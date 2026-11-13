import json
import unittest
from contextlib import redirect_stdout, nullcontext
from io import StringIO
from unittest.mock import patch

import line_manager_ogura_recovery as recovery


class FakeApi:
    def __init__(self): self.calls = []
    def _request(self, path, body):
        self.calls.append((path, body))
        return {"ok": True, "status": "complete" if body["action"] == "apply" else "checked", "existingMessageCount": 0 if body["action"] == "check" else 2, "imageStored": body["action"] == "apply", **({"insertedMessageCount": 0} if body["action"] == "apply" else {})}


class FakeReader:
    def __init__(self, events): self.events = events
    def bot_ids(self): return ("fixture-bot",)
    def messages(self, bot, chat): return {"list": self.events}


def events(chat="fixture-chat", timestamp=1794319649332, body="x" * 448):
    return [{"type": "message", "source": {"chatId": chat}, "timestamp": timestamp, "message": {"id": "fixture-image", "type": "image"}},
            {"type": "message", "source": {"chatId": chat}, "timestamp": 1794319904836, "message": {"id": "fixture-text", "type": "text", "text": body}}]


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.mappings = patch.object(recovery, "list_mappings", return_value=[{"id": 12, "managerBotId": "fixture-bot", "managerChatId": "fixture-chat"}])
        self.hashes = patch.object(recovery, "digest", side_effect=lambda value: {"fixture-image": recovery.IMAGE_SHA, "fixture-text": recovery.TEXT_SHA, "x" * 448: recovery.BODY_SHA}.get(value, "other"))
        self.mappings.start(); self.hashes.start()
        self.addCleanup(self.mappings.stop); self.addCleanup(self.hashes.stop)

    def test_dry_run_uses_fixed_check_only(self):
        result = recovery.run(self.api, FakeReader(events()), False)
        self.assertEqual(result["status"], "checked")
        self.assertEqual(len(self.api.calls), 1)
        self.assertEqual(self.api.calls[0][1]["action"], "check")

    def test_apply_uses_fixed_endpoint_and_two_events(self):
        result = recovery.run(self.api, FakeReader(events()), True)
        self.assertEqual(result["status"], "complete")
        path, body = self.api.calls[0]
        self.assertEqual(path, recovery.PATH)
        self.assertEqual((body["mappingId"], body["inquiryId"]), (12, 13))
        self.assertEqual(len(body["events"]), 2)

    def test_wrong_chat_time_body_or_duplicate_fails_without_api_call(self):
        for bad in (events(chat="other"), events(timestamp=1), events(body="bad"), events() + events()[:1]):
            with self.assertRaises(recovery.RecoveryError): recovery.run(self.api, FakeReader(bad), True)
        self.assertEqual(self.api.calls, [])

    def test_main_sanitizes_failure(self):
        output = StringIO()
        with patch.dict(recovery.os.environ, {"N8N_INTERNAL_TOKEN": "fixture-secret"}), patch.object(recovery, "HttpInternalApi", return_value=self.api), patch.object(recovery, "lineoa_operation", return_value=nullcontext()), patch.object(recovery.LINELibAdapter, "from_storage", side_effect=RuntimeError("private fixture")), redirect_stdout(output):
            self.assertEqual(recovery.main([]), 1)
        self.assertEqual(json.loads(output.getvalue()), {"status": "unavailable"})


if __name__ == "__main__": unittest.main()
