import type { Page } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { assertSingleDisabledNextPage } from "./yupuri-cloud-worker-core";

function exactManagement(text: string, managementNumber: string) {
  return text.split(/\s+/).includes(managementNumber);
}

export async function inspectCloudTab(page: Page, tabName: string, managementNumber: string,
  timeoutMs = 3000, pollMs = 100): Promise<string | null> {
  const tab = page.getByRole("tab", { name: tabName, exact: true });
  if (await tab.count() !== 1) throw new Error("Cloud tab ambiguous");
  await tab.click();
  // Cloud can select a tab before replacing its rows, with no reliable loading marker.
  // Observe the whole bounded window; an initially empty table is not proof of absence.
  const deadline = Date.now() + timeoutMs;
  let previous: string[] | undefined;
  let stableSince = Date.now();
  let matches: string[] = [];
  while (true) {
    if (await tab.getAttribute("aria-selected") !== "true") {
      if (Date.now() >= deadline) throw new Error("Cloud tab did not settle");
    } else {
      matches = (await page.getByRole("row").allInnerTexts()).filter(text => exactManagement(text, managementNumber));
      if (matches.length > 1) throw new Error("Duplicate Cloud management number");
      const prior = previous;
      if (!prior || matches.length !== prior.length || matches.some((row, index) => row !== prior[index])) {
        stableSince = Date.now();
      }
      previous = matches;
      if (Date.now() >= deadline) {
        if (Date.now() - stableSince < pollMs * 2) throw new Error("Cloud tab rows did not settle");
        const nextPage = page.getByRole("button", { name: "次の500件", exact: true });
        const count = await nextPage.count();
        assertSingleDisabledNextPage(count, count === 1 ? await nextPage.isEnabled() : null);
        if (await tab.getAttribute("aria-selected") !== "true") throw new Error("Cloud tab changed during inspection");
        return matches[0] ?? null;
      }
    }
    await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
}

export async function inspectCloudExportRows(page: Page, timeoutMs = 3000, pollMs = 100): Promise<string[]> {
  const rows = page.getByRole("row").filter({ hasText: "シート式ラベル(ユ00783)" }).filter({ hasText: "発行済み" });
  // The export URL can settle before its rows appear, with no reliable loading marker.
  // Observe the full window so the initial empty table cannot become a baseline.
  const deadline = Date.now() + timeoutMs;
  let previous: string[] | undefined;
  let stableSince = Date.now();
  while (true) {
    const current = await rows.allInnerTexts();
    const prior = previous;
    if (!prior || current.length !== prior.length || current.some((row, index) => row !== prior[index])) {
      stableSince = Date.now();
    }
    previous = current;
    if (Date.now() >= deadline) {
      if (Date.now() - stableSince < pollMs * 2) throw new Error("Cloud export rows did not settle");
      return current;
    }
    await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
}
