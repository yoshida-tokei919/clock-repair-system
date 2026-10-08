import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone


ADAPTER = Path(__file__).with_name("start-line-manager-mapping-n8n.ps1")
RESET = Path(__file__).with_name("reset-line-manager-mapping-alert-n8n.ps1")
WIRING = ADAPTER.parent.parent / "docs" / "ai-tasks" / "206c2b-line-manager-mapping-n8n-wiring.md"
MUTEX = "Global\\ClockRepairSystem_LineManagerMappingN8n_206C2B"
KEYS = {"status", "candidateCount", "scannedChatCount", "safeMatchCount", "runnerExitCode", "healthy", "alertDue"}
HEALTHY = {"healthy_no_candidates", "verified"}
PENDING = {"pending_no_exact_match", "pending_ambiguity"}
FAILURE = {"mapping_conflict", "manager_live_read_unavailable", "internal_api_unavailable", "configuration_failure", "sender_lock_unavailable"}
STATUSES = HEALTHY | PENDING | FAILURE


@unittest.skipUnless(shutil.which("powershell.exe"), "Windows PowerShell is required")
class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.root = ADAPTER.parent
        self.paths = []
        self.addCleanup(self.cleanup_paths)
        self.runner = self.new_path(".ps1")
        self.adapter = self.new_path(".ps1")
        self.marker = self.new_path(".txt")
        self.state = self.new_path(".json")
        self.grandchild_pid = self.new_path(".pid")
        self.grandchild_script = self.new_path(".ps1")
        self.grandchild_pipes = self.new_path(".txt")
        self.source = ADAPTER.read_text(encoding="utf-8")
        self.mutex_name = f"Global\\ClockRepairSystem_LineManagerMappingN8n_Test_{uuid.uuid4().hex}"
        self.assertIn("$runner = Join-Path $repo 'scripts\\start-line-manager-mapping.ps1'", self.source)
        self.assertIn("$childTimeoutMilliseconds = 240000", self.source)
        self.assertIn("$lockWaitMilliseconds = 300000", self.source)
        self.write_adapter()
        self.write_runner("healthy_no_candidates")

    def new_path(self, suffix):
        with tempfile.NamedTemporaryFile(dir=self.root, suffix=suffix, delete=False) as item:
            path = Path(item.name)
        path.unlink()
        self.paths.append(path)
        return path

    def cleanup_paths(self):
        for path in self.paths:
            path.unlink(missing_ok=True)

    @staticmethod
    def quoted(value):
        return str(value).replace("'", "''")

    def write_adapter(self, *, missing=False, start_failure=False, assignment_failure=False, timeout_ms=None, lock_wait_ms=None):
        source = self.source.replace(MUTEX, self.mutex_name).replace(
            "$runner = Join-Path $repo 'scripts\\start-line-manager-mapping.ps1'",
            f"$runner = '{self.quoted(self.root / 'absent.ps1' if missing else self.runner)}'",
        )
        source = source.replace("$stateDir = Join-Path $env:LOCALAPPDATA 'clock-repair-system\\line-manager-mapping-n8n'", f"$stateDir = '{self.quoted(self.root)}'")
        source = source.replace("$statePath = Join-Path $stateDir 'alert-state.json'", f"$statePath = '{self.quoted(self.state)}'")
        if start_failure:
            source = source.replace("$powerShell = Get-Command powershell.exe -ErrorAction Stop", "throw 'private start failure'")
        if timeout_ms is not None:
            source = source.replace("$childTimeoutMilliseconds = 240000", f"$childTimeoutMilliseconds = {timeout_ms}")
        if lock_wait_ms is not None:
            source = source.replace("$lockWaitMilliseconds = 300000", f"$lockWaitMilliseconds = {lock_wait_ms}")
        if assignment_failure:
            source = source.replace("[MappingJob]::Assign($job, $process.Handle)", "throw 'private assignment failure'")
        self.adapter.write_text(source, encoding="utf-8")

    def write_runner(self, status, exit_code=None, *, output=None, extra=""):
        if exit_code is None:
            exit_code = 0 if status in HEALTHY | PENDING else 1
        if output is None:
            output = f"status={status} candidate_count=2 scanned_chat_count=4 safe_match_count=1"
        lines = [
            "param([switch]$Apply)",
            f"[IO.File]::AppendAllText('{self.quoted(self.marker)}', \"start Apply=$Apply;args=$($MyInvocation.UnboundArguments -join ',')`n\")",
            extra,
            f"[Console]::Out.WriteLine('{self.quoted(output)}')",
            "[Console]::Error.WriteLine('private-stderr')",
            f"[IO.File]::AppendAllText('{self.quoted(self.marker)}', \"end`n\")",
            f"exit {exit_code}",
        ]
        self.runner.write_text("\n".join(lines), encoding="utf-8")

    def run_adapter(self):
        env = dict(os.environ, LOCALAPPDATA=str(self.root))
        return subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(self.adapter)],
            capture_output=True, text=True, timeout=20, env=env,
        )

    def assert_result(self, process, status, exit_code, healthy, alert_due):
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(len(process.stdout.splitlines()), 1, process.stdout)
        parsed = json.loads(process.stdout)
        self.assertEqual(set(parsed), KEYS)
        self.assertEqual(parsed["status"], status)
        self.assertEqual(parsed["runnerExitCode"], exit_code)
        self.assertIs(parsed["healthy"], healthy)
        self.assertIs(parsed["alertDue"], alert_due)
        self.assertNotIn("private", process.stdout + process.stderr)
        return parsed

    def calls(self):
        return self.marker.read_text(encoding="utf-8").splitlines() if self.marker.exists() else []

    def test_all_status_exit_pairs_and_single_apply(self):
        for status in sorted(STATUSES):
            with self.subTest(status=status):
                self.write_runner(status)
                code = 0 if status in HEALTHY | PENDING else 1
                parsed = self.assert_result(self.run_adapter(), status, code, status in HEALTHY, status not in HEALTHY)
                self.assertEqual((parsed["candidateCount"], parsed["scannedChatCount"], parsed["safeMatchCount"]), (2, 4, 1))
        starts = [line for line in self.calls() if line.startswith("start")]
        self.assertEqual(starts, ["start Apply=True;args="] * len(STATUSES))

    def test_rejects_every_inconsistent_exit_pair(self):
        for status in sorted(STATUSES):
            with self.subTest(status=status):
                self.state.unlink(missing_ok=True)
                wrong_code = 1 if status in HEALTHY | PENDING else 0
                self.write_runner(status, wrong_code)
                self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.write_runner("verified", 2)
        self.state.unlink(missing_ok=True)
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)

    def test_malformed_oversized_and_multiline_stdout(self):
        outputs = [
            "", "private token", "status=unknown candidate_count=0 scanned_chat_count=0 safe_match_count=0",
            "status=verified candidate_count=999999999999999999999 scanned_chat_count=0 safe_match_count=0",
            "status=verified candidate_count=1 scanned_chat_count=1 safe_match_count=1 extra=secret",
            "status=verified candidate_count=1 scanned_chat_count=1 safe_match_count=1\nprivate token",
            "x" * 5000,
        ]
        for output in outputs:
            with self.subTest(length=len(output)):
                self.state.unlink(missing_ok=True)
                self.write_runner("verified", 0, output=output)
                parsed = self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
                self.assertEqual((parsed["candidateCount"], parsed["scannedChatCount"], parsed["safeMatchCount"]), (0, 0, 0))

    def test_stderr_overflow_during_run_is_killed(self):
        self.write_runner("verified", extra="[Console]::Error.Write(('private' * 100000)); Start-Sleep -Seconds 10")
        started = time.monotonic()
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertLess(time.monotonic() - started, 8)
        self.assertNotIn("end", self.calls())

    def test_stdout_overflow_during_run_is_killed(self):
        self.write_runner("verified", extra="[Console]::Out.Write(('private' * 5000)); Start-Sleep -Seconds 10")
        started = time.monotonic()
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertLess(time.monotonic() - started, 8)
        self.assertNotIn("end", self.calls())

    def test_output_overflow_terminates_grandchild_job_process(self):
        extra = (
            "$grandchild = Start-Process powershell.exe -ArgumentList "
            "'-NoProfile -NonInteractive -Command \"Start-Sleep -Seconds 30\"' "
            "-PassThru -WindowStyle Hidden; "
            f"[IO.File]::WriteAllText('{self.quoted(self.grandchild_pid)}', [string]$grandchild.Id); "
            "[Console]::Out.Write(('private' * 5000)); Start-Sleep -Seconds 30"
        )
        self.write_runner("verified", extra=extra)
        completed = False
        try:
            self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
            self.assert_grandchild_gone()
            completed = True
        finally:
            if not completed and self.grandchild_pid.exists():
                subprocess.run(["taskkill.exe", "/PID", self.grandchild_pid.read_text(encoding="utf-8"), "/T", "/F"], capture_output=True, timeout=10)

    def test_child_timeout_is_sanitized_and_killed(self):
        self.write_adapter(timeout_ms=500)
        self.write_runner("verified", extra="Start-Sleep -Seconds 10")
        started = time.monotonic()
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertLess(time.monotonic() - started, 8)
        self.assertNotIn("end", self.calls())

    def assert_grandchild_gone(self):
        self.assertTrue(self.grandchild_pid.exists(), "runner did not create a grandchild")
        pid = int(self.grandchild_pid.read_text(encoding="utf-8"))
        probe = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
             f"if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 1 }}"],
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(probe.returncode, 0, "grandchild survived adapter return")

    def test_timeout_terminates_grandchild_job_process(self):
        self.write_adapter(timeout_ms=1500)
        extra = (
            "$grandchild = Start-Process powershell.exe -ArgumentList "
            "'-NoProfile -NonInteractive -Command \"Start-Sleep -Seconds 30\"' "
            "-PassThru -WindowStyle Hidden; "
            f"[IO.File]::WriteAllText('{self.quoted(self.grandchild_pid)}', [string]$grandchild.Id); "
            "Start-Sleep -Seconds 30"
        )
        self.write_runner("verified", extra=extra)
        completed = False
        try:
            self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
            self.assert_grandchild_gone()
            self.assertNotIn("end", self.calls())
            completed = True
        finally:
            if not completed and self.grandchild_pid.exists():
                pid = int(self.grandchild_pid.read_text(encoding="utf-8"))
                subprocess.run(["taskkill.exe", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=10)

    def test_root_exits_first_and_inherited_pipes_do_not_hold_adapter(self):
        self.write_adapter(timeout_ms=10000)
        self.grandchild_script.write_text(
            f"[IO.File]::WriteAllText('{self.quoted(self.grandchild_pid)}', [string]$PID)\n"
            f"[IO.File]::WriteAllText('{self.quoted(self.grandchild_pipes)}', "
            "([string][Console]::IsOutputRedirected + ',' + [string][Console]::IsErrorRedirected))\n"
            "[Console]::Out.WriteLine('private-grandchild-stdout')\n"
            "[Console]::Error.WriteLine('private-grandchild-stderr')\n"
            "Start-Sleep -Seconds 30\n",
            encoding="utf-8",
        )
        extra = (
            "$grandchild = Start-Process powershell.exe -ArgumentList "
            f"'-NoProfile -NonInteractive -File \"{self.quoted(self.grandchild_script)}\"' "
            "-NoNewWindow -PassThru; "
            "Start-Sleep -Milliseconds 700; "
            f"if (-not (Test-Path -LiteralPath '{self.quoted(self.grandchild_pid)}')) {{ throw 'grandchild did not start' }}"
        )
        self.write_runner("verified", extra=extra)
        completed = False
        started = time.monotonic()
        try:
            self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
            self.assertLess(time.monotonic() - started, 8)
            self.assertIn("end", self.calls(), "root must exit normally before cleanup")
            self.assertEqual(self.grandchild_pipes.read_text(encoding="utf-8"), "True,True")
            self.assert_grandchild_gone()
            completed = True
        finally:
            if not completed and self.grandchild_pid.exists():
                pid = int(self.grandchild_pid.read_text(encoding="utf-8"))
                subprocess.run(["taskkill.exe", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=10)

    def test_missing_runner_and_process_start_failure(self):
        self.write_adapter(missing=True)
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertEqual(self.calls(), [])
        self.write_adapter(start_failure=True)
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, False)
        self.assertEqual(self.calls(), [])

    def test_assignment_failure_keeps_gate_closed(self):
        self.write_adapter(assignment_failure=True)
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertEqual(self.calls(), [])

    def test_alert_dedupe_new_status_six_hours_and_recovery(self):
        self.write_runner("pending_no_exact_match")
        self.assert_result(self.run_adapter(), "pending_no_exact_match", 0, False, True)
        self.assertEqual(set(json.loads(self.state.read_text(encoding="utf-8-sig"))), {"lastUnhealthyStatus", "lastAlertAt"})
        self.assert_result(self.run_adapter(), "pending_no_exact_match", 0, False, False)
        self.write_runner("pending_ambiguity")
        self.assert_result(self.run_adapter(), "pending_ambiguity", 0, False, True)
        self.state.write_text(json.dumps({
            "lastUnhealthyStatus": "pending_ambiguity",
            "lastAlertAt": (datetime.now(timezone.utc) - timedelta(hours=7)).isoformat(timespec="microseconds").replace("+00:00", "0+00:00"),
        }), encoding="utf-8")
        self.assert_result(self.run_adapter(), "pending_ambiguity", 0, False, True)
        self.write_runner("verified")
        self.assert_result(self.run_adapter(), "verified", 0, True, False)
        self.assertFalse(self.state.exists())
        self.write_runner("pending_ambiguity")
        self.assert_result(self.run_adapter(), "pending_ambiguity", 0, False, True)

    def test_bad_state_fails_closed(self):
        self.state.write_text('{"customer":"private"}', encoding="utf-8")
        self.write_runner("verified")
        self.assert_result(self.run_adapter(), "verified", 0, True, False)
        self.write_runner("pending_ambiguity")
        self.state.write_text('{"customer":"private"}', encoding="utf-8")
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)

    def test_state_replacement_failure_fails_closed_and_retains_old_state(self):
        old = json.dumps({"lastUnhealthyStatus": "pending_no_exact_match", "lastAlertAt": "2020-01-01T00:00:00.0000000+00:00"})
        self.state.write_text(old, encoding="utf-8")
        self.write_runner("pending_ambiguity")
        source = self.adapter.read_text(encoding="utf-8")
        source = source.replace("[IO.File]::Replace($temporaryPath, $statePath, $backupPath)", "throw 'private replace failure'")
        source = source.replace("Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force -ErrorAction Stop", "throw 'private move failure'")
        self.adapter.write_text(source, encoding="utf-8")
        self.assert_result(self.run_adapter(), "configuration_failure", -1, False, True)
        self.assertEqual(self.state.read_text(encoding="utf-8"), old)

    def test_two_invocations_serialize(self):
        self.write_runner("pending_ambiguity", extra="Start-Sleep -Seconds 2")
        env = dict(os.environ, LOCALAPPDATA=str(self.root))
        command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(self.adapter)]
        first = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        try:
            time.sleep(0.2)
            second = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
            out1, err1 = first.communicate(timeout=20)
            out2, err2 = second.communicate(timeout=20)
        finally:
            if first.poll() is None:
                first.kill()
            if 'second' in locals() and second.poll() is None:
                second.kill()
        self.assert_result(subprocess.CompletedProcess(command, first.returncode, out1, err1), "pending_ambiguity", 0, False, True)
        self.assert_result(subprocess.CompletedProcess(command, second.returncode, out2, err2), "pending_ambiguity", 0, False, False)
        self.assertEqual([line.split()[0] for line in self.calls()], ["start", "end", "start", "end"])

    def test_mutex_wait_timeout_does_not_start_second_runner(self):
        self.write_adapter(lock_wait_ms=300)
        self.write_runner("pending_ambiguity", extra="Start-Sleep -Seconds 2")
        env = dict(os.environ, LOCALAPPDATA=str(self.root))
        command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(self.adapter)]
        first = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        try:
            deadline = time.monotonic() + 5
            while not self.calls() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(self.calls(), "first runner did not start")
            second = subprocess.run(command, capture_output=True, text=True, timeout=10, env=env)
            self.assert_result(second, "configuration_failure", -1, False, True)
            out1, err1 = first.communicate(timeout=10)
        finally:
            if first.poll() is None:
                first.kill()
        self.assert_result(subprocess.CompletedProcess(command, first.returncode, out1, err1), "pending_ambiguity", 0, False, True)
        self.assertEqual([line.split()[0] for line in self.calls()], ["start", "end"])

    def test_fixed_no_send_boundary(self):
        self.assertIn("& ''' + $runner + ''' -Apply", self.source)
        self.assertNotIn("N8N_INTERNAL_TOKEN", self.source)
        self.assertNotIn("--local", self.source.lower())
        self.assertNotIn("-Send", self.source)
        self.assertIn("[Console]::In.ReadLine()", self.source)
        self.assertIn("if ($gate -cne ''RUN'') { exit 1 }", self.source)
        self.assertLess(self.source.index("[Console]::In.ReadLine()"), self.source.index("& ''' + $runner + ''' -Apply"))
        self.assertIn("[MappingJob]::Assign($job, $process.Handle)", self.source)
        self.assertLess(self.source.index("[MappingJob]::Assign($job, $process.Handle)"), self.source.index("$process.StandardInput.WriteLine('RUN')"))
        self.assertIn("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE", self.source)
        self.assertIn("[MappingJob]::Active($job)", self.source)
        self.assertNotIn("$process.Kill()", self.source)
        self.assertNotIn("Get-CimInstance", self.source)


@unittest.skipUnless(shutil.which("powershell.exe"), "Windows PowerShell is required")
class ResetTests(unittest.TestCase):
    def test_workflow_alert_failure_contract(self):
        wiring = WIRING.read_text(encoding="utf-8")
        for required in (
            "retryOnFail: true", "maxTries: 3", "waitBetweenTries: 5000",
            "onError: continueErrorOutput", "only its error output", "Reset Mapping Alert State",
            "reset-line-manager-mapping-alert-n8n.ps1", "ignores all raw Slack error fields",
            "Slack success path does not reset state", "Do not use workflow static data",
        ):
            self.assertIn(required, wiring)

    def test_reset_deletes_only_fixed_state_with_sanitized_output(self):
        source = RESET.read_text(encoding="utf-8")
        self.assertIn(MUTEX, source)
        self.assertIn("clock-repair-system\\line-manager-mapping-n8n\\alert-state.json", source)
        for forbidden in ("N8N_INTERNAL_TOKEN", "Invoke-RestMethod", "Invoke-WebRequest", "Slack", "LINE", "-Send"):
            self.assertNotIn(forbidden, source)
        with tempfile.NamedTemporaryFile(dir=RESET.parent, suffix=".ps1", delete=False) as item:
            copy = Path(item.name)
        with tempfile.NamedTemporaryFile(dir=RESET.parent, suffix=".json", delete=False) as item:
            state = Path(item.name)
        with tempfile.NamedTemporaryFile(dir=RESET.parent, suffix=".json", delete=False) as item:
            sibling = Path(item.name)
        try:
            state.write_text("private", encoding="utf-8")
            sibling.write_text("keep", encoding="utf-8")
            copied = source.replace(MUTEX, f"Global\\ClockRepairSystem_LineManagerMappingN8n_Test_{uuid.uuid4().hex}")
            copied = copied.replace("$statePath = Join-Path $env:LOCALAPPDATA 'clock-repair-system\\line-manager-mapping-n8n\\alert-state.json'", f"$statePath = '{str(state).replace(chr(39), chr(39) * 2)}'")
            copy.write_text(copied, encoding="utf-8")
            env = dict(os.environ, LOCALAPPDATA=str(RESET.parent))
            command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(copy)]
            first = subprocess.run(command, capture_output=True, text=True, timeout=10, env=env)
            self.assertEqual(first.returncode, 0)
            self.assertEqual(first.stdout.splitlines(), ["status=alert_state_reset"])
            self.assertEqual(first.stderr, "")
            self.assertFalse(state.exists())
            self.assertEqual(sibling.read_text(encoding="utf-8"), "keep")
            second = subprocess.run(command, capture_output=True, text=True, timeout=10, env=env)
            self.assertEqual(second.stdout.splitlines(), ["status=alert_state_reset"])
        finally:
            copy.unlink(missing_ok=True)
            state.unlink(missing_ok=True)
            sibling.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
