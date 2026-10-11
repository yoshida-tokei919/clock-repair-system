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
TEST_CLOCK = [0.0]


class FakeLocator:
    def __init__(self, page, role=None, label=None, selector=None, index=0):
        self.page, self.role, self.label, self.selector, self.index = page, role, label, selector, index
    def count(self):
        if self.selector is not None:
            return len(self.page.visible_selectors.get(self.selector, []))
        if self.page.role_elements is not None:
            return len(self.page.exact_elements(self.role, self.label))
        if self.page.role_counts is not None:
            return self.page.role_counts.get((self.role, self.label), 0)
        return int(self.role == "button" and self.label == self.page.expected_label())
    def nth(self, index):
        return FakeLocator(self.page, selector=self.selector, index=index)
    def is_visible(self):
        if self.selector is not None:
            return self.page.visible_selectors[self.selector][self.index]
        if self.page.role_elements is not None:
            return self.page.exact_elements(self.role, self.label)[0].is_visible()
        return True
    def is_enabled(self):
        if self.page.role_elements is not None:
            return self.page.exact_elements(self.role, self.label)[0].is_enabled()
        return True
    def get_attribute(self, name):
        assert name == "href"
        return self.page.hrefs.get((self.role, self.label))
    def element_handles(self, **kwargs):
        assert not kwargs, "snapshot must not have a wait or timeout"
        if self.page.on_role_query:
            self.page.on_role_query(self)
        handles = self.page.exact_elements(self.role, self.label)
        self.page.snapshots.append((self.role, self.label, tuple(handles)))
        return handles
    def or_(self, other):
        return FakeUnionLocator(self, other)
    def element_handle(self, **kwargs):
        raise AssertionError("waiting Locator.element_handle must not be used")
    def evaluate_handle(self, *args, **kwargs):
        raise AssertionError("waiting Locator.evaluate_handle must not be used")
    def evaluate(self, *args, **kwargs):
        raise AssertionError("waiting Locator.evaluate must not be used")
    def click(self, **kwargs):
        raise AssertionError("Locator.click must not activate a continuation")


class FakeUnionLocator:
    def __init__(self, first, second):
        self.first, self.second = first, second
    def element_handles(self, **kwargs):
        assert not kwargs, "union snapshot must not have a wait or timeout"
        assert self.first.page is self.second.page
        assert (self.first.role, self.second.role) == ("button", "link")
        assert self.first.label == self.second.label
        page, label = self.first.page, self.first.label
        if page.on_union_query:
            page.on_union_query(page)
        handles = page.union_exact_elements(label)
        page.snapshots.append(("union", label, tuple(handles)))
        return handles


class FakeElementHandle:
    def __init__(self, page, role, label, tag=None, declared_role=None, input_type=None):
        self.page, self.role, self.label = page, role, label
        self.tag = tag or ("button" if role == "button" else "a")
        self.declared_role = declared_role
        self.input_type = input_type
        self.attached = self.visible = self.enabled = True
    def is_visible(self): return self.attached and self.visible
    def is_enabled(self): return self.attached and self.enabled
    def get_attribute(self, name):
        assert name == "href"
        return self.page.hrefs.get((self.role, self.label))
    def evaluate(self, expression, current=None):
        if "element.tagName.toLowerCase()" in expression:
            native_role = "button" if self.tag == "button" else "link" if self.tag == "a" else None
            declared_role = self.declared_role if self.declared_role is not None else (self.role if self.role != native_role else None)
            return {"tag": self.tag, "role": declared_role, "type": self.input_type,
                    "href": self.page.hrefs.get((self.role, self.label)), "connected": self.attached}
        assert expression == "(element, current) => element === current"
        self.page.identity_checks.append((self, current))
        return self is current and self.attached
    def dispatch_event(self, event):
        assert event == "click"
        # Playwright dispatch_event does not enforce visibility or enabled state.
        self.page.activations.append((self, event))
        self.page.clicks += 1
        self.page.url = self.page.transitions.pop(0)


class FakePage:
    def __init__(self, url, transitions=(), labels=None, visible_selectors=None, visible_texts=(),
                 role_counts=None, hrefs=None, on_poll=None, role_elements=None,
                 on_role_query=None, on_union_query=None):
        self.url, self.transitions = url, list(transitions)
        self.labels = list(labels or ("LINEアカウント", "ログイン"))
        self.visible_selectors = visible_selectors or {}
        self.visible_texts = list(visible_texts)
        self.role_counts, self.hrefs, self.on_poll = role_counts, hrefs or {}, on_poll
        self.on_role_query, self.on_union_query = on_role_query, on_union_query
        self.role_elements = role_elements
        self.default_elements = {}
        self.clicks = 0
        self.snapshots = []
        self.identity_checks = []
        self.activations = []
        self.poll_ticks = 0
    def expected_label(self):
        return self.labels[self.clicks] if self.clicks < len(self.labels) else None
    def exact_elements(self, role, label):
        if self.role_elements is not None:
            return [element for element in self.role_elements
                    if element.attached and element.role == role and element.label == label]
        key = (role, label)
        count = (self.role_counts.get(key, 0) if self.role_counts is not None
                 else int(role == "button" and label == self.expected_label()))
        elements = self.default_elements.setdefault(key, [])
        while len(elements) < count:
            elements.append(FakeElementHandle(self, role, label))
        return [element for element in elements[:count] if element.attached and element.role == role and element.label == label]
    def union_exact_elements(self, label):
        if self.role_elements is not None:
            return [element for element in self.role_elements
                    if element.attached and element.label == label and element.role in {"button", "link"}]
        return self.exact_elements("button", label) + self.exact_elements("link", label)
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
    def wait_for_timeout(self, milliseconds):
        TEST_CLOCK[0] += milliseconds / 1000
        self.poll_ticks += 1
        if self.on_poll:
            self.on_poll(self)


class AuthStorageTests(unittest.TestCase):
    def setUp(self):
        TEST_CLOCK[0] = 0.0
        monotonic = patch.object(auth.time, "monotonic", side_effect=lambda: TEST_CLOCK[0])
        monotonic.start()
        self.addCleanup(monotonic.stop)

    def test_continuation_labels_are_exact_observed_values(self):
        self.assertEqual(auth.ACCOUNT_CONTINUATION, "LINEアカウント")
        self.assertEqual(auth.ACCESS_CONTINUATION, "ログイン")
        self.assertFalse(hasattr(auth, "CONTINUATION_HANDLE_TIMEOUT_MS"))

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
        self.assertEqual(len(page.snapshots), 3)
        self.assertEqual(page.identity_checks, [(page.activations[0][0], page.activations[0][0])])
        self.assertEqual(page.activations, [(page.default_elements[("button", auth.ACCOUNT_CONTINUATION)][0], "click")])

    def test_account_then_access_then_chat_uses_exact_two_controls(self):
        page = FakePage("https://account.line.biz/login?state=opaque", [
            "https://access.line.me/oauth2/v2.1/authorize?state=opaque", "https://chat.line.biz/"
        ])
        self.assertEqual(auth.advance_authenticated_profile(page), 2)
        self.assertEqual(page.clicks, 2)
        self.assertEqual(len(page.snapshots), 6)
        self.assertEqual(len(page.identity_checks), 2)

    def test_observed_login_sso_automatic_transition_uses_exactly_two_clicks(self):
        def complete_sso(page):
            if page.poll_ticks == 1:
                page.url = auth.CHAT_ORIGIN
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/login",
            auth.SSO_TRANSITION_URL,
        ], on_poll=complete_sso)
        self.assertEqual(auth.advance_authenticated_profile(page), 2)
        self.assertEqual(page.clicks, 2)
        self.assertEqual(len(page.snapshots), 6)
        self.assertEqual(page.poll_ticks, 1)

    def test_sso_transition_never_allows_a_third_click(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/login",
            auth.SSO_TRANSITION_URL,
            auth.CHAT_ORIGIN,
        ], role_counts={
            ("button", auth.ACCOUNT_CONTINUATION): 1,
            ("button", auth.ACCESS_CONTINUATION): 1,
        })
        with self.assertRaisesRegex(auth.AuthStorageError, "login_navigation_missing"):
            auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 2)
        self.assertEqual(len(page.snapshots), 6)
        self.assertEqual(page.poll_ticks, 40)

    def test_unexpected_path_after_second_click_fails_without_another_click(self):
        for destination in (
            "https://access.line.me/oauth2/v2.1/authorize",
            "https://access.line.me/oauth2/v2.1/ssoLogin?state=opaque",
            "https://chat.line.biz/unexpected",
        ):
            with self.subTest(destination=destination):
                page = FakePage("https://account.line.biz/login", [
                    "https://access.line.me/oauth2/v2.1/login", destination,
                ])
                with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_stage"):
                    auth.advance_authenticated_profile(page)
                self.assertEqual(page.clicks, 2)
                self.assertEqual(len(page.snapshots), 6)

    def test_sso_transition_redirect_to_unexpected_path_fails_closed(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/login", auth.SSO_TRANSITION_URL,
        ], on_poll=lambda current: setattr(current, "url", "https://example.invalid/login"))
        with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_stage"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, page.poll_ticks), (2, 1))

    def test_challenge_on_sso_transition_fails_closed(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/login", auth.SSO_TRANSITION_URL,
        ])
        original_dispatch = FakeElementHandle.dispatch_event
        def dispatch_and_reveal(handle, event):
            original_dispatch(handle, event)
            if page.url == auth.SSO_TRANSITION_URL:
                page.visible_selectors['input:not([type="hidden"])'] = [True]
        with patch.object(FakeElementHandle, "dispatch_event", dispatch_and_reveal):
            with self.assertRaisesRegex(auth.AuthStorageError, "interactive_login_required"):
                auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, page.poll_ticks), (2, 0))

    def test_sso_transition_is_never_an_initial_interactive_stage(self):
        page = FakePage(auth.SSO_TRANSITION_URL, [auth.CHAT_ORIGIN], role_counts={
            ("button", auth.ACCESS_CONTINUATION): 1,
        })
        with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_stage"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, len(page.snapshots)), (0, 0))

    def test_second_click_direct_to_chat_root_is_accepted(self):
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/login", auth.CHAT_ORIGIN,
        ])
        self.assertEqual(auth.advance_authenticated_profile(page), 2)
        self.assertEqual(page.clicks, 2)
        self.assertEqual(page.poll_ticks, 0)

    def test_snapshot_pin_has_no_artificial_timeout_or_waiting_locator_api(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(len(page.snapshots), 3)
        self.assertEqual(page.activations, [(page.identity_checks[0][0], "click")])

    def test_delayed_account_control_gets_one_click(self):
        counts = {("button", auth.ACCOUNT_CONTINUATION): 0}
        def reveal(page):
            if page.poll_ticks == 3:
                counts[("button", auth.ACCOUNT_CONTINUATION)] = 1
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts=counts, on_poll=reveal)
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual((page.poll_ticks, page.clicks), (3, 1))

    def test_delayed_access_control_gets_two_clicks(self):
        counts = {("button", auth.ACCOUNT_CONTINUATION): 1, ("button", auth.ACCESS_CONTINUATION): 0}
        def reveal(page):
            if page.poll_ticks == 2:
                counts[("button", auth.ACCESS_CONTINUATION)] = 1
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/authorize", "https://chat.line.biz/"
        ], role_counts=counts, on_poll=reveal)
        self.assertEqual(auth.advance_authenticated_profile(page), 2)
        self.assertEqual((page.poll_ticks, page.clicks), (2, 2))

    def test_stage_change_after_wait_readiness_stops_before_click(self):
        original_wait = auth._wait_for_continuation
        for destination in ("https://access.line.me/oauth2/v2.1/authorize", "https://example.invalid/login"):
            with self.subTest(destination=destination):
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
                def wait_then_redirect(*args):
                    ready = original_wait(*args)
                    self.assertTrue(ready)
                    page.url = destination
                    return ready
                with patch.object(auth, "_wait_for_continuation", side_effect=wait_then_redirect):
                    with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_stage"):
                        auth.advance_authenticated_profile(page)
                self.assertEqual(page.clicks, 0)

    def test_challenge_after_wait_readiness_stops_before_click(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
        original_wait = auth._wait_for_continuation
        def wait_then_reveal(*args):
            ready = original_wait(*args)
            self.assertTrue(ready)
            page.visible_selectors['input:not([type="hidden"])'] = [True]
            return ready
        with patch.object(auth, "_wait_for_continuation", side_effect=wait_then_reveal):
            with self.assertRaisesRegex(auth.AuthStorageError, "interactive_login_required"):
                auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 0)

    def test_reresolved_control_failure_is_immediate_and_does_not_click(self):
        original_wait = auth._wait_for_continuation
        for kind, error in (("ambiguous", "ambiguous_login_continuation"),
                            ("untrusted", "untrusted_login_destination"),
                            ("missing", "login_continuation_unavailable")):
            with self.subTest(kind=kind):
                counts = {("button", auth.ACCOUNT_CONTINUATION): 1}
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_counts=counts)
                def wait_then_change(*args):
                    ready = original_wait(*args)
                    self.assertTrue(ready)
                    counts[("button", auth.ACCOUNT_CONTINUATION)] = 2 if kind == "ambiguous" else 0
                    if kind == "untrusted":
                        counts[("link", auth.ACCOUNT_CONTINUATION)] = 1
                        page.hrefs[("link", auth.ACCOUNT_CONTINUATION)] = "https://example.invalid/login"
                    return ready
                with patch.object(auth, "_wait_for_continuation", side_effect=wait_then_change):
                    with self.assertRaisesRegex(auth.AuthStorageError, error):
                        auth.advance_authenticated_profile(page)
                self.assertEqual((page.poll_ticks, page.clicks), (0, 0))

    def test_stage_or_challenge_change_during_reresolution_stops_before_click(self):
        original_continuation = auth._continuation
        for kind, error in (("stage", "untrusted_login_stage"),
                            ("challenge", "interactive_login_required")):
            with self.subTest(kind=kind):
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
                resolutions = 0
                def resolve_then_change(*args):
                    nonlocal resolutions
                    control = original_continuation(*args)
                    resolutions += 1
                    if resolutions == 2:
                        if kind == "stage":
                            page.url = "https://example.invalid/login"
                        else:
                            page.visible_selectors['input:not([type="hidden"])'] = [True]
                    return control
                with patch.object(auth, "_continuation", side_effect=resolve_then_change):
                    with self.assertRaisesRegex(auth.AuthStorageError, error):
                        auth.advance_authenticated_profile(page)
                self.assertEqual(resolutions, 2)
                self.assertEqual(page.clicks, 0)

    def test_challenge_during_first_stage_wait_stops_without_click(self):
        counts = {("button", auth.ACCOUNT_CONTINUATION): 0}
        def reveal(page):
            if page.poll_ticks == 2:
                counts[("button", auth.ACCOUNT_CONTINUATION)] = 1
                page.visible_selectors['input:not([type="hidden"])'] = [True]
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts=counts, on_poll=reveal)
        with self.assertRaisesRegex(auth.AuthStorageError, "interactive_login_required"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (2, 0))

    def test_challenge_during_second_stage_wait_stops_after_one_click(self):
        counts = {("button", auth.ACCOUNT_CONTINUATION): 1, ("button", auth.ACCESS_CONTINUATION): 0}
        def reveal(page):
            if page.poll_ticks == 2:
                page.visible_selectors['input[autocomplete="one-time-code" i]'] = [True]
        page = FakePage("https://account.line.biz/login", [
            "https://access.line.me/oauth2/v2.1/authorize", "https://chat.line.biz/"
        ], role_counts=counts, on_poll=reveal)
        with self.assertRaisesRegex(auth.AuthStorageError, "interactive_login_required"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (2, 1))

    def test_stage_change_while_waiting_stops_without_stale_click(self):
        for destination in ("https://access.line.me/oauth2/v2.1/authorize", "https://example.invalid/login"):
            with self.subTest(destination=destination):
                counts = {("button", auth.ACCOUNT_CONTINUATION): 0}
                def redirect(page):
                    page.url = destination
                    counts[("button", auth.ACCOUNT_CONTINUATION)] = 1
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                                role_counts=counts, on_poll=redirect)
                with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_stage"):
                    auth.advance_authenticated_profile(page)
                self.assertEqual((page.poll_ticks, page.clicks), (1, 0))

    def test_final_chat_transition_while_waiting_uses_outer_validation(self):
        page = FakePage("https://account.line.biz/login", role_counts={},
                        on_poll=lambda current: setattr(current, "url", "https://chat.line.biz/"))
        self.assertEqual(auth.advance_authenticated_profile(page), 0)
        self.assertEqual((page.poll_ticks, page.clicks), (1, 0))

    def test_ambiguous_control_fails_without_polling(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts={("button", auth.ACCOUNT_CONTINUATION): 2})
        with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (0, 0))

    def test_button_and_trusted_link_ambiguity_never_waits_for_one_to_disappear(self):
        counts = {("button", auth.ACCOUNT_CONTINUATION): 1,
                  ("link", auth.ACCOUNT_CONTINUATION): 1}
        def remove_link(page):
            counts[("link", auth.ACCOUNT_CONTINUATION)] = 0
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts=counts,
                        hrefs={("link", auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"},
                        on_poll=remove_link)
        with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (0, 0))

    def test_wait_ready_old_element_loses_exact_name_and_new_element_is_clicked(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        old = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        new = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(old)
        original_wait = auth._wait_for_continuation

        def wait_then_replace(*args):
            ready = original_wait(*args)
            self.assertTrue(ready)
            old.label = "別の操作"
            page.role_elements.append(new)
            return ready

        with patch.object(auth, "_wait_for_continuation", side_effect=wait_then_replace):
            self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(page.snapshots[1][2], (new,))
        self.assertEqual(page.activations, [(new, "click")])

    def test_old_wait_window_cannot_reresolve_during_nonwaiting_pin(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        old = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        new = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(old)
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def change_after_fresh_pin(locator, **kwargs):
            nonlocal calls
            handles = original_snapshot(locator, **kwargs)
            calls += 1
            if calls == 2:  # The fresh union snapshot is complete.
                old.label = "別の操作"
                page.role_elements.append(new)
            return handles

        with patch.object(FakeUnionLocator, "element_handles", change_after_fresh_pin):
            with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
                auth.advance_authenticated_profile(page)
        self.assertEqual(page.snapshots[1][2], (old,))
        self.assertEqual(page.snapshots[2][2], (new,))
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_cross_role_ambiguity_after_pin_before_identity_recheck_fails_closed(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[],
                        hrefs={("link", auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"})
        button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(button)
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def add_link_before_recheck(locator, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 3:
                page.role_elements.append(FakeElementHandle(page, "link", auth.ACCOUNT_CONTINUATION))
            return original_snapshot(locator, **kwargs)

        with patch.object(FakeUnionLocator, "element_handles", add_link_before_recheck):
            with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
                auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_same_role_duplicate_after_pin_before_recheck_fails_closed(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        page.role_elements.append(FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION))
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def add_button_before_recheck(locator, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 3:
                page.role_elements.append(FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION))
            return original_snapshot(locator, **kwargs)

        with patch.object(FakeUnionLocator, "element_handles", add_button_before_recheck):
            with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
                auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_hidden_same_label_link_is_ambiguous_with_button(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        page.role_elements.append(FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION))
        hidden_link = FakeElementHandle(page, "link", auth.ACCOUNT_CONTINUATION)
        hidden_link.visible = False
        page.role_elements.append(hidden_link)
        with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (0, 0))

    def test_alternating_cross_role_queries_cannot_hide_simultaneous_link(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        link = FakeElementHandle(page, "link", auth.ACCOUNT_CONTINUATION)
        page.role_elements.extend((button, link))
        original_role_snapshot = FakeLocator.element_handles
        role_queries = []

        def alternate_around_legacy_role_query(locator, **kwargs):
            # Old button then link queries each saw button A alone, even though
            # the link existed before and after every role query.
            role_queries.append(locator.role)
            link.attached = locator.role == "button"
            try:
                return original_role_snapshot(locator, **kwargs)
            finally:
                link.attached = True

        with patch.object(FakeLocator, "element_handles", alternate_around_legacy_role_query):
            self.assertEqual(page.get_by_role("button", name=auth.ACCOUNT_CONTINUATION, exact=True).element_handles(), [button])
            self.assertEqual(page.get_by_role("link", name=auth.ACCOUNT_CONTINUATION, exact=True).element_handles(), [])
            self.assertTrue(link.attached)
            role_queries.clear()
            page.snapshots.clear()
            with self.assertRaisesRegex(auth.AuthStorageError, "ambiguous_login_continuation"):
                auth.advance_authenticated_profile(page)
        self.assertEqual(role_queries, [])
        self.assertEqual(page.snapshots, [("union", auth.ACCOUNT_CONTINUATION, (button, link))])
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_same_dom_element_surviving_recheck_is_clicked(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(button)
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(page.identity_checks, [(button, button)])
        self.assertEqual(page.activations, [(button, "click")])

    def test_current_control_disappears_after_pin_without_click(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(button)
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def disappear_before_recheck(locator, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 3:
                button.attached = False
            return original_snapshot(locator, **kwargs)

        with patch.object(FakeUnionLocator, "element_handles", disappear_before_recheck):
            with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
                auth.advance_authenticated_profile(page)
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_role_stage_or_challenge_change_after_pin_fails_closed(self):
        for kind, error in (("role", "login_continuation_unavailable"),
                            ("stage", "untrusted_login_stage"),
                            ("challenge", "interactive_login_required")):
            with self.subTest(kind=kind):
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[],
                                hrefs={("link", auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"})
                button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
                page.role_elements.append(button)
                original_snapshot = FakeUnionLocator.element_handles
                calls = 0

                def change_after_pin(locator, **kwargs):
                    nonlocal calls
                    handles = original_snapshot(locator, **kwargs)
                    calls += 1
                    if calls == (3 if kind == "role" else 2):
                        if kind == "role":
                            button.role = "link"
                        elif kind == "stage":
                            page.url = "https://example.invalid/login"
                        else:
                            page.visible_selectors['input:not([type="hidden"])'] = [True]
                    return handles

                with patch.object(FakeUnionLocator, "element_handles", change_after_pin):
                    with self.assertRaisesRegex(auth.AuthStorageError, error):
                        auth.advance_authenticated_profile(page)
                self.assertEqual((page.clicks, page.activations), (0, []))

    def test_link_destination_change_after_pin_fails_closed(self):
        hrefs = {("link", auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"}
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[], hrefs=hrefs)
        page.role_elements.append(FakeElementHandle(page, "link", auth.ACCOUNT_CONTINUATION))
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def change_href_after_pin(locator, **kwargs):
            nonlocal calls
            handles = original_snapshot(locator, **kwargs)
            calls += 1
            if calls == 3:
                hrefs[("link", auth.ACCOUNT_CONTINUATION)] = "https://example.invalid/login"
            return handles

        with patch.object(FakeUnionLocator, "element_handles", change_href_after_pin):
            with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_destination"):
                auth.advance_authenticated_profile(page)
        self.assertEqual(len(page.snapshots), 3)
        self.assertEqual((page.clicks, page.activations), (0, []))

    def test_fresh_exact_control_disappearing_before_pin_fails_closed(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        control = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(control)
        original_snapshot = FakeUnionLocator.element_handles
        calls = 0

        def disappear_before_pin(locator, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                control.label = "別の操作"
            return original_snapshot(locator, **kwargs)

        with patch.object(FakeUnionLocator, "element_handles", disappear_before_pin):
            with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
                auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (0, 0))
        self.assertEqual(page.snapshots[1][2], ())
        self.assertEqual(page.activations, [])

    def test_freshly_pinned_target_becoming_non_actionable_fails_without_replacement(self):
        for state in ("attached", "enabled", "visible"):
            with self.subTest(state=state):
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
                original_snapshot = FakeUnionLocator.element_handles
                calls = 0

                def pin_then_invalidate(locator, **kwargs):
                    nonlocal calls
                    handles = original_snapshot(locator, **kwargs)
                    calls += 1
                    if calls == 2:
                        setattr(page.default_elements[("button", auth.ACCOUNT_CONTINUATION)][0], state, False)
                    return handles

                with patch.object(FakeUnionLocator, "element_handles", pin_then_invalidate):
                    with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
                        auth.advance_authenticated_profile(page)
                self.assertEqual((page.poll_ticks, page.clicks), (0, 0))
                self.assertEqual(page.activations, [])

    def test_activation_uses_pinned_target_without_locator_click_or_actionability_wait(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(page.activations, [(page.identity_checks[0][0], "click")])

    def test_fake_dispatch_has_no_visibility_or_enabled_guard(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"])
        button = FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION)
        button.visible = button.enabled = False
        button.dispatch_event("click")
        self.assertEqual(page.activations, [(button, "click")])

    def test_untrusted_link_fails_without_polling(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts={("link", auth.ACCOUNT_CONTINUATION): 1},
                        hrefs={("link", auth.ACCOUNT_CONTINUATION): "https://example.invalid/login"})
        with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_destination"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (0, 0))

    def test_trusted_link_is_pinned_and_clicked(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[],
                        hrefs={("link", auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"})
        link = FakeElementHandle(page, "link", auth.ACCOUNT_CONTINUATION)
        page.role_elements.append(link)
        self.assertEqual(auth.advance_authenticated_profile(page), 1)
        self.assertEqual(page.identity_checks, [(link, link)])
        self.assertEqual(page.activations, [(link, "click")])

    def test_explicit_button_and_link_semantics_with_trusted_href(self):
        for role, tag in (("button", "a"), ("link", "div")):
            with self.subTest(role=role, tag=tag):
                hrefs = {(role, auth.ACCOUNT_CONTINUATION): "https://access.line.me/oauth2/v2.1/authorize"}
                page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                                role_elements=[], hrefs=hrefs)
                control = FakeElementHandle(page, role, auth.ACCOUNT_CONTINUATION,
                                            tag=tag, declared_role=role)
                page.role_elements.append(control)
                self.assertEqual(auth.advance_authenticated_profile(page), 1)
                self.assertEqual(page.activations, [(control, "click")])

    def test_button_href_and_unknown_semantics_fail_closed(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[],
                        hrefs={("button", auth.ACCOUNT_CONTINUATION): "https://example.invalid/login"})
        page.role_elements.append(FakeElementHandle(page, "button", auth.ACCOUNT_CONTINUATION))
        with self.assertRaisesRegex(auth.AuthStorageError, "untrusted_login_destination"):
            auth.advance_authenticated_profile(page)
        self.assertEqual(page.clicks, 0)

        unknown = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"], role_elements=[])
        unknown.role_elements.append(FakeElementHandle(unknown, "button", auth.ACCOUNT_CONTINUATION,
                                                       tag="div", declared_role="menuitem"))
        with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
            auth.advance_authenticated_profile(unknown)
        self.assertEqual(unknown.clicks, 0)

    def test_missing_control_times_out_without_click(self):
        page = FakePage("https://account.line.biz/login", ["https://chat.line.biz/"],
                        role_counts={("button", auth.ACCOUNT_CONTINUATION): 0})
        with self.assertRaisesRegex(auth.AuthStorageError, "login_continuation_unavailable"):
            auth.advance_authenticated_profile(page)
        self.assertEqual((page.poll_ticks, page.clicks), (20, 0))
        self.assertEqual(TEST_CLOCK[0], 5.0)

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
        self.assertIsNone(auth._trusted_stage(auth.SSO_TRANSITION_URL))

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
        for forbidden in ("post_text_v2", "process_send_once", "requests.post", ".fill(", ".type(",
                          "page.evaluate(", ".send(", ".element_handle(", ".evaluate_handle("):
            self.assertNotIn(forbidden, source)
        self.assertEqual(source.count(".element_handles()"), 1)
        self.assertEqual(source.count(".or_("), 1)
        self.assertEqual(source.count(".evaluate("), 2)
        self.assertIn("(element, current) => element === current", source)
        self.assertIn("page.goto", source)
        self.assertIn("context.cookies", source)


if __name__ == "__main__": unittest.main()
