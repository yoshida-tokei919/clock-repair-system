from datetime import datetime, timezone
from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO
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


class FakeLocator:
    def __init__(self, page, role=None, label=None, selector=None, index=0):
        self.page, self.role, self.label, self.selector, self.index = page, role, label, selector, index
    def count(self):
        if self.selector is not None:
            return len(self.page.visible_selectors.get(self.selector, []))
        return int(self.role == "button" and self.label == self.page.expected_label())
    def nth(self, index):
        return FakeLocator(self.page, selector=self.selector, index=index)
    def is_visible(self):
        return self.page.visible_selectors[self.selector][self.index] if self.selector is not None else True
    def is_enabled(self): return True
    def click(self, **kwargs):
        self.page.clicks += 1
        self.page.url = self.page.transitions.pop(0)


class FakePage:
    def __init__(self, url, transitions=(), labels=None, visible_selectors=None, visible_texts=()):
        self.url, self.transitions = url, list(transitions)
        self.labels = list(labels or ("LINEアカウント", "ログイン"))
        self.visible_selectors = visible_selectors or {}
        self.visible_texts = list(visible_texts)
        self.clicks = 0
    def expected_label(self):
        return self.labels[self.clicks] if self.clicks < len(self.labels) else None
    def get_by_role(self, role, name, exact=False):
        assert exact
        return FakeLocator(self, role, name)
    def locator(self, selector):
        return FakeLocator(self, selector=selector)
    def get_by_text(self, pattern):
        self.visible_selectors["__challenge_text__"] = [True for text in self.visible_texts if pattern.search(text)]
        return FakeLocator(self, selector="__challenge_text__")
    def wait_for_url(self, predicate, **kwargs):
        if not predicate(self.url): raise TimeoutError("synthetic no navigation")


class AuthStorageTests(unittest.TestCase):
    def test_continuation_labels_are_exact_observed_values(self):
        self.assertEqual(auth.ACCOUNT_CONTINUATION, "LINEアカウント")
        self.assertEqual(auth.ACCESS_CONTINUATION, "ログイン")

    def test_similar_or_consent_labels_are_never_clicked(self):
        wrong_first = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], labels=["LINEでログイン"])
        with self.assertRaises(auth.AuthStorageError):
            auth.advance_authenticated_profile(wrong_first)
        self.assertEqual(wrong_first.clicks, 0)

        wrong_second = FakePage(
            "https://account.line.biz/login",
            ["https://access.line.me/oauth2/v2.1/authorize", "https://chat.line.biz/"],
            labels=["LINEアカウント", "許可する"],
        )
        with self.assertRaises(auth.AuthStorageError):
            auth.advance_authenticated_profile(wrong_second)
        self.assertEqual(wrong_second.clicks, 1)
    def test_cli_failure_does_not_emit_error_details(self):
        output = StringIO()
        with patch.object(auth, "ensure_valid_storage", side_effect=RuntimeError("secret-cookie account-id query=secret")), redirect_stdout(output):
            self.assertEqual(auth.main(["--ensure-valid"]), 1)
        self.assertEqual(json.loads(output.getvalue()), {"ok": False, "error": "auth_storage_failed"})

    def test_valid_existing_storage_never_bootstraps_browser(self):
        with patch.object(auth, "fixed_paths", return_value=(Path("profile"), Path("storage"))), \
             patch.object(Path, "is_file", return_value=True), \
             patch.object(auth, "validate_storage", return_value=1), \
             patch.object(auth, "bootstrap") as bootstrap:
            self.assertEqual(auth.ensure_valid_storage()["recovered"], False)
        bootstrap.assert_not_called()

    def test_missing_or_invalid_storage_recovers(self):
        for exists in (False, True):
            with self.subTest(exists=exists), patch.object(auth, "fixed_paths", return_value=(Path("profile"), Path("storage"))), \
                 patch.object(Path, "is_file", return_value=exists), \
                 patch.object(auth, "validate_storage", side_effect=auth.AuthStorageError("invalid")) as validate, \
                 patch.object(auth, "bootstrap", return_value={"ok": True, "verified": True, "bot_count": 1}) as bootstrap:
                self.assertTrue(auth.ensure_valid_storage()["recovered"])
                self.assertEqual(validate.call_count, int(exists))
                bootstrap.assert_called_once()

    def test_already_authenticated_profile_uses_zero_clicks(self):
        page = FakePage("https://chat.line.biz/")
        self.assertEqual(auth.advance_authenticated_profile(page), 0)
        self.assertEqual(page.clicks, 0)

    def test_account_to_chat_uses_one_control(self):
        page = FakePage("https://account.line.biz/login?state=opaque", ["https://chat.line.biz/"])
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(page.clicks, 1)

    def test_account_then_access_then_chat_uses_exact_two_controls(self):
        page = FakePage("https://account.line.biz/login?state=opaque", [
            "https://access.line.me/oauth2/v2.1/authorize?state=opaque", "https://chat.line.biz/"
        ])
        self.assertEqual(auth.advance_authenticated_profile(page), 2)
        self.assertEqual(page.clicks, 2)

    def test_third_step_fails_after_two_clicks(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/authorize?stage=2",
            "https://access.line.me/oauth2/v2.1/authorize?consent=1",
        ])
        with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 2)

    def test_unknown_or_lookalike_domain_never_clicked(self):
        for url in ("https://account.line.biz.evil.example/login", "https://evil.example/login",
                    "http://account.line.biz/login", "https://account.line.biz:443/login", "https://account.line.biz:444/login",
                    "https://account.line.biz/unknown", "https://access.line.me/oauth2/v2.1/authorize",
                    "https://chat.line.biz/unexpected"):
            page = FakePage(url, ["https://chat.line.biz/"])
            with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
            self.assertEqual(page.clicks, 0)

    def test_visible_credential_or_challenge_ui_is_not_advanced(self):
        for selector in ('input:not([type="hidden"])', 'textarea', '[class*="captcha" i]',
                         '[class*="qrcode" i]', 'canvas'):
            page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], visible_selectors={selector: [True]})
            with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
            self.assertEqual(page.clicks, 0)

    def test_challenge_on_access_stage_stops_second_click(self):
        page = FakePage("https://account.line.biz/login", ["https://access.line.me/oauth2/v2.1/authorize", "https://chat.line.biz/"])
        original_wait = page.wait_for_url
        def wait_and_reveal(predicate, **kwargs):
            original_wait(predicate, **kwargs)
            page.visible_selectors['input:not([type="hidden"])'] = [True]
        page.wait_for_url = wait_and_reveal
        with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 1)

    def test_hidden_credential_control_does_not_false_block_safe_continuation(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        visible_selectors={'input:not([type="hidden"])': [False]})
        self.assertEqual(auth.advance_authenticated_profile(page), 1)

    def test_alternative_login_method_text_does_not_false_block(self):
        page = FakePage(
            "https://account.line.biz/login",
            ["https://chat.line.biz/"],
            visible_texts=("???????", "?????????"),
        )
        self.assertEqual(auth.advance_authenticated_profile(page), 1)

    def test_explicit_challenge_text_blocks(self):
        challenges = (
            "\u30d1\u30b9\u30ad\u30fc\u3092\u767b\u9332",
            "\u30d1\u30b9\u30ad\u30fc\u3067\u8a8d\u8a3c\u3057\u3066\u304f\u3060\u3055\u3044",
            "\u30d1\u30b9\u30ad\u30fc\u3067\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u8a8d\u8a3c\u3057\u3066\u304f\u3060\u3055\u3044",
            "\u8a8d\u8a3c\u30b3\u30fc\u30c9",
            "\u30ef\u30f3\u30bf\u30a4\u30e0\u30d1\u30b9\u30ef\u30fc\u30c9",
            "CAPTCHA verification required",
            "Use your passkey to verify your identity",
            "one-time password",
        )
        for text in challenges:
            with self.subTest(text=text):
                page = FakePage(
                    "https://account.line.biz/login",
                    ["https://chat.line.biz/"],
                    visible_texts=(text,),
                )
                with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
                self.assertEqual(page.clicks, 0)

    def test_final_chat_root_only(self):
        self.assertEqual(auth._trusted_stage("https://chat.line.biz/"), "chat.line.biz")
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz/unexpected"))
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz:443/"))
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz:/"))
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz/?"))
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz/#"))
        self.assertIsNone(auth._trusted_stage("https://chat.line.biz/?state=unexpected"))

    def test_final_chat_explicit_auth_challenge_still_blocks(self):
        page = FakePage(
            "https://chat.line.biz/",
            visible_texts=("\u8a8d\u8a3c\u30b3\u30fc\u30c9",),
        )
        with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 0)

    def test_final_chat_normal_message_input_does_not_false_block(self):
        page = FakePage(
            "https://chat.line.biz/",
            visible_selectors={'input:not([type="hidden"])': [True]},
        )
        self.assertEqual(auth.advance_authenticated_profile(page), 0)

    def test_untrusted_redirect_stops_before_another_click(self):
        page = FakePage("https://account.line.biz/login", ["https://account.line.biz.evil.example/login"])
        with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 1)

    def test_no_navigation_stops_after_one_click(self):
        page = FakePage("https://account.line.biz/login", ["https://account.line.biz/login"])
        with self.assertRaises(auth.AuthStorageError): auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 1)

    def test_invalid_candidate_leaves_existing_storage_and_cleans_temp(self):
        storage = Path("C:/fixed/lineoa-storage.json")
        with patch.object(auth, "write_storage") as write, \
             patch.object(auth, "validate_storage", side_effect=auth.AuthStorageError("storage_validation_failed")), \
             patch.object(auth.os, "replace") as replace, patch.object(Path, "unlink") as unlink:
            with self.assertRaises(auth.AuthStorageError): auth.replace_validated_storage({"cookies": []}, storage)
        self.assertNotEqual(write.call_args.args[1], storage)
        replace.assert_not_called()
        self.assertEqual(unlink.call_count, 2)

    def test_valid_candidate_atomically_replaces_storage(self):
        storage = Path("C:/fixed/lineoa-storage.json")
        with patch.object(auth, "write_storage") as write, \
             patch.object(auth, "validate_storage", return_value=1) as validate, \
             patch.object(auth.os, "replace") as replace, patch.object(Path, "unlink"):
            self.assertEqual(auth.replace_validated_storage({"cookies": []}, storage), 1)
        candidate = write.call_args.args[1]
        self.assertEqual(validate.call_args.args[0], candidate)
        replace.assert_called_once_with(candidate, storage)

    def test_bootstrap_reads_cookies_only_after_final_chat_host(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/authorize", "https://chat.line.biz/"
        ])
        class Context:
            pages = [page]
            closed = False
            def cookies(self):
                self_cookie_check = page.url
                assert self_cookie_check == "https://chat.line.biz/"
                return [{"name": "session", "value": "secret", "domain": "chat.line.biz"}]
            def close(self): self.closed = True
        context = Context()
        class Chromium:
            def launch_persistent_context(self, *args, **kwargs): return context
        class SyncPlaywright:
            def __enter__(self): return types.SimpleNamespace(chromium=Chromium())
            def __exit__(self, *args): return False
        sync_api = types.ModuleType("playwright.sync_api")
        sync_api.sync_playwright = lambda: SyncPlaywright()
        playwright = types.ModuleType("playwright")
        playwright.sync_api = sync_api
        page.goto = lambda url, **kwargs: None
        with patch.dict(sys.modules, {"playwright": playwright, "playwright.sync_api": sync_api}), \
             patch.object(auth, "fixed_paths", return_value=(Path("profile"), Path("storage"))), \
             patch.object(Path, "is_dir", return_value=True), \
             patch.object(auth, "replace_validated_storage", return_value=1) as replace:
            result = auth.bootstrap()
        self.assertEqual(result["cookie_count"], 1)
        self.assertEqual(page.clicks, 2)
        self.assertTrue(context.closed)
        replace.assert_called_once()

    def test_bootstrap_rejects_unknown_stage_without_reading_cookies(self):
        page = FakePage("https://account.line.biz.evil.example/login")
        class Context:
            pages = [page]
            def cookies(self): raise AssertionError("cookies read before verified chat")
            def close(self): pass
        class Chromium:
            def launch_persistent_context(self, *args, **kwargs): return Context()
        class SyncPlaywright:
            def __enter__(self): return types.SimpleNamespace(chromium=Chromium())
            def __exit__(self, *args): return False
        sync_api = types.ModuleType("playwright.sync_api")
        sync_api.sync_playwright = lambda: SyncPlaywright()
        playwright = types.ModuleType("playwright")
        playwright.sync_api = sync_api
        page.goto = lambda url, **kwargs: None
        with patch.dict(sys.modules, {"playwright": playwright, "playwright.sync_api": sync_api}), \
             patch.object(auth, "fixed_paths", return_value=(Path("profile"), Path("storage"))), \
             patch.object(Path, "is_dir", return_value=True), \
             patch.object(auth, "replace_validated_storage") as replace:
            with self.assertRaises(auth.AuthStorageError): auth.bootstrap()
        replace.assert_not_called()

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
        rendered = json.dumps(auth.safe_status(2, 1), sort_keys=True)
        self.assertNotIn("synthetic-cookie-secret", rendered)
        self.assertNotIn("synthetic-bot-id", rendered)
        self.assertNotIn("storage_path", rendered)

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

    def test_source_has_no_sender_or_credential_mutation_calls(self):
        source = inspect.getsource(auth)
        for forbidden in ("post_text_v2", "process_send_once", "requests.post", ".fill(", ".type(", ".evaluate(", ".send("):
            self.assertNotIn(forbidden, source)
        self.assertIn("page.goto", source)
        self.assertIn("context.cookies", source)


if __name__ == "__main__": unittest.main()
