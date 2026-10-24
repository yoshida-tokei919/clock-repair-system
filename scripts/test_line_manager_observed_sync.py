import hashlib
import hmac
import json
import io
import contextlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from line_manager_observed_sync import ObservedSyncError, list_mappings, main, parse_history, process, signed_import, signing_key_bytes


class FakeApi:
    def _request(self, path, body):
        return {"ok": True, "items": [{"id": 1, "managerBotId": "bot", "managerChatId": "chat"}], "nextAfterId": None}


class FakeReader:
    def bot_ids(self): return ("bot",)
    def messages(self, bot, chat):
        return {"backward": "older", "list": [{"type": "chatRead"}, {"type": "messageSent", "source": {"chatId": "chat"},
            "timestamp": 1700000000000, "message": {"type": "text", "id": "msg", "text": "hello"}}]}


class ObservedSyncTests(unittest.TestCase):
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
        with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-token", "LINE_MANAGER_SYNC_SIGNING_KEY": "ab" * 32}), \
             patch("line_manager_observed_sync.HttpInternalApi", return_value=TwoPageApi()), \
             patch("line_manager_observed_sync.LINELibAdapter.from_storage", return_value=TwoChatReader()), \
             patch("line_manager_observed_sync.fixed_storage_path", return_value=Path("unused")), \
             patch("line_manager_observed_sync.lineoa_operation", return_value=contextlib.nullcontext()), \
             patch("line_manager_observed_sync.signed_import", side_effect=importer), contextlib.redirect_stdout(output):
            self.assertEqual(main(["--apply", "--local"]), 1)
        result = json.loads(output.getvalue())
        self.assertTrue(result["possiblePartial"])
        self.assertIsNone(result["imported"])
        self.assertEqual(len(calls), 2)


if __name__ == "__main__": unittest.main()
