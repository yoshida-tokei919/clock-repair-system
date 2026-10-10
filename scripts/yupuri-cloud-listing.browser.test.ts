import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { inspectCloudExportRows, inspectCloudTab } from "./yupuri-cloud-listing";

test("tab switch waits for delayed Cloud rows before deciding whether a shipment exists", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://cloud.test/invoices/", route => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <button role="tab" aria-selected="false" onclick="selectTab(this, 'issued')">発行後</button>
        <button role="tab" aria-selected="false" onclick="selectTab(this, 'unissued')">発行前</button>
        <table><tbody id="rows"><tr><td>SHP-1 398007150100</td></tr></tbody></table>
        <button disabled>次の500件</button>
        <script>
          async function selectTab(tab, state) {
            document.querySelectorAll('[role="tab"]').forEach(item => item.setAttribute('aria-selected', String(item === tab)));
            const response = await fetch('/invoices/rows?state=' + state);
            document.querySelector('#rows').innerHTML = await response.text();
          }
        </script></body></html>`,
    }));
    await page.route("https://cloud.test/invoices/rows?state=*", async route => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({ contentType: "text/html", body: route.request().url().endsWith("unissued")
        ? "<tr><td>SHP-1</td></tr>" : "<tr><td>other shipment</td></tr>" });
    });
    await page.goto("https://cloud.test/invoices/");

    assert.equal(await inspectCloudTab(page, "発行後", "SHP-1", 350, 10), null);
    assert.equal(await inspectCloudTab(page, "発行前", "SHP-1", 350, 10), "SHP-1");
  } finally {
    await browser.close();
  }
});

test("export snapshot waits when matching rows appear 1.5 seconds after navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://cloud.test/invoices/export", route => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <table><tbody id="rows"></tbody></table>
        <script>setTimeout(() => {
          document.querySelector('#rows').innerHTML =
            '<tr><td>シート式ラベル(ユ00783)</td><td>発行済み</td><td>first</td></tr>' +
            '<tr><td>シート式ラベル(ユ00783)</td><td>発行済み</td><td>second</td></tr>';
        }, 1500)</script></body></html>`,
    }));
    await page.goto("https://cloud.test/invoices/export");
    assert.deepEqual(await inspectCloudExportRows(page), [
      "シート式ラベル(ユ00783)\t発行済み\tfirst",
      "シート式ラベル(ユ00783)\t発行済み\tsecond",
    ]);
  } finally {
    await browser.close();
  }
});
