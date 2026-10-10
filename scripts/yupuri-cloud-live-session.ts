import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir, open, rmdir, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function cdpEndpoint(value = "http://127.0.0.1:18822"): string {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})$/.exec(value);
  const port = match && Number(match[1]);
  if (!port || port < 1024 || port > 65535 || port === 18820 || port === 18821) {
    throw new Error("Cloud CDP endpoint must be a dedicated localhost port");
  }
  return value;
}

export function edgeProfilePath(localAppData: string): string {
  if (!localAppData || !isAbsolute(localAppData)) throw new Error("LOCALAPPDATA is required");
  const profile = join(localAppData, "clock-repair-system", "yupuri-cloud", "edge-profile");
  const fromRepo = relative(process.cwd(), profile);
  if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
    throw new Error("Cloud Edge profile must be outside the repository");
  }
  return profile;
}

export const CLOUD_SSO_URL = "https://auth.btoolboxprintservice.jp/sso";

export function cloudSsoBootstrapUrl(value = CLOUD_SSO_URL): string {
  // Compare the original spelling too: URL() normalizes empty queries, fragments and ports.
  if (value !== CLOUD_SSO_URL) throw new Error("Invalid Cloud SSO bootstrap URL");
  return value;
}

export function loginAttemptLatchPath(localAppData: string): string {
  return join(dirname(edgeProfilePath(localAppData)), "auto-login-attempted");
}

export const CLOUD_LOGIN_LOCK_PROTOCOL = 2;

class LoginLockUnavailableError extends Error {}

export class LoginAttemptLatch {
  constructor(private readonly path: string) {}
  async isClaimed(): Promise<boolean> {
    try { await stat(this.path); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  // mkdir is exclusive across Node processes on Windows. Never break an abandoned
  // lock automatically: a dead process may have already sent a credential key.
  async runExclusive<T>(action: (lease: LoginAttemptLease) => Promise<T>, waitMs = 90000): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    const lockPath = `${this.path}.lock`;
    const deadline = Date.now() + waitMs;
    while (true) {
      try { await mkdir(lockPath); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new LoginLockUnavailableError("Cloud login lock unavailable; manual recovery required");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    try { return await action(new LoginAttemptLease(this.path)); }
    finally { await rmdir(lockPath); }
  }
}

class LoginAttemptLease {
  constructor(private readonly path: string) {}
  async claim(): Promise<void> {
    let file;
    try { file = await open(this.path, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Automatic Cloud login already attempted; manual recovery required");
      throw error;
    }
    try { await file.writeFile("attempted\n"); }
    finally { await file.close(); }
  }
  async clearAfterAuthenticated(): Promise<void> {
    try { await unlink(this.path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

function oneFlag(args: string[], name: string): string {
  const values = args.filter(arg => arg.startsWith(`${name}=`)).map(arg => arg.slice(name.length + 1));
  if (values.length !== 1 || !values[0]) throw new Error("Cloud Edge session does not match the dedicated profile");
  return values[0];
}

export function assertDedicatedEdgeCommandLine(args: string[], endpoint: string, profile: string): void {
  const port = new URL(cdpEndpoint(endpoint)).port;
  const actualProfile = oneFlag(args, "--user-data-dir").replace(/^"|"$/g, "");
  if (!/(^|[\\/])msedge\.exe$/i.test((args[0] ?? "").replace(/^"|"$/g, "")) ||
    resolve(actualProfile).toLowerCase() !== resolve(profile).toLowerCase() ||
    oneFlag(args, "--remote-debugging-address") !== "127.0.0.1" ||
    oneFlag(args, "--remote-debugging-port") !== port) {
    throw new Error("Cloud Edge session does not match the dedicated profile");
  }
}

export async function connectDedicatedEdge(endpoint: string, profile: string): Promise<Browser> {
  const safeEndpoint = cdpEndpoint(endpoint);
  const browser = await chromium.connectOverCDP(safeEndpoint, { timeout: 5000 });
  try {
    const session = await browser.newBrowserCDPSession();
    try {
      const result = await session.send("Browser.getBrowserCommandLine");
      assertDedicatedEdgeCommandLine(result.arguments, safeEndpoint, profile);
    } finally { await session.detach(); }
    return browser;
  } catch (error) {
    // The caller exits on failure, which drops CDP without a Browser.close command.
    throw error;
  }
}

export function isInvoicesPageUrl(actual: string, expected: string): boolean {
  try {
    const page = new URL(actual);
    const invoices = new URL(expected);
    return page.origin === invoices.origin && page.pathname.replace(/\/$/, "") === "/invoices" &&
      (page.search === "" || page.search === "?tab=printed" || page.search === "?tab=not_printed") &&
      page.href === `${page.origin}${page.pathname}${page.search}` &&
      !page.hash && !page.username && !page.password;
  } catch { return false; }
}

// This checks rendered UI only; it is not fresh server authentication proof.
// Marker reset additionally requires an exact-SSO navigation on the probe page.
export async function isAuthenticatedInvoices(page: Page, invoicesUrl: string): Promise<boolean> {
  if (page.isClosed() || !isInvoicesPageUrl(page.url(), invoicesUrl)) return false;
  const tab = page.getByRole("tab", { name: "発行後", exact: true });
  return await tab.count() === 1 && await tab.isVisible();
}

export async function assertAuthenticatedInvoices(page: Page, invoicesUrl: string): Promise<void> {
  if (!isInvoicesPageUrl(page.url(), invoicesUrl)) throw new Error("Cloud session or invoice page unavailable");
  await page.getByRole("tab", { name: "発行後", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  if (!await isAuthenticatedInvoices(page, invoicesUrl)) throw new Error("Cloud session or invoice page unavailable");
}

export async function findAuthenticatedInvoicesPage(browser: Browser, invoicesUrl: string): Promise<Page> {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (await isAuthenticatedInvoices(page, invoicesUrl)) return page;
    }
  }
  throw new Error("Cloud session or invoice page unavailable");
}

export async function waitForAuthenticatedInvoices(browser: Browser, invoicesUrl: string,
  pollIntervalMs = 250): Promise<Page> {
  while (browser.isConnected()) {
    try { return await findAuthenticatedInvoicesPage(browser, invoicesUrl); }
    catch { await new Promise(resolve => setTimeout(resolve, pollIntervalMs)); }
  }
  throw new Error("Cloud Edge session closed before authentication");
}

export function isJpToolboxUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "btoolbox.post.japanpost.jp" &&
      !url.port && !url.username && !url.password;
  } catch { return false; }
}

async function visibleUnique(page: Page, selector: string): Promise<boolean> {
  const control = page.locator(selector);
  return await control.count() === 1 && await control.isVisible() && await control.isEnabled();
}

export async function isVerifiedJpLogin(page: Page): Promise<boolean> {
  if (!isJpToolboxUrl(page.url())) return false;
  return await visibleUnique(page, "#lgnIdsLogIds") &&
    await visibleUnique(page, "#pwdLogIds") &&
    await visibleUnique(page, "#loginLogIds");
}

async function isJpLoginCandidate(page: Page): Promise<boolean> {
  if (await isVerifiedJpLogin(page)) return true;
  if (!isJpToolboxUrl(page.url())) return false;
  const choice = page.getByText("ログインIDでログイン", { exact: true });
  return await choice.count() === 1 && await choice.isVisible();
}

export async function isVerifiedToolboxPortal(page: Page): Promise<boolean> {
  const address = page.url();
  if (!/^https:\/\/btoolbox\.post\.japanpost\.jp\/portal\//.test(address) ||
    !isJpToolboxUrl(address) || await isJpLoginCandidate(page)) return false;
  const logout = page.getByRole("link", { name: "ログアウト", exact: true });
  if (await logout.count() === 1 && await logout.isVisible()) return true;
  if (new URL(address).pathname !== "/portal/SV/SVSV/SVSV0001.do") return false;
  const sso = page.locator("#srvUtlUrl");
  const serviceUse = page.locator("#srvUtl");
  return await sso.count() === 1 && await sso.getAttribute("value") === CLOUD_SSO_URL &&
    await serviceUse.count() === 1 && await serviceUse.isVisible();
}

type AuthOutcome = { kind: "cloud"; page: Page } | { kind: "login" | "portal"; page: Page };

async function waitForOutcome(browser: Browser, page: Page, invoicesUrl: string,
  accepted: ReadonlySet<"login" | "portal">, timeoutMs: number): Promise<AuthOutcome> {
  const deadline = Date.now() + timeoutMs;
  while (browser.isConnected() && !page.isClosed() && Date.now() < deadline) {
    // Only this navigation's page can prove its outcome. A rendered invoices tab
    // elsewhere may have lost server auth before this SSO or credential attempt.
    if (await isAuthenticatedInvoices(page, invoicesUrl)) return { kind: "cloud", page };
    if (accepted.has("login") && await isJpLoginCandidate(page)) return { kind: "login", page };
    if (accepted.has("portal") && await isVerifiedToolboxPortal(page)) return { kind: "portal", page };
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Cloud authentication outcome unavailable");
}

async function prepareLoginForm(page: Page): Promise<void> {
  if (await isVerifiedJpLogin(page)) return;
  if (!isJpToolboxUrl(page.url())) throw new Error("JP login page not verified");
  const choice = page.getByText("ログインIDでログイン", { exact: true });
  if (await choice.count() !== 1 || !await choice.isVisible()) throw new Error("JP login method unavailable");
  await choice.click();
  if (!await isVerifiedJpLogin(page)) throw new Error("JP login controls unavailable");
}

export async function ensureAuthenticatedInvoices(browser: Browser, invoicesUrl: string,
  latch: LoginAttemptLatch, timeoutMs = 30000): Promise<Page> {
  const clearAfterFreshSso = async (page: Page): Promise<Page> => {
    try {
      return await latch.runExclusive(async lease => {
        // The lock may have been held by a credential attempt after our first
        // probe. Refresh the SSO proof while holding it before deleting a marker.
        let confirmed = await probe(new Set(["portal", "login"]));
        if (confirmed.kind === "portal") confirmed = await probe(new Set(["login"]));
        if (confirmed.kind !== "cloud") throw new Error("Cloud invoices not confirmed");
        await lease.clearAfterAuthenticated();
        return page;
      }, 1000);
    } catch (error) {
      if (!(error instanceof LoginLockUnavailableError)) throw error;
      // Fresh SSO can be used, but an active or abandoned lock retains the marker.
      if (!await isAuthenticatedInvoices(page, invoicesUrl)) throw new Error("Cloud invoices not confirmed");
      return page;
    }
  };
  // Startup always proves authentication through a new exact-SSO request.
  // A pre-existing rendered invoices tab is never session evidence.
  const context = browser.contexts()[0];
  if (!context) throw new Error("Dedicated Edge context unavailable");
  const page = await context.newPage();
  const probe = async (accepted: ReadonlySet<"login" | "portal">): Promise<AuthOutcome> => {
    await page.goto(cloudSsoBootstrapUrl(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    return waitForOutcome(browser, page, invoicesUrl, accepted, timeoutMs);
  };
  let outcome = await probe(new Set(["login", "portal"]));
  if (outcome.kind === "cloud") return clearAfterFreshSso(page);
  if (outcome.kind === "portal") {
    outcome = await probe(new Set(["login"]));
    if (outcome.kind === "cloud") return clearAfterFreshSso(page);
  }
  if (await latch.isClaimed()) throw new Error("Automatic Cloud login already attempted; manual recovery required");
  return latch.runExclusive(async lease => {
      // Another helper may have completed SSO while this one waited for the lock.
      // Probe again under the lock before claiming or sending any credential key.
      let lockedOutcome = await probe(new Set(["login", "portal"]));
      if (lockedOutcome.kind === "portal") lockedOutcome = await probe(new Set(["login"]));
      if (lockedOutcome.kind === "cloud") {
        await lease.clearAfterAuthenticated();
        return page;
      }
      if (!await isJpLoginCandidate(page)) throw new Error("JP login page changed");
      await lease.claim(); // Durable one-attempt marker before any login-form interaction.
      await prepareLoginForm(page);
      const userId = page.locator("#usrIdsLogIds");
      if (await userId.count() > 1) throw new Error("JP user ID control ambiguous");
      if (await userId.count() === 1) {
        if (!await userId.isVisible()) throw new Error("JP user ID control unavailable");
        await userId.fill("");
      }
      if (!await isVerifiedJpLogin(page)) throw new Error("JP login controls changed");
      const loginId = page.locator("#lgnIdsLogIds");
      try {
        await loginId.click();
        await loginId.press("ArrowDown");
        await loginId.press("Enter");
      } catch {
        // Navigation during selection is uncertain. Never send another key.
      }
      await waitForOutcome(browser, page, invoicesUrl, new Set(["portal"]), timeoutMs);
      // Even a post-key Cloud rendering must be confirmed by a fresh,
      // credential-free request to the exact official SSO entry.
      const confirmed = await probe(new Set());
      if (confirmed.kind !== "cloud") throw new Error("Cloud invoices not confirmed");
      await lease.clearAfterAuthenticated();
      return page;
    });
}
