import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { validatePreparedBatchLabels } from "./b2b-batch-print-progress";

type Element = { type: unknown; props: Record<string, any> };

test("reuse discards cached provisional label and printed status, then requires the replacement QR", async () => {
  const states: any[] = [];
  const refs: any[] = [];
  let index = 0;
  let printed: string[] = [];
  let activeTag = 22;
  const react = {
    useState: (initial: unknown) => {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next: any) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
    },
    useRef: (initial: unknown) => {
      const slot = index++;
      return refs[slot] ?? (refs[slot] = { current: initial });
    },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const source = readFileSync("src/app/(private)/(app)/repairs/b2b-intake/B2bBatchTagPrinting.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const modules: Record<string, unknown> = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { __esModule: true, default: "a" },
    "@/lib/bpac-physical-tag-print": { printPhysicalTagLabel: async (label: any) => { printed.push(label.shortCode); } },
    "@/lib/b2b-batch-print-progress": {
      validatePreparedBatchLabels,
      BatchPrintStopped: class extends Error {},
      printBatchFrom: async () => {},
    },
    "@/components/repairs/PhysicalTagNfcBinding": { PhysicalTagNfcBinding: "binding" },
  };
  const compiled = { exports: {} as Record<string, any> };
  new Function("exports", "require", "module", code)(compiled.exports, (name: string) => {
    assert.ok(name in modules, name); return modules[name];
  }, compiled);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ labels: [{
    repairId: 10, physicalTagId: activeTag, shortCode: `PT-${String(activeTag).padStart(6, "0")}`,
    nfcUid: activeTag === 18 ? "0433E4DC390289" : null, reused: activeTag === 18,
    label: { inquiryNumber: "T-010", shortCode: `PT-${String(activeTag).padStart(6, "0")}`,
      qrPayload: activeTag === 18 ? "old-token" : "new-token", customerType: "business" },
  }] }) })) as unknown as typeof fetch;
  const render = (): Element => {
    index = 0;
    return compiled.exports.B2bBatchTagPrinting({ result: { partnerId: 1,
      repairs: [{ id: 10, inquiryNumber: "T-010" }] }, onReset: () => {} });
  };
  const all = (node: any): Element[] => Array.isArray(node) ? node.flatMap(all) :
    node && typeof node === "object" && "props" in node ? [node, ...all(node.props.children)] : [];
  const html = () => JSON.stringify(render(), (_key, value) => typeof value === "function" ? undefined : value);
  const button = (label: string) => {
    const node = all(render()).find(item => item.type === "button" &&
      String(item.props.children).includes(label));
    assert.ok(node, label); return node;
  };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  try {
    button("この案件のタグを準備").props.onClick();
    await flush();
    button("この案件のQRラベルを印刷").props.onClick();
    await flush();
    assert.deepEqual(printed, ["PT-000022"]);
    assert.match(html(), /印刷完了/);
    const provisional = states[1][10];
    assert.equal(provisional.physicalTagId, 22);
    assert.equal(provisional.label.qrPayload, "new-token");

    activeTag = 18;
    const binding = all(render()).find(item => item.type === "binding");
    assert.ok(binding);
    binding.props.onReused({ physicalTagId: 18, shortCode: "PT-000018", nfcUid: "0433E4DC390289" });
    assert.doesNotMatch(html(), /PT-000022/);
    assert.match(html(), /旧QRラベルは無効・新しいQRラベルの印刷が必要/);
    assert.equal(all(render()).some(item => item.type === "button" &&
      String(item.props.children).includes("この案件のQRラベルを印刷")), false);
    assert.deepEqual(printed, ["PT-000022"]);
    await flush();
    assert.match(html(), /PT-000018/);
    assert.equal(states[1][10].label.qrPayload, "old-token");
    assert.doesNotMatch(html(), /印刷完了/);
    button("この案件のQRラベルを印刷").props.onClick();
    await flush();
    assert.deepEqual(printed, ["PT-000022", "PT-000018"]);
    assert.match(html(), /印刷完了/);
    assert.doesNotMatch(html(), /旧QRラベルは無効・新しいQRラベルの印刷が必要/);
  } finally { globalThis.fetch = originalFetch; }
});
