"""Fixed, one-time Ogura Manager-history recovery. No content is persisted locally."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from typing import Any, Mapping

from line_manager_mapping import HttpInternalApi, LINELibAdapter, PRODUCTION_ORIGIN, fixed_storage_path
from line_manager_observed_sync import list_mappings
from line_manager_sender_worker import lineoa_operation

PATH = "/api/internal/line-manager-ogura-recovery"
IMAGE_SHA = "3a8b8911bb3ede6876230b623fafef9c4308a563812871687aeddf47c95c4c22"
TEXT_SHA = "19bf5fd7cee506208dedef4c001fd7ab8f1b0adcda0453692bbbf0d527736fc2"
BODY_SHA = "b5c88ead067d3fe2c9cf4af7664d10ad5780a540efc75671529faade61bfeeb6"


class RecoveryError(Exception): pass


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def payload(api: HttpInternalApi, reader: LINELibAdapter, action: str) -> dict[str, Any]:
    matches = [row for row in list_mappings(api) if row["id"] == 12]
    if len(matches) != 1: raise RecoveryError()
    mapping = matches[0]
    bot, chat = mapping["managerBotId"], mapping["managerChatId"]
    if bot not in reader.bot_ids(): raise RecoveryError()
    raw = reader.messages(bot, chat)
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list) or len(raw["list"]) > 100: raise RecoveryError()
    found: dict[str, dict[str, Any]] = {}
    for item in raw["list"]:
        if not isinstance(item, Mapping) or item.get("type") != "message": continue
        message = item.get("message")
        if not isinstance(message, Mapping) or not isinstance(message.get("id"), str): raise RecoveryError()
        message_id = message["id"]
        kind = "image" if digest(message_id) == IMAGE_SHA else "text" if digest(message_id) == TEXT_SHA else None
        if kind is None: continue
        source, timestamp = item.get("source"), item.get("timestamp")
        expected_time = 1794319649332 if kind == "image" else 1794319904836
        if not isinstance(source, Mapping) or source.get("chatId") != chat or message.get("type") != kind or type(timestamp) is not int or timestamp != expected_time or kind in found: raise RecoveryError()
        event = {"messageId": message_id, "type": kind, "timestamp": timestamp}
        if kind == "text":
            body = message.get("text")
            if not isinstance(body, str) or len(body) != 448 or digest(body) != BODY_SHA: raise RecoveryError()
            event["text"] = body
        found[kind] = event
    if set(found) != {"image", "text"}: raise RecoveryError()
    return {"action": action, "mappingId": 12, "inquiryId": 13, "managerBotId": bot, "managerChatId": chat, "events": [found["image"], found["text"]]}


def run(api: HttpInternalApi, reader: LINELibAdapter, apply: bool) -> dict[str, Any]:
    request = payload(api, reader, "apply" if apply else "check")
    result = api._request(PATH, request)
    status = "complete" if apply else "checked"
    if result.get("ok") is not True or result.get("status") != status or type(result.get("existingMessageCount")) is not int or not 0 <= result["existingMessageCount"] <= 2 or type(result.get("imageStored")) is not bool:
        raise RecoveryError()
    if apply and (type(result.get("insertedMessageCount")) is not int or result["insertedMessageCount"] + result["existingMessageCount"] != 2 or result["imageStored"] is not True): raise RecoveryError()
    return {"status": status, "existingMessageCount": result["existingMessageCount"], "imageStored": result["imageStored"], **({"insertedMessageCount": result["insertedMessageCount"]} if apply else {})}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fixed Ogura inbound recovery")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        token = os.environ.get("N8N_INTERNAL_TOKEN")
        if not token: raise RecoveryError()
        api = HttpInternalApi(PRODUCTION_ORIGIN, token)
        with lineoa_operation(timeout_seconds=3):
            reader = LINELibAdapter.from_storage(fixed_storage_path())
            result = run(api, reader, args.apply)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception:
        print('{"status":"unavailable"}')
        return 1


if __name__ == "__main__": raise SystemExit(main())
