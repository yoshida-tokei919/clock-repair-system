"""Fail-closed, read-only verifier for immutable LINE Manager chat mappings.

This worker never sends or mutates LINE.  It may only read chat lists and
history, then (only with explicit apply=True) ask the internal API to record a
mapping already proven by an exact immutable LINE message id.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence
from urllib.parse import urlsplit
import argparse
import json
import os
import urllib.error
import urllib.request

PRODUCTION_ORIGIN = "https://yoshidawatchrepair.com"
LOCAL_TEST_ORIGIN = "http://127.0.0.1:3000"


class MappingWorkerError(Exception): pass


@dataclass(frozen=True)
class Evidence:
    inquiry_message_id: int
    external_message_id: str
    received_at: str | None
    order: int


@dataclass(frozen=True)
class Candidate:
    line_user_id: int
    evidence: tuple[Evidence, ...]
    order: int


@dataclass(frozen=True)
class MappingMatch:
    candidate: Candidate
    evidence: Evidence
    manager_bot_id: str
    manager_chat_id: str


@dataclass(frozen=True)
class MappingResult:
    status: str
    candidate_count: int
    scanned_chat_count: int
    safe_match_count: int


class InternalApi(Protocol):
    def candidates(self) -> tuple[Candidate, ...]: ...
    def verify(self, match: MappingMatch) -> bool: ...


class LineManagerReader(Protocol):
    def bot_ids(self) -> tuple[str, ...]: ...
    def chats(self, bot_id: str) -> Sequence[Mapping[str, Any]]: ...
    def messages(self, bot_id: str, chat_id: str) -> Any: ...


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip(): raise MappingWorkerError(f"invalid {name}")
    return value


def _id(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0: raise MappingWorkerError(f"invalid {name}")
    return value


def fixed_storage_path() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if not local: raise MappingWorkerError("LOCALAPPDATA is required")
    return Path(local) / "clock-repair-system" / "linelib-poc" / "lineoa-storage.json"


def parse_candidates(raw: Any) -> tuple[Candidate, ...]:
    if not isinstance(raw, Mapping) or raw.get("ok") is not True or not isinstance(raw.get("items"), list):
        raise MappingWorkerError("invalid candidate response")
    candidates: list[Candidate] = []
    seen_users: set[int] = set()
    seen_messages: set[str] = set()
    for candidate_order, item in enumerate(raw["items"]):
        if not isinstance(item, Mapping): raise MappingWorkerError("invalid candidate item")
        line_user_id = _id(item.get("lineUserId"), "lineUserId")
        evidence_raw = item.get("evidence")
        if line_user_id in seen_users or not isinstance(evidence_raw, list) or not evidence_raw or len(evidence_raw) > 5:
            raise MappingWorkerError("invalid candidate evidence")
        evidence: list[Evidence] = []
        for evidence_order, row in enumerate(evidence_raw):
            if not isinstance(row, Mapping): raise MappingWorkerError("invalid evidence item")
            message_id = _string(row.get("externalMessageId"), "externalMessageId")
            if message_id in seen_messages: raise MappingWorkerError("duplicate evidence message")
            received_at = row.get("receivedAt")
            if received_at is not None and not isinstance(received_at, str): raise MappingWorkerError("invalid receivedAt")
            evidence.append(Evidence(_id(row.get("inquiryMessageId"), "inquiryMessageId"), message_id, received_at, evidence_order))
            seen_messages.add(message_id)
        seen_users.add(line_user_id)
        candidates.append(Candidate(line_user_id, tuple(evidence), candidate_order))
    if len(candidates) > 20: raise MappingWorkerError("candidate response exceeds limit")
    return tuple(candidates)


def parse_chats(raw: Any) -> tuple[Mapping[str, Any], ...]:
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list): raise MappingWorkerError("invalid chat list")
    chats: list[Mapping[str, Any]] = []
    seen: set[str] = set()
    for item in raw["list"]:
        if not isinstance(item, Mapping): raise MappingWorkerError("invalid chat item")
        chat_id = _string(item.get("chatId"), "chatId")
        if chat_id in seen: raise MappingWorkerError("duplicate chatId")
        seen.add(chat_id); chats.append(item)
    return tuple(chats)


def _event_message_id(event: Mapping[str, Any], requested_chat_id: str) -> str | None:
    if event.get("type") != "message": return None
    source = event.get("source")
    message = event.get("message")
    if not isinstance(source, Mapping) or not isinstance(message, Mapping): raise MappingWorkerError("invalid inbound event")
    if _string(source.get("chatId"), "source chatId") != requested_chat_id: return None
    return _string(message.get("id"), "message id")


def latest_evidence_ids(chat: Mapping[str, Any], requested_chat_id: str) -> tuple[str, ...]:
    latest = chat.get("latestEvent")
    if latest is None: return ()
    if not isinstance(latest, Mapping): raise MappingWorkerError("invalid latest event")
    message_id = _event_message_id(latest, requested_chat_id)
    return (message_id,) if message_id is not None else ()


def history_evidence_ids(raw: Any, requested_chat_id: str) -> tuple[str, ...]:
    if not isinstance(raw, Mapping) or not isinstance(raw.get("list"), list): raise MappingWorkerError("invalid message history")
    result: list[str] = []
    for event in raw["list"]:
        if not isinstance(event, Mapping): raise MappingWorkerError("invalid history event")
        message_id = _event_message_id(event, requested_chat_id)
        if message_id is not None: result.append(message_id)
    return tuple(result)


class LINELibAdapter:
    """Version-coupled read-only lineoa adapter: get_chats and get_chat_messages only."""
    def __init__(self, client: Any):
        if not callable(getattr(client, "get_chats", None)) or not callable(getattr(client, "get_chat_messages", None)):
            raise MappingWorkerError("authenticated LINELib client is required")
        self._client = client

    @classmethod
    def from_storage(cls, storage_path: Path) -> "LINELibAdapter":
        if not storage_path.is_file(): raise MappingWorkerError("LINELib storage is required")
        try:
            from LINELib import LINELib
            return cls(LINELib(storage=str(storage_path)))
        except Exception as error:
            raise MappingWorkerError("unable to initialize authenticated LINELib client") from error

    def bot_ids(self) -> tuple[str, ...]:
        bots = getattr(self._client, "_bot_ids", None)
        if not isinstance(bots, (list, tuple)) or not bots: raise MappingWorkerError("invalid authenticated bot list")
        parsed = tuple(_string(bot, "bot id") for bot in bots)
        if len(set(parsed)) != len(parsed): raise MappingWorkerError("duplicate bot id")
        return parsed

    def chats(self, bot_id: str) -> Sequence[Mapping[str, Any]]:
        return parse_chats(self._client.get_chats(bot_id, 25))

    def messages(self, bot_id: str, chat_id: str) -> Any:
        return self._client.get_chat_messages(bot_id, chat_id, limit=100)


class HttpInternalApi:
    def __init__(self, base_url: str, token: str):
        origin = base_url.rstrip("/"); parsed = urlsplit(origin)
        if origin not in {PRODUCTION_ORIGIN, LOCAL_TEST_ORIGIN} or parsed.path or parsed.query or parsed.fragment:
            raise MappingWorkerError("internal API origin is not allowed")
        if not isinstance(token, str) or not token: raise MappingWorkerError("internal token is required")
        self.base_url, self._token = origin, token

    def _request(self, path: str, body: Mapping[str, Any]) -> Mapping[str, Any]:
        request = urllib.request.Request(self.base_url + path, data=json.dumps(body).encode("utf-8"), method="POST", headers={"Authorization": "Bearer " + self._token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status != 200: raise MappingWorkerError("internal API failed")
                data = json.loads(response.read().decode("utf-8"))
        except MappingWorkerError: raise
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError) as error:
            raise MappingWorkerError("internal API failed") from error
        if not isinstance(data, Mapping): raise MappingWorkerError("invalid internal API response")
        return data

    def candidates(self) -> tuple[Candidate, ...]:
        return parse_candidates(self._request("/api/internal/line-manager-mapping/candidates", {}))

    def verify(self, match: MappingMatch) -> bool:
        data = self._request("/api/internal/line-manager-mapping/verify", {
            "lineUserId": match.candidate.line_user_id,
            "evidenceInquiryMessageId": match.evidence.inquiry_message_id,
            "evidenceManagerMessageId": match.evidence.external_message_id,
            "managerBotId": match.manager_bot_id,
            "managerChatId": match.manager_chat_id,
        })
        item = data.get("item")
        return data.get("ok") is True and isinstance(item, Mapping) and _id(item.get("id"), "mapping id") > 0 and item.get("lineUserId") == match.candidate.line_user_id and isinstance(item.get("verifiedAt"), str)


def _history_from_reader(reader: LineManagerReader, bot_id: str, chat_id: str) -> tuple[str, ...]:
    return history_evidence_ids(reader.messages(bot_id, chat_id), chat_id)


def find_safe_matches(candidates: Sequence[Candidate], reader: LineManagerReader) -> tuple[list[MappingMatch], int, bool]:
    evidence_index = {e.external_message_id: (candidate, e) for candidate in candidates for e in candidate.evidence}
    found: dict[int, dict[tuple[str, str], list[Evidence]]] = {}
    scanned = 0
    for bot_id in reader.bot_ids():
        for chat in reader.chats(bot_id):
            chat_id = _string(chat.get("chatId"), "chatId"); scanned += 1
            message_ids = set(latest_evidence_ids(chat, chat_id)) | set(_history_from_reader(reader, bot_id, chat_id))
            for message_id in message_ids:
                hit = evidence_index.get(message_id)
                if hit:
                    candidate, evidence = hit
                    found.setdefault(candidate.line_user_id, {}).setdefault((bot_id, chat_id), []).append(evidence)
    ambiguous_users = {user_id for user_id, destinations in found.items() if len(destinations) != 1}
    chat_users: dict[tuple[str, str], set[int]] = {}
    for user_id, destinations in found.items():
        for destination in destinations: chat_users.setdefault(destination, set()).add(user_id)
    ambiguous_users.update(user_id for users in chat_users.values() if len(users) > 1 for user_id in users)
    matches: list[MappingMatch] = []
    for candidate in candidates:
        destinations = found.get(candidate.line_user_id, {})
        if candidate.line_user_id in ambiguous_users or len(destinations) != 1: continue
        (bot_id, chat_id), evidence = next(iter(destinations.items()))
        matches.append(MappingMatch(candidate, min(evidence, key=lambda item: item.order), bot_id, chat_id))
    return matches, scanned, bool(ambiguous_users)


def process_mapping_once(api: InternalApi, reader: LineManagerReader, *, apply: bool = False) -> MappingResult:
    candidates = api.candidates()
    if not candidates: return MappingResult("no_candidates", 0, 0, 0)
    matches, scanned, ambiguous = find_safe_matches(candidates, reader)
    if ambiguous: return MappingResult("ambiguous", len(candidates), scanned, len(matches))
    if not matches: return MappingResult("ambiguous" if ambiguous else "no_match", len(candidates), scanned, 0)
    selected = matches[0]
    if not apply: return MappingResult("dry_run_match", len(candidates), scanned, len(matches))
    return MappingResult("verified" if api.verify(selected) else "already_mapped", len(candidates), scanned, len(matches))


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only LINE Manager mapping verifier")
    parser.add_argument("--apply", action="store_true", help="record at most one already verified mapping")
    parser.add_argument("--local", action="store_true", help="use only the local test origin")
    args = parser.parse_args()
    try:
        token = os.environ.get("N8N_INTERNAL_TOKEN")
        if not token: raise MappingWorkerError("N8N_INTERNAL_TOKEN is required")
        api = HttpInternalApi(LOCAL_TEST_ORIGIN if args.local else PRODUCTION_ORIGIN, token)
        result = process_mapping_once(api, LINELibAdapter.from_storage(fixed_storage_path()), apply=args.apply)
        print(f"status={result.status} candidate_count={result.candidate_count} scanned_chat_count={result.scanned_chat_count} safe_match_count={result.safe_match_count}")
        return 0
    except MappingWorkerError:
        print("status=failed")
        return 1


if __name__ == "__main__": raise SystemExit(main())
