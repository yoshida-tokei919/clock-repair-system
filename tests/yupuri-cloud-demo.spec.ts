import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const DEMO_ORIGIN = "https://static.btoolboxprintservice.jp";
const DEMO_PATH = "/yu-pri-cloud/demo/";
const DEMO_ENTRY = `${DEMO_ORIGIN}${DEMO_PATH}index.html`;
const INVOICES_URL = `${DEMO_ORIGIN}${DEMO_PATH}invoices/invoices.html`;
const UPLOAD_URL = `${DEMO_ORIGIN}${DEMO_PATH}invoices/invoices-upload.html`;
const EXPORT_URL = `${DEMO_ORIGIN}${DEMO_PATH}invoices/invoices-export.html`;
const SAMPLE_PDF_URL = `${DEMO_ORIGIN}${DEMO_PATH}assets/invoice_sample.pdf`;

function assertDemoUrl(value: string): void {
  const url = new URL(value);
  expect(url.origin).toBe(DEMO_ORIGIN);
  expect(url.pathname.startsWith(DEMO_PATH)).toBe(true);
}

test("Yu-Pri Cloud public demo: simulated CSV upload and sample PDF download", async ({ page }) => {
  assertDemoUrl(DEMO_ENTRY);
  const blockedRequests: string[] = [];
  const nonGetRequests: string[] = [];

  await page.context().route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== DEMO_ORIGIN || !url.pathname.startsWith(DEMO_PATH)) {
      // The demo references this cosmetic CDN stylesheet; block it without contacting the CDN.
      const demoStylesheet = request.resourceType() === "stylesheet" &&
        request.url() === "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
      if (!demoStylesheet) blockedRequests.push(request.url());
      return route.abort();
    }
    if (request.method() !== "GET") nonGetRequests.push(`${request.method()} ${request.url()}`);
    return route.continue();
  });

  await page.goto(DEMO_ENTRY);
  await expect(page).toHaveURL(INVOICES_URL);
  await expect(page.getByText("ゆうプリクラウド【デモサイト】")).toBeVisible();

  await page.getByRole("button", { name: "新規登録" }).click();
  // The demo's modal uses a clickable span instead of a button or link.
  await page.getByText("一括アップロードへ", { exact: true }).click();
  await expect(page).toHaveURL(UPLOAD_URL);
  await expect(page.getByText("送り状データのアップロード", { exact: true }).first()).toBeVisible();

  // The read-only custom picker has no associated label or option roles.
  await page.locator("#filterSelectInput").click();
  await page.getByText("取込サンプルフィルタ", { exact: true }).click();
  await expect(page.locator("#filterSelectInput")).toHaveValue("取込サンプルフィルタ");

  const fileInput = page.locator('input[type="file"][accept=".csv"]');
  await expect(fileInput).toHaveCount(1);
  // Deliberately incomplete synthetic data demonstrates that the static demo does not parse the CSV.
  await fileInput.setInputFiles({
    name: "task201d-demo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("送り状種別,お客さま管理番号\r\n0,SHP-201D-DEMO\r\n", "utf8"),
  });
  await expect(page.getByText("task201d-demo.csv")).toBeVisible();
  await page.getByRole("button", { name: "アップロード", exact: true }).click();
  await expect(page).toHaveURL(INVOICES_URL);
  await expect(page.getByText("SHP-201D-DEMO")).toHaveCount(0);
  expect(nonGetRequests).toEqual([]);

  // The label-type select has no for/id label binding in the demo markup.
  const labelType = page.locator("select:visible").filter({ has: page.getByRole("option", { name: "シート式ラベル(ユ00783)" }) });
  await expect(labelType).toHaveCount(1);
  await labelType.selectOption({ label: "シート式ラベル(ユ00783)" });
  await expect(labelType).toHaveValue("シート式ラベル(ユ00783)");
  await labelType.selectOption({ label: "サーマル式ラベル(ユ00572)" });

  // Canned rows repeat the same management number; use the first matching row to exercise selection.
  await page.getByRole("row", { name: /kanri-5689/ }).first().getByRole("checkbox").check();
  await page.getByRole("button", { name: "送り状を発行" }).click();
  await expect(page).toHaveURL(INVOICES_URL);
  expect(nonGetRequests).toEqual([]);

  await page.getByRole("link", { name: "送り状のダウンロード" }).click();
  await expect(page).toHaveURL(EXPORT_URL);
  const issuedSample = page.getByRole("row")
    .filter({ hasText: "シート式ラベル(ユ00783)" })
    .filter({ hasText: "発行済み" }).first();
  const downloadLink = issuedSample.getByRole("link", { name: "ダウンロード" });
  const href = await downloadLink.getAttribute("href");
  expect(href).not.toBeNull();
  expect(new URL(href!, page.url()).href).toBe(SAMPLE_PDF_URL);

  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  expect(download.url()).toBe(SAMPLE_PDF_URL);
  expect(download.suggestedFilename()).toBe("invoice_sample.pdf");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(0);
  expect(blockedRequests).toEqual([]);
  expect(nonGetRequests).toEqual([]);
});
