import hashlib
import hmac
import json
import io
import contextlib
import os
import sys
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from line_manager_observed_sync import ObservedSyncError, list_mappings, load_checkpoint, main, parse_history, parse_start_at, process, signed_import, signing_key_bytes, verify_pagination
from datetime import datetime, timezone


class FakeApi:
    def _request(self, path, body):
        return {"ok": True, "items": [{"id": 1, "managerBotId": "bot", "managerChatId": "chat"}], "nextAfterId": None}


class FakeReader:
    def bot_ids(self): return ("bot",)
    def messages(self, bot, chat):
        return {"backward": "older", "list": [{"type": "chatRead", "timestamp": 1699999999000}, {"type": "messageSent", "source": {"chatId": "chat"},
            "timestamp": 1700000000000, "message": {"type": "text", "id": "msg", "text": "hello"}}]}


class ObservedSyncTests(unittest.TestCase):
    def setUp(self):
        self.state_path = Path.cwd() / "scripts" / (".observed-test-" + uuid.uuid4().hex + ".json")
        self.addCleanup(lambda: self.state_path.unlink(missing_ok=True))

    def test_cutoff_validation_and_worker_boundary(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        for value in (None, "2026-10-23T00:00:00Z", "2026-02-30T00:00:00.000Z", "2026-10-25T00:00:00.000Z"):
            with self.assertRaises(ObservedSyncError): parse_start_at(value, now)
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")):
            result = process(FakeApi(), FakeReader(), apply=True, signing_key="ab" * 32, start_at="2023-11-14T22:13:20.000Z", now=now, state_path=self.state_path)
        self.assertEqual(result["candidateCount"], 0)
        self.assertFalse(result["historyComplete"])
        self.assertEqual(result["status"], "coverage_unverified")
        self.assertTrue(result["mappingsIncomplete"])
        before_path = self.state_path.with_suffix(".other.json")
        self.addCleanup(lambda: before_path.unlink(missing_ok=True))
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 1, "existing": 0, "deferred": 0}) as importer:
            result = process(FakeApi(), FakeReader(), apply=True, signing_key="ab" * 32, start_at="2023-11-14T22:13:19.999Z", now=now, state_path=before_path)
        self.assertEqual(result["candidateCount"], 1)
        importer.assert_called_once()

    def test_checkpoint_restart_overlap_and_gap_blocks_all_imports(self):
        cutoff = "2023-11-14T22:13:19.999Z"
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        class Reader(FakeReader):
            def __init__(self): self.ids = ["first"]
            def messages(self, bot, chat):
                return {"backward": None, "list": [{"type": "messageSent", "source": {"chatId": chat}, "timestamp": 1700000000000,
                    "message": {"type": "text", "id": value, "text": "hello"}} for value in self.ids]}
        reader = Reader()
        def run():
            return process(FakeApi(), reader, apply=True, signing_key="ab" * 32, start_at=cutoff, now=now, state_path=self.state_path)
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 1, "existing": 0, "deferred": 0}) as importer:
            first = run()
            self.assertEqual(first["status"], "coverage_unverified")
            self.assertTrue(first["startupCoverageUnverified"])
            self.assertEqual(importer.call_count, 1)
            initial = self.state_path.read_text()
            self.assertNotIn("first", initial)
            self.assertNotIn('"chat"', initial)
            reader.ids = ["second", "first"]
            overlap = run()
            self.assertEqual(overlap["status"], "synced_with_overlap")
            self.assertTrue(overlap["startupCoverageUnverified"])
            self.assertTrue(load_checkpoint(self.state_path, cutoff)["initialCoverageUnverified"])
            self.assertEqual(importer.call_count, 2)
            self.assertEqual(importer.call_args.args[2]["startAt"], cutoff)
            saved = self.state_path.read_text()
            reader.ids = ["third"]
            gap = run()
            self.assertEqual(gap["status"], "coverage_gap_possible")
            self.assertEqual(gap["imported"], 0)
            self.assertEqual(importer.call_count, 2)
            self.assertEqual(self.state_path.read_text(), saved)

    def test_checkpoint_corrupt_mismatch_and_deferred_do_not_advance(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        cutoff = "2023-11-14T22:13:19.999Z"
        args = dict(apply=True, signing_key="ab" * 32, start_at=cutoff, now=now, state_path=self.state_path)
        self.state_path.write_text("broken", encoding="utf-8")
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")):
            with self.assertRaises(ObservedSyncError): process(FakeApi(), FakeReader(), **args)
        self.state_path.unlink()
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 0, "existing": 0, "deferred": 1}):
            result = process(FakeApi(), FakeReader(), **args)
        self.assertEqual(result["status"], "coverage_unverified")
        self.assertFalse(self.state_path.exists())
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 1, "existing": 0, "deferred": 0}):
            process(FakeApi(), FakeReader(), **args)
        saved = self.state_path.read_text(encoding="utf-8")
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 0, "existing": 0, "deferred": 1}):
            result = process(FakeApi(), FakeReader(), **args)
        self.assertEqual(result["deferred"], 1)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), saved)
        with self.assertRaises(ObservedSyncError): load_checkpoint(self.state_path, "2023-11-14T22:13:20.000Z")

    def test_full_first_page_after_cutoff_reports_gap_without_import(self):
        class FullReader(FakeReader):
            def messages(self, bot, chat):
                return {"backward": "older", "list": [{"type": "messageSent", "source": {"chatId": chat},
                    "timestamp": 1700000000000 + i, "message": {"type": "text", "id": str(i), "text": "hello"}} for i in range(100)]}
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")):
            result = process(FakeApi(), FullReader(), apply=True, signing_key="ab" * 32,
                start_at="2023-11-14T22:13:19.999Z", now=datetime(2026, 10, 24, tzinfo=timezone.utc), state_path=self.state_path)
        self.assertEqual(result["status"], "coverage_gap_possible")
        self.assertFalse(self.state_path.exists())

    def test_short_backward_first_page_after_cutoff_blocks_import_and_checkpoint(self):
        class Reader(FakeReader):
            def messages(self, bot, chat):
                return {"backward": "older", "list": [{"type": "messageSent", "source": {"chatId": chat},
                    "timestamp": 1700000000000, "message": {"type": "text", "id": "new", "text": "hello"}}]}
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")), \
             patch("line_manager_observed_sync.save_checkpoint", side_effect=AssertionError("must not checkpoint")):
            result = process(FakeApi(), Reader(), apply=True, signing_key="ab" * 32,
                start_at="2023-11-14T22:13:19.999Z", now=datetime(2026, 10, 24, tzinfo=timezone.utc), state_path=self.state_path)
        self.assertEqual(result["status"], "coverage_gap_possible")
        self.assertEqual(result["imported"], 0)
        self.assertFalse(self.state_path.exists())

    def test_short_backward_first_page_spanning_cutoff_is_unverified(self):
        with patch("line_manager_observed_sync.signed_import", return_value={"imported": 1, "existing": 0, "deferred": 0}) as importer:
            result = process(FakeApi(), FakeReader(), apply=True, signing_key="ab" * 32,
                start_at="2023-11-14T22:13:19.999Z", now=datetime(2026, 10, 24, tzinfo=timezone.utc), state_path=self.state_path)
        self.assertEqual(result["status"], "coverage_unverified")
        importer.assert_called_once()
        self.assertTrue(self.state_path.exists())

    def test_empty_backward_first_page_blocks_import_and_checkpoint(self):
        class Reader(FakeReader):
            def messages(self, bot, chat): return {"backward": "older", "list": []}
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")), \
             patch("line_manager_observed_sync.save_checkpoint", side_effect=AssertionError("must not checkpoint")):
            result = process(FakeApi(), Reader(), apply=True, signing_key="ab" * 32,
                start_at="2023-11-14T22:13:19.999Z", now=datetime(2026, 10, 24, tzinfo=timezone.utc), state_path=self.state_path)
        self.assertEqual(result["status"], "coverage_gap_possible")
        self.assertFalse(self.state_path.exists())

    def test_short_backward_first_page_validates_assessed_timestamps(self):
        class Reader(FakeReader):
            def messages(self, bot, chat): return {"backward": "older", "list": [{"type": "chatRead"}]}
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")):
            with self.assertRaises(ObservedSyncError):
                process(FakeApi(), Reader(), apply=True, signing_key="ab" * 32,
                    start_at="2023-11-14T22:13:19.999Z", now=datetime(2026, 10, 24, tzinfo=timezone.utc), state_path=self.state_path)
        self.assertFalse(self.state_path.exists())

    def test_main_apply_nonconfident_and_deferred_exit_nonzero_with_counts(self):
        base = {"scannedChatCount": 1, "candidateCount": 1, "imported": 0, "existing": 0, "deferred": 0,
                "historyComplete": False, "startupCoverageUnverified": True}
        for status, deferred in (("coverage_gap_possible", 0), ("coverage_unverified", 0), ("synced_with_overlap", 1)):
            output = io.StringIO()
            with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-token", "LINE_MANAGER_SYNC_SIGNING_KEY": "ab" * 32}), \
                 patch("line_manager_observed_sync.HttpInternalApi"), \
                 patch("line_manager_observed_sync.LINELibAdapter.from_storage"), \
                 patch("line_manager_observed_sync.fixed_storage_path", return_value=Path("unused")), \
                 patch("line_manager_observed_sync.lineoa_operation", return_value=contextlib.nullcontext()), \
                 patch("line_manager_observed_sync.process", return_value={**base, "status": status, "deferred": deferred}), \
                 contextlib.redirect_stdout(output):
                self.assertEqual(main(["--apply", "--local"]), 1)
            result = json.loads(output.getvalue())
            self.assertEqual(result["status"], status)
            self.assertEqual(result["scannedChatCount"], 1)
            self.assertEqual(result["deferred"], deferred)

    def test_pagination_progress_and_nonprogress_are_count_only(self):
        first = {"backward": "cursor", "list": [{"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "one"}}]}
        class Client:
            def __init__(self, page): self.page = page; self.calls = 0
            def get_chat_messages(self, bot, chat, *, limit, before):
                self.calls += 1
                self_args = (bot, chat, limit, before)
                assert self_args == ("bot", "chat", 100, "cursor")
                return self.page
        class Reader:
            def __init__(self, page): self._client = Client(page)
        repeat = Reader(first)
        self.assertEqual(verify_pagination(repeat, "bot", "chat", first), ("nonprogress", 0))
        self.assertEqual(repeat._client.calls, 1)
        newer = Reader({"list": [{"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "two"}}]})
        self.assertEqual(verify_pagination(newer, "bot", "chat", first), ("progress", 1))
        self.assertEqual(newer._client.calls, 1)

    def test_pagination_conflicting_identity_fails_closed(self):
        first = {"backward": "cursor", "list": [{"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "one", "text": "a"}}]}
        class Reader:
            class Client:
                def get_chat_messages(self, *args, **kwargs):
                    return {"list": [{"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "one", "text": "b"}}]}
            _client = Client()
        with self.assertRaises(ObservedSyncError): verify_pagination(Reader(), "bot", "chat", first)

    def test_changed_read_events_do_not_count_as_pagination_progress(self):
        first = {"backward": "cursor", "list": [
            {"type": "chatRead", "timestamp": 1},
            {"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "one", "text": "same"}},
        ]}
        class Reader:
            class Client:
                def get_chat_messages(self, *args, **kwargs):
                    return {"list": [
                        {"type": "chatRead", "timestamp": 2},
                        {"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "one", "text": "same"}},
                    ]}
            _client = Client()
        self.assertEqual(verify_pagination(Reader(), "bot", "chat", first), ("nonprogress", 0))

    def test_diagnostic_stops_on_nonprogress_without_import(self):
        class Reader(FakeReader):
            def __init__(self):
                self.calls = 0
                self._client = self
            def get_chat_messages(self, bot, chat, *, limit, before):
                self.calls += 1
                return self.messages(bot, chat)
        reader = Reader()
        with patch("line_manager_observed_sync.signed_import", side_effect=AssertionError("must not import")):
            result = process(FakeApi(), reader, verify_paging=True)
        self.assertEqual(result["status"], "nonprogress")
        self.assertEqual(result["paginationNewEventCount"], 0)
        self.assertFalse(result["historyComplete"])
        self.assertEqual(reader.calls, 1)

    def test_short_page_with_backward_is_incomplete(self):
        result = process(FakeApi(), FakeReader())
        self.assertEqual(result["candidateCount"], 1)
        self.assertTrue(result["hasEarlierHistory"])
        self.assertFalse(result["historyComplete"])

    def test_mismatched_chat_and_conflicting_duplicate_fail(self):
        raw = FakeReader().messages("bot", "chat")
        raw["list"][1]["source"]["chatId"] = "other"
        with self.assertRaises(ObservedSyncError): parse_history(raw, "chat", "2026-01-01T00:00:00.000Z")
        raw["list"][1]["source"]["chatId"] = "chat"
        raw["list"].append({**raw["list"][1], "message": {"type": "text", "id": "msg", "text": "changed"}})
        with self.assertRaises(ObservedSyncError): parse_history(raw, "chat", "2026-01-01T00:00:00.000Z")

    def test_apply_requires_key_before_read(self):
        with self.assertRaises(ObservedSyncError): process(FakeApi(), FakeReader(), apply=True)
        for value in ("short", "AB" * 32, "gg" * 32):
            with self.assertRaises(ObservedSyncError): signing_key_bytes(value)
        self.assertEqual(len(signing_key_bytes("ab" * 32)), 32)

    def test_mapping_cursor_walks_past_first_page(self):
        class PagedApi:
            def _request(self, path, body):
                after = body["afterId"]
                if after == 0:
                    return {"ok": True, "items": [{"id": i, "managerBotId": "bot", "managerChatId": str(i)} for i in range(1, 21)], "nextAfterId": 20}
                return {"ok": True, "items": [{"id": 21, "managerBotId": "bot", "managerChatId": "21"}], "nextAfterId": None}
        self.assertEqual(len(list_mappings(PagedApi())), 21)

    def test_hmac_is_over_raw_body_and_timestamp(self):
        captured = {}
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b'{"ok":true,"imported":1,"existing":0,"deferred":0}'
        def urlopen(request, timeout):
            captured["request"] = request
            return Response()
        api = FakeApi(); api.base_url = "http://127.0.0.1:3000"; api._token = "token"
        key = "ab" * 32  # test fixture only
        with patch("line_manager_observed_sync.urllib.request.urlopen", urlopen):
            signed_import(api, key, {"events": [{}]})
        request = captured["request"]
        timestamp = request.headers["X-line-manager-sync-timestamp"]
        signature = request.headers["X-line-manager-sync-signature"]
        expected = hmac.new(bytes.fromhex(key), timestamp.encode() + b"." + request.data, hashlib.sha256).hexdigest()
        self.assertEqual(signature, expected)
        self.assertNotIn(key.encode(), request.data)

    def test_failure_after_committed_batch_reports_unknown_counts(self):
        class TwoPageApi(FakeApi):
            def _request(self, path, body):
                return {"ok": True, "items": [{"id": 1, "managerBotId": "bot", "managerChatId": "chat"},
                    {"id": 2, "managerBotId": "bot", "managerChatId": "chat2"}], "nextAfterId": None}
        class TwoChatReader(FakeReader):
            def messages(self, bot, chat):
                raw = super().messages(bot, chat)
                raw["list"][1]["source"]["chatId"] = chat
                return raw
        calls = []
        def importer(*args):
            calls.append(1)
            if len(calls) == 2: raise ObservedSyncError()
            return {"ok": True, "imported": 1, "existing": 0, "deferred": 0}
        output = io.StringIO()
        with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-token", "LINE_MANAGER_SYNC_SIGNING_KEY": "ab" * 32, "LINE_MANAGER_SYNC_START_AT": "2023-11-14T22:13:19.999Z", "LOCALAPPDATA": str(Path.cwd() / "scripts")}), \
             patch("line_manager_observed_sync.HttpInternalApi", return_value=TwoPageApi()), \
             patch("line_manager_observed_sync.LINELibAdapter.from_storage", return_value=TwoChatReader()), \
             patch("line_manager_observed_sync.fixed_storage_path", return_value=Path("unused")), \
             patch("line_manager_observed_sync.checkpoint_path", return_value=self.state_path), \
             patch("line_manager_observed_sync.lineoa_operation", return_value=contextlib.nullcontext()), \
             patch("line_manager_observed_sync.signed_import", side_effect=importer), contextlib.redirect_stdout(output):
            self.assertEqual(main(["--apply", "--local"]), 1)
        result = json.loads(output.getvalue())
        self.assertTrue(result["possiblePartial"])
        self.assertIsNone(result["imported"])
        self.assertEqual(len(calls), 2)


if __name__ == "__main__": unittest.main()
