import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { join } from "node:path";
import { assertDedicatedEdgeCommandLine, cdpEndpoint, edgeProfilePath, findAuthenticatedInvoicesPage,
  isInvoicesPageUrl, waitForAuthenticatedInvoices } from "./yupuri-cloud-live-session";

const url = "https://btoolboxprintservice.jp/invoices/";
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
