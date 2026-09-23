from pathlib import Path
import inspect
import os
import unittest
from unittest.mock import patch

import line_manager_mapping as mapping


def candidate(user, *message_ids):
    return mapping.Candidate(user, tuple(mapping.Evidence(100 + index, value, None, index) for index, value in enumerate(message_ids)), user)


def inbound(message_id, chat="chat", message_type="text"):
    return {"type": "message", "source": {"chatId": chat}, "message": {"id": message_id, "type": message_type}}


class FakeApi:
    def __init__(self, candidates): self.value, self.verified = tuple(candidates), []
    def candidates(self): return self.value
    def verify(self, match): self.verified.append(match); return True


class FakeReader:
    def __init__(self, chats, histories, bots=("bot",)):
        self._chats, self._histories, self._bots = chats, histories, bots
        self.history_calls = []
    def bot_ids(self): return self._bots
    def chats(self, bot): return self._chats.get(bot, ())
    def messages(self, bot, chat): self.history_calls.append((bot, chat)); return self._histories[(bot, chat)]


class ParserTests(unittest.TestCase):
    def test_chat_root_list_is_strict(self):
        self.assertEqual(mapping.parse_chats({"list": [{"chatId": "chat"}]}), ({"chatId": "chat"},))
        for value in (None, {}, {"list": {}}, {"list": ["bad"]}):
            with self.subTest(value=value):
                with self.assertRaises(mapping.MappingWorkerError): mapping.parse_chats(value)

    def test_latest_inbound_exact_match_and_history_image_id(self):
        chat = {"chatId": "chat", "latestEvent": inbound("latest")}
        self.assertEqual(mapping.latest_evidence_ids(chat, "chat"), ("latest",))
        raw = {"list": [inbound("image-id", message_type="image"), {"type": "chatRead"}, {"type": "messageSent", "message": {"id": "out"}}]}
        self.assertEqual(mapping.history_evidence_ids(raw, "chat"), ("image-id",))

    def test_outbound_and_read_are_never_evidence_and_source_mismatch_is_ignored(self):
        raw = {"list": [{"type": "messageSent", "source": {"chatId": "chat"}, "message": {"id": "out"}}, {"type": "chatRead"}, inbound("wrong", "other")]}
        self.assertEqual(mapping.history_evidence_ids(raw, "chat"), ())

    def test_candidate_response_is_strict_and_private_fields_do_not_propagate(self):
        raw = {"ok": True, "items": [{"lineUserId": 1, "evidence": [{"inquiryMessageId": 2, "externalMessageId": "m", "receivedAt": None}], "displayName": "private"}]}
        parsed = mapping.parse_candidates(raw)
        self.assertEqual(parsed[0].evidence[0].external_message_id, "m")
        for bad in ({"ok": False, "items": []}, {"ok": True, "items": [{"lineUserId": 1, "evidence": []}]}, {"ok": True, "items": [{"lineUserId": 1, "evidence": [{"inquiryMessageId": 2, "externalMessageId": " "}]}]}):
            with self.subTest(bad=bad):
                with self.assertRaises(mapping.MappingWorkerError): mapping.parse_candidates(bad)


class WorkerTests(unittest.TestCase):
    def reader(self, latest=None, history=(), chat="chat"):
        item = {"chatId": chat}
        if latest is not None: item["latestEvent"] = latest
        return FakeReader({"bot": [item]}, {("bot", chat): {"list": list(history)}})

    def test_exact_matching_only_and_dry_run_never_verifies(self):
        api = FakeApi([candidate(1, "match")])
        result = mapping.process_mapping_once(api, self.reader(latest=inbound("not-match"), history=[inbound("match")]))
        self.assertEqual(result.status, "dry_run_match"); self.assertEqual(api.verified, [])

    def test_apply_calls_verify_once_at_most(self):
        api = FakeApi([candidate(1, "match")])
        result = mapping.process_mapping_once(api, self.reader(history=[inbound("match")]), apply=True)
        self.assertEqual(result.status, "verified"); self.assertEqual(len(api.verified), 1)

    def test_multiple_safe_matches_only_first_candidate_is_verified(self):
        first, second = candidate(1, "one"), candidate(2, "two")
        reader = FakeReader({"bot": [{"chatId": "first"}, {"chatId": "second"}]}, {("bot", "first"): {"list": [inbound("one", "first")]}, ("bot", "second"): {"list": [inbound("two", "second")]}})
        api = FakeApi([first, second])
        result = mapping.process_mapping_once(api, reader, apply=True)
        self.assertEqual((result.status, result.safe_match_count), ("verified", 2)); self.assertEqual(api.verified[0].candidate.line_user_id, 1)

    def test_same_candidate_across_two_chats_is_ambiguous(self):
        one = candidate(1, "one", "two")
        reader = FakeReader({"bot": [{"chatId": "a"}, {"chatId": "b"}]}, {("bot", "a"): {"list": [inbound("one", "a")]}, ("bot", "b"): {"list": [inbound("two", "b")]}})
        api = FakeApi([one])
        self.assertEqual(mapping.process_mapping_once(api, reader, apply=True).status, "ambiguous"); self.assertEqual(api.verified, [])

    def test_same_chat_for_two_users_is_ambiguous(self):
        api = FakeApi([candidate(1, "one"), candidate(2, "two")])
        result = mapping.process_mapping_once(api, self.reader(history=[inbound("one"), inbound("two")]), apply=True)
        self.assertEqual(result.status, "ambiguous"); self.assertEqual(api.verified, [])

    def test_no_candidates_and_no_match_do_not_write(self):
        no_candidates = FakeApi([])
        self.assertEqual(mapping.process_mapping_once(no_candidates, self.reader()).status, "no_candidates")
        no_match = FakeApi([candidate(1, "missing")])
        self.assertEqual(mapping.process_mapping_once(no_match, self.reader(history=[inbound("other")]), apply=True).status, "no_match")
        self.assertEqual(no_match.verified, [])

    def test_malformed_history_fails_closed(self):
        reader = FakeReader({"bot": [{"chatId": "chat"}]}, {("bot", "chat"): {"not": "a list"}})
        with self.assertRaises(mapping.MappingWorkerError): mapping.process_mapping_once(FakeApi([candidate(1, "m")]), reader)

    def test_fixed_storage_path_requires_localappdata(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(mapping.MappingWorkerError): mapping.fixed_storage_path()
        with patch.dict(os.environ, {"LOCALAPPDATA": "C:/local"}, clear=True):
            self.assertEqual(mapping.fixed_storage_path(), Path("C:/local") / "clock-repair-system" / "linelib-poc" / "lineoa-storage.json")

    def test_source_contains_only_read_only_manager_calls(self):
        source = inspect.getsource(mapping)
        for forbidden in ("send_message(", "sendMessage(", "post_text_v2", "_chat_service.send_message", "markAsRead", "set_typing", "uploadFile"):
            self.assertNotIn(forbidden, source)
        self.assertIn("get_chats(bot_id, 25)", source)
        self.assertIn("get_chat_messages(bot_id, chat_id, limit=100)", source)


if __name__ == "__main__": unittest.main()
