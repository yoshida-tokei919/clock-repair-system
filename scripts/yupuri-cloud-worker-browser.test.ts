import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCloudPageTopology, appOrigin, edgeRestartExitError, PlaywrightCloudBrowser, withCloudPdfPopup } from "./yupuri-cloud-worker";
import { ToolboxServiceClosedError } from "./yupuri-cloud-live-session";
import { JournalStore, runCloudJob, type CloudJob } from "./yupuri-cloud-worker-core";
import { inspectCloudTab } from "./yupuri-cloud-listing";
import { guardedCloudCheck, guardedCloudClick, guardedCloudFiles } from "./yupuri-cloud-actions";

const invoices = "https://btoolboxprintservice.jp/invoices/";
const job: CloudJob = { shipmentId: 42, managementNumber: "SHP-42",
  csvBase64: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("SHP-42\r\n")]).toString("base64") };

test("raw production app origin rejects normalized aliases and retains localhost development", () => {
  assert.equal(appOrigin("https://yoshidawatchrepair.com"), "https://yoshidawatchrepair.com");
  assert.equal(appOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const value of ["https://yoshidawatchrepair.com:443", "https://user@yoshidawatchrepair.com",
    "https://yoshidawatchrepair.com/", "https://yoshidawatchrepair.com?x=1"]) {
    assert.throws(() => appOrigin(value), value);
  }
});

test("Edge restart failure at cutoff enters closed-window handling", () => {
  assert.equal(edgeRestartExitError(new Date("2026-10-11T14:54:59.999Z")) instanceof ToolboxServiceClosedError, false);
  assert.equal(edgeRestartExitError(new Date("2026-10-11T14:55:00.000Z")) instanceof ToolboxServiceClosedError, true);
});

function uploadHarness() {
  const actions: string[] = [];
  let address = invoices;
  const pages: Page[] = [];
  const context = { pages: () => pages, browser: () => browser } as unknown as BrowserContext;
  const browser = { contexts: () => [context] } as unknown as Browser;
  const page = {
    context: () => context, isClosed: () => false, url: () => address,
    goto: async (url: string) => { actions.push(`goto:${url}`); address = url; },
    waitForURL: async () => {},
    getByRole: (role: string, options: { name?: string }) => ({
      count: async () => role === "tab" && options.name === "発行後" ? 1 : 0,
      isVisible: async () => true, waitFor: async () => {},
      click: async (settings?: { trial?: boolean }) => { if (!settings?.trial) actions.push(`click:${options.name}`); },
    }),
    locator: (selector: string) => ({
      count: async () => 1, click: async (settings?: { trial?: boolean }) => {
        if (!settings?.trial) actions.push(`click:${selector}`);
      },
      waitFor: async () => {}, getAttribute: async () => "時計修理アプリ17列",
      innerText: async () => "時計修理アプリ17列 あり",
      first: () => ({ waitFor: async () => {} }),
      nth: () => ({ getAttribute: async () => "時計修理アプリ17列", innerText: async () => "時計修理アプリ17列 あり",
        click: async (settings?: { trial?: boolean }) => { if (!settings?.trial) actions.push("click:option"); } }),
      locator: () => ({ count: async () => 1, innerText: async () => "時計修理アプリ17列" }),
      setInputFiles: async () => { actions.push("files"); },
    }),
  } as unknown as Page;
  pages.push(page);
  return { page, pages, actions, context, browser };
}

test("injected hours guard stops upload between filter and option, then before filter", async () => {
  for (const closeOn of [4, 5]) {
    const h = uploadHarness();
    let checks = 0;
    const browser = new PlaywrightCloudBrowser(h.page, invoices, "時計修理アプリ17列", () => {
      if (++checks === closeOn) throw new Error("service closed");
    });
    await assert.rejects(browser.upload(Buffer.from("csv"), "SHP-1"), /service closed/);
    assert.equal(h.actions.includes("click:option"), false);
    assert.equal(h.actions.includes("files"), false);
    assert.equal(h.actions.includes("click:#shippingDataFilterId"), closeOn === 5);
  }
});

test("listing helper rechecks injected hours guard immediately before tab click", async () => {
  let clicks = 0;
  const page = { getByRole: () => ({ count: async () => 1, click: async () => { clicks++; } }) } as unknown as Page;
  await assert.rejects(inspectCloudTab(page, "発行前", "SHP-1", 1, 1,
    () => { throw new Error("service closed"); }), /service closed/);
  assert.equal(clicks, 0);
});

test("a second listing tab is not clicked when service closes after first inspection", async () => {
  const h = uploadHarness();
  const clicks: string[] = [];
  const original = h.page.getByRole.bind(h.page);
  h.page.getByRole = ((role: string, options: { name?: string }) => role === "tab" ? {
    count: async () => 1, isVisible: async () => true, waitFor: async () => {},
    click: async (settings?: { trial?: boolean }) => { if (!settings?.trial) clicks.push(options.name ?? ""); },
    getAttribute: async () => "true",
  } : role === "row" ? { allInnerTexts: async () => [] } : role === "button" ? {
    count: async () => 1, isEnabled: async () => false,
  } : original(role as Parameters<Page["getByRole"]>[0], options)) as Page["getByRole"];
  let checks = 0;
  const browser = new PlaywrightCloudBrowser(h.page, invoices, "時計修理アプリ17列", () => {
    if (++checks === 4) throw new Error("service closed");
  });
  await assert.rejects(browser.find("SHP-1"), /service closed/);
  assert.deepEqual(clicks, ["発行後"]);
});

test("extra tab after authentication blocks the next job browser action", async () => {
  const h = uploadHarness();
  h.pages.push({ isClosed: () => false } as Page);
  const browser = new PlaywrightCloudBrowser(h.page, invoices, "時計修理アプリ17列", () => {});
  await assert.rejects(browser.upload(Buffer.from("csv"), "SHP-1"), /Unexpected Cloud browser tab/);
  assert.deepEqual(h.actions, []);
});

test("page in a later browser context blocks the next business action", async () => {
  const h = uploadHarness();
  const other = { pages: () => [{ isClosed: () => false } as Page] } as BrowserContext;
  h.browser.contexts = () => [h.context, other];
  const browser = new PlaywrightCloudBrowser(h.page, invoices, "時計修理アプリ17列", () => {});
  await assert.rejects(browser.upload(Buffer.from("csv"), "SHP-1"), /Unexpected Cloud browser tab/);
  assert.deepEqual(h.actions, []);
});

test("topology counts every browser context and ignores closed pages", () => {
  const h = uploadHarness();
  assert.doesNotThrow(() => assertCloudPageTopology(h.page));
  const closed = { isClosed: () => true } as Page;
  h.pages.push(closed);
  assert.doesNotThrow(() => assertCloudPageTopology(h.page));
  h.pages.push({ isClosed: () => false } as Page);
  assert.throws(() => assertCloudPageTopology(h.page), /Unexpected Cloud browser tab/);
  h.pages.pop();
  const second = { pages: () => [closed], browser: () => h.browser } as unknown as BrowserContext;
  h.browser.contexts = () => [h.context, second];
  assert.throws(() => assertCloudPageTopology(h.page), /Unexpected Cloud browser tab/);
  second.pages = () => [{ isClosed: () => false } as Page];
  assert.throws(() => assertCloudPageTopology(h.page), /Unexpected Cloud browser tab/);
});

test("later context or page after issued journal write blocks internal completion", async () => {
  for (const extra of ["context", "page"] as const) {
    const dir = await mkdtemp(join(tmpdir(), "yupuri-topology-"));
    try {
      const h = uploadHarness();
      const browser = new PlaywrightCloudBrowser(h.page, invoices, "filter", () => {});
      browser.find = async () => ({ state: "issued", trackingNumber: "398007150100" });
      const store = new JournalStore(dir);
      await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "issuing", exportBefore: ["old"] });
      const write = store.write.bind(store);
      store.write = async value => {
        await write(value);
        if (value.stage === "issued") {
          if (extra === "page") h.pages.push({ isClosed: () => false } as Page);
          else h.browser.contexts = () => [h.context, { pages: () => [] } as unknown as BrowserContext];
        }
      };
      let completes = 0;
      const api = { next: async () => job, complete: async () => { completes++; } };
      await assert.rejects(runCloudJob(job, api, browser, store, true, undefined,
        () => browser.assertOperationalPage()), /Unexpected Cloud browser tab/);
      assert.equal(completes, 0, extra);
      assert.equal((await store.read(42))?.stage, "issued");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test("later page immediately before print callback blocks print", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-topology-"));
  try {
    const h = uploadHarness();
    const browser = new PlaywrightCloudBrowser(h.page, invoices, "filter", () => {});
    browser.find = async () => ({ state: "issued", trackingNumber: "398007150100" });
    const store = new JournalStore(dir);
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "completed",
      trackingNumber: "398007150100", pdfPath: "label.pdf" });
    const write = store.write.bind(store);
    store.write = async value => {
      await write(value);
      if (value.printAttempted) h.pages.push({ isClosed: () => false } as Page);
    };
    let prints = 0;
    const api = { next: async () => job, complete: async () => {} };
    await assert.rejects(runCloudJob(job, api, browser, store, true, async () => { prints++; },
      () => browser.assertOperationalPage()), /Unexpected Cloud browser tab/);
    assert.equal(prints, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("guard closing during actionability wait blocks click, check, and files", async () => {
  for (const kind of ["click", "check", "files"] as const) {
    let open = true;
    let dispatches = 0;
    const guard = () => { if (!open) throw new Error("service closed"); };
    const locator = {
      click: async (options?: { trial?: boolean }) => { if (options?.trial) open = false; else dispatches++; },
      check: async (options?: { trial?: boolean }) => { if (options?.trial) open = false; else dispatches++; },
      waitFor: async () => { open = false; },
      setInputFiles: async () => { dispatches++; },
    } as unknown as Locator;
    const action = kind === "click" ? guardedCloudClick(locator, guard) :
      kind === "check" ? guardedCloudCheck(locator, guard) :
      guardedCloudFiles(locator, { name: "test.csv", mimeType: "text/csv", buffer: Buffer.from("x") }, guard);
    await assert.rejects(action, /service closed/);
    assert.equal(dispatches, 0, kind);
  }
});

function popupHarness(kind: "single" | "duplicate" | "unrelated" | "mixed" | "click-throws") {
  const actions: string[] = [];
  const listeners = new Set<(page: Page) => void>();
  const pages: Page[] = [];
  let resolvePage: ((page: Page) => void) | undefined;
  const context = {
    pages: () => pages, browser: () => browser,
    on: (_event: string, listener: (page: Page) => void) => listeners.add(listener),
    off: (_event: string, listener: (page: Page) => void) => listeners.delete(listener),
    waitForEvent: () => new Promise<Page>(resolve => { resolvePage = resolve; }),
  };
  const browser = { contexts: () => [context] } as unknown as Browser;
  const root = { context: () => context, isClosed: () => false } as unknown as Page;
  pages.push(root);
  function makePopup(opener: Page | null): Page {
    let closed = false;
    return { isClosed: () => closed, opener: async () => opener,
      close: async () => { closed = true; actions.push("close:popup"); } } as unknown as Page;
  }
  const click = async () => {
    actions.push("click:download");
    const popup = makePopup(kind === "unrelated" ? null : root);
    pages.push(popup);
    for (const listener of listeners) listener(popup);
    resolvePage?.(popup);
    if (kind === "duplicate" || kind === "mixed") {
      const second = makePopup(kind === "mixed" ? null : root);
      pages.push(second);
      for (const listener of listeners) listener(second);
    }
    if (kind === "click-throws") throw new Error("original click failure");
  };
  return { root, pages, actions, click };
}

test("PDF popup requires one attributed page and cleanup restores single page", async () => {
  const single = popupHarness("single");
  assert.equal(await withCloudPdfPopup(single.root, () => {}, single.click, async () => "pdf"), "pdf");
  assert.deepEqual(single.actions, ["click:download", "close:popup"]);
  assert.equal(single.pages.filter(page => !page.isClosed()).length, 1);
});

test("popup opened before click rejection is closed and original error survives", async () => {
  const h = popupHarness("click-throws");
  await assert.rejects(withCloudPdfPopup(h.root, () => {}, h.click,
    async () => { throw new Error("PDF request should not start"); }), /original click failure/);
  assert.deepEqual(h.actions, ["click:download", "close:popup"]);
  assert.equal(h.pages.filter(page => !page.isClosed()).length, 1);
});

test("local popup cleanup remains possible when service closes after popup use", async () => {
  const h = popupHarness("single");
  await assert.rejects(withCloudPdfPopup(h.root, () => {}, h.click,
    async () => { throw new Error("service closed"); }), /service closed/);
  assert.deepEqual(h.actions, ["click:download", "close:popup"]);
  assert.equal(h.pages.filter(page => !page.isClosed()).length, 1);
});

test("duplicate attributable popups are both closed but ambiguity rejects", async () => {
  const h = popupHarness("duplicate");
  await assert.rejects(withCloudPdfPopup(h.root, () => {}, h.click,
    async () => { throw new Error("PDF request should not start"); }), /ambiguous/);
  assert.deepEqual(h.actions, ["click:download", "close:popup", "close:popup"]);
  assert.equal(h.pages.filter(page => !page.isClosed()).length, 1);
});

test("unrelated popup stays open for manual review", async () => {
  for (const kind of ["unrelated", "mixed"] as const) {
    const h = popupHarness(kind);
    await assert.rejects(withCloudPdfPopup(h.root, () => {}, h.click,
      async () => { throw new Error("PDF request should not start"); }), /popup|Unexpected Cloud browser tab/);
    assert.deepEqual(h.actions, kind === "mixed" ? ["click:download", "close:popup"] : ["click:download"]);
    assert.equal(h.pages.filter(page => !page.isClosed()).length, 2);
  }
});
