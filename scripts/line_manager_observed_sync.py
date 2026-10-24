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
import re
import time
from typing import Any, Mapping
import urllib.error
import urllib.request

from line_manager_mapping import HttpInternalApi, LINELibAdapter, LOCAL_TEST_ORIGIN, PRODUCTION_ORIGIN, fixed_storage_path
from line_manager_sender_worker import LineoaOperationBusy, lineoa_operation

MAX_MAPPINGS = 1000
MAX_HISTORY = 100


class ObservedSyncError(Exception): pass


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


def process(api: HttpInternalApi, reader: LINELibAdapter, *, apply: bool = False, signing_key: str | None = None) -> dict[str, Any]:
    if apply: signing_key_bytes(signing_key)
    targets = list_mappings(api)
    bots = set(reader.bot_ids())
    if not bots: raise ObservedSyncError()
    scanned = candidates = imported = existing = deferred = 0
    has_earlier = False
    for target in targets:
        bot_id, chat_id = target["managerBotId"], target["managerChatId"]
        if bot_id not in bots: raise ObservedSyncError()
        raw = reader.messages(bot_id, chat_id)
        verified_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        events, earlier = parse_history(raw, chat_id, verified_at)
        has_earlier |= earlier
        scanned += 1
        candidates += len(events)
        if apply:
            for offset in range(0, len(events), 50):
                batch = events[offset:offset + 50]
                response = signed_import(api, signing_key, {"mappingId": target["id"], "managerBotId": bot_id, "managerChatId": chat_id, "events": batch})
                imported += response["imported"]; existing += response["existing"]; deferred += response["deferred"]
    return {"status": "applied" if apply else "dry_run", "scannedChatCount": scanned, "candidateCount": candidates,
            "imported": imported, "existing": existing, "deferred": deferred, "historyComplete": False,
            "hasEarlierHistory": has_earlier, "mappingsIncomplete": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only LINE Manager observed outbound sync")
    parser.add_argument("--apply", action="store_true")
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
            result = process(api, reader, apply=args.apply, signing_key=key)
        print(json.dumps(result, sort_keys=True))
        return 0
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
