from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from line_manager_sender import WorkerError
from line_manager_sender_worker import fixed_storage_path, main, process_cycle, single_instance


class Api:
    def __init__(self, reconciliation=None):
        self.reconciliation = reconciliation
        self.calls = []

    def claim_reconciliation(self):
        self.calls.append("reconcile")
        return self.reconciliation

    def claim_send(self):
        self.calls.append("send")
        return None


class WorkerTests(unittest.TestCase):
    def test_reconciliation_first_and_pending_blocks_send(self):
        api = Api()
        with patch("line_manager_sender_worker.process_reconciliation_once", return_value="history evidence absent or ambiguous; reconciliation remains pending"):
            result = process_cycle(api, object(), allow_send=True)
        self.assertIn("pending", result)
        self.assertEqual(api.calls, [])

    def test_no_reconciliation_can_send_only_when_explicitly_enabled(self):
        api = Api()
        with patch("line_manager_sender_worker.process_reconciliation_once", return_value="no reconciliation candidate"):
            self.assertIn("send disabled", process_cycle(api, object(), allow_send=False))
            self.assertEqual(api.calls, [])
            self.assertEqual(process_cycle(api, object(), allow_send=True), "no send candidate")
            self.assertEqual(api.calls, ["send"])

    def test_os_lock_rejects_second_instance_and_releases(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with single_instance(root):
                with self.assertRaises(WorkerError):
                    with single_instance(root):
                        pass
            with single_instance(root):
                pass

    def test_missing_configuration_fails_before_network_or_send(self):
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": ""}):
            self.assertEqual(main(["--once", "--allow-send"]), 1)

    def test_storage_path_is_fixed(self):
        with patch.dict("line_manager_sender_worker.os.environ", {"LOCALAPPDATA": "C:/Local"}):
            self.assertEqual(fixed_storage_path(), Path("C:/Local/clock-repair-system/linelib-poc/lineoa-storage.json"))


if __name__ == "__main__":
    unittest.main()
