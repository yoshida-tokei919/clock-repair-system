"""Create and verify fixed, non-sending lineoa authentication storage."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit
import json
import math
import os
import re
import time
from uuid import uuid4


class AuthStorageError(Exception):
    """A deliberately sanitized failure from the auth-storage utility."""


CHAT_ORIGIN = "https://chat.line.biz/"
CHAT_PATHS = frozenset({"/"})
ACCOUNT_HOST = "account.line.biz"
ACCESS_HOST = "access.line.me"
ACCOUNT_PATHS = frozenset({"/login"})
ACCESS_PATHS = frozenset({"/oauth2/v2.1/authorize"})
ACCOUNT_CONTINUATION = "LINEアカウント"
ACCESS_CONTINUATION = "ログイン"
MAX_CONTINUATION_CLICKS = 2


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


def safe_status(cookie_count: int, bot_count: int) -> dict[str, Any]:
    """Return status data that cannot contain cookie or bot identifiers."""
    return {"ok": True, "verified": True, "cookie_count": int(cookie_count), "bot_count": int(bot_count)}


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


def _trusted_stage(raw_url: str) -> str | None:
    if raw_url == CHAT_ORIGIN:
        return "chat.line.biz"
    try:
        parsed = urlsplit(raw_url)
        hostname = (parsed.hostname or "").lower()
        if (
            parsed.scheme != "https"
            or parsed.port is not None
            or parsed.username
            or parsed.password
            or parsed.fragment
            or parsed.netloc.lower() != hostname
        ):
            return None
        if hostname == ACCOUNT_HOST and parsed.path in ACCOUNT_PATHS:
            return ACCOUNT_HOST
        if hostname == ACCESS_HOST and parsed.path in ACCESS_PATHS:
            return ACCESS_HOST
    except (TypeError, ValueError):
        pass
    return None


def _explicit_auth_challenge_present(page: Any) -> bool:
    selectors = (
        'input[type="email"]', 'input[autocomplete="username" i]',
        'input[type="password"]', 'input[autocomplete="current-password" i]',
        'input[autocomplete="one-time-code" i]',
        '[name*="captcha" i]', '[id*="captcha" i]', '[class*="captcha" i]',
        '[id*="recaptcha" i]', '[class*="recaptcha" i]',
        '[class*="qrcode" i]', '[id*="qrcode" i]',
        '[class*="qr-code" i]', '[id*="qr-code" i]',
        '[data-testid*="qr" i]',
        'img[alt*="qr" i]', '[aria-label*="qr" i]',
        'canvas',
    )
    for selector in selectors:
        locator = page.locator(selector)
        if any(locator.nth(index).is_visible() for index in range(locator.count())):
            return True
    challenge_text = re.compile(
        r"\u30d1\u30b9\u30ad\u30fc.{0,32}"
        r"(?:\u8a8d\u8a3c|\u672c\u4eba\u78ba\u8a8d|\u767b\u9332|\u4f5c\u6210|\u8a2d\u5b9a)|"
        r"(?:\u8a8d\u8a3c|\u672c\u4eba\u78ba\u8a8d).{0,32}\u30d1\u30b9\u30ad\u30fc|"
        r"\u8a8d\u8a3c\u30b3\u30fc\u30c9|\u78ba\u8a8d\u30b3\u30fc\u30c9|"
        r"\u30ef\u30f3\u30bf\u30a4\u30e0\u30d1\u30b9\u30ef\u30fc\u30c9|"
        r"\u4e8c\u6bb5\u968e\u8a8d\u8a3c|\u672c\u4eba\u78ba\u8a8d|"
        r"QR\s*\u30b3\u30fc\u30c9|CAPTCHA|reCAPTCHA|"
        r"one[- ]time password|\botp\b|verification code|two[- ]factor|\b2fa\b|"
        r"(?:use|verify|verification|authenticate).{0,32}passkey|"
        r"passkey.{0,32}(?:verify|verification|authenticate|identity)|"
        r"(?:create|register|set up).{0,16}passkey",
        re.I,
    )
    locator = page.get_by_text(challenge_text)
    return any(locator.nth(index).is_visible() for index in range(locator.count()))


def _credential_ui_present(page: Any) -> bool:
    # Before continuing a login stage, any visible generic input is interactive auth.
    for selector in ('input:not([type="hidden"])', 'textarea'):
        locator = page.locator(selector)
        if any(locator.nth(index).is_visible() for index in range(locator.count())):
            return True
    return _explicit_auth_challenge_present(page)


def _continuation(page: Any, label: str) -> Any:
    matches = []
    for role in ("button", "link"):
        locator = page.get_by_role(role, name=label, exact=True)
        if locator.count() > 1:
            raise AuthStorageError("ambiguous_login_continuation")
        if locator.count() == 1 and locator.is_visible() and locator.is_enabled():
            if role == "link":
                href = locator.get_attribute("href")
                if not href or _trusted_stage(urljoin(page.url, href)) is None:
                    raise AuthStorageError("untrusted_login_destination")
            matches.append(locator)
    if len(matches) != 1:
        raise AuthStorageError("login_continuation_unavailable")
    return matches[0]


def advance_authenticated_profile(page: Any) -> int:
    """Follow only the two observed controls, without entering secrets."""
    clicks = 0
    while True:
        stage = _trusted_stage(page.url)
        if stage == "chat.line.biz":
            if _explicit_auth_challenge_present(page):
                raise AuthStorageError("interactive_login_required")
            return clicks
        if stage not in {ACCOUNT_HOST, ACCESS_HOST}:
            raise AuthStorageError("untrusted_login_stage")
        if _credential_ui_present(page):
            raise AuthStorageError("interactive_login_required")
        if clicks >= MAX_CONTINUATION_CLICKS or (clicks == 1 and stage != ACCESS_HOST) or (clicks == 0 and stage != ACCOUNT_HOST):
            raise AuthStorageError("login_continuation_limit")
        before_url = page.url
        label = ACCOUNT_CONTINUATION if clicks == 0 else ACCESS_CONTINUATION
        _continuation(page, label).click(timeout=10000)
        clicks += 1
        try:
            page.wait_for_url(lambda url: str(url) != before_url, timeout=10000)
        except Exception as exc:
            raise AuthStorageError("login_navigation_missing") from exc


def replace_validated_storage(payload: dict[str, Any], storage_path: Path) -> int:
    """Validate a same-directory candidate before replacing live storage."""
    candidate_path = storage_path.with_name(f".{storage_path.name}.{uuid4().hex}.tmp")
    try:
        write_storage(payload, candidate_path)
        bot_count = validate_storage(candidate_path)
        os.replace(candidate_path, storage_path)
        return bot_count
    except Exception as exc:
        raise AuthStorageError("storage_refresh_failed") from exc
    finally:
        _remove_storage_best_effort(candidate_path)
        _remove_storage_best_effort(candidate_path.with_name(candidate_path.name + ".lock"))


def ensure_valid_storage() -> dict[str, Any]:
    """Use existing fixed storage when it restores; recover only if it cannot."""
    _, storage_path = fixed_paths()
    if storage_path.is_file():
        try:
            bot_count = validate_storage(storage_path)
            return {"ok": True, "verified": True, "bot_count": bot_count, "recovered": False}
        except AuthStorageError:
            pass
    result = bootstrap()
    result["recovered"] = True
    return result


def bootstrap() -> dict[str, Any]:
    """Verify cookies from the dedicated profile before replacing live storage."""
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
            page.goto(CHAT_ORIGIN, wait_until="domcontentloaded", timeout=30000)
            advance_authenticated_profile(page)
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
    bot_count = replace_validated_storage(payload, storage_path)
    return safe_status(len(payload["cookies"]), bot_count)


def main(argv: list[str] | None = None) -> int:
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if args == ["--ensure-valid"]:
            result = ensure_valid_storage()
        elif not args:
            result = bootstrap()
        else:
            raise AuthStorageError("unsupported_mode")
    except Exception:
        print(json.dumps({"ok": False, "error": "auth_storage_failed"}, sort_keys=True))
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
