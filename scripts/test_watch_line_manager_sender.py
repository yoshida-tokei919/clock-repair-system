"""Offline Windows watchdog checks; never start the actual Scheduled Task."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import json
import subprocess
import unittest


SCRIPTS = Path(__file__).parent
WATCHDOG = SCRIPTS / "watch-line-manager-sender.ps1"
INSTALLER = SCRIPTS / "install-line-manager-sender-watchdog-task.ps1"


def powershell(source: str) -> subprocess.CompletedProcess[bytes]:
    encoded = base64.b64encode(source.encode("utf-16-le")).decode("ascii")
    return subprocess.run(["powershell.exe", "-NoProfile", "-EncodedCommand", encoded], capture_output=True)


class WatchdogTests(unittest.TestCase):
    def test_scripts_parse(self):
        for path in (WATCHDOG, INSTALLER):
            with self.subTest(path=path.name):
                quoted = str(path).replace("'", "''")
                result = powershell(
                    "$tokens=$null; $errors=$null; "
                    f"[System.Management.Automation.Language.Parser]::ParseFile('{quoted}', "
                    "[ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { exit 1 }"
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))

    def _exercise(self, root: str, *, state: str = "Ready", enabled: bool = True,
                  fail_start: bool = False, missing: bool = False) -> tuple[str, list[str]]:
        source = WATCHDOG.read_text(encoding="utf-8")
        source = source.replace("exit 1", "return").replace("exit 0", "return")
        quoted = source.replace("'", "''")
        root_quoted = root.replace("'", "''")
        harness = (
            f"$env:LOCALAPPDATA='{root_quoted}'; $global:calls=@(); "
            f"function Get-ScheduledTask {{ param($TaskName,$ErrorAction) "
            f"if (${str(missing).lower()}) {{ throw 'missing' }}; "
            f"return [pscustomobject]@{{State='{state}';Settings=[pscustomobject]@{{Enabled=${str(enabled).lower()}}}}} }}; "
            f"function Start-ScheduledTask {{ param($TaskName,$ErrorAction) $global:calls += 'start'; if (${str(fail_start).lower()}) {{ throw 'failed' }} }}; "
            f"$source='{quoted}'; & ([scriptblock]::Create($source)); "
            "'calls=' + (ConvertTo-Json -InputObject $global:calls -Compress)"
        )
        result = powershell(harness)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        lines = result.stdout.decode("utf-8-sig").strip().splitlines()
        self.assertEqual(len(lines), 2, lines)
        return lines[0], json.loads(lines[1].removeprefix("calls="))

    @staticmethod
    def _state_file(root: str) -> Path:
        return Path(root) / "clock-repair-system" / "line-manager-sender" / "watchdog-state.json"

    def test_ready_starts_once_then_cooldown_and_deduped_alert(self):
        with TemporaryDirectory() as root:
            status, calls = self._exercise(root)
            self.assertEqual((status, calls), ("status=start_requested;alertDue=false", ["start"]))
            status, calls = self._exercise(root)
            self.assertEqual((status, calls), ("status=cooldown;alertDue=true", []))
            status, calls = self._exercise(root)
            self.assertEqual((status, calls), ("status=cooldown;alertDue=false", []))

    def test_expired_cooldown_allows_one_start(self):
        with TemporaryDirectory() as root:
            path = self._state_file(root)
            path.parent.mkdir(parents=True)
            old = (datetime.now(timezone.utc) - timedelta(minutes=16)).strftime("%Y-%m-%dT%H:%M:%S.%f0+00:00")
            path.write_text(json.dumps({"lastStartUtc": old, "lastAlertUtc": None}), encoding="utf-8")
            self.assertEqual(self._exercise(root), ("status=start_requested;alertDue=false", ["start"]))

    def test_running_clears_alert_and_never_restarts(self):
        with TemporaryDirectory() as root:
            self._exercise(root)
            self._exercise(root)
            self.assertEqual(self._exercise(root, state="Running"), ("status=running;alertDue=false", []))
            self.assertEqual(self._exercise(root), ("status=cooldown;alertDue=true", []))

    def test_disabled_and_invalid_state_fail_closed(self):
        with TemporaryDirectory() as root:
            status, calls = self._exercise(root, enabled=False)
            self.assertEqual((status, calls), ("status=watchdog_unavailable;alertDue=true", []))

    def test_missing_task_and_failed_start_are_bounded(self):
        with TemporaryDirectory() as root:
            self.assertEqual(self._exercise(root, missing=True),
                             ("status=watchdog_unavailable;alertDue=true", []))
            status, calls = self._exercise(root, fail_start=True)
            self.assertEqual((status, calls), ("status=watchdog_unavailable;alertDue=false", ["start"]))
            self.assertEqual(self._exercise(root), ("status=cooldown;alertDue=false", []))
            path = self._state_file(root)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{invalid", encoding="utf-8")
            status, calls = self._exercise(root)
            self.assertEqual((status, calls), ("status=watchdog_unavailable;alertDue=true", []))

    def test_no_direct_auth_or_sender_invocation(self):
        source = WATCHDOG.read_text(encoding="utf-8")
        for forbidden in ("--precheck", "--ensure-valid", "--allow-send", "line_manager_sender_worker.py", "Stop-ScheduledTask"):
            self.assertNotIn(forbidden, source)
        self.assertIn("Start-ScheduledTask -TaskName $taskName", source)

    def test_installer_defaults_to_preview_and_repeats_every_five_minutes(self):
        source = INSTALLER.read_text(encoding="utf-8")
        self.assertIn("-RepetitionInterval (New-TimeSpan -Minutes 5)", source)
        result = powershell(f"& '{str(INSTALLER).replace(chr(39), chr(39)*2)}'")
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        self.assertIn("status=preview", result.stdout.decode("utf-8-sig"))


if __name__ == "__main__":
    unittest.main()
