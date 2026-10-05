import assert from "node:assert/strict";
import test from "node:test";
import type { PhysicalTagLabel } from "./physical-tag-label";
import {
  BPAC_AUTO_CUT,
  BPAC_PRINTER_NAME,
  physicalTagBpacText,
  printPhysicalTagLabel,
  type BpacRuntime,
} from "./bpac-physical-tag-print";

const label: PhysicalTagLabel = {
  shortCode: "PT-000123",
  inquiryNumber: "C-002",
  customerType: "individual",
  customerName: "山田太郎",
  endUserName: null,
  partnerRef: null,
  brand: "OMEGA",
  model: "Seamaster",
  reference: "2516.50",
  serialNumber: "SN123",
  caliber: "1400",
  receptionDate: "2026/10/05",
  qrPayload: "AbcdEFGHijklMNOPqrstUVWXyz01_-23",
};

type MockOptions = {
  extension?: boolean;
  setPrinter?: boolean;
  installed?: string[];
  online?: boolean;
  mountedMedia?: string;
  templateMedia?: string;
  width?: number;
  length?: number;
  printOut?: boolean;
  endPrint?: boolean;
  missingObject?: "objInquiry" | "objShortCode" | "objInfo";
};

function mockRuntime(options: MockOptions = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const textValues = new Map<string, string>();
  let qrValue = "";
  const printer = {
    async GetInstalledPrinters() {
      calls.push({ method: "GetInstalledPrinters", args: [] });
      return options.installed ?? [BPAC_PRINTER_NAME];
    },
    async GetMediaName() {
      calls.push({ method: "Printer.GetMediaName", args: [] });
      return options.mountedMedia ?? "62mm";
    },
    async IsPrinterOnline(name: string) {
      calls.push({ method: "IsPrinterOnline", args: [name] });
      return options.online ?? true;
    },
  };
  const document = {
    async Open(path: string) {
      calls.push({ method: "Open", args: [path] });
      return true;
    },
    async Close() {
      calls.push({ method: "Close", args: [] });
      return true;
    },
    async SetPrinter(name: string, fit: boolean) {
      calls.push({ method: "SetPrinter", args: [name, fit] });
      return options.setPrinter ?? true;
    },
    async GetPrinter() {
      calls.push({ method: "GetPrinter", args: [] });
      return printer;
    },
    async GetMediaName() {
      calls.push({ method: "Document.GetMediaName", args: [] });
      return options.templateMedia ?? "62mm";
    },
    get Width() {
      calls.push({ method: "Width", args: [] });
      return Promise.resolve(options.width ?? 3514);
    },
    get Length() {
      calls.push({ method: "Length", args: [] });
      return Promise.resolve(options.length ?? 4252);
    },
    async GetObject(name: string) {
      calls.push({ method: "GetObject", args: [name] });
      if (options.missingObject === name) return undefined;
      if (!["objInquiry", "objShortCode", "objInfo"].includes(name)) return undefined;
      return {
        set Text(value: string) {
          calls.push({ method: "Object.Text", args: [name, value] });
          textValues.set(name, value);
        },
      };
    },
    async GetBarcodeIndex(name: string) {
      calls.push({ method: "GetBarcodeIndex", args: [name] });
      return name === "objQr" ? 0 : undefined;
    },
    async SetBarcodeData(index: number, value: string) {
      calls.push({ method: "SetBarcodeData", args: [index, value] });
      qrValue = value;
      return true;
    },
    async StartPrint(name: string, option: number) {
      calls.push({ method: "StartPrint", args: [name, option] });
      return true;
    },
    async PrintOut(copies: number, option: number) {
      calls.push({ method: "PrintOut", args: [copies, option] });
      return options.printOut ?? true;
    },
    async EndPrint() {
      calls.push({ method: "EndPrint", args: [] });
      return options.endPrint ?? true;
    },
  };
  const runtime: BpacRuntime = {
    IsExtensionInstalled: () => options.extension ?? true,
    IDocument: document,
  };
  return { runtime, calls, textValues, get qrValue() { return qrValue; } };
}

const deps = (runtime: BpacRuntime) => ({
  loadBpac: async () => runtime,
  origin: "https://repair.example.test",
  sleep: async () => {},
  extensionChecks: 1,
});

test("direct print fixes Brother QL-800, prints one auto-cut copy, and writes exact QR payload", async () => {
  const mock = mockRuntime();
  await printPhysicalTagLabel(label, deps(mock.runtime));

  assert.deepEqual(mock.calls.find(call => call.method === "SetPrinter")?.args, [BPAC_PRINTER_NAME, false]);
  assert.deepEqual(mock.calls.find(call => call.method === "StartPrint")?.args, ["PhysicalTag PT-000123", BPAC_AUTO_CUT]);
  assert.deepEqual(mock.calls.find(call => call.method === "PrintOut")?.args, [1, 0]);
  const text = physicalTagBpacText(label);
  assert.equal(mock.textValues.get("objInquiry"), text.inquiry);
  assert.equal(mock.textValues.get("objShortCode"), text.shortCode);
  assert.equal(mock.textValues.get("objInfo"), text.info);
  assert.equal(mock.calls.some(call => call.method === "GetTextIndex"), false);
  assert.equal(mock.qrValue, label.qrPayload);
  assert.equal(mock.calls.filter(call => call.method === "EndPrint").length, 1);
  assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
  assert.equal(mock.calls.some(call => call.args.includes("NEC MultiWriter 5750C")), false);
  assert.match(String(mock.calls.find(call => call.method === "Open")?.args[0]), /^https:\/\/repair\.example\.test\/bpac\/physical-tag-62x75\.lbx$/);
});

test("missing named text object fails closed before printing", async () => {
  const mock = mockRuntime({ missingObject: "objInquiry" });
  await assert.rejects(
    () => printPhysicalTagLabel(label, deps(mock.runtime)),
    /objInquiry/,
  );
  assert.equal(mock.calls.some(call => call.method === "StartPrint"), false);
  assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
});

test("missing b-PAC extension fails before opening or printing", async () => {
  const mock = mockRuntime({ extension: false });
  await assert.rejects(
    () => printPhysicalTagLabel(label, deps(mock.runtime)),
    /b-PAC Extension/,
  );
  assert.equal(mock.calls.some(call => call.method === "Open"), false);
  assert.equal(mock.calls.some(call => call.method === "StartPrint"), false);
});

test("QL-800 absence, offline state, and wrong mounted media fail closed", async t => {
  const cases: Array<[string, MockOptions, RegExp]> = [
    ["absent", { installed: ["NEC MultiWriter 5750C"] }, /QL-800が見つかりません/],
    ["offline", { online: false }, /オフライン/],
    ["wrong media", { mountedMedia: "29mm" }, /用紙が62mmではありません/],
  ];
  for (const [name, options, expected] of cases) {
    await t.test(name, async () => {
      const mock = mockRuntime(options);
      await assert.rejects(() => printPhysicalTagLabel(label, deps(mock.runtime)), expected);
      assert.equal(mock.calls.some(call => call.method === "StartPrint"), false);
      assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
    });
  }
});

test("wrong template media or dimensions fail before print", async t => {
  for (const [name, options] of [
    ["media", { templateMedia: "29mm" }],
    ["width", { width: 3500 }],
    ["length", { length: 4300 }],
  ] as Array<[string, MockOptions]>) {
    await t.test(name, async () => {
      const mock = mockRuntime(options);
      await assert.rejects(
        () => printPhysicalTagLabel(label, deps(mock.runtime)),
        /62 × 75 mm/,
      );
      assert.equal(mock.calls.some(call => call.method === "StartPrint"), false);
      assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
    });
  }
});

test("SetPrinter failure never falls back to a default printer", async () => {
  const mock = mockRuntime({ setPrinter: false });
  await assert.rejects(
    () => printPhysicalTagLabel(label, deps(mock.runtime)),
    /QL-800を印刷先に指定できません/,
  );
  assert.equal(mock.calls.some(call => call.method === "GetPrinter"), false);
  assert.equal(mock.calls.some(call => call.method === "StartPrint"), false);
  assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
});

test("a PrintOut failure ends the started job and closes the document", async () => {
  const mock = mockRuntime({ printOut: false });
  await assert.rejects(
    () => printPhysicalTagLabel(label, deps(mock.runtime)),
    /ラベルを送信できません/,
  );
  assert.equal(mock.calls.filter(call => call.method === "EndPrint").length, 1);
  assert.equal(mock.calls.filter(call => call.method === "Close").length, 1);
});

test("direct label formatter keeps B2C/B2B semantics and truncates long lines", () => {
  const individual = physicalTagBpacText(label);
  assert.match(individual.inquiry, /^受付 C-002$/);
  assert.match(individual.info, /お客様 山田太郎/);
  assert.doesNotMatch(individual.info, /取引先管理番号|エンドユーザー/);

  const business = physicalTagBpacText({
    ...label,
    customerType: "business",
    customerName: "取引先会社",
    partnerRef: "先方-001",
    endUserName: "所有者",
    model: "非常に長いモデル名称".repeat(4),
  });
  assert.match(business.info, /取引先管理番号 先方-001/);
  assert.match(business.info, /取引先 取引先会社/);
  assert.match(business.info, /エンドユーザー 所有者/);
  assert.match(business.info, /…/);
  assert.equal(business.info.split("\r\n").length, 9);
});
