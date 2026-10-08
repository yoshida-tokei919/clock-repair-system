"""Single-instance, fail-closed orchestration for the existing LINE Manager sender.

The default CLI only reconciles. Sending requires --allow-send explicitly.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import time
from typing import Iterator

from line_manager_sender import (
    HttpInternalApi, LINELibAdapter, PRODUCTION_ORIGIN, WorkerError,
    evidence_directory, process_reconciliation_once, process_send_once,
)

OPERATION_LOCK_TIMEOUT_SECONDS = 5


def fixed_storage_path() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        raise WorkerError("LOCALAPPDATA is required")
    return Path(local) / "clock-repair-system" / "linelib-poc" / "lineoa-storage.json"


@contextmanager
def _file_lock(name: str, busy_error: type[WorkerError], root: Path | None,
               timeout_seconds: float | None) -> Iterator[None]:
    directory = evidence_directory(root)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / name).open("a+b") as lock:
        deadline = None if timeout_seconds is None else time.monotonic() + timeout_seconds
        if os.name == "nt":
            import msvcrt
            def acquire() -> None:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            def release() -> None:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            def acquire() -> None:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            def release() -> None:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        while True:
            try:
                acquire()
                break
            except OSError as error:
                if deadline is not None and time.monotonic() >= deadline:
                    raise busy_error("lock unavailable") from error
                time.sleep(0.1)
        try:
            yield
        finally:
            release()


class LineoaOperationBusy(WorkerError):
    pass


@contextmanager
def single_instance(root: Path | None = None) -> Iterator[None]:
    with _file_lock("sender-service.lock", WorkerError, root, 0):
        yield


@contextmanager
def lineoa_operation(root: Path | None = None, *, timeout_seconds: float | None = None) -> Iterator[None]:
    with _file_lock("lineoa-operation.lock", LineoaOperationBusy, root, timeout_seconds):
        yield


def process_cycle(api, adapter, *, allow_send: bool, evidence_root: Path | None = None) -> str:
    result = process_reconciliation_once(api, adapter, evidence_root=evidence_root)
    if result != "no reconciliation candidate":
        return result
    if not allow_send:
        return "send disabled; no claim, fence, or Manager POST"
    return process_send_once(api, adapter, allow_send=True, evidence_root=evidence_root)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LINE Manager sender service")
    parser.add_argument("--allow-send", action="store_true", help="enable one fenced Manager POST per cycle")
    parser.add_argument("--once", action="store_true", help="run one cycle and exit")
    parser.add_argument("--poll-seconds", type=int, default=30, help="seconds between cycles (minimum 5)")
    args = parser.parse_args(argv)
    if args.poll_seconds < 5:
        parser.error("--poll-seconds must be at least 5")
    try:
        token = os.environ.get("N8N_INTERNAL_TOKEN")
        if not token:
            raise WorkerError("N8N_INTERNAL_TOKEN is required")
        with single_instance():
            api = HttpInternalApi(PRODUCTION_ORIGIN, token)
            adapter = None
            while True:
                try:
                    if adapter is None:
                        with lineoa_operation(timeout_seconds=OPERATION_LOCK_TIMEOUT_SECONDS):
                            adapter = LINELibAdapter.from_storage(fixed_storage_path())
                    with lineoa_operation(timeout_seconds=OPERATION_LOCK_TIMEOUT_SECONDS):
                        result = process_cycle(api, adapter, allow_send=args.allow_send)
                except LineoaOperationBusy:
                    result = "lineoa operation busy; retry next cycle"
                    if args.once:
                        print(f"status={result}", flush=True)
                        return 1
                # Only fixed status strings leave the worker; no messages, IDs, or credentials.
                print(f"status={result}", flush=True)
                if args.once:
                    return 0
                time.sleep(args.poll_seconds)
    except Exception:
        print("status=failed", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
