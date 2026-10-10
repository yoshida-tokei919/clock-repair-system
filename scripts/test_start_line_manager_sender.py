"""Non-sending checks for the PowerShell sender auth gate."""
from pathlib import Path
import base64
import json
import subprocess
import unittest


LAUNCHER = Path(__file__).with_name("start-line-manager-sender.ps1")


def run_powershell(source: str) -> subprocess.CompletedProcess[bytes]:
    encoded = base64.b64encode(source.encode("utf-16-le")).decode("ascii")
    return subprocess.run(["powershell.exe", "-NoProfile", "-EncodedCommand", encoded], capture_output=True)


class SenderLauncherTests(unittest.TestCase):
    def test_powershell_parser(self):
        path = str(LAUNCHER).replace("'", "''")
        result = run_powershell(
            "$tokens=$null; $errors=$null; "
            f"[System.Management.Automation.Language.Parser]::ParseFile('{path}', "
            "[ref]$tokens, [ref]$errors) | Out-Null; "
            "if ($errors.Count) { exit 1 }"
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))

    def _exercise_launcher(self, gate_exit: int, allow_send: bool) -> list[str]:
        script = LAUNCHER.read_text(encoding="utf-8")
        script = script.replace("$token = [Environment]::GetEnvironmentVariable('N8N_INTERNAL_TOKEN', 'User')", "$token = 'synthetic-token'")
        script = script.replace("1>> $stdout 2>> $stderr", "*> $null")
        script = script.replace("exit 1", "return").replace("exit $LASTEXITCODE", "return")
        self.assertIn("$token = 'synthetic-token'", script)
        self.assertIn("'--ensure-valid'", script)
        self.assertNotIn("1>> $stdout", script)
        quoted_script = script.replace("'", "''")
        harness = (
            "$global:calls = @(); "
            "function Test-Path { param($LiteralPath, $PathType) return $true }; "
            "function New-Item { param($ItemType, $Path, [switch]$Force) return $null }; "
            "function Get-Command { param($Name, $ErrorAction) [pscustomobject]@{Source='fakepython'} }; "
            "function fakepython { "
            "$global:calls += ($args -join ' '); "
            f"if ($args -contains '--ensure-valid') {{ $global:LASTEXITCODE={gate_exit} }} "
            "else { $global:LASTEXITCODE=0 } }; "
            f"$source = '{quoted_script}'; "
            "& ([scriptblock]::Create($source)) " + ("-AllowSend; " if allow_send else "; ") +
            "$global:calls | ConvertTo-Json -Compress"
        )
        result = run_powershell(harness)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        data = json.loads(result.stdout.decode("utf-8-sig"))
        return [data] if isinstance(data, str) else data

    def test_gate_failure_never_invokes_worker(self):
        calls = self._exercise_launcher(7, True)
        self.assertEqual(len(calls), 1)
        self.assertIn("--ensure-valid", calls[0])
        self.assertNotIn("line_manager_sender_worker.py", "\n".join(calls))

    def test_gate_success_invokes_worker_and_preserves_allow_send(self):
        calls = self._exercise_launcher(0, True)
        self.assertEqual(len(calls), 2)
        self.assertIn("--ensure-valid", calls[0])
        self.assertIn("line_manager_sender_worker.py", calls[1])
        self.assertIn("--allow-send", calls[1])

    def test_gate_success_without_allow_send(self):
        calls = self._exercise_launcher(0, False)
        self.assertEqual(len(calls), 2)
        self.assertNotIn("--allow-send", calls[1])


if __name__ == "__main__":
    unittest.main()
