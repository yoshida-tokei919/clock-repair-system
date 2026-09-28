import { expect, test } from "@playwright/test";
import { build } from "esbuild";

const revision = (letter: string) => letter.repeat(64);
const repair = (action: string) => ({
  id: 7, inquiryNumber: "R-7", status: "作業待ち", priorityScore: 1,
  workMinutes: 60, workMinutesSource: "ESTIMATED_WORK", currentScheduledDate: null,
  scheduleLocked: false, currentSegments: [], partsReadinessState: "READY",
  partsReadyDate: null, blocked: false, resumeEligibleDate: null, reviewDate: null,
  projectedEarliestDate: null, latestWorkCompletionDate: null, proposedSummaryDate: "2026-10-01",
  proposedSegments: [{ repairId: 7, workDate: "2026-10-01", plannedMinutes: 60, source: "AUTO", sortOrder: 0 }],
  unplacedReason: null, futureApplyAction: action,
});
const preview = (letter: string, action = "CREATE_AUTO") => ({
  asOfDate: "2026-09-28", horizonEndDate: "2026-10-31", plannerVersion: "193C1-1",
  snapshotRevision: revision(letter), days: [], repairs: [repair(action)],
});

let bundle: string;
test.beforeAll(async () => {
  const built = await build({
    stdin: {
      contents: `import React from "react";
import { createRoot } from "react-dom/client";
import { SchedulerV2Preview } from "./src/components/repairs/SchedulerV2Preview";
createRoot(document.getElementById("root")!).render(React.createElement(SchedulerV2Preview));`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, platform: "browser", format: "iife", jsx: "automatic", write: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  bundle = built.outputFiles[0].text;
});

async function mount(page: import("@playwright/test").Page, previews: ReturnType<typeof preview>[],
  applyStatus = 200) {
  let previewRequests = 0;
  const posted: unknown[] = [];
  await page.route("http://localhost:4177/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.route("**/api/repairs/scheduler-v2-preview", route => {
    const response = previews[Math.min(previewRequests, previews.length - 1)];
    previewRequests++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.route("**/api/repairs/scheduler-v2-apply", route => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({ status: applyStatus, contentType: "application/json",
      body: JSON.stringify(applyStatus === 409 ? { error: "stale" } : { changedRepairs: 1, createdSegments: 1 }) });
  });
  await page.goto("http://localhost:4177/");
  await page.addScriptTag({ content: bundle });
  await page.getByRole("button", { name: "予定案を表示" }).click();
  await expect(page.locator("code")).toHaveText(previews[0].snapshotRevision);
  return { posted, get previewRequests() { return previewRequests; } };
}

test("confirmation is required and apply sends only the preview revision", async ({ page }) => {
  const state = await mount(page, [preview("a"), preview("b")]);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "1件の予定を反映" }).click();
  expect(state.posted).toHaveLength(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "1件の予定を反映" }).click();
  await expect(page.getByRole("status")).toContainText("1件の予定を反映しました");
  expect(state.posted).toEqual([{ revision: revision("a") }]);
  expect(state.previewRequests).toBe(2);
  await expect(page.locator("code")).toHaveText(revision("b"));
});

test("409 refreshes the preview without another POST", async ({ page }) => {
  const state = await mount(page, [preview("a"), preview("b")], 409);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "1件の予定を反映" }).click();
  await expect(page.getByRole("status")).toContainText("予定案が変更されました");
  await expect(page.locator("code")).toHaveText(revision("b"));
  expect(state.posted).toEqual([{ revision: revision("a") }]);
  expect(state.previewRequests).toBe(2);
});

test("no actionable writes disables apply", async ({ page }) => {
  const state = await mount(page, [preview("a", "PROTECTED")]);
  await expect(page.getByRole("button", { name: "0件の予定を反映" })).toBeDisabled();
  expect(state.posted).toHaveLength(0);
});

test("other apply errors are shown without a retry", async ({ page }) => {
  const state = await mount(page, [preview("a")], 500);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "1件の予定を反映" }).click();
  await expect(page.getByRole("alert")).toContainText("予定を反映できませんでした");
  expect(state.posted).toEqual([{ revision: revision("a") }]);
  expect(state.previewRequests).toBe(1);
});
