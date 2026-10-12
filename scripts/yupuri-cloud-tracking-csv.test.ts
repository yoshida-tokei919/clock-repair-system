import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import type { Locator, Page } from "@playwright/test";
import * as iconv from "iconv-lite";
import { downloadTrackingCsv } from "./yupuri-cloud-tracking-csv";
import { YUPURI_HISTORY_HEADER } from "../src/lib/yupuri-history";

function actionLocator(actions: string[], name: string, extra: Partial<Locator> = {}): Locator {
  return {
    count: async () => 1,
    click: async (options?: { trial?: boolean }) => { if (!options?.trial) actions.push(`click:${name}`); },
    check: async (options?: { trial?: boolean }) => { if (!options?.trial) actions.push(`check:${name}`); },
    waitFor: async () => {},
    getAttribute: async () => "true",
    isEnabled: async () => false,
    ...extra,
  } as unknown as Locator;
}

function successPage(bytes: Buffer) {
  const actions: string[] = [];
  const rowTexts = ["header", "SHP-42 issued", "unrelated"];
  const rows = rowTexts.map((text, index) => actionLocator(actions, `row-${index}`, {
    innerText: async () => text,
    getByRole: ((role: string) => role === "checkbox" ? actionLocator(actions, `box-${index}`) : actionLocator(actions, `row-role-${index}`)) as Locator["getByRole"],
  }));
  const rowsLocator = {
    allInnerTexts: async () => rowTexts,
    count: async () => rows.length,
    nth: (index: number) => rows[index],
  } as unknown as Locator;
  const dialog = actionLocator(actions, "dialog", {
    getByRole: ((role: string, options?: { name?: string }) => role === "combobox"
      ? actionLocator(actions, "filter")
      : role === "button" && options?.name === "ダウンロード"
        ? actionLocator(actions, "dialog-download")
        : actionLocator(actions, `dialog-${role}`)) as Locator["getByRole"],
  });
  const page = {
    getByRole: (role: string, options?: { name?: string }) => {
      if (role === "row") return rowsLocator;
      if (role === "tab" && options?.name === "発行後") return actionLocator(actions, "issued-tab");
      if (role === "button" && options?.name === "次の500件") return actionLocator(actions, "next", { isEnabled: async () => false });
      if (role === "button" && options?.name === "ダウンロード") return actionLocator(actions, "open-download");
      if (role === "dialog") return dialog;
      if (role === "option") return actionLocator(actions, "filter-option");
      return { count: async () => 0 } as unknown as Locator;
    },
    waitForEvent: async () => ({ createReadStream: async () => Readable.from(bytes) }),
  } as unknown as Page;
  return { page, actions };
}

test("browser automation selects only SHP rows and returns downloaded CSV bytes", async () => {
  const header = YUPURI_HISTORY_HEADER.map(value => `"${value}"`).join(",");
  const bytes = iconv.encode(`${header}\r\n"SHP-42","193715301010","","","10","0A"\r\n`, "cp932");
  const fixture = successPage(bytes);
  let guards = 0;
  const result = await downloadTrackingCsv(fixture.page, "配送状況6列", () => { guards++; }, 5, 1);
  assert.deepEqual(result, bytes);
  assert.deepEqual(fixture.actions, [
    "click:issued-tab", "check:box-1", "click:open-download", "click:filter",
    "click:filter-option", "click:dialog-download",
  ]);
  assert.ok(guards >= 10);
});

test("no SHP rows returns null without opening the CSV dialog", async () => {
  const fixture = successPage(Buffer.from("unused"));
  (fixture.page.getByRole("row") as unknown as { allInnerTexts(): Promise<string[]> }).allInnerTexts = async () => ["header", "other", "unrelated"];
  const result = await downloadTrackingCsv(fixture.page, "配送状況6列", () => {}, 5, 1);
  assert.equal(result, null);
  assert.deepEqual(fixture.actions, ["click:issued-tab"]);
});

test("invalid output filter name fails before any browser action", async () => {
  const fixture = successPage(Buffer.from("unused"));
  await assert.rejects(downloadTrackingCsv(fixture.page, " bad ", () => {}, 5, 1), /Invalid Cloud tracking output filter/);
  assert.deepEqual(fixture.actions, []);
});
