import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "@playwright/test";
import { join } from "node:path";
import { assertAuthenticatedInvoices, assertDedicatedEdgeCommandLine, assertToolboxAutomationWindowOpen, cdpEndpoint, edgeProfilePath,
  ensureAuthenticatedInvoices, isExpectedToolboxHandoffUrl, isInvoicesPageUrl, isJpLoginCandidate, isJpToolboxUrl, isToolboxServiceOpen,
  isToolboxAutomationWindowOpen, msUntilToolboxAutomationWindowOpen, isVerifiedToolboxPortal, TOOLBOX_PUBLIC_ENTRY_URL,
  TOOLBOX_LOGIN_URL, CLOUD_SSO_URL } from "./yupuri-cloud-live-session";

const invoices = "https://btoolboxprintservice.jp/invoices/";
const portal = "https://btoolbox.post.japanpost.jp/portal/PT/PTPT/PTPT0001.do?op=init";
const openTime = () => new Date("2026-10-11T03:00:00.000Z");

function harness(outcome: "portal" | "login" | "sso-login" | "no-page" | "duplicate" | "entry-navigates" |
  "unexpected" | "unrelated" | "extra-on-sso" = "portal", loginLinks = 1, initialTabs = 1) {
  const actions: string[] = [];
  const pages: Page[] = [];
  const listeners = new Set<(page: Page) => void>();
  let pageWait: ((page: Page) => void) | undefined;
  let rejectPageWait: ((error: Error) => void) | undefined;
  const emit = (page: Page) => {
    pages.push(page);
    for (const listener of listeners) listener(page);
    pageWait?.(page);
    pageWait = undefined;
  };
  function makePage(initial: string, entry = false, opener: Page | null = null): Page {
    let address = initial;
    let closed = false;
    return {
      url: () => address,
      isClosed: () => closed,
      opener: async () => opener,
      close: async () => { closed = true; actions.push("close:entry"); },
      goto: async (target: string) => {
        actions.push(`goto:${target}`);
        address = target === CLOUD_SSO_URL ?
          (outcome === "sso-login" ? "https://btoolbox.post.japanpost.jp/login" : invoices) : target;
        if (target === CLOUD_SSO_URL && outcome === "extra-on-sso") emit(makePage("https://example.com"));
      },
      locator: (selector: string, options?: { hasText?: RegExp }) => {
        const officialLogin = entry && selector === `a[href="${TOOLBOX_LOGIN_URL}"]` &&
          (!options?.hasText || options.hasText.test("\u30ed\u30b0\u30a4\u30f3"));
        const portalLogout = address === portal && selector === 'a[href="javascript:void(0);"]' &&
          (!options?.hasText || options.hasText.test("\u30ed\u30b0\u30a2\u30a6\u30c8"));
        const clickOfficial = async (clickOptions?: { trial?: boolean }) => {
          if (clickOptions?.trial) return;
          if (!officialLogin) throw new Error("Credential control clicked");
          if (!pageWait) throw new Error("Page wait was not armed before click");
          actions.push("click:official-login");
          if (outcome === "no-page") { rejectPageWait?.(new Error("Timeout waiting for page")); return; }
          if (outcome === "entry-navigates") address = "https://www.post.japanpost.jp/other";
          emit(makePage(outcome === "login" ? "https://btoolbox.post.japanpost.jp/login" :
            outcome === "unexpected" ? "https://example.com" : portal,
          false, outcome === "unrelated" ? null : pages[0]));
          if (outcome === "duplicate") emit(makePage(portal, false, pages[0]));
        };
        return {
          count: async () => officialLogin ? loginLinks : portalLogout ? 1 :
            address.endsWith("/login") && selector === "#lgnIdsLogIds" ? 1 : 0,
          isVisible: async () => officialLogin || portalLogout || address.endsWith("/login") && selector === "#lgnIdsLogIds",
          nth: (index: number) => ({
            isVisible: async () => officialLogin ? index < loginLinks :
              address.endsWith("/login") && selector === "#lgnIdsLogIds",
            getAttribute: async (name: string) => officialLogin && index < loginLinks ?
              (name === "href" ? TOOLBOX_LOGIN_URL : name === "target" ? "_blank" : null) : null,
            click: clickOfficial,
          }),
          click: clickOfficial,
        };
      },
      getByRole: (role: string, options: { name?: string }) => ({
        count: async () => role === "link" && options.name === "ログアウト" && address === portal ||
          role === "tab" && options.name === "発行後" && address === invoices ? 1 : 0,
        isVisible: async () => role === "link" && options.name === "ログアウト" && address === portal ||
          role === "tab" && options.name === "発行後" && address === invoices,
        waitFor: async () => undefined,
      }),
      getByText: () => ({ count: async () => 0, nth: () => ({ isVisible: async () => false }) }),
    } as unknown as Page;
  }
  const entry = makePage(TOOLBOX_PUBLIC_ENTRY_URL, true);
  pages.push(entry);
  for (let i = 1; i < initialTabs; i++) pages.push(makePage("https://example.com"));
  const browser = {
    contexts: () => [{
      pages: () => pages,
      on: (_event: string, listener: (page: Page) => void) => { listeners.add(listener); },
      off: (_event: string, listener: (page: Page) => void) => { listeners.delete(listener); },
      waitForEvent: () => new Promise<Page>((resolve, reject) => { pageWait = resolve; rejectPageWait = reject; }),
    }],
    isConnected: () => true,
  } as unknown as Browser;
  return { entry, browser, actions, pages, setAddress: (value: string) => { pages[0] = makePage(value, true); } };
}

test("dedicated CDP identity rejects another Edge profile or port", () => {
  const profile = edgeProfilePath("C:\\Users\\test\\AppData\\Local");
  assert.equal(profile, join("C:\\Users\\test\\AppData\\Local", "clock-repair-system", "yupuri-cloud", "edge-profile"));
  const flags = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    `--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=18822"];
  assert.doesNotThrow(() => assertDedicatedEdgeCommandLine(flags, cdpEndpoint(), profile));
  assert.throws(() => assertDedicatedEdgeCommandLine([...flags, flags[1]], cdpEndpoint(), profile));
  assert.throws(() => assertDedicatedEdgeCommandLine(flags.map(flag => flag.startsWith("--user-data-dir=") ?
    "--user-data-dir=C:\\Users\\test\\normal" : flag), cdpEndpoint(), profile));
  assert.throws(() => assertDedicatedEdgeCommandLine(flags.map(flag => flag.startsWith("--remote-debugging-port=") ?
    "--remote-debugging-port=18821" : flag), cdpEndpoint(), profile));
  assert.throws(() => cdpEndpoint("http://localhost:18822"));
});

test("new target-blank page may be empty only before the official ToolBox handoff", () => {
  assert.equal(isExpectedToolboxHandoffUrl(""), true);
  assert.equal(isExpectedToolboxHandoffUrl("about:blank"), true);
  assert.equal(isExpectedToolboxHandoffUrl("https://btoolbox.post.japanpost.jp/auth/realms/realm1/protocol/saml/clients/portal"), true);
  assert.equal(isExpectedToolboxHandoffUrl("https://btoolbox.post.japanpost.jp/portal/PT/PTPT/PTPT0001.do?op=init"), true);
  assert.equal(isExpectedToolboxHandoffUrl("https://example.com/"), false);
  assert.equal(isExpectedToolboxHandoffUrl("edge://newtab/"), false);
});

test("official hours and conservative JST automation cutoff are distinct", () => {
  const before = new Date("2026-10-10T20:59:59.999Z");
  const opening = new Date("2026-10-10T21:00:00.000Z");
  const lastOpen = new Date("2026-10-11T14:54:59.999Z");
  const cutoff = new Date("2026-10-11T14:55:00.000Z");
  const closing = new Date("2026-10-11T15:00:00.000Z");
  assert.equal(isToolboxServiceOpen(before), false);
  assert.equal(msUntilToolboxAutomationWindowOpen(before), 1);
  assert.equal(isToolboxServiceOpen(opening), true);
  assert.equal(isToolboxAutomationWindowOpen(opening), true);
  assert.equal(msUntilToolboxAutomationWindowOpen(opening), 0);
  assert.equal(isToolboxAutomationWindowOpen(lastOpen), true);
  assert.doesNotThrow(() => assertToolboxAutomationWindowOpen(lastOpen));
  assert.equal(isToolboxServiceOpen(cutoff), true);
  assert.equal(isToolboxAutomationWindowOpen(cutoff), false);
  assert.throws(() => assertToolboxAutomationWindowOpen(cutoff), /automation window/);
  assert.equal(msUntilToolboxAutomationWindowOpen(cutoff), (6 * 60 + 5) * 60 * 1000);
  assert.equal(isToolboxServiceOpen(new Date(closing.getTime() - 1)), true);
  assert.equal(isToolboxServiceOpen(closing), false);
  assert.equal(isToolboxAutomationWindowOpen(closing), false);
  assert.equal(msUntilToolboxAutomationWindowOpen(closing), 6 * 60 * 60 * 1000);
});

test("official target blank Login opens one new portal page, closes entry, then reaches Cloud", async () => {
  const h = harness();
  const cloud = await ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime);
  assert.equal(cloud, h.pages[1]);
  assert.equal(h.entry.url(), TOOLBOX_PUBLIC_ENTRY_URL);
  assert.equal(h.entry.isClosed(), true);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login",
    "close:entry", `goto:${CLOUD_SSO_URL}`]);
  assert.equal(await isVerifiedToolboxPortal(h.entry), false);
});

test("an old rendered invoices tab is rechecked through official entry and SSO", async () => {
  const h = harness();
  h.setAddress(invoices);
  assert.equal(await ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), h.pages[1]);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login",
    "close:entry", `goto:${CLOUD_SSO_URL}`]);
});

test("login form stops with manual recovery and never sends credential keys", async () => {
  const h = harness("login");
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), /Log in manually with auto-login enabled/);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login"]);
  assert.equal(h.entry.url(), TOOLBOX_PUBLIC_ENTRY_URL);
});

test("no new page event fails after one click with unchanged entry", async () => {
  const h = harness("no-page");
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), /did not open a new ToolBox page/);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login"]);
  assert.equal(h.entry.url(), TOOLBOX_PUBLIC_ENTRY_URL);
});

test("duplicate, unrelated, unexpected, and later extra new pages fail closed", async () => {
  for (const [outcome, reason] of [
    ["duplicate", /Unexpected dedicated Edge tab/],
    ["unrelated", /unrelated page/],
    ["unexpected", /unexpected page/],
    ["extra-on-sso", /Unexpected dedicated Edge tab/],
  ] as const) {
    const h = harness(outcome);
    await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), reason);
    assert.equal(h.actions.filter(action => action === "click:official-login").length, 1);
  }
});

test("new portal cannot hide navigation of original public entry", async () => {
  const h = harness("entry-navigates");
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), /entry changed/);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login"]);
  assert.equal(h.entry.isClosed(), false);
});

test("duplicate official Login CTAs are accepted but only one is clicked", async () => {
  const h = harness("portal", 2);
  await ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime);
  assert.equal(h.actions.filter(action => action === "click:official-login").length, 1);
});

test("missing official Login link and duplicate tabs fail closed", async () => {
  const missing = harness("portal", 0);
  await assert.rejects(ensureAuthenticatedInvoices(missing.browser, invoices, 50, openTime), /Official ToolBox Login link unavailable/);
  assert.deepEqual(missing.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`]);
  const tabs = harness("portal", 1, 2);
  await assert.rejects(ensureAuthenticatedInvoices(tabs.browser, invoices, 50, openTime), /exactly one tab/);
  assert.deepEqual(tabs.actions, []);
});

test("Cloud SSO login redirect fails with manual recovery", async () => {
  const h = harness("sso-login");
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50, openTime), /Log in manually with auto-login enabled/);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`, "click:official-login",
    "close:entry", `goto:${CLOUD_SSO_URL}`]);
});

test("outside automation window exits before browser navigation", async () => {
  const h = harness();
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50,
    () => new Date("2026-10-11T14:55:00Z")), /automation window/);
  assert.deepEqual(h.actions, []);
});

test("official entry navigation rechecks hours after tab inspection", async () => {
  const h = harness();
  let checks = 0;
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50,
    () => ++checks === 1 ? openTime() : new Date("2026-10-11T14:55:00Z")), /automation window/);
  assert.deepEqual(h.actions, []);
  assert.equal(checks, 2);
});

test("official Login actionability wait cannot dispatch after hours close", async () => {
  const h = harness();
  let closed = false;
  const original = h.entry.locator.bind(h.entry);
  h.entry.locator = ((selector: string, options?: { hasText?: RegExp }) => {
    const item = original(selector, options as never) as any;
    return { ...item, nth: (index: number) => {
      const nth = item.nth(index);
      return { ...nth, click: async (clickOptions?: { trial?: boolean }) => {
        if (clickOptions?.trial) { closed = true; return; }
        await nth.click(clickOptions);
      } };
    } };
  }) as Page["locator"];
  await assert.rejects(ensureAuthenticatedInvoices(h.browser, invoices, 50,
    () => closed ? new Date("2026-10-11T14:55:00Z") : openTime()), /automation window/);
  assert.deepEqual(h.actions, [`goto:${TOOLBOX_PUBLIC_ENTRY_URL}`]);
});

test("username, ambiguous controls and text, and inspection errors block portal proof", async () => {
  const make = (visible: boolean[], selector = "#usrIdsLogIds", inspectionError: "count" | "visibility" | null = null,
    textVisible: boolean[] = []): Page => ({
    url: () => portal, isClosed: () => false,
    locator: (actual: string) => ({ count: async () => {
      if (inspectionError === "count" && actual === selector) throw new Error("count failed");
      if (actual === 'a[href="javascript:void(0);"]') return 1;
      return actual === selector ? visible.length : 0;
    },
      isVisible: async () => actual === 'a[href="javascript:void(0);"]',
      nth: (index: number) => ({ isVisible: async () => {
        if (inspectionError === "visibility") throw new Error("inspection failed");
        return visible[index];
      } }),
    }),
    getByText: () => ({ count: async () => textVisible.length,
      nth: (index: number) => ({ isVisible: async () => textVisible[index] }) }),
    getByRole: () => ({ count: async () => 1, isVisible: async () => true }),
  } as unknown as Page);
  for (const [visible, candidate] of [
    [[], false], [[false], false], [[false, false], true],
    [[true, false], true], [[false, true], true], [[true, true], true],
  ] as const) {
    const page = make([...visible]);
    assert.equal(await isJpLoginCandidate(page), candidate);
    assert.equal(await isVerifiedToolboxPortal(page), !candidate);
  }
  for (const selector of ["#lgnIdsLogIds", "#usrIdsLogIds", "#pwdLogIds", "#loginLogIds"]) {
    assert.equal(await isJpLoginCandidate(make([true], selector)), true, selector);
  }
  for (const error of ["count", "visibility"] as const) {
    const errorPage = make([false], "#usrIdsLogIds", error);
    assert.equal(await isJpLoginCandidate(errorPage), true);
    assert.equal(await isVerifiedToolboxPortal(errorPage), false);
  }
  for (const textVisible of [[false, false], [true, false], [false, true]]) {
    const labelPage = make([], "#usrIdsLogIds", null, textVisible);
    assert.equal(await isJpLoginCandidate(labelPage), true);
    assert.equal(await isVerifiedToolboxPortal(labelPage), false);
  }
});

test("invoice proof waits for the SSO redirect before enforcing the final URL", async () => {
  let address = CLOUD_SSO_URL;
  const page = {
    url: () => address, isClosed: () => false,
    getByRole: () => ({
      waitFor: async () => { address = invoices; },
      count: async () => 1, isVisible: async () => true,
    }),
  } as unknown as Page;
  await assert.doesNotReject(assertAuthenticatedInvoices(page, invoices));
  assert.equal(address, invoices);
});

test("portal and invoices URL proof reject unrelated pages", async () => {
  const h = harness();
  assert.equal(await isVerifiedToolboxPortal(h.entry), false);
  assert.equal(isJpToolboxUrl("https://btoolbox.post.japanpost.jp/login"), true);
  assert.equal(isJpToolboxUrl("https://evil.example/login"), false);
  assert.equal(isInvoicesPageUrl(invoices, invoices), true);
  assert.equal(isInvoicesPageUrl(`${invoices}?tab=printed`, invoices), true);
  assert.equal(isInvoicesPageUrl(`${invoices}?x=1`, invoices), false);
});

test("exact official URL constants and strict invoice URL policy", () => {
  assert.equal(TOOLBOX_PUBLIC_ENTRY_URL, "https://www.post.japanpost.jp/bizpost/service/businesstoolbox/");
  assert.equal(TOOLBOX_LOGIN_URL, "https://btoolbox.post.japanpost.jp/");
  assert.equal(CLOUD_SSO_URL, "https://auth.btoolboxprintservice.jp/sso");
  for (const url of [invoices, `${invoices}?tab=printed`, `${invoices}?tab=not_printed`]) {
    assert.equal(isInvoicesPageUrl(url, invoices), true, url);
  }
  for (const url of [
    `${invoices}?tab=other`, `${invoices}?tab=printed&x=1`, `${invoices}x`,
    "https://btoolboxprintservice.jp/invoices/export", "http://btoolboxprintservice.jp/invoices/",
    "https://btoolboxprintservice.jp:8443/invoices/", "https://btoolboxprintservice.jp:443/invoices/",
    "https://user:pass@btoolboxprintservice.jp/invoices/",
    "https://btoolboxprintservice.jp.evil.example/invoices/", `${invoices}#x`,
  ]) assert.equal(isInvoicesPageUrl(url, invoices), false, url);
  for (const expected of ["https://btoolboxprintservice.jp/invoices", "https://btoolboxprintservice.jp:443/invoices/",
    "https://user@btoolboxprintservice.jp/invoices/"]) {
    assert.equal(isInvoicesPageUrl(invoices, expected), false, expected);
  }
});

test("ToolBox portal requires official host and authenticated proof", async () => {
  const make = (url: string, logout = false, sso: string | null = null, use = false, ssoVisible = false) => ({
    url: () => url, isClosed: () => false,
    getByRole: () => ({ count: async () => 0, isVisible: async () => false }),
    locator: (selector: string) => {
      const logoutAnchor = selector === 'a[href="javascript:void(0);"]' && logout;
      return { count: async () => logoutAnchor || selector === "#srvUtlUrl" && sso !== null || selector === "#srvUtl" && use ? 1 : 0,
        getAttribute: async () => sso, isVisible: async () => logoutAnchor ? true : selector === "#srvUtlUrl" ? ssoVisible : use,
        nth: () => ({ isVisible: async () => false }) };
    },
    getByText: () => ({ count: async () => 0, nth: () => ({ isVisible: async () => false }) }),
  } as unknown as Page);
  for (const url of ["https://btoolbox.post.japanpost.jp/login", "https://btoolbox.post.japanpost.jp/portal/other",
    `${portal}&extra=1`, portal.replace("op=init", "op=other"), `${portal}#fragment`,
    `${portal.replace("PTPT0001.do", "PTPT0001.doX")}`, `${portal.replace("https://", "https://user@")}`,
    `${portal.replace(".jp/portal", ".jp:443/portal")}`,
    "http://btoolbox.post.japanpost.jp/portal/PT/PTPT/PTPT0001.do?op=init",
    "https://btoolbox.post.japanpost.jp:8443/portal/PT/PTPT/PTPT0001.do?op=init",
    "https://btoolbox.post.japanpost.jp.evil.example/portal/PT/PTPT/PTPT0001.do?op=init",
  ]) assert.equal(await isVerifiedToolboxPortal(make(url, true)), false, url);
  assert.equal(await isVerifiedToolboxPortal(make(portal)), false);
  assert.equal(await isVerifiedToolboxPortal(make(portal, true)), true);
  const detail = "https://btoolbox.post.japanpost.jp/portal/SV/SVSV/SVSV0001.do";
  assert.equal(await isVerifiedToolboxPortal(make(detail, false, CLOUD_SSO_URL, true)), true);
  assert.equal(await isVerifiedToolboxPortal(make(detail, true)), false);
  assert.equal(await isVerifiedToolboxPortal(make(detail, false, CLOUD_SSO_URL, true, true)), false);
  assert.equal(await isVerifiedToolboxPortal(make(detail, false, "https://evil.example/sso", true)), false);
  assert.equal(await isVerifiedToolboxPortal(make(detail, false, CLOUD_SSO_URL, false)), false);
  for (const url of [`${detail}?x=1`, `${detail}#x`, detail.replace(".jp/portal", ".jp:443/portal")]) {
    assert.equal(await isVerifiedToolboxPortal(make(url, true, CLOUD_SSO_URL, true)), false, url);
  }
  for (const url of ["https://btoolbox.post.japanpost.jp/", "https://btoolbox.post.japanpost.jp/login"]) {
    assert.equal(isJpToolboxUrl(url), true);
  }
  for (const url of ["http://btoolbox.post.japanpost.jp/", "https://btoolbox.post.japanpost.jp:8443/",
    "https://btoolbox.post.japanpost.jp:443/",
    "https://user@btoolbox.post.japanpost.jp/", "https://btoolbox.post.japanpost.jp.evil.example/"]) {
    assert.equal(isJpToolboxUrl(url), false);
  }
});
