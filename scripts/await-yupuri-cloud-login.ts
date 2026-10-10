import { productionCloudInvoicesUrl } from "./yupuri-cloud-worker-core";
import { cdpEndpoint, connectDedicatedEdge, edgeProfilePath, ensureAuthenticatedInvoices, LoginAttemptLatch, loginAttemptLatchPath } from "./yupuri-cloud-live-session";

async function main() {
  const url = productionCloudInvoicesUrl(process.env.YUPURI_CLOUD_INVOICES_URL);
  const endpoint = cdpEndpoint(process.env.YUPURI_CLOUD_CDP_URL);
  const profile = edgeProfilePath(process.env.LOCALAPPDATA ?? "");
  let browser;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { browser = await connectDedicatedEdge(endpoint, profile); break; }
    catch { if (attempt === 19) throw new Error("Dedicated Edge CDP endpoint unavailable"); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!browser) throw new Error("Dedicated Edge CDP endpoint unavailable");
  await ensureAuthenticatedInvoices(browser, url, new LoginAttemptLatch(loginAttemptLatchPath(process.env.LOCALAPPDATA ?? "")));
  console.log("Cloud login confirmed. Keep the dedicated Edge window open.");
}

main().then(() => {
  // Exit drops only this CDP socket; never send Browser.close to the dedicated Edge.
  process.exit(0);
}).catch(() => {
  console.error("Cloud login was not confirmed in the dedicated Edge window");
  process.exit(1);
});
