"""Fail-closed local worker for LINE Manager outbox work.

It never writes InquiryMessage. Sending needs an explicit ``allow_send=True``.
LINELib use is coupled to lineoa 7.7.18: public history returns raw JSON, while
private ``_chat_service.send_message`` accepts the supplied payload plus the
authenticated client's ``_session`` and ``_xsrf_token``. Do not use its
high-level sender, which creates a new sendId.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence
from urllib.parse import urlsplit
import json
import os
import urllib.error
import urllib.request

FALLBACK_WINDOW = timedelta(minutes=5)
MAX_CAPTURE_TO_FENCE = timedelta(minutes=10)
MAX_POST_INVOCATION_FENCE_SKEW = timedelta(minutes=2)
PRODUCTION_ORIGIN = "https://yoshidawatchrepair.com"
LOCAL_TEST_ORIGIN = "http://127.0.0.1:3000"

class WorkerError(Exception): pass

@dataclass(frozen=True)
class SendCandidate:
    id: int; text: str; send_id: str; manager_bot_id: str; manager_chat_id: str; claim_token: str; status: str
@dataclass(frozen=True)
class ReconciliationCandidate:
    id: int; text: str; send_id: str; manager_bot_id: str; manager_chat_id: str; reconciliation_token: str; post_attempted_at: datetime
@dataclass(frozen=True)
class HistoryMessage:
    id: str; chat_id: str; text: str; timestamp: datetime; outbound: bool; send_id: str | None = None
@dataclass(frozen=True)
class SendEvidence:
    outbox_id: int; send_id: str; manager_bot_id: str; manager_chat_id: str
    pre_send_watermark: datetime; pre_send_latest_outbound_message_id: str | None; captured_at: datetime; post_invocation_started_at: datetime | None

class InternalApi(Protocol):
    def claim_send(self) -> SendCandidate | None: ...
    def pre_send_failed(self, item: SendCandidate, error: str) -> bool: ...
    def fence(self, item: SendCandidate) -> bool: ...
    def claim_reconciliation(self) -> ReconciliationCandidate | None: ...
    def confirm(self, item: ReconciliationCandidate, message: HistoryMessage) -> bool: ...
class LineManagerAdapter(Protocol):
    def get_raw_history(self, manager_bot_id: str, manager_chat_id: str) -> Sequence[HistoryMessage]: ...
    def post_text_v2(self, manager_bot_id: str, manager_chat_id: str, payload: dict[str, str], *, allow_send: bool) -> None: ...

def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip(): raise WorkerError(f"Invalid {name}")
    return value
def _id(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0: raise WorkerError("Invalid id")
    return value
def _timestamp(value: Any, name: str) -> datetime:
    if not isinstance(value, str) or not value: raise WorkerError(f"Invalid {name}")
    try: result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error: raise WorkerError(f"Invalid {name}") from error
    if result.tzinfo is None or result.utcoffset() is None: raise WorkerError(f"Invalid {name}")
    return result.astimezone(timezone.utc)
def _now(now: datetime | None) -> datetime:
    result = now or datetime.now(timezone.utc)
    if result.tzinfo is None or result.utcoffset() is None: raise WorkerError("Worker clock must be timezone-aware")
    return result.astimezone(timezone.utc)

def text_v2_payload(text: str, send_id: str) -> dict[str, str]:
    if not isinstance(text, str) or not text or not isinstance(send_id, str) or not send_id: raise WorkerError("Outbox text or sendId is missing")
    return {"id": "", "type": "textV2", "text": text, "sendId": send_id}
def safe_error(error: BaseException | str) -> str:
    value = " ".join(str(error).replace("\r", " ").replace("\n", " ").split())
    secret = os.environ.get("N8N_INTERNAL_TOKEN")
    if isinstance(secret, str) and secret: value = value.replace(secret, "[redacted]")
    return value[:300] or "LINE Manager operation failed"

def evidence_directory(root: Path | None = None) -> Path:
    if root is not None: return root
    local = os.environ.get("LOCALAPPDATA")
    if not local: raise WorkerError("LOCALAPPDATA is required for sender evidence")
    return Path(local) / "clock-repair-system" / "line-manager-sender"
def _evidence_path(item_id: int, root: Path | None = None) -> Path: return evidence_directory(root) / f"outbox-{item_id}.json"
def _write_json_atomic(path: Path, data: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with open(temporary, "x", encoding="utf-8", newline="\n") as file:
            json.dump(data, file, ensure_ascii=False, sort_keys=True); file.write("\n"); file.flush(); os.fsync(file.fileno())
        os.replace(temporary, path)
    except Exception:
        try: os.unlink(temporary)
        except OSError: pass
        raise
def persist_evidence(evidence: SendEvidence, *, root: Path | None = None) -> None:
    data = asdict(evidence)
    for field in ("pre_send_watermark", "captured_at", "post_invocation_started_at"):
        data[field] = data[field].isoformat() if data[field] is not None else None
    _write_json_atomic(_evidence_path(evidence.outbox_id, root), data)
def load_evidence(item: ReconciliationCandidate, *, root: Path | None = None) -> SendEvidence | None:
    try: raw = json.loads(_evidence_path(item.id, root).read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError): return None
    if not isinstance(raw, dict): return None
    try:
        evidence = SendEvidence(_id(raw.get("outbox_id")), _string(raw.get("send_id"), "evidence sendId"), _string(raw.get("manager_bot_id"), "evidence managerBotId"), _string(raw.get("manager_chat_id"), "evidence managerChatId"), _timestamp(raw.get("pre_send_watermark"), "evidence watermark"), raw.get("pre_send_latest_outbound_message_id"), _timestamp(raw.get("captured_at"), "evidence capturedAt"), _timestamp(raw.get("post_invocation_started_at"), "evidence postInvocationStartedAt"))
    except WorkerError: return None
    if evidence.pre_send_latest_outbound_message_id is not None and not isinstance(evidence.pre_send_latest_outbound_message_id, str): return None
    if (evidence.outbox_id, evidence.send_id, evidence.manager_bot_id, evidence.manager_chat_id) != (item.id, item.send_id, item.manager_bot_id, item.manager_chat_id): return None
    capture_delta = item.post_attempted_at - evidence.captured_at
    if capture_delta > MAX_CAPTURE_TO_FENCE or capture_delta < -MAX_POST_INVOCATION_FENCE_SKEW: return None
    if evidence.post_invocation_started_at < evidence.captured_at or abs(evidence.post_invocation_started_at - item.post_attempted_at) > MAX_POST_INVOCATION_FENCE_SKEW: return None
    return evidence
def delete_evidence(item_id: int, *, root: Path | None = None) -> None:
    try: _evidence_path(item_id, root).unlink()
    except FileNotFoundError: pass

def pre_send_watermark(history: Sequence[HistoryMessage]) -> tuple[datetime, str | None]:
    outbound = [message for message in history if message.outbound]
    if not outbound: return datetime.min.replace(tzinfo=timezone.utc), None
    latest = max(outbound, key=lambda message: message.timestamp)
    return latest.timestamp.astimezone(timezone.utc), latest.id or None
def reconcile_history(history: Sequence[HistoryMessage], item: ReconciliationCandidate, evidence: SendEvidence) -> HistoryMessage | None:
    if any(not message.id or not message.chat_id or not message.text or message.timestamp.tzinfo is None or message.timestamp.utcoffset() is None for message in history): return None
    base = [m for m in history if m.outbound and m.chat_id == item.manager_chat_id and m.text == item.text]
    if any(m.send_id is not None for m in history): matches = [m for m in base if m.send_id == item.send_id]
    else:
        lower_bound = max(evidence.pre_send_watermark, evidence.captured_at)
        end = item.post_attempted_at + FALLBACK_WINDOW
        if end < lower_bound: return None
        matches = [m for m in base if lower_bound < m.timestamp.astimezone(timezone.utc) <= end]
    return matches[0] if len(matches) == 1 else None

class LINELibAdapter:
    """Private lineoa 7.7.18 adapter; use only an authenticated injected client."""
    def __init__(self, client: Any):
        if not all(hasattr(client, name) for name in ("get_chat_messages", "_chat_service", "_session", "_xsrf_token")): raise WorkerError("Authenticated lineoa 7.7.18 client is required")
        self._client = client
    @classmethod
    def from_storage(cls, storage_path: str | os.PathLike[str]) -> "LINELibAdapter":
        path = Path(storage_path)
        if not path.is_file(): raise WorkerError("Existing LINELib storage path is required")
        try:
            from LINELib import LINELib
            return cls(LINELib(storage=str(path)))
        except Exception as error: raise WorkerError("Unable to initialize authenticated LINELib client") from error
    def get_raw_history(self, manager_bot_id: str, manager_chat_id: str) -> Sequence[HistoryMessage]:
        raw = self._client.get_chat_messages(manager_bot_id, manager_chat_id, limit=100)
        if not isinstance(raw, Mapping): raise WorkerError("LINELib history response is not an object")
        # 7.7.18 provides raw JSON but no shipped history schema/fixture. Parsing
        # unverified field names would invent reconciliation evidence; empty means
        # non-confirming until real E2E establishes the raw shape.
        return []
    def post_text_v2(self, manager_bot_id: str, manager_chat_id: str, payload: dict[str, str], *, allow_send: bool) -> None:
        if not allow_send: raise WorkerError("Explicit allow_send=True is required")
        result = self._client._chat_service.send_message(manager_bot_id, manager_chat_id, payload, session=self._client._session, xsrf_token=self._client._xsrf_token)
        if result != {}: raise WorkerError("LINELib send response was not the expected empty object")

def process_send_once(api: InternalApi, adapter: LineManagerAdapter, *, allow_send: bool, now: datetime | None = None, evidence_root: Path | None = None) -> str:
    if not allow_send: return "send disabled; no claim, fence, or Manager POST"
    item = api.claim_send()
    if item is None: return "no send candidate"
    if item.status != "CLAIMED": return "invalid send claim status; no fence or Manager POST"
    try:
        history = adapter.get_raw_history(item.manager_bot_id, item.manager_chat_id); watermark, latest_id = pre_send_watermark(history)
        evidence = SendEvidence(item.id, item.send_id, item.manager_bot_id, item.manager_chat_id, watermark, latest_id, _now(now), None); persist_evidence(evidence, root=evidence_root)
    except Exception as error:
        return "pre-send history/evidence failed" if api.pre_send_failed(item, safe_error(error)) else "pre-send failure acknowledgement rejected"
    try:
        if not api.fence(item): return "fence rejected; no Manager POST"
    except Exception:
        return "fence failed; no Manager POST"
    try:
        persist_evidence(replace(evidence, post_invocation_started_at=_now(now)), root=evidence_root)
    except Exception:
        return "post-invocation marker persistence failed; no Manager POST"
    try: adapter.post_text_v2(item.manager_bot_id, item.manager_chat_id, text_v2_payload(item.text, item.send_id), allow_send=True)
    except Exception: return "post outcome unknown; reconciliation required"
    return "post attempted; reconciliation required"
def process_reconciliation_once(api: InternalApi, adapter: LineManagerAdapter, *, evidence_root: Path | None = None) -> str:
    item = api.claim_reconciliation()
    if item is None: return "no reconciliation candidate"
    evidence = load_evidence(item, root=evidence_root)
    if evidence is None: return "local evidence missing or mismatched; reconciliation remains pending"
    try: history = adapter.get_raw_history(item.manager_bot_id, item.manager_chat_id)
    except Exception: return "history unavailable; reconciliation remains pending"
    match = reconcile_history(history, item, evidence)
    if match is None: return "history evidence absent or ambiguous; reconciliation remains pending"
    if not api.confirm(item, match): return "confirmation rejected; reconciliation remains pending"
    delete_evidence(item.id, root=evidence_root); return "confirmed"

class HttpInternalApi:
    """Known-origin internal client. Tokens are never logged."""
    def __init__(self, base_url: str, token: str):
        origin = base_url.rstrip("/"); parsed = urlsplit(origin)
        if origin not in {PRODUCTION_ORIGIN, LOCAL_TEST_ORIGIN} or parsed.path or parsed.query or parsed.fragment: raise WorkerError("Internal sender API origin is not allowed")
        if not isinstance(token, str) or not token: raise WorkerError("Internal sender token is required")
        self.base_url, self._token = origin, token
    def _post(self, path: str, body: dict[str, str] | None = None) -> dict[str, Any]:
        request = urllib.request.Request(self.base_url + path, data=json.dumps(body or {}).encode("utf-8"), method="POST", headers={"Authorization": "Bearer " + self._token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status != 200: raise WorkerError("Internal sender API returned an unexpected status")
                data = json.loads(response.read().decode("utf-8"))
        except WorkerError: raise
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError) as error: raise WorkerError("Internal sender API request failed") from error
        if not isinstance(data, dict) or data.get("ok") is not True: raise WorkerError("Internal sender API returned an invalid response")
        return data
    def claim_send(self) -> SendCandidate | None:
        item = self._post("/api/internal/line-manager-sender/claim").get("item")
        if item is None: return None
        if not isinstance(item, dict) or item.get("status") != "CLAIMED": raise WorkerError("Internal sender API returned invalid send claim")
        return SendCandidate(_id(item.get("id")), _string(item.get("text"), "text"), _string(item.get("sendId"), "sendId"), _string(item.get("managerBotId"), "managerBotId"), _string(item.get("managerChatId"), "managerChatId"), _string(item.get("claimToken"), "claimToken"), "CLAIMED")
    def pre_send_failed(self, item: SendCandidate, error: str) -> bool: return self._post(f"/api/internal/line-manager-sender/{item.id}/pre-send-failed", {"claimToken": item.claim_token, "error": safe_error(error)}).get("ok") is True
    def fence(self, item: SendCandidate) -> bool: return self._post(f"/api/internal/line-manager-sender/{item.id}/fence", {"claimToken": item.claim_token}).get("ok") is True
    def claim_reconciliation(self) -> ReconciliationCandidate | None:
        item = self._post("/api/internal/line-manager-sender/reconciliation/claim").get("item")
        if item is None: return None
        if not isinstance(item, dict) or item.get("status") != "POST_UNCONFIRMED": raise WorkerError("Internal sender API returned invalid reconciliation claim")
        return ReconciliationCandidate(_id(item.get("id")), _string(item.get("text"), "text"), _string(item.get("sendId"), "sendId"), _string(item.get("managerBotId"), "managerBotId"), _string(item.get("managerChatId"), "managerChatId"), _string(item.get("reconciliationToken"), "reconciliationToken"), _timestamp(item.get("postAttemptedAt"), "postAttemptedAt"))
    def confirm(self, item: ReconciliationCandidate, message: HistoryMessage) -> bool:
        body = {"reconciliationToken": item.reconciliation_token, "actualMessageId": message.id, "text": message.text, "timestamp": message.timestamp.astimezone(timezone.utc).isoformat(), "managerBotId": item.manager_bot_id, "managerChatId": item.manager_chat_id}
        return self._post(f"/api/internal/line-manager-sender/{item.id}/confirm", body).get("ok") is True
