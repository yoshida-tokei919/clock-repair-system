from pathlib import Path
from contextlib import contextmanager
from contextlib import redirect_stdout
from io import StringIO
from types import SimpleNamespace
from uuid import uuid4
import unittest
from unittest.mock import call, patch

from line_manager_sender import WorkerError
from line_manager_sender_worker import (
    LineoaOperationBusy, MAX_WORKER_LIFETIME_SECONDS, OPERATION_LOCK_TIMEOUT_SECONDS, fixed_storage_path,
    lineoa_operation, main, process_cycle, single_instance,
)


@contextmanager
def available_operation():
    yield


@contextmanager
def busy_operation():
    raise LineoaOperationBusy("test only")
    yield


@contextmanager
def lock_root():
    parent = Path(__file__).parent.resolve()
    root = parent / f"test-lineoa-lock-{uuid4().hex}"
    root.mkdir()
    try:
        yield root
    finally:
        assert root.resolve().parent == parent
        for name in ("sender-service.lock", "lineoa-operation.lock"):
            (root / name).unlink(missing_ok=True)
        root.rmdir()



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
        with lock_root() as root:
            with single_instance(root):
                with self.assertRaises(WorkerError):
                    with single_instance(root):
                        pass
            with single_instance(root):
                pass
            self.assertTrue((root / "sender-service.lock").is_file())

    def test_sender_releases_operation_lock_before_sleep(self):
        with lock_root() as root:
            def between_cycles(_seconds):
                with lineoa_operation(root, timeout_seconds=0):
                    pass
                raise RuntimeError("stop local test")
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.fixed_storage_path", return_value=root / "storage"), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=object()), \
                 patch("line_manager_sender_worker.process_cycle", return_value="no send candidate"), \
                 patch("line_manager_sender_worker.time.sleep", side_effect=between_cycles):
                self.assertEqual(main(["--allow-send"]), 1)
            self.assertTrue((root / "lineoa-operation.lock").is_file())

    def test_lifetime_exit_only_after_completed_cycle(self):
        self.assertEqual(MAX_WORKER_LIFETIME_SECONDS, 3600)
        with lock_root() as root:
            output = StringIO()
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.fixed_storage_path", return_value=root / "storage"), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=object()), \
                 patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
                 patch("line_manager_sender_worker.lineoa_operation", side_effect=lambda **kwargs: available_operation()), \
                 patch("line_manager_sender_worker.process_cycle", return_value="no send candidate") as cycle, \
                 patch("line_manager_sender_worker.time.monotonic", side_effect=[0, 3600]), \
                 patch("line_manager_sender_worker.time.sleep") as sleep, redirect_stdout(output):
                self.assertEqual(main(["--allow-send"]), 0)
            cycle.assert_called_once()
            sleep.assert_not_called()
            self.assertEqual(output.getvalue(), "status=no send candidate\n")

    def test_lifetime_does_not_exit_on_busy_cycle(self):
        with lock_root() as root:
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.lineoa_operation", return_value=busy_operation()), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage") as bootstrap, \
                 patch("line_manager_sender_worker.time.monotonic", side_effect=[0]), \
                 patch("line_manager_sender_worker.time.sleep", side_effect=RuntimeError("stop test")):
                self.assertEqual(main([]), 1)
            bootstrap.assert_not_called()

    def test_typed_history_expiry_recovers_once_under_reacquired_operation_lock(self):
        events = []
        @contextmanager
        def operation(**kwargs):
            events.append("lock")
            try: yield
            finally: events.append("unlock")
        stale = SimpleNamespace(auth_expired=False)
        fresh = SimpleNamespace(auth_expired=False)
        def cycle(api, adapter, **kwargs):
            events.append("cycle")
            if adapter is stale:
                stale.auth_expired = True
                return "pre-send history/evidence failed"
            return "no send candidate"
        def bootstrap():
            events.append("bootstrap")
            self.assertEqual(events[-2], "lock")
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
             patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
             patch("line_manager_sender_worker.lineoa_operation", side_effect=operation), \
             patch("line_manager_sender_worker.HttpInternalApi"), \
             patch("line_manager_sender_worker.fixed_storage_path", return_value=Path("storage")), \
             patch("line_manager_sender_worker.LINELibAdapter.from_storage", side_effect=[stale, fresh]) as restore, \
             patch("line_manager_sender_worker.process_cycle", side_effect=cycle), \
             patch("line_manager_auth_storage.bootstrap", side_effect=bootstrap) as recover, \
             patch("line_manager_sender_worker.time.sleep", side_effect=[None, RuntimeError("stop test")]), \
             redirect_stdout(StringIO()):
            self.assertEqual(main(["--allow-send"]), 1)
        self.assertEqual(recover.call_count, 1)
        self.assertEqual(restore.call_count, 2)
        self.assertEqual(events[:6], ["lock", "unlock", "lock", "cycle", "unlock", "lock"])
        self.assertEqual(events[6:9], ["bootstrap", "unlock", "lock"])

    def test_generic_history_and_unknown_post_outcome_never_bootstrap(self):
        for result in ("pre-send history/evidence failed", "history unavailable; reconciliation remains pending",
                       "post outcome unknown; reconciliation required"):
            with self.subTest(result=result), \
                 patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
                 patch("line_manager_sender_worker.lineoa_operation", side_effect=lambda **kwargs: available_operation()), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.fixed_storage_path", return_value=Path("storage")), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=SimpleNamespace(auth_expired=False)), \
                 patch("line_manager_sender_worker.process_cycle", return_value=result), \
                 patch("line_manager_auth_storage.bootstrap") as recover, redirect_stdout(StringIO()):
                self.assertEqual(main(["--once", "--allow-send"]), 0)
                recover.assert_not_called()

    def test_challenge_during_typed_expiry_recovery_fails_closed(self):
        adapter = SimpleNamespace(auth_expired=True)
        output = StringIO()
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
             patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
             patch("line_manager_sender_worker.lineoa_operation", side_effect=lambda **kwargs: available_operation()), \
             patch("line_manager_sender_worker.HttpInternalApi"), \
             patch("line_manager_sender_worker.fixed_storage_path", return_value=Path("storage")), \
             patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=adapter), \
             patch("line_manager_sender_worker.process_cycle", return_value="history unavailable; reconciliation remains pending"), \
             patch("line_manager_auth_storage.bootstrap", side_effect=RuntimeError("secret challenge")) as recover, \
             redirect_stdout(output):
            self.assertEqual(main(["--once", "--allow-send"]), 1)
        recover.assert_called_once()
        self.assertEqual(output.getvalue(), "status=failed\n")

    def test_second_expiry_does_not_repeat_bootstrap(self):
        first = SimpleNamespace(auth_expired=True)
        second = SimpleNamespace(auth_expired=True)
        output = StringIO()
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
             patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
             patch("line_manager_sender_worker.lineoa_operation", side_effect=lambda **kwargs: available_operation()), \
             patch("line_manager_sender_worker.HttpInternalApi"), \
             patch("line_manager_sender_worker.fixed_storage_path", return_value=Path("storage")), \
             patch("line_manager_sender_worker.LINELibAdapter.from_storage", side_effect=[first, second]), \
             patch("line_manager_sender_worker.process_cycle", return_value="pre-send history/evidence failed") as cycle, \
             patch("line_manager_auth_storage.bootstrap") as recover, \
             patch("line_manager_sender_worker.time.sleep", return_value=None), redirect_stdout(output):
            self.assertEqual(main(["--allow-send"]), 1)
        self.assertEqual(cycle.call_count, 2)
        recover.assert_called_once()
        self.assertEqual(output.getvalue(),
                         "status=pre-send history/evidence failed\nstatus=auth recovery unavailable\n")

    def test_recovery_lock_busy_stops_without_bootstrap_or_retry(self):
        output = StringIO()
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
             patch("line_manager_sender_worker.single_instance", side_effect=lambda: available_operation()), \
             patch("line_manager_sender_worker.lineoa_operation", side_effect=[available_operation(), available_operation(), busy_operation()]), \
             patch("line_manager_sender_worker.HttpInternalApi"), \
             patch("line_manager_sender_worker.fixed_storage_path", return_value=Path("storage")), \
             patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=SimpleNamespace(auth_expired=True)) as restore, \
             patch("line_manager_sender_worker.process_cycle", return_value="pre-send history/evidence failed"), \
             patch("line_manager_auth_storage.bootstrap") as recover, redirect_stdout(output):
            self.assertEqual(main(["--allow-send"]), 1)
        restore.assert_called_once()
        recover.assert_not_called()
        self.assertEqual(output.getvalue(), "status=auth recovery unavailable\n")

    def test_bootstrap_busy_blocks_linelib_and_once_fails(self):
        self.assertEqual(OPERATION_LOCK_TIMEOUT_SECONDS, 5)
        with lock_root() as root:
            output = StringIO()
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.lineoa_operation", return_value=busy_operation()) as operation, \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage") as bootstrap, \
                 patch("line_manager_sender_worker.process_cycle") as cycle, \
                 redirect_stdout(output):
                self.assertEqual(main(["--once", "--allow-send"]), 1)
            operation.assert_called_once_with(timeout_seconds=OPERATION_LOCK_TIMEOUT_SECONDS)
            bootstrap.assert_not_called()
            cycle.assert_not_called()
            self.assertEqual(output.getvalue(), "status=lineoa operation busy; retry next cycle\n")

    def test_cycle_busy_sleeps_and_retries_without_processing(self):
        with lock_root() as root:
            output = StringIO()
            sleeps = []
            def between_cycles(seconds):
                sleeps.append(seconds)
                if len(sleeps) == 1:
                    cycle.assert_not_called()
                with self.assertRaises(WorkerError):
                    with single_instance(root):
                        pass
                if len(sleeps) == 2:
                    raise RuntimeError("stop local test")
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.HttpInternalApi"), \
                 patch("line_manager_sender_worker.fixed_storage_path", return_value=root / "storage"), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage", return_value=object()) as bootstrap, \
                 patch("line_manager_sender_worker.lineoa_operation", side_effect=[available_operation(), busy_operation(), available_operation()]) as operation, \
                 patch("line_manager_sender_worker.process_cycle", return_value="no send candidate") as cycle, \
                 patch("line_manager_sender_worker.time.sleep", side_effect=between_cycles), \
                 redirect_stdout(output):
                self.assertEqual(main(["--allow-send"]), 1)
            bootstrap.assert_called_once()
            cycle.assert_called_once()
            self.assertEqual(sleeps, [30, 30])
            self.assertEqual(operation.call_args_list, [call(timeout_seconds=OPERATION_LOCK_TIMEOUT_SECONDS)] * 3)
            self.assertEqual(output.getvalue(),
                             "status=lineoa operation busy; retry next cycle\n"
                             "status=no send candidate\nstatus=failed\n")

    def test_second_sender_worker_cannot_bootstrap(self):
        with lock_root() as root:
            with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": "test-only"}), \
                 patch("line_manager_sender_worker.evidence_directory", return_value=root), \
                 patch("line_manager_sender_worker.LINELibAdapter.from_storage") as bootstrap, \
                 single_instance(root):
                self.assertEqual(main(["--once", "--allow-send"]), 1)
            bootstrap.assert_not_called()

    def test_missing_configuration_fails_before_network_or_send(self):
        with patch.dict("line_manager_sender_worker.os.environ", {"N8N_INTERNAL_TOKEN": ""}):
            self.assertEqual(main(["--once", "--allow-send"]), 1)

    def test_storage_path_is_fixed(self):
        with patch.dict("line_manager_sender_worker.os.environ", {"LOCALAPPDATA": "C:/Local"}):
            self.assertEqual(fixed_storage_path(), Path("C:/Local/clock-repair-system/linelib-poc/lineoa-storage.json"))


if __name__ == "__main__":
    unittest.main()
