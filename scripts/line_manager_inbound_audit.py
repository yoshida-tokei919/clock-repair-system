"""Bounded read-only comparison of the newest Manager inbound page per verified chat."""
from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any, Mapping

from line_manager_mapping import HttpInternalApi, LINELibAdapter, LOCAL_TEST_ORIGIN, PRODUCTION_ORIGIN, fixed_storage_path
from line_manager_observed_sync import list_mappings
from line_manager_sender_worker import LineoaOperationBusy, lineoa_operation

COMPARE_PATH = "/api/internal/line-manager-inbound-audit/compare"


class InboundAuditError(Exception):
    pass


def _identifier(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 256 and value.strip() == value and not any(ord(char) < 32 or ord(char) == 127 for char in value)


def parse_recent_inbound(raw: Any, chat_id: str, now_ms: int) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list) or len(raw["list"]) > 100:
        raise InboundAuditError()
    backward = raw.get("backward")
    if backward is not None and not isinstance(backward, str):
        raise InboundAuditError()
    seen: dict[str, dict[str, Any]] = {}
    for item in raw["list"]:
        if not isinstance(item, Mapping):
            raise InboundAuditError()
        if item.get("type") != "message":
            continue
        message = item.get("message")
        if not isinstance(message, Mapping):
            raise InboundAuditError()
        message_type = message.get("type")
        if not _identifier(message_type):
            raise InboundAuditError()
        if message_type not in ("text", "image"):
            continue
        source = item.get("source")
        message_id, timestamp = message.get("id"), item.get("timestamp")
        if not isinstance(source, Mapping) or source.get("chatId") != chat_id or not _identifier(message_id) or type(timestamp) is not int or timestamp < 946684800000 or timestamp > now_ms + 120_000:
            raise InboundAuditError()
        event = {"messageId": message_id, "type": message["type"], "timestamp": timestamp}
        if message_id in seen and seen[message_id] != event:
            raise InboundAuditError()
        seen[message_id] = event
    return [event for event in seen.values() if event["timestamp"] <= now_ms - 300_000], bool(backward)


def audit(api: HttpInternalApi, reader: LINELibAdapter, now_ms: int | None = None) -> dict[str, Any]:
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    mappings = list_mappings(api)
    bots = set(reader.bot_ids())
    if any(item["managerBotId"] not in bots for item in mappings):
        raise InboundAuditError()
    result: dict[str, Any] = {"status": "recent_page_compared", "scannedChatCount": 0, "eligibleCount": 0,
                              "missingMessageCount": 0, "missingImageCount": 0, "mismatchCount": 0,
                              "hasEarlierHistory": False, "historyComplete": False}
    for mapping in mappings:
        bot, chat = mapping["managerBotId"], mapping["managerChatId"]
        events, earlier = parse_recent_inbound(reader.messages(bot, chat), chat, now_ms)
        comparison = api._request(COMPARE_PATH, {"mappingId": mapping["id"], "managerBotId": bot, "managerChatId": chat, "events": events})
        keys = ("eligibleCount", "missingMessageCount", "missingImageCount", "mismatchCount")
        if comparison.get("ok") is not True or comparison.get("status") != "recent_page_compared" or comparison.get("historyComplete") is not False or any(type(comparison.get(key)) is not int or comparison[key] < 0 for key in keys) or comparison["eligibleCount"] != len(events) or sum(comparison[key] for key in keys[1:]) > len(events):
            raise InboundAuditError()
        result["scannedChatCount"] += 1
        for key in keys:
            result[key] += comparison[key]
        result["hasEarlierHistory"] |= earlier
    if any(result[key] for key in ("missingMessageCount", "missingImageCount", "mismatchCount")):
        result["status"] = "discrepancies_found"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only recent LINE inbound discrepancy audit")
    parser.add_argument("--local", action="store_true", help="use local test origin")
    args = parser.parse_args(argv)
    try:
        token = os.environ.get("N8N_INTERNAL_TOKEN")
        if not token:
            raise InboundAuditError()
        api = HttpInternalApi(LOCAL_TEST_ORIGIN if args.local else PRODUCTION_ORIGIN, token)
        with lineoa_operation(timeout_seconds=3):
            reader = LINELibAdapter.from_storage(fixed_storage_path())
            result = audit(api, reader)
        print(json.dumps(result, sort_keys=True))
        return 0
    except LineoaOperationBusy:
        status = "lineoa_operation_busy"
    except Exception:
        status = "unavailable"
    print(json.dumps({"status": status, "scannedChatCount": None, "eligibleCount": None,
                      "missingMessageCount": None, "missingImageCount": None, "mismatchCount": None,
                      "hasEarlierHistory": None, "historyComplete": False}, sort_keys=True))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
