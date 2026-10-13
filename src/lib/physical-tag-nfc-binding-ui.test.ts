import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "./physical-tag-resolver";

type Element = { type: unknown; props: Record<string, any> };

function harness(initialNfcUid: string | null = null) {
  const states: any[] = [];
  const refs: Array<{ current: any }> = [];
  let index = 0;
  let writes = 0;
  let response: (() => void) | null = null;
  let onBound = "";
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
    useEffect: () => { index++; },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const source = readFileSync("src/components/repairs/PhysicalTagNfcBinding.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const modules: Record<string, unknown> = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/ui/button": { Button: "button" },
    "@/lib/physical-tag-resolver": { parsePhysicalTagIdentifier, PhysicalTagIdentifierError },
  };
  const compiled = { exports: {} as Record<string, any> };
  new Function("exports", "require", "module", code)(compiled.exports, (name: string) => {
    assert.ok(name in modules, `unexpected module ${name}`);
    return modules[name];
  }, compiled);
  const props = { physicalTagId: 5, repairId: 10, shortCode: "PT-000005", inquiryNumber: "T-001",
    initialNfcUid, onBound: (uid: string) => { onBound = uid; } };
  const render = (): Element => { index = 0; return compiled.exports.PhysicalTagNfcBinding(props); };
  const all = (root: any): Element[] => {
    if (Array.isArray(root)) return root.flatMap(all);
    if (!root || typeof root !== "object" || !("props" in root)) return [];
    return [root, ...all(root.props.children)];
  };
  const button = (root: Element, label: string) => {
    const found = all(root).find(node => node.type === "button" &&
      all(node.props.children).length === 0 && String(node.props.children).includes(label));
    assert.ok(found, `button ${label} is visible`);
    return found;
  };
  const input = (root: Element) => {
    const found = all(root).find(node => node.type === "input");
    assert.ok(found);
    return found;
  };
  const form = (root: Element) => {
    const found = all(root).find(node => node.type === "form");
    assert.ok(found);
    return found;
  };
  const html = (root: Element) => JSON.stringify(root, (_key, value) => typeof value === "function" ? undefined : value);
  return { render, button, input, form, html,
    get writes() { return writes; }, get onBound() { return onBound; },
    setFetch() {
      const previous = globalThis.fetch;
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        writes++;
        assert.deepEqual(JSON.parse(String(init.body)), { physicalTagId: 5, repairId: 10, nfcUid: "04333F" });
        await new Promise<void>(resolve => { response = resolve; });
        return { ok: true, json: async () => ({ physicalTagId: 5, repairId: 10, nfcUid: "04333F" }) } as Response;
      }) as typeof fetch;
      return { resolve: () => { assert.ok(response); response(); }, restore: () => { globalThis.fetch = previous; } };
    },
  };
}

test("unregistered tag shows registration; registered tag hides it", () => {
  const empty = harness();
  assert.match(empty.html(empty.render()), /NFC未登録/);
  empty.button(empty.render(), "NFCタグを登録");
  const bound = harness("04333F");
  assert.match(bound.html(bound.render()), /NFC UID: /);
  assert.match(bound.html(bound.render()), /04333F/);
  assert.doesNotMatch(bound.html(bound.render()), /NFCタグを登録/);
});

test("HID Enter stages a normalized candidate, cancel discards it without saving", () => {
  const ui = harness();
  ui.button(ui.render(), "NFCタグを登録").props.onClick();
  assert.match(ui.html(ui.render()), /R65でNFCタグを読み取ってください/);
  ui.input(ui.render()).props.onChange({ target: { value: "04:33-3f" } });
  ui.form(ui.render()).props.onSubmit({ preventDefault() {} });
  let tree = ui.render();
  assert.match(ui.html(tree), /04333F/);
  assert.match(ui.html(tree), /まだ保存していません/);
  assert.equal(ui.writes, 0);
  ui.button(tree, "キャンセル").props.onClick();
  tree = ui.render();
  assert.match(ui.html(tree), /NFC未登録/);
  assert.doesNotMatch(ui.html(tree), /04333F/);
  assert.equal(ui.writes, 0);
});

test("explicit confirm saves once despite a rapid second click, then hides registration", async () => {
  const ui = harness();
  const fetch = ui.setFetch();
  try {
    ui.button(ui.render(), "NFCタグを登録").props.onClick();
    ui.input(ui.render()).props.onChange({ target: { value: "04:33:3f" } });
    ui.form(ui.render()).props.onSubmit({ preventDefault() {} });
    const confirm = ui.button(ui.render(), "このUIDをT-001 / PT-000005へ登録").props.onClick;
    confirm();
    confirm();
    assert.equal(ui.writes, 1);
    fetch.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.onBound, "04333F", ui.html(ui.render()));
    assert.match(ui.html(ui.render()), /NFC UID: /);
    assert.doesNotMatch(ui.html(ui.render()), /NFCタグを登録/);
  } finally { fetch.restore(); }
});
