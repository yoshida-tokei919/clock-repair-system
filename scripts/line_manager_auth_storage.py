"""Create and verify fixed, non-sending lineoa authentication storage."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit
import json
import math
import os
import time


class AuthStorageError(Exception):
    """A deliberately sanitized failure from the auth-storage utility."""


def fixed_paths(localappdata: str | None = None) -> tuple[Path, Path]:
    """Return the only profile and storage paths this utility may use."""
    try:
        root = localappdata if localappdata is not None else os.environ["LOCALAPPDATA"]
    except KeyError as exc:
        raise AuthStorageError("localappdata_missing") from exc
    if not isinstance(root, str) or not root.strip():
        raise AuthStorageError("localappdata_missing")
    base = Path(root) / "clock-repair-system" / "linelib-poc"
    return base / "chrome-profile", base / "lineoa-storage.json"


def is_line_business_domain(domain: Any) -> bool:
    """Allow line.biz and its subdomains, but no lookalike domains."""
    if not isinstance(domain, str):
        return False
    normalized = domain.lstrip(".").lower()
    return normalized == "line.biz" or normalized.endswith(".line.biz")


def _epoch(now: datetime | int | float | None) -> float:
    if now is None:
        return time.time()
    if isinstance(now, datetime):
        if now.tzinfo is None or now.utcoffset() is None:
            raise AuthStorageError("invalid_clock")
        return now.astimezone(timezone.utc).timestamp()
    if isinstance(now, bool) or not isinstance(now, (int, float)) or not math.isfinite(now):
        raise AuthStorageError("invalid_clock")
    return float(now)


def build_storage_payload(browser_cookies: Iterable[Any], now: datetime | int | float | None = None) -> dict[str, list[dict[str, Any]]]:
    """Build lineoa's cookie-only JSON root from Playwright-style cookies."""
    current_epoch = _epoch(now)
    cookies: list[dict[str, Any]] = []
    for cookie in browser_cookies:
        if not isinstance(cookie, dict):
            continue
        name, value, domain = cookie.get("name"), cookie.get("value"), cookie.get("domain")
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(value, str) or not value.strip() or not is_line_business_domain(domain):
            continue
        raw_path = cookie.get("path")
        path = raw_path if isinstance(raw_path, str) and raw_path.strip() and raw_path.startswith("/") else "/"
        item: dict[str, Any] = {"name": name, "value": value, "domain": domain.lstrip(".").lower(), "path": path}
        raw_expiry = cookie.get("expires")
        if raw_expiry is None:
            raw_expiry = cookie.get("expiry")
        if isinstance(raw_expiry, bool) or not isinstance(raw_expiry, (int, float)):
            pass
        elif not math.isfinite(raw_expiry):
            continue
        elif raw_expiry > 0:
            if raw_expiry <= current_epoch:
                continue
            item["expiry"] = int(raw_expiry)
        if cookie.get("secure") is True:
            item["secure"] = True
        cookies.append(item)
    if not cookies:
        raise AuthStorageError("no_usable_cookies")
    return {"cookies": cookies}


def safe_status(cookie_count: int, bot_count: int, storage_path: Path | str) -> dict[str, Any]:
    """Return status data that cannot contain cookie or bot identifiers."""
    return {"ok": True, "verified": True, "cookie_count": int(cookie_count), "bot_count": int(bot_count), "storage_path": str(storage_path)}


def _get_write_json() -> Callable[[str, dict[str, Any]], Any]:
    from LINELib.storage import write_json
    return write_json


def write_storage(payload: dict[str, Any], path: Path | str) -> None:
    """Write storage through lineoa without allowing a raw error to escape."""
    try:
        _get_write_json()(str(path), payload)
    except Exception as exc:
        raise AuthStorageError("storage_write_failed") from exc


def validate_storage(storage_path: Path | str, lineoa_factory: Callable[..., Any] | None = None) -> int:
    """Restore from storage only and return the count of usable bot IDs."""
    client: Any = None
    try:
        if lineoa_factory is None:
            from LINELib import LINELib
            lineoa_factory = LINELib
        client = lineoa_factory(storage=str(storage_path))
        bot_ids = getattr(client, "_bot_ids")
        if isinstance(bot_ids, (str, bytes, Mapping)) or not isinstance(bot_ids, Iterable):
            raise ValueError("invalid bot collection")
        bot_ids = list(bot_ids)
        if not bot_ids or any(not isinstance(bot_id, str) or not bot_id.strip() for bot_id in bot_ids):
            raise ValueError("no usable bots")
        return len(bot_ids)
    except Exception as exc:
        raise AuthStorageError("storage_validation_failed") from exc
    finally:
        close = getattr(getattr(client, "_session", None), "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass


def _remove_storage_best_effort(storage_path: Path) -> None:
    try:
        storage_path.unlink(missing_ok=True)
    except Exception:
        pass


def bootstrap() -> dict[str, Any]:
    """Read the dedicated profile, persist filtered cookies, then verify storage."""
    profile_path, storage_path = fixed_paths()
    if not profile_path.is_dir():
        raise AuthStorageError("profile_missing")
    context: Any = None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(str(profile_path), channel="chrome", headless=True)
            pages = context.pages
            page = pages[0] if pages else context.new_page()
            page.goto("https://chat.line.biz/", wait_until="domcontentloaded", timeout=30000)
            if urlsplit(page.url).hostname != "chat.line.biz":
                raise AuthStorageError("profile_not_authenticated")
            browser_cookies = context.cookies()
    except AuthStorageError:
        raise
    except Exception as exc:
        raise AuthStorageError("profile_read_failed") from exc
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
    payload = build_storage_payload(browser_cookies)
    write_storage(payload, storage_path)
    try:
        bot_count = validate_storage(storage_path)
    except AuthStorageError:
        _remove_storage_best_effort(storage_path)
        raise
    return safe_status(len(payload["cookies"]), bot_count, storage_path)


def main() -> int:
    try:
        result = bootstrap()
    except AuthStorageError:
        print(json.dumps({"ok": False, "error": "auth_storage_failed"}, sort_keys=True))
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
