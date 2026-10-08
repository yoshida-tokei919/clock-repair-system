from pathlib import Path
from contextlib import nullcontext
from contextlib import redirect_stdout
import base64
import inspect
import io
import os
import shutil
import subprocess
import urllib.error
import unittest
from unittest.mock import Mock, patch

import line_manager_mapping as mapping
import line_manager_sender_worker as sender
from test_line_manager_sender_worker import lock_root


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
        self.assertEqual(mapping.process_mapping_once(api, reader, apply=True).status, "pending_ambiguity"); self.assertEqual(api.verified, [])

    def test_same_chat_for_two_users_is_ambiguous(self):
        api = FakeApi([candidate(1, "one"), candidate(2, "two")])
        result = mapping.process_mapping_once(api, self.reader(history=[inbound("one"), inbound("two")]), apply=True)
        self.assertEqual(result.status, "pending_ambiguity"); self.assertEqual(api.verified, [])

    def test_no_candidates_and_no_match_do_not_write(self):
        no_candidates = FakeApi([])
        reader = self.reader()
        self.assertEqual(mapping.process_mapping_once(no_candidates, reader).status, "healthy_no_candidates")
        self.assertEqual(reader.history_calls, [("bot", "chat")])
        no_match = FakeApi([candidate(1, "missing")])
        self.assertEqual(mapping.process_mapping_once(no_match, self.reader(history=[inbound("other")]), apply=True).status, "pending_no_exact_match")
        self.assertEqual(no_match.verified, [])

    def test_malformed_history_fails_closed(self):
        reader = FakeReader({"bot": [{"chatId": "chat"}]}, {("bot", "chat"): {"not": "a list"}})
        api = FakeApi([candidate(1, "m")])
        self.assertEqual(mapping.process_mapping_once(api, reader, apply=True).status, "manager_live_read_unavailable")
        self.assertEqual(api.verified, [])

    def test_empty_manager_chat_list_is_not_healthy(self):
        api = FakeApi([])
        reader = FakeReader({"bot": []}, {})
        self.assertEqual(mapping.process_mapping_once(api, reader, apply=True).status, "manager_live_read_unavailable")

    def test_no_candidate_history_failure_is_sanitized(self):
        api = FakeApi([])
        reader = FakeReader({"bot": [{"chatId": "chat"}]}, {("bot", "chat"): {"secret": "private"}})
        result = mapping.process_mapping_once(api, reader, apply=True)
        self.assertEqual(result, mapping.MappingResult("manager_live_read_unavailable", 0, 0, 0))
        self.assertEqual(api.verified, [])

    def test_internal_api_failure_is_sanitized(self):
        class FailingApi(FakeApi):
            def candidates(self): raise RuntimeError("secret content")
        self.assertEqual(mapping.process_mapping_once(FailingApi([]), self.reader(), apply=True).status, "internal_api_unavailable")

    def test_verify_http_409_reports_sanitized_mapping_conflict(self):
        api = mapping.HttpInternalApi(mapping.LOCAL_TEST_ORIGIN, "test-only")
        matched = candidate(1, "match")
        response_body = Mock()
        response_body.read.side_effect = AssertionError("HTTP error body must not be read")
        error = urllib.error.HTTPError("test", 409, "private conflict detail", {}, response_body)
        with patch.object(api, "candidates", return_value=(matched,)), patch.object(mapping.urllib.request, "urlopen", side_effect=error) as request:
            result = mapping.process_mapping_once(api, self.reader(history=[inbound("match")]), apply=True)
        self.assertEqual(result, mapping.MappingResult("mapping_conflict", 1, 1, 1))
        self.assertEqual(request.call_count, 1)
        response_body.read.assert_not_called()
        self.assertNotIn("private", result.status)

    def test_verify_other_http_and_network_failures_remain_generic(self):
        api = mapping.HttpInternalApi(mapping.LOCAL_TEST_ORIGIN, "test-only")
        matched = candidate(1, "match")
        with patch.object(api, "candidates", return_value=(matched,)):
            for error in (urllib.error.HTTPError("test", 401, "private", {}, None), urllib.error.HTTPError("test", 503, "private", {}, None), urllib.error.URLError("private")):
                with self.subTest(error=error), patch.object(mapping.urllib.request, "urlopen", side_effect=error):
                    result = mapping.process_mapping_once(api, self.reader(history=[inbound("match")]), apply=True)
                    self.assertEqual(result.status, "internal_api_unavailable")

    def test_candidates_http_409_is_not_a_mapping_conflict(self):
        api = mapping.HttpInternalApi(mapping.LOCAL_TEST_ORIGIN, "test-only")
        with patch.object(mapping.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("test", 409, "private", {}, None)):
            self.assertEqual(mapping.process_mapping_once(api, self.reader(), apply=True).status, "internal_api_unavailable")

    def test_main_defaults_to_dry_run_and_acquires_operation_lock(self):
        api = FakeApi([candidate(1, "match")])
        output = io.StringIO()
        with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-only"}), patch.object(mapping, "HttpInternalApi", return_value=api), patch.object(mapping, "fixed_storage_path", return_value=Path(__file__)), patch.object(mapping.LINELibAdapter, "from_storage", return_value=self.reader(history=[inbound("match")])), patch.object(mapping, "lineoa_operation", return_value=nullcontext()) as lock, redirect_stdout(output):
            self.assertEqual(mapping.main([]), 0)
        lock.assert_called_once_with(timeout_seconds=3)
        self.assertEqual(api.verified, [])
        self.assertIn("status=dry_run_match", output.getvalue())

    def test_main_explicit_apply_verifies_only_one(self):
        api = FakeApi([candidate(1, "one"), candidate(2, "two")])
        reader = FakeReader({"bot": [{"chatId": "a"}, {"chatId": "b"}]}, {("bot", "a"): {"list": [inbound("one", "a")]}, ("bot", "b"): {"list": [inbound("two", "b")]}})
        output = io.StringIO()
        with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-only"}), patch.object(mapping, "HttpInternalApi", return_value=api), patch.object(mapping, "fixed_storage_path", return_value=Path(__file__)), patch.object(mapping.LINELibAdapter, "from_storage", return_value=reader), patch.object(mapping, "lineoa_operation", return_value=nullcontext()), redirect_stdout(output):
            self.assertEqual(mapping.main(["--apply"]), 0)
        self.assertEqual(len(api.verified), 1)
        self.assertIn("status=verified", output.getvalue())

    def test_main_reports_mapping_conflict_as_failure(self):
        class ConflictingApi(FakeApi):
            def verify(self, match):
                self.verified.append(match)
                raise mapping.MappingConflictError("private conflict")
        api = ConflictingApi([candidate(1, "match")])
        output = io.StringIO()
        with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-only"}), patch.object(mapping, "HttpInternalApi", return_value=api), patch.object(mapping, "fixed_storage_path", return_value=Path(__file__)), patch.object(mapping.LINELibAdapter, "from_storage", return_value=self.reader(history=[inbound("match")])), patch.object(mapping, "lineoa_operation", return_value=nullcontext()), redirect_stdout(output):
            self.assertEqual(mapping.main(["--apply"]), 1)
        self.assertEqual(len(api.verified), 1)
        self.assertEqual(output.getvalue(), "status=mapping_conflict candidate_count=1 scanned_chat_count=1 safe_match_count=1\n")

    def test_sender_cycle_blocks_mapping_but_between_cycles_allows_it(self):
        with lock_root() as root:
            api = FakeApi([candidate(1, "match")])
            output = io.StringIO()
            reader = self.reader(history=[inbound("match")])
            def sender_cycle(_api, _adapter, *, allow_send):
                self.assertTrue(allow_send)
                self.assertEqual(mapping.main(["--apply"]), 1)
                bootstrap.assert_not_called()
                self.assertEqual(api.verified, [])
                return "no send candidate"
            with patch.dict(os.environ, {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch.object(mapping, "HttpInternalApi", return_value=api), \
                 patch.object(mapping, "fixed_storage_path", return_value=Path(__file__)), \
                 patch.object(mapping.LINELibAdapter, "from_storage", return_value=reader) as bootstrap, \
                 patch.object(mapping, "lineoa_operation", side_effect=lambda timeout_seconds: sender.lineoa_operation(root, timeout_seconds=0.1)), \
                 patch.object(sender, "evidence_directory", return_value=root), \
                 patch.object(sender, "HttpInternalApi"), \
                 patch.object(sender, "fixed_storage_path", return_value=Path(__file__)), \
                 patch.object(sender.LINELibAdapter, "from_storage", return_value=object()), \
                 patch.object(sender, "process_cycle", side_effect=sender_cycle), \
                 redirect_stdout(output):
                self.assertEqual(sender.main(["--once", "--allow-send"]), 0)
                with sender.single_instance(root):
                    self.assertEqual(mapping.main(["--apply"]), 0)
            self.assertEqual(output.getvalue().splitlines(), [
                "status=lineoa_operation_busy candidate_count=0 scanned_chat_count=0 safe_match_count=0",
                "status=no send candidate",
                "status=verified candidate_count=1 scanned_chat_count=1 safe_match_count=1",
            ])
            self.assertEqual(len(api.verified), 1)

    def test_wrapper_has_explicit_apply_and_no_send_path(self):
        source = (Path(__file__).parent / "start-line-manager-mapping.ps1").read_text(encoding="utf-8")
        self.assertIn("if (-not $Apply)", source)
        self.assertIn("GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')", source)
        self.assertIn("$worker --apply", source)
        self.assertIn("|pending_ambiguity|mapping_conflict|", source)
        self.assertIn("lineoa_operation_busy", source)
        for name, prior in (("N8N_INTERNAL_TOKEN", "priorToken"), ("PYTHONDONTWRITEBYTECODE", "priorNoBytecode")):
            self.assertIn(f"${prior} = [Environment]::GetEnvironmentVariable('{name}', 'Process')", source)
            self.assertIn(f"[Environment]::SetEnvironmentVariable('{name}', ${prior}, 'Process')", source)
        for forbidden in ("--allow-send", "line_manager_sender_worker.py", "start-line-manager-sender.ps1", "--local"):
            self.assertNotIn(forbidden, source)

    def test_wrapper_restores_existing_and_absent_process_environment(self):
        powershell = shutil.which("powershell.exe")
        if not powershell:
            self.skipTest("Windows PowerShell unavailable")
        wrapper = str(Path(__file__).parent / "start-line-manager-mapping.ps1").replace("'", "''")
        # Exercise finally after both values change, while stopping before any
        # token lookup or network operation in the isolated PowerShell host.
        command = f"""
$source = Get-Content -LiteralPath '{wrapper}' -Raw
$source = $source.Replace('exit $exitCode', 'return').Replace('exit 1', 'return')
$beforeInjection = $source
$source = $source.Replace('if (-not $Apply) {{ throw ''Explicit apply is required'' }}', 'if (-not $Apply) {{ $env:N8N_INTERNAL_TOKEN = ''temporary''; $env:PYTHONDONTWRITEBYTECODE = ''1''; throw ''Test stop before network'' }}')
if ($source -ceq $beforeInjection) {{ throw 'Test setup failed' }}
$wrapper = [ScriptBlock]::Create($source)
foreach ($value in @('sentinel', $null)) {{
    [Environment]::SetEnvironmentVariable('N8N_INTERNAL_TOKEN', $value, 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONDONTWRITEBYTECODE', $value, 'Process')
    $null = . $wrapper
    foreach ($name in @('N8N_INTERNAL_TOKEN', 'PYTHONDONTWRITEBYTECODE')) {{
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $value) {{ throw "Environment not restored: $name" }}
    }}
}}
"""
        encoded = base64.b64encode(command.encode("utf-16le")).decode("ascii")
        result = subprocess.run([powershell, "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

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
