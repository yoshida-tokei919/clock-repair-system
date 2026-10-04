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


def fixed_storage_path() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        raise WorkerError("LOCALAPPDATA is required")
    return Path(local) / "clock-repair-system" / "linelib-poc" / "lineoa-storage.json"


@contextmanager
def single_instance(root: Path | None = None) -> Iterator[None]:
    directory = evidence_directory(root)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "worker.lock").open("a+b") as lock:
        try:
            lock.seek(0)
            if not lock.read(1):
                lock.write(b"0")
                lock.flush()
            lock.seek(0)
        except OSError as error:
            raise WorkerError("sender worker already running") from error
        if os.name == "nt":
            import msvcrt
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                raise WorkerError("sender worker already running") from error
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                raise WorkerError("sender worker already running") from error
            try:
                yield
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


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
            adapter = LINELibAdapter.from_storage(fixed_storage_path())
            while True:
                result = process_cycle(api, adapter, allow_send=args.allow_send)
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
