import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isAbsolute, join, relative, resolve } from "node:path";
import { guardedCloudClick } from "./yupuri-cloud-actions";

export const TOOLBOX_PUBLIC_ENTRY_URL = "https://www.post.japanpost.jp/bizpost/service/businesstoolbox/";
export const TOOLBOX_LOGIN_URL = "https://btoolbox.post.japanpost.jp/";
export const TOOLBOX_PORTAL_HOME_URL = "https://btoolbox.post.japanpost.jp/portal/PT/PTPT/PTPT0001.do?op=init";
export const TOOLBOX_SERVICE_DETAIL_URL = "https://btoolbox.post.japanpost.jp/portal/SV/SVSV/SVSV0001.do";
export const CLOUD_SSO_URL = "https://auth.btoolboxprintservice.jp/sso";
export const CLOUD_LOGIN_PROTOCOL = 3;

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
  const session = await browser.newBrowserCDPSession();
  try {
    const result = await session.send("Browser.getBrowserCommandLine");
    assertDedicatedEdgeCommandLine(result.arguments, safeEndpoint, profile);
    return browser;
  } finally { await session.detach(); }
}

export function isInvoicesPageUrl(actual: string, expected: string): boolean {
  return expected === "https://btoolboxprintservice.jp/invoices/" &&
    /^https:\/\/btoolboxprintservice\.jp\/invoices\/?(?:\?tab=(?:printed|not_printed))?$/.test(actual);
}

export async function isAuthenticatedInvoices(page: Page, invoicesUrl: string): Promise<boolean> {
  if (page.isClosed() || !isInvoicesPageUrl(page.url(), invoicesUrl)) return false;
  const tab = page.getByRole("tab", { name: "発行後", exact: true });
  return await tab.count() === 1 && await tab.isVisible();
}

export async function assertAuthenticatedInvoices(page: Page, invoicesUrl: string): Promise<void> {
  await page.getByRole("tab", { name: "発行後", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  if (!isInvoicesPageUrl(page.url(), invoicesUrl) || !await isAuthenticatedInvoices(page, invoicesUrl)) {
    throw new Error("Cloud session or invoice page unavailable");
  }
}

export function isJpToolboxUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https:\/\/btoolbox\.post\.japanpost\.jp(?:\/|$)/.test(value) &&
      url.protocol === "https:" && url.hostname === "btoolbox.post.japanpost.jp" &&
      !url.port && !url.username && !url.password;
  } catch { return false; }
}

export function isExpectedToolboxHandoffUrl(value: string): boolean {
  return value === "" || value === "about:blank" || isJpToolboxUrl(value);
}

const JP_LOGIN_ENTRY_TEXT = "料金別後納お客さま番号でログイン";
const JP_LOGIN_ID_CHOICE_TEXT = "ログインIDでログイン";

export async function isJpLoginCandidate(page: Page): Promise<boolean> {
  if (page.isClosed() || !isJpToolboxUrl(page.url())) return false;
  try {
    for (const item of [
      ...["#lgnIdsLogIds", "#usrIdsLogIds", "#pwdLogIds", "#loginLogIds"].map(selector => page.locator(selector)),
      ...[JP_LOGIN_ENTRY_TEXT, JP_LOGIN_ID_CHOICE_TEXT].map(label => page.getByText(label, { exact: true })),
    ]) {
      const count = await item.count();
      if (count > 1 || (count === 1 && await item.nth(0).isVisible())) return true;
    }
    return false;
  } catch {
    // An inspection failure cannot be used as evidence of an authenticated portal.
    return true;
  }
}

export async function isVerifiedToolboxPortal(page: Page): Promise<boolean> {
  const address = page.url();
  if ((address !== TOOLBOX_PORTAL_HOME_URL && address !== TOOLBOX_SERVICE_DETAIL_URL) ||
    await isJpLoginCandidate(page)) return false;
  if (address === TOOLBOX_PORTAL_HOME_URL) {
    const logout = page.locator('a[href="javascript:void(0);"]', { hasText: /^\s*\u30ed\u30b0\u30a2\u30a6\u30c8\s*$/ });
    return await logout.count() === 1 && await logout.isVisible();
  }
  const sso = page.locator("#srvUtlUrl");
  const serviceUse = page.locator("#srvUtl");
  return await sso.count() === 1 && !await sso.isVisible() && await sso.getAttribute("value") === CLOUD_SSO_URL &&
    await serviceUse.count() === 1 && await serviceUse.isVisible();
}

export function isToolboxServiceOpen(now: Date = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  return hour >= 6 && hour < 24;
}

const JST_DAY_MS = 24 * 60 * 60 * 1000;
const AUTOMATION_OPEN_MS = 6 * 60 * 60 * 1000;
const AUTOMATION_CUTOFF_MS = (23 * 60 + 55) * 60 * 1000;

function jstTimeOfDayMs(now: Date): number {
  return ((now.getTime() + 9 * 60 * 60 * 1000) % JST_DAY_MS + JST_DAY_MS) % JST_DAY_MS;
}

export function isToolboxAutomationWindowOpen(now: Date = new Date()): boolean {
  const time = jstTimeOfDayMs(now);
  return time >= AUTOMATION_OPEN_MS && time < AUTOMATION_CUTOFF_MS;
}

export function msUntilToolboxAutomationWindowOpen(now: Date = new Date()): number {
  if (isToolboxAutomationWindowOpen(now)) return 0;
  const time = jstTimeOfDayMs(now);
  return time < AUTOMATION_OPEN_MS ? AUTOMATION_OPEN_MS - time : JST_DAY_MS - time + AUTOMATION_OPEN_MS;
}

export class ToolboxServiceClosedError extends Error {
  constructor() { super("JP Business ToolBox automation window is 06:00–23:55 JST"); }
}

export function assertToolboxAutomationWindowOpen(now: Date = new Date()): void {
  if (!isToolboxAutomationWindowOpen(now)) throw new ToolboxServiceClosedError();
}

function assertLoginTabs(context: BrowserContext, entry: Page, opened: Page[], portal?: Page): void {
  const expected = portal ? [entry, portal] : [entry];
  const pages = context.pages().filter(page => !page.isClosed());
  if (opened.length !== (portal ? 1 : 0) || (portal && opened[0] !== portal) ||
    pages.length !== expected.length ||
    expected.some(page => !pages.includes(page))) {
    throw new Error("Unexpected dedicated Edge tab; close it manually and restart login recovery");
  }
}

function assertPublicEntryUnchanged(entry: Page): void {
  if (entry.isClosed() || entry.url() !== TOOLBOX_PUBLIC_ENTRY_URL) {
    throw new Error("Official ToolBox entry changed during Login handoff");
  }
}

async function waitForPortalOrLogin(browser: Browser, context: BrowserContext, entry: Page,
  opened: Page[], page: Page, timeoutMs: number,
  now: () => Date): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (browser.isConnected() && !page.isClosed() && Date.now() < deadline) {
    assertToolboxAutomationWindowOpen(now());
    assertLoginTabs(context, entry, opened, page);
    assertPublicEntryUnchanged(entry);
    const address = page.url();
    if (!isExpectedToolboxHandoffUrl(address)) {
      throw new Error("Official Login opened an unexpected page");
    }
    if (await isVerifiedToolboxPortal(page)) return;
    if (await isJpLoginCandidate(page)) {
      throw new Error("ToolBox login form appeared. Log in manually with auto-login enabled, then restart the dedicated Edge.");
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("ToolBox portal was not confirmed. Log in manually with auto-login enabled, then restart the dedicated Edge.");
}

export async function ensureAuthenticatedInvoices(browser: Browser, invoicesUrl: string,
  timeoutMs = 30000, now: () => Date = () => new Date()): Promise<Page> {
  assertToolboxAutomationWindowOpen(now());
  const context = browser.contexts()[0];
  if (!context || browser.contexts().length !== 1) throw new Error("Dedicated Edge context unavailable");
  const pages = context.pages().filter(page => !page.isClosed());
  if (pages.length !== 1) throw new Error("Dedicated Edge must have exactly one tab; restart it before login recovery");
  const entry = pages[0];
  assertToolboxAutomationWindowOpen(now());
  await entry.goto(TOOLBOX_PUBLIC_ENTRY_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (entry.url() !== TOOLBOX_PUBLIC_ENTRY_URL) throw new Error("Official ToolBox entry page unavailable");
  const loginCandidates = entry.locator(`a[href="${TOOLBOX_LOGIN_URL}"]`, { hasText: /^\s*\u30ed\u30b0\u30a4\u30f3\s*$/ });
  const loginCount = await loginCandidates.count();
  const visibleLogins = [];
  for (let i = 0; i < loginCount; i++) {
    const candidate = loginCandidates.nth(i);
    if (!await candidate.isVisible()) continue;
    if (await candidate.getAttribute("href") !== TOOLBOX_LOGIN_URL ||
      await candidate.getAttribute("target") !== "_blank") {
      throw new Error("Official ToolBox Login link unavailable");
    }
    visibleLogins.push(candidate);
  }
  if (visibleLogins.length < 1) throw new Error("Official ToolBox Login link unavailable");
  const login = visibleLogins[0];
  const opened: Page[] = [];
  const onPage = (page: Page) => { opened.push(page); };
  context.on("page", onPage);
  try {
    assertLoginTabs(context, entry, opened);
    assertToolboxAutomationWindowOpen(now());
    const newPage = context.waitForEvent("page", { timeout: timeoutMs }).catch(() => {
      throw new Error("Official Login did not open a new ToolBox page; restart login recovery");
    });
    const [, portal] = await Promise.all([
      guardedCloudClick(login, () => assertToolboxAutomationWindowOpen(now())), newPage,
    ]);
    assertLoginTabs(context, entry, opened, portal);
    assertPublicEntryUnchanged(entry);
    if (portal === entry) throw new Error("Official Login did not open a new ToolBox page");
    if (await portal.opener() !== entry) throw new Error("Official Login opened an unrelated page");
    await waitForPortalOrLogin(browser, context, entry, opened, portal, timeoutMs, now);
    assertLoginTabs(context, entry, opened, portal);
    assertPublicEntryUnchanged(entry);
    assertToolboxAutomationWindowOpen(now());
    await entry.close();
    if (opened.length !== 1 || context.pages().filter(page => !page.isClosed()).length !== 1 ||
      context.pages().filter(page => !page.isClosed())[0] !== portal) {
      throw new Error("Unexpected dedicated Edge tab; close it manually and restart login recovery");
    }
    assertToolboxAutomationWindowOpen(now());
    await portal.goto(CLOUD_SSO_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    assertToolboxAutomationWindowOpen(now());
    if (opened.length !== 1 || context.pages().filter(page => !page.isClosed()).length !== 1 ||
      context.pages().filter(page => !page.isClosed())[0] !== portal) {
      throw new Error("Unexpected dedicated Edge tab; close it manually and restart login recovery");
    }
    if (await isJpLoginCandidate(portal)) {
      throw new Error("ToolBox login form appeared. Log in manually with auto-login enabled, then restart the dedicated Edge.");
    }
    await assertAuthenticatedInvoices(portal, invoicesUrl);
    if (opened.length !== 1 || context.pages().filter(page => !page.isClosed()).length !== 1 ||
      context.pages().filter(page => !page.isClosed())[0] !== portal) {
      throw new Error("Unexpected dedicated Edge tab; close it manually and restart login recovery");
    }
    return portal;
  } finally { context.off("page", onPage); }
}
