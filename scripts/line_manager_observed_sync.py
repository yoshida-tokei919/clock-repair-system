"""Bounded, read-only Manager history observer. Never sends LINE messages.

History is a recent first page only. A backward cursor means earlier history
exists, even when the returned list contains fewer than 100 events.
"""
from __future__ import annotations

from datetime import datetime, timezone
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import tempfile
import time
from typing import Any, Mapping
import urllib.error
import urllib.request

from line_manager_mapping import HttpInternalApi, LINELibAdapter, LOCAL_TEST_ORIGIN, PRODUCTION_ORIGIN, fixed_storage_path
from line_manager_sender_worker import LineoaOperationBusy, lineoa_operation

MAX_MAPPINGS = 1000
MAX_HISTORY = 100
CHECKPOINT_VERSION = 2


class ObservedSyncError(Exception): pass


def checkpoint_path() -> Path:
    root = os.environ.get("LOCALAPPDATA")
    if not root: raise ObservedSyncError()
    return Path(root) / "clock-repair-system" / "line-manager-observed-sync-checkpoint.json"


def _digest(*values: str) -> str:
    return hashlib.sha256(json.dumps(values, separators=(",", ":")).encode("utf-8")).hexdigest()


def load_checkpoint(path: Path, start_at: str) -> dict[str, Any]:
    if not path.exists():
        return {"version": CHECKPOINT_VERSION, "startAt": start_at, "scannedAt": None, "chats": {}, "initialCoverageUnverified": True}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError) as error:
        raise ObservedSyncError() from error
    if not isinstance(state, dict) or set(state) != {"version", "startAt", "scannedAt", "chats", "initialCoverageUnverified"} or type(state["version"]) is not int or state["version"] != CHECKPOINT_VERSION or state["startAt"] != start_at or type(state["initialCoverageUnverified"]) is not bool:
        raise ObservedSyncError()
    try:
        datetime.fromisoformat(state["scannedAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError) as error:
        raise ObservedSyncError() from error
    if not isinstance(state["chats"], dict) or len(state["chats"]) > MAX_MAPPINGS:
        raise ObservedSyncError()
    for chat, ids in state["chats"].items():
        if not isinstance(chat, str) or re.fullmatch(r"[0-9a-f]{64}", chat) is None or not isinstance(ids, list) or len(ids) > MAX_HISTORY or len(set(ids)) != len(ids) or any(not isinstance(item, str) or re.fullmatch(r"[0-9a-f]{64}", item) is None for item in ids):
            raise ObservedSyncError()
    return state


def save_checkpoint(path: Path, state: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp: str | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=".observed-sync-", suffix=".tmp", delete=False) as file:
            temp = file.name
            json.dump(state, file, separators=(",", ":"), sort_keys=True)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    except OSError as error:
        raise ObservedSyncError() from error
    finally:
        if temp and os.path.exists(temp): os.unlink(temp)


def parse_start_at(value: str | None, now: datetime) -> datetime:
    if not isinstance(value, str) or re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value) is None:
        raise ObservedSyncError()
    try:
        cutoff = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ObservedSyncError() from error
    if cutoff > now: raise ObservedSyncError()
    return cutoff


def signing_key_bytes(value: str | None) -> bytes:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise ObservedSyncError()
    return bytes.fromhex(value)


def _valid_string(value: Any, max_length: int = 256) -> bool:
    return isinstance(value, str) and 0 < len(value) <= max_length and bool(value.strip())


def parse_history(raw: Any, chat_id: str, verified_at: str) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list) or len(raw["list"]) > MAX_HISTORY:
        raise ObservedSyncError()
    backward = raw.get("backward")
    if backward is not None and not isinstance(backward, str): raise ObservedSyncError()
    events: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}
    for item in raw["list"]:
        if not isinstance(item, Mapping): raise ObservedSyncError()
        if item.get("type") != "messageSent": continue
        message = item.get("message")
        if not isinstance(message, Mapping): raise ObservedSyncError()
        if message.get("type") != "text": continue
        source = item.get("source")
        if not isinstance(source, Mapping) or source.get("chatId") != chat_id: raise ObservedSyncError()
        message_id, body, millis = message.get("id"), message.get("text"), item.get("timestamp")
        send_id = item.get("sendId")
        if not _valid_string(message_id) or not _valid_string(body, 5000) or (send_id is not None and not _valid_string(send_id)) or type(millis) is not int:
            raise ObservedSyncError()
        if millis < 946684800000 or millis > int(time.time() * 1000) + 120000: raise ObservedSyncError()
        timestamp = datetime.fromtimestamp(millis / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        event = {"messageId": message_id, "text": body, "chatId": chat_id, "timestamp": timestamp, "sendId": send_id, "verifiedAt": verified_at}
        if message_id in seen:
            if seen[message_id] != event: raise ObservedSyncError()
            continue
        seen[message_id] = event
        events.append(event)
    return events, bool(backward)


def _page_evidence(raw: Any, chat_id: str) -> dict[str, str]:
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list) or len(raw["list"]) > MAX_HISTORY:
        raise ObservedSyncError()
    evidence: dict[str, str] = {}
    for item in raw["list"]:
        if not isinstance(item, Mapping): raise ObservedSyncError()
        source = item.get("source")
        if source is not None and (not isinstance(source, Mapping) or source.get("chatId") != chat_id): raise ObservedSyncError()
        message = item.get("message")
        message_id = message.get("id") if isinstance(message, Mapping) else None
        if item.get("type") in ("message", "messageSent") and _valid_string(message_id):
            if source is None: raise ObservedSyncError()
            key = "message:" + message_id
        else:
            if item.get("type") in ("message", "messageSent"): raise ObservedSyncError()
            continue
        digest = hashlib.sha256(json.dumps(item, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
        if key in evidence and evidence[key] != digest: raise ObservedSyncError()
        evidence[key] = digest
    return evidence


def verify_pagination(reader: LINELibAdapter, bot_id: str, chat_id: str, first: Any) -> tuple[str, int]:
    """Two pages maximum; no history data leaves this function."""
    first_keys = _page_evidence(first, chat_id)
    cursor = first.get("backward")
    if cursor is None: return "pagination_unverified", 0
    if not _valid_string(cursor): raise ObservedSyncError()
    second = reader._client.get_chat_messages(bot_id, chat_id, limit=100, before=cursor)
    second_keys = _page_evidence(second, chat_id)
    if any(second_keys[key] != first_keys[key] for key in second_keys.keys() & first_keys.keys()): raise ObservedSyncError()
    new_count = len(second_keys.keys() - first_keys.keys())
    return ("progress" if new_count else "nonprogress"), new_count


def list_mappings(api: HttpInternalApi) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    after = 0
    while True:
        page = api._request("/api/internal/line-manager-observed-sync/mappings", {"afterId": after})
        items = page.get("items")
        cursor = page.get("nextAfterId")
        if page.get("ok") is not True or not isinstance(items, list) or len(items) > 20 or (cursor is not None and (type(cursor) is not int or cursor <= after or not items)):
            raise ObservedSyncError()
        for item in items:
            if not isinstance(item, Mapping) or type(item.get("id")) is not int or item["id"] <= after or not _valid_string(item.get("managerBotId")) or not _valid_string(item.get("managerChatId")):
                raise ObservedSyncError()
            after = item["id"]
            result.append(dict(item))
        if len(result) > MAX_MAPPINGS: raise ObservedSyncError()
        if cursor is None: return result
        if cursor != after: raise ObservedSyncError()


def signed_import(api: HttpInternalApi, key: str, body: Mapping[str, Any]) -> Mapping[str, Any]:
    key_bytes = signing_key_bytes(key)
    raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    timestamp = str(int(time.time()))
    signature = hmac.new(key_bytes, timestamp.encode("ascii") + b"." + raw, hashlib.sha256).hexdigest()
    request = urllib.request.Request(api.base_url + "/api/internal/line-manager-observed-sync/import", data=raw, method="POST", headers={
        "Authorization": "Bearer " + api._token, "Content-Type": "application/json", "X-Line-Manager-Sync-Timestamp": timestamp, "X-Line-Manager-Sync-Signature": signature,
    })
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            if response.status != 200: raise ObservedSyncError()
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise ObservedSyncError() from error
    if not isinstance(data, Mapping) or data.get("ok") is not True or any(type(data.get(field)) is not int or data[field] < 0 for field in ("imported", "existing", "deferred")) or sum(data[field] for field in ("imported", "existing", "deferred")) != len(body["events"]):
        raise ObservedSyncError()
    return data


def process(api: HttpInternalApi, reader: LINELibAdapter, *, apply: bool = False, verify_paging: bool = False, signing_key: str | None = None, start_at: str | None = None, now: datetime | None = None, state_path: Path | None = None) -> dict[str, Any]:
    if apply and verify_paging: raise ObservedSyncError()
    if apply:
        signing_key_bytes(signing_key)
        scan_time = now or datetime.now(timezone.utc)
        cutoff = parse_start_at(start_at, scan_time)
        path = state_path or checkpoint_path()
        state = load_checkpoint(path, start_at)
        next_chats = dict(state["chats"])
        pending: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
        gap = False
        unverified = False
    targets = list_mappings(api)
    bots = set(reader.bot_ids())
    if not bots: raise ObservedSyncError()
    scanned = candidates = imported = existing = deferred = 0
    has_earlier = False
    pagination_status = "pagination_unverified"
    pagination_new = 0
    for target in targets:
        bot_id, chat_id = target["managerBotId"], target["managerChatId"]
        if bot_id not in bots: raise ObservedSyncError()
        raw = reader.messages(bot_id, chat_id)
        verified_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        events, earlier = parse_history(raw, chat_id, verified_at)
        has_earlier |= earlier
        scanned += 1
        if apply:
            chat_key = _digest(bot_id, chat_id)
            page_ids = {_digest(message_id) for key in _page_evidence(raw, chat_id) for message_id in [key.removeprefix("message:")]}
            prior_ids = state["chats"].get(chat_key, [])
            if prior_ids:
                if not page_ids.intersection(prior_ids): gap = True
            else:
                unverified = True
                if earlier or len(raw["list"]) == MAX_HISTORY:
                    timestamps = [item.get("timestamp") for item in raw["list"]]
                    if any(type(value) is not int for value in timestamps): raise ObservedSyncError()
                    if not timestamps or min(timestamps) > int(cutoff.timestamp() * 1000): gap = True
            next_chats[chat_key] = sorted(page_ids)
            events = [event for event in events if datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00")) > cutoff]
            pending.append((target, events))
        candidates += len(events)
        if verify_paging:
            page_status, new_count = verify_pagination(reader, bot_id, chat_id, raw)
            pagination_new += new_count
            if page_status == "nonprogress":
                pagination_status = "nonprogress"
                break
    if apply and not gap:
        for target, events in pending:
            bot_id, chat_id = target["managerBotId"], target["managerChatId"]
            for offset in range(0, len(events), 50):
                batch = events[offset:offset + 50]
                response = signed_import(api, signing_key, {"mappingId": target["id"], "managerBotId": bot_id, "managerChatId": chat_id, "startAt": start_at, "events": batch})
                imported += response["imported"]; existing += response["existing"]; deferred += response["deferred"]
        if deferred == 0:
            save_checkpoint(path, {"version": CHECKPOINT_VERSION, "startAt": start_at, "scannedAt": scan_time.isoformat(timespec="milliseconds").replace("+00:00", "Z"), "chats": next_chats, "initialCoverageUnverified": state["initialCoverageUnverified"] or unverified})
    status = pagination_status if verify_paging else ("coverage_gap_possible" if gap else ("coverage_unverified" if unverified or deferred else "synced_with_overlap")) if apply else "dry_run"
    return {"status": status, "scannedChatCount": scanned, "candidateCount": candidates,
            "imported": imported, "existing": existing, "deferred": deferred, "historyComplete": False,
            "startupCoverageUnverified": (state["initialCoverageUnverified"] or unverified) if apply else None,
            "hasEarlierHistory": has_earlier, "mappingsIncomplete": (pagination_status == "nonprogress" if verify_paging else bool(apply and (gap or unverified or deferred))),
            **({"paginationNewEventCount": pagination_new} if verify_paging else {})}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only LINE Manager observed outbound sync")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify-pagination", action="store_true")
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args(argv)
    try:
        token = os.environ.get("N8N_INTERNAL_TOKEN")
        key = os.environ.get("LINE_MANAGER_SYNC_SIGNING_KEY")
        if not token: raise ObservedSyncError()
        if args.apply: signing_key_bytes(key)
        api = HttpInternalApi(LOCAL_TEST_ORIGIN if args.local else PRODUCTION_ORIGIN, token)
        with lineoa_operation(timeout_seconds=3):
            reader = LINELibAdapter.from_storage(fixed_storage_path())
            result = process(api, reader, apply=args.apply, verify_paging=args.verify_pagination, signing_key=key, start_at=os.environ.get("LINE_MANAGER_SYNC_START_AT"))
        print(json.dumps(result, sort_keys=True))
        return 1 if args.apply and (result["status"] != "synced_with_overlap" or result["deferred"] != 0) else 0
    except LineoaOperationBusy:
        status = "lineoa_operation_busy"
    except Exception:
        status = "unavailable"
    # Any previous batch may have committed; a failed run cannot assert zero writes.
    print(json.dumps({"status": status, "scannedChatCount": None, "candidateCount": None, "imported": None,
                      "existing": None, "deferred": None, "possiblePartial": bool(args.apply),
                      "historyComplete": False, "hasEarlierHistory": None, "mappingsIncomplete": True}, sort_keys=True))
    return 1


if __name__ == "__main__": raise SystemExit(main())
