import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { assertDedicatedEdgeCommandLine, cdpEndpoint, edgeProfilePath, findAuthenticatedInvoicesPage,
  isInvoicesPageUrl, waitForAuthenticatedInvoices, cloudSsoBootstrapUrl, CLOUD_SSO_URL,
  ensureAuthenticatedInvoices, isJpToolboxUrl, isVerifiedJpLogin, isVerifiedToolboxPortal,
  LoginAttemptLatch } from "./yupuri-cloud-live-session";

const url = "https://btoolboxprintservice.jp/invoices/";
const toolboxHome = "https://btoolbox.post.japanpost.jp/portal/PT/PTPT/PTPT0001.do?op=init";
const toolboxDetail = "https://btoolbox.post.japanpost.jp/portal/SV/SVSV/SVSV0001.do";
const profile = edgeProfilePath("C:\\Users\\test\\AppData\\Local");

test("CDP accepts only a dedicated IPv4 loopback HTTP endpoint", () => {
  assert.equal(cdpEndpoint(), "http://127.0.0.1:18822");
  assert.equal(cdpEndpoint("http://127.0.0.1:28822"), "http://127.0.0.1:28822");
  for (const endpoint of ["http://localhost:18822", "http://0.0.0.0:18822", "http://192.168.1.2:18822",
    "https://127.0.0.1:18822", "http://127.0.0.1:18820", "http://127.0.0.1:18821",
    "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:018822",
    "http://127.0.0.1:18822/path", "http://127.0.0.1:18822?x=1", "http://user@127.0.0.1:18822"]) {
    assert.throws(() => cdpEndpoint(endpoint), endpoint);
  }
});

test("CDP browser must use the dedicated profile and local bind", () => {
  assert.equal(profile, join("C:\\Users\\test\\AppData\\Local", "clock-repair-system", "yupuri-cloud", "edge-profile"));
  assert.throws(() => edgeProfilePath(process.cwd()), /outside/);
  const flags = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    `--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=18822"];
  assert.doesNotThrow(() => assertDedicatedEdgeCommandLine(flags, cdpEndpoint(), profile));
  for (const replacement of ["--user-data-dir=C:\\Users\\test\\Other", "--remote-debugging-address=0.0.0.0",
    "--remote-debugging-port=18820"]) {
    const index = flags.findIndex(flag => flag.split("=")[0] === replacement.split("=")[0]);
    const altered = [...flags];
    altered[index] = replacement;
    assert.throws(() => assertDedicatedEdgeCommandLine(altered, cdpEndpoint(), profile));
  }
  assert.throws(() => assertDedicatedEdgeCommandLine([...flags, flags[1]], cdpEndpoint(), profile));
  assert.throws(() => assertDedicatedEdgeCommandLine(["chrome.exe", ...flags.slice(1)], cdpEndpoint(), profile));
});

function page(address: string, tabVisible: boolean): Page {
  return {
    url: () => address,
    isClosed: () => false,
    getByRole: () => ({ count: async () => tabVisible ? 1 : 0, isVisible: async () => tabVisible }),
  } as unknown as Page;
}

test("auth discovers only canonical or known Cloud tab invoices pages with a visible tab", async () => {
  const login = page("https://btoolbox.post.japanpost.jp/login", false);
  const query = page(`${url}?x=1`, true);
  const unauthenticated = page(url, false);
  const invoices = page(url, true);
  const printed = page(`${url}?tab=printed`, true);
  const notPrinted = page(`${url}?tab=not_printed`, true);
  assert.equal(isInvoicesPageUrl(url, url), true);
  assert.equal(isInvoicesPageUrl(`${url}?tab=printed`, url), true);
  assert.equal(isInvoicesPageUrl(`${url}?tab=not_printed`, url), true);
  for (const address of ["https://btoolbox.post.japanpost.jp/login", `${url}?x=1`,
    `${url}?tab=not_printed&x=1`, `${url}?tab=printed&x=1`, `${url}?tab=printed&tab=not_printed`,
    `${url}?tab=other`, `${url}?`, `${url}#`, `${url}?tab=printed#`,
    `${url}?tab=printed#section`, `${url}#tab=not_printed`,
    `${url}?tab=not_printed#section`, "https://btoolboxprintservice.jp/invoices/upload",
    "http://btoolboxprintservice.jp/invoices/", "https://user@btoolboxprintservice.jp/invoices/"]) {
    assert.equal(isInvoicesPageUrl(address, url), false);
  }
  const pages = [login, query, unauthenticated];
  const context = { pages: () => pages } as unknown as BrowserContext;
  let connected = true;
  const browser = { contexts: () => [context], isConnected: () => connected } as unknown as Browser;
  await assert.rejects(findAuthenticatedInvoicesPage(browser, url), /unavailable/);
  pages.push(printed);
  assert.equal(await findAuthenticatedInvoicesPage(browser, url), printed);
  pages.pop();
  pages.push(notPrinted);
  assert.equal(await findAuthenticatedInvoicesPage(browser, url), notPrinted);
  pages.pop();
  setTimeout(() => pages.push(invoices), 5);
  assert.equal(await waitForAuthenticatedInvoices(browser, url, 1), invoices);
  pages.pop();
  setTimeout(() => { connected = false; }, 5);
  await assert.rejects(waitForAuthenticatedInvoices(browser, url, 1), /closed/);
});

test("SSO entry and JP host classification reject altered targets", () => {
  assert.equal(cloudSsoBootstrapUrl(), CLOUD_SSO_URL);
  for (const value of [`${CLOUD_SSO_URL}/`, `${CLOUD_SSO_URL}?x=1`, `${CLOUD_SSO_URL}#x`,
    "http://auth.btoolboxprintservice.jp/sso", "https://user@auth.btoolboxprintservice.jp/sso",
    "https://auth.btoolboxprintservice.jp:443/sso", "https://evil.example/sso"]) {
    assert.throws(() => cloudSsoBootstrapUrl(value));
  }
  assert.equal(isJpToolboxUrl("https://btoolbox.post.japanpost.jp/login"), true);
  assert.equal(isJpToolboxUrl("https://evil.example/login"), false);
  assert.equal(isJpToolboxUrl("http://btoolbox.post.japanpost.jp/login"), false);
});

test("portal verification matches the observed ToolBox home and service detail, not login or arbitrary pages", async () => {
  const harness = authHarness("portal");
  harness.setAddress(toolboxHome);
  assert.equal(await isVerifiedToolboxPortal(harness.page), true);
  harness.setAddress(toolboxDetail);
  harness.setLogoutVisible(false);
  assert.equal(await isVerifiedToolboxPortal(harness.page), true);
  harness.setServiceUrl("https://evil.example/sso");
  assert.equal(await isVerifiedToolboxPortal(harness.page), false);
  harness.setServiceUrl(CLOUD_SSO_URL);
  harness.setLogoutVisible(true);
  for (const address of ["https://btoolbox.post.japanpost.jp/login",
    "https://btoolbox.post.japanpost.jp/saml/SSO", "https://btoolbox.post.japanpost.jp/other",
    "https://btoolbox.post.japanpost.jp/portal/account/login",
    toolboxHome.replace(".jp/", ".jp:443/"), toolboxHome.replace("https://", "https://user@")]) {
    harness.setAddress(address);
    assert.equal(await isVerifiedToolboxPortal(harness.page), false, address);
  }
  harness.setAddress(toolboxHome);
  harness.setLogoutVisible(false);
  assert.equal(await isVerifiedToolboxPortal(harness.page), false);
  harness.setAddress("https://btoolbox.post.japanpost.jp/portal/other");
  assert.equal(await isVerifiedToolboxPortal(harness.page), false);
});

function authHarness(start: "login" | "portal" | "detail" | "cloud", onLoginIdClick?: () => Promise<void> | void) {
  const calls: string[] = [];
  let address = "about:blank";
  let userId = "unexpected";
  let logoutVisible = true;
  let serviceUrl = CLOUD_SSO_URL;
  let ssoExpired = false;
  const fakePage = {
    url: () => address,
    isClosed: () => false,
    goto: async (target: string) => {
      calls.push(`goto:${target}`);
      assert.equal(target, CLOUD_SSO_URL);
      address = ssoExpired ? "https://btoolbox.post.japanpost.jp/login" :
        address.includes("btoolbox.post.japanpost.jp/portal/") || start === "cloud" ? url :
        start === "login" ? "https://btoolbox.post.japanpost.jp/login" :
          start === "detail" ? toolboxDetail : toolboxHome;
    },
    getByRole: (role: string, options: { name?: string }) => {
      const visible = role === "tab" && address === url ||
        role === "link" && options.name === "ログアウト" && address.startsWith("https://btoolbox.post.japanpost.jp/portal/") && logoutVisible;
      return { count: async () => visible ? 1 : 0, isVisible: async () => visible };
    },
    getByText: () => ({ count: async () => 0, isVisible: async () => false }),
    locator: (selector: string) => {
      const form = address.endsWith("/login");
      const known = ["#lgnIdsLogIds", "#usrIdsLogIds", "#pwdLogIds", "#loginLogIds"].includes(selector);
      const detailControl = address === toolboxDetail && ["#srvUtlUrl", "#srvUtl"].includes(selector);
      return {
        count: async () => known && form || detailControl ? 1 : 0,
        isVisible: async () => known && form || selector === "#srvUtl" && detailControl,
        isEnabled: async () => true,
        getAttribute: async (name: string) => selector === "#srvUtlUrl" && name === "value" ? serviceUrl :
          selector === "#srvUtl" && name === "href" ? "javascript:void(0)" : null,
        fill: async (value: string) => { calls.push(`user-fill:${value}`); userId = value; },
        click: async () => { calls.push(`click:${selector}`); if (selector === "#lgnIdsLogIds") await onLoginIdClick?.(); },
        press: async (key: string) => {
          calls.push(`press:${key}`);
          if (key === "Enter") address = toolboxHome;
        },
      };
    },
  } as unknown as Page;
  const pages: Page[] = [];
  const context = { pages: () => pages, newPage: async () => { pages.push(fakePage); return fakePage; } } as unknown as BrowserContext;
  const browser = { contexts: () => [context], isConnected: () => true } as unknown as Browser;
  return { calls, page: fakePage, pages, browser, userId: () => userId,
    navigatePortal: () => { address = toolboxHome; },
    setAddress: (value: string) => { address = value; },
    setLogoutVisible: (value: boolean) => { logoutVisible = value; },
    setSsoExpired: (value: boolean) => { ssoExpired = value; },
    setServiceUrl: (value: string) => { serviceUrl = value; } };
}

test("stale rendered invoices with no marker require fresh exact SSO before success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const latch = new LoginAttemptLatch(join(dir, "attempt"));
    const harness = authHarness("cloud");
    const stale = page(url, true);
    const originalContexts = harness.browser.contexts.bind(harness.browser);
    harness.browser.contexts = (() => [...originalContexts(),
      { pages: () => [stale] } as BrowserContext]) as Browser["contexts"];
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, latch), harness.page);
    assert.notEqual(harness.page, stale);
    assert.deepEqual(harness.calls, Array(2).fill(`goto:${CLOUD_SSO_URL}`));
    await assert.rejects(stat(join(dir, "attempt")), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("stale rendered invoices with no marker require SSO before login handling", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const harness = authHarness("login");
    const stale = page(url, true);
    const originalContexts = harness.browser.contexts.bind(harness.browser);
    harness.browser.contexts = (() => [...originalContexts(),
      { pages: () => [stale] } as BrowserContext]) as Browser["contexts"];
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, new LoginAttemptLatch(path), 500), harness.page);
    assert.notEqual(harness.page, stale);
    assert.deepEqual(harness.calls, [
      `goto:${CLOUD_SSO_URL}`, `goto:${CLOUD_SSO_URL}`, "user-fill:", "click:#lgnIdsLogIds",
      "press:ArrowDown", "press:Enter", `goto:${CLOUD_SSO_URL}`,
    ]);
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("login uses one saved-credential sequence with an atomic pre-attempt latch, then SSO handoff", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    let latchWasPresent = false;
    const harness = authHarness("login", async () => { latchWasPresent = (await readFile(path, "utf8")).trim() === "attempted"; });
    const latch = new LoginAttemptLatch(path);
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, latch, 500), harness.page);
    assert.equal(latchWasPresent, true);
    assert.equal(harness.userId(), "");
    assert.deepEqual(harness.calls, [
      `goto:${CLOUD_SSO_URL}`, `goto:${CLOUD_SSO_URL}`, "user-fill:", "click:#lgnIdsLogIds", "press:ArrowDown", "press:Enter",
      `goto:${CLOUD_SSO_URL}`,
    ]);
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("failed automatic attempt stays latched across runs and never retries credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const harness = authHarness("login");
    // Simulate a saved credential that fills controls but causes no navigation.
    const originalLocator = harness.page.locator.bind(harness.page);
    harness.page.locator = ((selector: string) => {
      const control = originalLocator(selector);
      return selector === "#lgnIdsLogIds" ? { ...control, press: async (key: string) => { harness.calls.push(`press:${key}`); } } : control;
    }) as Page["locator"];
    await assert.rejects(ensureAuthenticatedInvoices(harness.browser, url, new LoginAttemptLatch(path), 50));
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
    assert.deepEqual(harness.calls.filter(call => call.startsWith("press:")), ["press:ArrowDown", "press:Enter"]);
    const second = authHarness("login");
    await assert.rejects(ensureAuthenticatedInvoices(second.browser, url, new LoginAttemptLatch(path), 50), /already attempted/);
    assert.deepEqual(second.calls, [`goto:${CLOUD_SSO_URL}`]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("exclusive latch permits only one concurrent claimant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const results = await Promise.allSettled([
      new LoginAttemptLatch(path).runExclusive(lease => lease.claim()),
      new LoginAttemptLatch(path).runExclusive(lease => lease.claim()),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), ["fulfilled", "rejected"]);
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("overlapping helpers serialize the attempt and never send a second credential sequence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    let releaseFirst!: () => void;
    let firstClicked!: () => void;
    const clicked = new Promise<void>(resolve => { firstClicked = resolve; });
    const paused = new Promise<void>(resolve => { releaseFirst = resolve; });
    const first = authHarness("login", async () => { firstClicked(); await paused; });
    const second = authHarness("login");
    const secondContexts = second.browser.contexts.bind(second.browser);
    second.browser.contexts = (() => [...secondContexts(),
      { pages: () => first.pages } as BrowserContext]) as Browser["contexts"];
    const path = join(dir, "attempt");
    const firstRun = ensureAuthenticatedInvoices(first.browser, url, new LoginAttemptLatch(path), 500);
    await clicked; // First helper holds the lock with its attempt marker already written.
    const secondRun = ensureAuthenticatedInvoices(second.browser, url, new LoginAttemptLatch(path), 500);
    const secondRejected = assert.rejects(secondRun, /already attempted/);
    await new Promise(resolve => setTimeout(resolve, 30));
    releaseFirst();
    assert.equal(await firstRun, first.page);
    await secondRejected;
    assert.deepEqual(first.calls.filter(call => call.startsWith("press:")), ["press:ArrowDown", "press:Enter"]);
    assert.deepEqual(second.calls.filter(call => call.startsWith("press:")), []);
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("abandoned lock is never broken automatically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    await mkdir(`${path}.lock`);
    await assert.rejects(new LoginAttemptLatch(path).runExclusive(async () => undefined, 0), /lock unavailable/);
    assert.equal((await stat(`${path}.lock`)).isDirectory(), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("credential-free Cloud recovery remains usable behind an abandoned lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    await new LoginAttemptLatch(path).runExclusive(lease => lease.claim());
    await mkdir(`${path}.lock`);
    const harness = authHarness("cloud");
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, new LoginAttemptLatch(path), 100), harness.page);
    assert.deepEqual(harness.calls, [`goto:${CLOUD_SSO_URL}`]);
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a stale Cloud observation cannot clear another helper's active attempt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    let releaseOwner!: () => void;
    let ownerReady!: () => void;
    const ready = new Promise<void>(resolve => { ownerReady = resolve; });
    const paused = new Promise<void>(resolve => { releaseOwner = resolve; });
    const owner = new LoginAttemptLatch(path).runExclusive(async lease => {
      await lease.claim();
      ownerReady();
      await paused;
    });
    await ready;
    const observer = authHarness("login");
    observer.pages.push(observer.page);
    observer.setAddress(url);
    const observing = assert.rejects(ensureAuthenticatedInvoices(observer.browser, url,
      new LoginAttemptLatch(path), 100), /already attempted/);
    await new Promise(resolve => setTimeout(resolve, 20));
    observer.setAddress("about:blank");
    releaseOwner();
    await owner;
    await observing;
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
    assert.deepEqual(observer.calls.filter(call => call.startsWith("press:")), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("navigation during credential selection is observed without a second key sequence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const harness = authHarness("login");
    const originalLocator = harness.page.locator.bind(harness.page);
    harness.page.locator = ((selector: string) => {
      const control = originalLocator(selector);
      return selector === "#lgnIdsLogIds" ? { ...control, press: async (key: string) => {
        harness.calls.push(`press:${key}`);
        if (key === "ArrowDown") { harness.navigatePortal(); throw new Error("page navigated"); }
      } } : control;
    }) as Page["locator"];
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url,
      new LoginAttemptLatch(join(dir, "attempt")), 500), harness.page);
    assert.deepEqual(harness.calls.filter(call => call.startsWith("press:")), ["press:ArrowDown"]);
    assert.deepEqual(harness.calls.filter(call => call.startsWith("goto:")),
      [`goto:${CLOUD_SSO_URL}`, `goto:${CLOUD_SSO_URL}`, `goto:${CLOUD_SSO_URL}`]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("verified portal handoff skips credential interaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const harness = authHarness("portal");
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, new LoginAttemptLatch(join(dir, "attempt")), 500), harness.page);
    assert.deepEqual(harness.calls, Array(4).fill(`goto:${CLOUD_SSO_URL}`));
    assert.equal(await isVerifiedToolboxPortal(harness.page), false); // The page is now Cloud invoices.
    assert.equal(await isVerifiedJpLogin(harness.page), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("preexisting latch permits direct Cloud recovery through exact SSO without credential keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const latch = new LoginAttemptLatch(path);
    await latch.runExclusive(lease => lease.claim());
    const harness = authHarness("cloud");
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, latch, 500), harness.page);
    assert.deepEqual(harness.calls, Array(2).fill(`goto:${CLOUD_SSO_URL}`));
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("preexisting latch permits authenticated ToolBox handoff without credential keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const latch = new LoginAttemptLatch(path);
    await latch.runExclusive(lease => lease.claim());
    const harness = authHarness("portal");
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, latch, 500), harness.page);
    assert.deepEqual(harness.calls, Array(4).fill(`goto:${CLOUD_SSO_URL}`));
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("preexisting latch reaching JP login stops before any credential interaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const latch = new LoginAttemptLatch(path);
    await latch.runExclusive(lease => lease.claim());
    const harness = authHarness("login");
    await assert.rejects(ensureAuthenticatedInvoices(harness.browser, url, latch, 500), /already attempted/);
    assert.deepEqual(harness.calls, [`goto:${CLOUD_SSO_URL}`]);
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("stale visible invoices with a durable marker cannot clear it when exact SSO reaches JP login", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const latch = new LoginAttemptLatch(path);
    await latch.runExclusive(lease => lease.claim());
    const harness = authHarness("login");
    const originalContexts = harness.browser.contexts.bind(harness.browser);
    const stale = page(url, true);
    harness.browser.contexts = (() => [...originalContexts(),
      { pages: () => [stale] } as BrowserContext]) as Browser["contexts"];
    await assert.rejects(ensureAuthenticatedInvoices(harness.browser, url, latch, 100), /already attempted/);
    assert.deepEqual(harness.calls, [`goto:${CLOUD_SSO_URL}`]);
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
    assert.deepEqual(harness.calls.filter(call => call.startsWith("press:")), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("stale Cloud tab appearing during credential selection cannot prove its outcome or clear the marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    let addStale = () => {};
    const harness = authHarness("login", () => { addStale(); harness.setSsoExpired(true); });
    const originalContexts = harness.browser.contexts.bind(harness.browser);
    addStale = () => { harness.browser.contexts = (() => [...originalContexts(),
      { pages: () => [page(url, true)] } as BrowserContext]) as Browser["contexts"]; };
    await assert.rejects(ensureAuthenticatedInvoices(harness.browser, url,
      new LoginAttemptLatch(path), 50), /outcome unavailable/);
    assert.deepEqual(harness.calls.filter(call => call.startsWith("press:")), ["press:ArrowDown", "press:Enter"]);
    assert.equal((await readFile(path, "utf8")).trim(), "attempted");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fresh exact-SSO Cloud recovery clears a marker despite a pre-existing stale Cloud tab", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-auth-"));
  try {
    const path = join(dir, "attempt");
    const latch = new LoginAttemptLatch(path);
    await latch.runExclusive(lease => lease.claim());
    const harness = authHarness("cloud");
    const originalContexts = harness.browser.contexts.bind(harness.browser);
    const stale = page(url, true);
    harness.browser.contexts = (() => [...originalContexts(),
      { pages: () => [stale] } as BrowserContext]) as Browser["contexts"];
    assert.equal(await ensureAuthenticatedInvoices(harness.browser, url, latch, 500), harness.page);
    assert.deepEqual(harness.calls, Array(2).fill(`goto:${CLOUD_SSO_URL}`));
    await assert.rejects(stat(path), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
