import { cloudInvoicesUrl } from "./yupuri-cloud-worker-core";
import { cdpEndpoint, connectDedicatedEdge, edgeProfilePath, isInvoicesPageUrl, waitForAuthenticatedInvoices } from "./yupuri-cloud-live-session";

async function main() {
  const url = cloudInvoicesUrl(process.env.YUPURI_CLOUD_INVOICES_URL);
  if (new URL(url).origin !== "https://btoolboxprintservice.jp") throw new Error("Production Cloud URL is required");
  const endpoint = cdpEndpoint(process.env.YUPURI_CLOUD_CDP_URL);
  const profile = edgeProfilePath(process.env.LOCALAPPDATA ?? "");
  let browser;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { browser = await connectDedicatedEdge(endpoint, profile); break; }
    catch { if (attempt === 19) throw new Error("Dedicated Edge CDP endpoint unavailable"); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!browser) throw new Error("Dedicated Edge CDP endpoint unavailable");
  const context = browser.contexts()[0];
  if (!context) throw new Error("Dedicated Edge context unavailable");
  const page = context.pages().find(candidate => isInvoicesPageUrl(candidate.url(), url)) ?? await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("Sign in to Yu-Pri Cloud in the dedicated Edge window. Waiting for the invoices page...");
  await waitForAuthenticatedInvoices(browser, url);
  console.log("Cloud login confirmed. Keep the dedicated Edge window open.");
}

main().then(() => {
  // Exit drops only this CDP socket; never send Browser.close to the dedicated Edge.
  process.exit(0);
}).catch(() => {
  console.error("Cloud login was not confirmed in the dedicated Edge window");
  process.exit(1);
});
