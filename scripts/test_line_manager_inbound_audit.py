import contextlib
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from line_manager_inbound_audit import InboundAuditError, audit, main, parse_recent_inbound

NOW = 1800000000000
EVENT = {"type": "message", "source": {"chatId": "chat"}, "timestamp": NOW - 300000,
         "message": {"id": "msg", "type": "image", "text": "private"}}


class FakeReader:
    def bot_ids(self): return ("bot",)
    def chats(self, bot): raise AssertionError("first 25 chats must not be enumerated")
    def messages(self, bot, chat): return {"list": [EVENT], "backward": "older"}


class FakeApi:
    def __init__(self): self.calls = []
    def _request(self, path, body):
        self.calls.append((path, body))
        if path.endswith("/mappings"):
            return {"ok": True, "items": [{"id": 1, "managerBotId": "bot", "managerChatId": "chat"}], "nextAfterId": None}
        return {"ok": True, "status": "recent_page_compared", "eligibleCount": 1, "missingMessageCount": 0,
                "missingImageCount": 1, "mismatchCount": 0, "historyComplete": False}


class InboundAuditTests(unittest.TestCase):
    def test_first_page_only_and_sanitized_payload(self):
        api = FakeApi()
        result = audit(api, FakeReader(), NOW)
        self.assertEqual(result["status"], "discrepancies_found")
        self.assertTrue(result["hasEarlierHistory"])
        self.assertFalse(result["historyComplete"])
        self.assertEqual(api.calls[1][1]["events"], [{"messageId": "msg", "type": "image", "timestamp": NOW - 300000}])
        self.assertNotIn("private", json.dumps(result) + json.dumps(api.calls[1][1]))

    def test_chat_duplicate_and_grace_fail_closed(self):
        for changed in [{**EVENT, "source": {"chatId": "other"}}, {**EVENT, "message": {"type": "text"}},
                        {**EVENT, "timestamp": NOW + 120001}]:
            with self.assertRaises(InboundAuditError): parse_recent_inbound({"list": [changed]}, "chat", NOW)
        with self.assertRaises(InboundAuditError): parse_recent_inbound({"list": [EVENT, {**EVENT, "timestamp": NOW - 300001}]}, "chat", NOW)
        self.assertEqual(parse_recent_inbound({"list": [{**EVENT, "timestamp": NOW - 299999}]}, "chat", NOW)[0], [])
        for malformed in [{**EVENT, "message": {"id": "msg"}}, {**EVENT, "message": {"id": "" , "type": "image"}}]:
            with self.assertRaises(InboundAuditError): parse_recent_inbound({"list": [malformed]}, "chat", NOW)
        for backward, earlier in [(None, False), ("", False), ("older", True)]:
            self.assertEqual(parse_recent_inbound({"list": [EVENT], "backward": backward}, "chat", NOW)[1], earlier)
        with self.assertRaises(InboundAuditError): parse_recent_inbound({"list": [EVENT], "backward": 1}, "chat", NOW)
        self.assertEqual(parse_recent_inbound({"list": [{**EVENT, "timestamp": NOW + 120000}]}, "chat", NOW)[0], [])

    def test_no_send_or_import_and_safe_failure(self):
        output = io.StringIO()
        with patch("line_manager_inbound_audit.LINELibAdapter.from_storage", side_effect=RuntimeError("secret")), patch.dict("line_manager_inbound_audit.os.environ", {"N8N_INTERNAL_TOKEN": "test"}), contextlib.redirect_stdout(output):
            self.assertEqual(main(["--local"]), 1)
        self.assertNotIn("secret", output.getvalue())
        self.assertFalse(json.loads(output.getvalue())["historyComplete"])


if __name__ == "__main__": unittest.main()
