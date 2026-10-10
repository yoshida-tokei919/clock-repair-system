import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "@playwright/test";
import { inspectCloudExportRows, inspectCloudTab } from "./yupuri-cloud-listing";

function cloudPage(rowsForTab: (tab: string, elapsedMs: number) => string[], nextEnabled = false): Page {
  let selected = "";
  let clickedAt = 0;
  return {
    getByRole: (role: string, options?: { name?: string }) => {
      if (role === "tab") {
        const name = options?.name ?? "";
        return {
          count: async () => 1,
          click: async () => { selected = name; clickedAt = Date.now(); },
          getAttribute: async () => selected === name ? "true" : "false",
        };
      }
      if (role === "row") return { allInnerTexts: async () => rowsForTab(selected, Date.now() - clickedAt) };
      if (role === "button") return { count: async () => 1, isEnabled: async () => nextEnabled };
      throw new Error(`Unexpected role: ${role}`);
    },
  } as unknown as Page;
}

test("row appearing 1.5 seconds after tab click is found, while the other tab remains absent", async () => {
  const page = cloudPage((tab, elapsed) => tab === "発行後" && elapsed >= 1500
    ? ["SHP-10 398007150100", "SHP-1 398007150101"] : ["SHP-10 398007150100"]);
  assert.equal(await inspectCloudTab(page, "発行後", "SHP-1"), "SHP-1 398007150101");
  assert.equal(await inspectCloudTab(page, "発行前", "SHP-1", 100, 5), null);
});

test("a row absent throughout the observation window stays absent", async () => {
  const page = cloudPage(() => ["SHP-10 398007150100"]);
  assert.equal(await inspectCloudTab(page, "発行後", "SHP-1", 60, 5), null);
});

test("late duplicates and enabled next-500 pagination fail closed", async () => {
  const duplicate = cloudPage((_tab, elapsed) => elapsed >= 25 ? ["SHP-1 first", "SHP-1 second"] : []);
  await assert.rejects(inspectCloudTab(duplicate, "発行前", "SHP-1", 80, 5), /Duplicate/);
  const paginated = cloudPage(() => [], true);
  await assert.rejects(inspectCloudTab(paginated, "発行前", "SHP-1", 60, 5), /pagination/);
});

function exportPage(readRows: () => Promise<string[]>): Page {
  const rows = { filter: () => rows, allInnerTexts: readRows };
  return { getByRole: (role: string) => {
    if (role !== "row") throw new Error(`Unexpected role: ${role}`);
    return rows;
  } } as unknown as Page;
}

test("export rows can remain empty throughout the bounded observation window", async () => {
  const started = Date.now();
  assert.deepEqual(await inspectCloudExportRows(exportPage(async () => []), 60, 5), []);
  assert.ok(Date.now() - started >= 60);
});

test("export row changes at the deadline fail closed", async () => {
  let reads = 0;
  const page = exportPage(async () => {
    if (++reads === 1) return [];
    await new Promise(resolve => setTimeout(resolve, 50));
    return ["late row"];
  });
  await assert.rejects(inspectCloudExportRows(page, 40, 5), /did not settle/);
});
