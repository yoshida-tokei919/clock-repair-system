from datetime import datetime, timezone
from pathlib import Path
import inspect
import json
import math
import os
import sys
import types
import unittest
from unittest.mock import patch

import line_manager_auth_storage as auth

NOW = datetime(2026, 9, 23, tzinfo=timezone.utc)


class AuthStorageTests(unittest.TestCase):
    def test_fixed_paths_and_missing_localappdata(self):
        profile, storage = auth.fixed_paths("C:/local")
        self.assertEqual(profile, Path("C:/local/clock-repair-system/linelib-poc/chrome-profile"))
        self.assertEqual(storage, Path("C:/local/clock-repair-system/linelib-poc/lineoa-storage.json"))
        with self.assertRaises(auth.AuthStorageError): auth.fixed_paths("")
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(auth.AuthStorageError): auth.fixed_paths()

    def test_line_business_domains(self):
        self.assertTrue(auth.is_line_business_domain("line.biz"))
        self.assertTrue(auth.is_line_business_domain(".line.biz"))
        self.assertTrue(auth.is_line_business_domain("CHAT.LINE.BIZ"))
        self.assertFalse(auth.is_line_business_domain("evil-line.biz"))
        self.assertFalse(auth.is_line_business_domain("line.biz.evil.example"))
        self.assertFalse(auth.is_line_business_domain(" line.biz"))

    def test_payload_filters_and_normalizes(self):
        payload = auth.build_storage_payload([
            {"name": "", "value": "secret", "domain": "chat.line.biz", "path": "/"},
            {"name": "blank", "value": "   ", "domain": "chat.line.biz", "path": "/"},
            {"name": "outside", "value": "secret", "domain": "evil-line.biz", "path": "/"},
            {"name": "slash", "value": "secret", "domain": ".line.biz", "path": "/kept", "expires": -1},
            {"name": "normal", "value": "secret", "domain": "chat.line.biz", "path": "invalid", "expires": 0},
        ], now=NOW)
        self.assertEqual(set(payload), {"cookies"})
        self.assertEqual([c["path"] for c in payload["cookies"]], ["/kept", "/"])
        self.assertTrue(all("expiry" not in c for c in payload["cookies"]))

    def test_expiry_and_secure_rules(self):
        payload = auth.build_storage_payload([
            {"name": "old", "value": "secret", "domain": "chat.line.biz", "path": "/", "expires": NOW.timestamp() - 1},
            {"name": "future", "value": "secret", "domain": "chat.line.biz", "path": "/", "expires": NOW.timestamp() + 30.9, "secure": True},
            {"name": "bool", "value": "secret", "domain": "chat.line.biz", "path": "/", "expires": True, "secure": False},
        ], now=NOW)
        self.assertEqual([c["name"] for c in payload["cookies"]], ["future", "bool"])
        self.assertEqual(payload["cookies"][0]["expiry"], int(NOW.timestamp() + 30.9))
        self.assertNotIn("expiry", payload["cookies"][1])
        self.assertTrue(payload["cookies"][0]["secure"])
        self.assertNotIn("secure", payload["cookies"][1])

    def test_nonfinite_expiry_is_never_persisted(self):
        payload = auth.build_storage_payload([
            {"name": "nan", "value": "secret", "domain": "chat.line.biz", "expires": math.nan},
            {"name": "inf", "value": "secret", "domain": "chat.line.biz", "expires": math.inf},
            {"name": "negative-inf", "value": "secret", "domain": "chat.line.biz", "expires": -math.inf},
            {"name": "session", "value": "secret", "domain": "chat.line.biz", "expires": -1},
        ], now=NOW)
        self.assertEqual([cookie["name"] for cookie in payload["cookies"]], ["session"])
        self.assertNotIn("expiry", payload["cookies"][0])

    def test_no_usable_cookie_is_an_error(self):
        with self.assertRaises(auth.AuthStorageError):
            auth.build_storage_payload([{"name": "n", "value": "v", "domain": "example.com", "path": "/"}], now=NOW)

    def test_safe_status_never_receives_or_serializes_identifiers(self):
        rendered = json.dumps(auth.safe_status(2, 1, Path("C:/local/lineoa-storage.json")), sort_keys=True)
        self.assertNotIn("synthetic-cookie-secret", rendered)
        self.assertNotIn("synthetic-bot-id", rendered)

    def test_write_storage_uses_patched_writer(self):
        writes = []
        with patch.object(auth, "_get_write_json", return_value=lambda path, payload: writes.append((path, payload))):
            auth.write_storage({"cookies": []}, Path("C:/fixed/lineoa-storage.json"))
        self.assertEqual(writes, [("C:\\fixed\\lineoa-storage.json", {"cookies": []})])

    def test_validate_storage_uses_only_storage_and_closes_session(self):
        calls = []
        class Session:
            closed = False
            def close(self): self.closed = True
        session = Session()
        class Client: _bot_ids = ["synthetic-bot-id"]; _session = session
        def factory(**kwargs): calls.append(kwargs); return Client()
        self.assertEqual(auth.validate_storage(Path("C:/fixed/lineoa-storage.json"), factory), 1)
        self.assertEqual(calls, [{"storage": "C:\\fixed\\lineoa-storage.json"}])
        self.assertTrue(session.closed)

    def test_validate_storage_rejects_empty_or_invalid_bots(self):
        class Empty: _bot_ids = []; _session = None
        class Invalid: _bot_ids = "synthetic-bot-id"; _session = None
        class Blank: _bot_ids = [" "]; _session = None
        class Mixed: _bot_ids = ["synthetic-bot-id", 7]; _session = None
        with self.assertRaises(auth.AuthStorageError): auth.validate_storage(Path("C:/fixed"), lambda **kwargs: Empty())
        with self.assertRaises(auth.AuthStorageError): auth.validate_storage(Path("C:/fixed"), lambda **kwargs: Invalid())
        with self.assertRaises(auth.AuthStorageError): auth.validate_storage(Path("C:/fixed"), lambda **kwargs: Blank())
        with self.assertRaises(auth.AuthStorageError): auth.validate_storage(Path("C:/fixed"), lambda **kwargs: Mixed())

    def test_bootstrap_validation_failure_deletes_only_generated_storage(self):
        class Page:
            url = "https://chat.line.biz/"
            def goto(self, url, **kwargs): self.url = url
        class Context:
            pages = [Page()]
            def cookies(self): return [{"name": "cookie", "value": "secret", "domain": "chat.line.biz"}]
            def close(self): pass
        class Chromium:
            def launch_persistent_context(self, *args, **kwargs): return Context()
        class Playwright:
            chromium = Chromium()
        class SyncPlaywright:
            def __enter__(self): return Playwright()
            def __exit__(self, *args): return False
        sync_api = types.ModuleType("playwright.sync_api")
        sync_api.sync_playwright = lambda: SyncPlaywright()
        playwright = types.ModuleType("playwright")
        playwright.sync_api = sync_api
        class ProfilePath:
            def is_dir(self): return True
            def __str__(self): return "C:/fixed/chrome-profile"
        class StoragePath:
            deleted = False
            def unlink(self, missing_ok=False): self.deleted = True
            def __str__(self): return "C:/fixed/lineoa-storage.json"
        profile, storage = ProfilePath(), StoragePath()
        writes = []
        with patch.dict(sys.modules, {"playwright": playwright, "playwright.sync_api": sync_api}):
            with patch.object(auth, "fixed_paths", return_value=(profile, storage)):
                with patch.object(auth, "_get_write_json", return_value=lambda path, payload: writes.append((path, payload))):
                    with patch.object(auth, "validate_storage", side_effect=auth.AuthStorageError("storage_validation_failed")):
                        with self.assertRaises(auth.AuthStorageError): auth.bootstrap()
        self.assertEqual(len(writes), 1)
        self.assertTrue(storage.deleted)

    def test_source_has_no_sender_or_browser_mutation_calls(self):
        source = inspect.getsource(auth)
        for forbidden in ("post_text_v2", "process_send_once", "requests.post", ".click(", ".fill(", ".type(", ".evaluate("):
            self.assertNotIn(forbidden, source)
        self.assertIn("page.goto", source)
        self.assertIn("context.cookies", source)


if __name__ == "__main__": unittest.main()
