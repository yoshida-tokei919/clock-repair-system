import type { Locator } from "@playwright/test";

// Keep the actionability wait separate from the short, bounded dispatch. The
// guard is repeated after every wait so the 23:55 cutoff cannot queue an
// action behind Playwright's default locator wait. OS scheduling is not atomic.
export async function guardedCloudClick(locator: Locator, guard: () => void): Promise<void> {
  guard();
  await locator.click({ trial: true, timeout: 15000 });
  guard();
  await locator.click({ noWaitAfter: true, timeout: 1000 });
}

export async function guardedCloudCheck(locator: Locator, guard: () => void): Promise<void> {
  guard();
  await locator.check({ trial: true, timeout: 15000 });
  guard();
  await locator.check({ timeout: 1000 });
}

export async function guardedCloudFiles(locator: Locator, files: Parameters<Locator["setInputFiles"]>[0],
  guard: () => void): Promise<void> {
  guard();
  await locator.waitFor({ state: "attached", timeout: 15000 });
  guard();
  await locator.setInputFiles(files, { timeout: 1000 });
}
