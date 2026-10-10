import { chromium, type Browser, type Page } from "@playwright/test";
import { isAbsolute, join, relative, resolve } from "node:path";

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
