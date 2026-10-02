import assert from "node:assert/strict";
import test from "node:test";
import * as iconv from "iconv-lite";
import {
  parseYupuriHistory, resolveYupuriHistory, YUPURI_HISTORY_HEADER,
  YUPURI_HISTORY_MAX_BYTES, YUPURI_HISTORY_MAX_ROWS,
} from "./yupuri-history";

const header = YUPURI_HISTORY_HEADER.map(value => `"${value}"`).join(",");
const row = (key = "SHP-42", tracking = "193715301010", aggregate = "10", detail = "0A") =>
  [key, tracking, "", "", aggregate, detail].map(value => `"${value}"`).join(",");
const cp932 = (text: string) => iconv.encode(text, "cp932");
const preview = (text: string, shipments = [{ id: 42, trackingNumber: null as string | null }]) =>
  resolveYupuriHistory(parseYupuriHistory(cp932(text)), shipments);

test("CP932 header, 10/0A, raw dates, CRLF and LF", () => {
  for (const sep of ["\r\n", "\n"]) {
    const rows = preview([header, '"SHP-42","193715301010","raw-A","raw-D","10","0A"', ""].join(sep));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowNumber, 2);
    assert.equal(rows[0].managementNumber, "SHP-42");
    assert.equal(rows[0].resolvedShipmentId, 42);
    assert.equal(rows[0].shipmentFound, true);
    assert.equal(rows[0].acceptanceRelatedValue, "raw-A");
    assert.equal(rows[0].deliveryCompletionCandidate, "raw-D");
    assert.equal(rows[0].confirmedDescriptionOrNull, "引受予定");
    assert.equal(rows[0].importableLater, true);
  }
});

test("quoted comma and doubled quote stay in fields", () => {
  const rows = preview(`${header}\r\n"SHP-42","12,34""56","","","10","0A"\r\n`);
  assert.equal(rows[0].trackingNumberCandidate, '12,34"56');
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].importableLater, true);
});

test("empty file, header-only, BOM, UTF-8 and malformed quoting fail closed", () => {
  for (const bytes of [
    Buffer.alloc(0), cp932(`${header}\r\n`),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), cp932(`${header}\r\n${row()}\r\n`)]),
    Buffer.from(`${header}\r\n${row()}\r\n`, "utf8"),
    cp932(`${header}\n"SHP-42,"123","","","10","0A"`),
    cp932(`${header}\n"SHP-42"x,"123","","","10","0A"`),
    cp932(`${header}\nSHP-"42",123,,,,10,0A`),
  ]) assert.throws(() => parseYupuriHistory(bytes));
});

test("missing columns, short row, extra column and blank tracking are row errors", () => {
  const rows = preview(`${header}\n"SHP-42"\n${row("SHP-42", "")}\n${row()},"extra"\n${row("SHP-42", "  ")}\n`);
  assert.equal(rows.length, 4);
  assert.ok(rows[0].errors.some(error => error.includes("6 columns")));
  assert.ok(rows[0].errors.some(error => error.includes("Tracking number")));
  assert.ok(rows[1].errors.some(error => error.includes("Tracking number")));
  assert.ok(rows[2].errors.some(error => error.includes("6 columns")));
  assert.equal(rows[3].trackingNumberCandidate, "  ");
  assert.ok(rows[3].errors.some(error => error.includes("Tracking number")));
  assert.ok(rows.every(value => !value.importableLater));
});

test("canonical SHP ID and safe Int range are required; missing Shipment is explicit", () => {
  for (const key of ["POC003", "SHP-0", "SHP-01", " SHP-42", "SHP-2147483648", "SHP-9007199254740992"])
    assert.ok(preview(`${header}\n${row(key)}\n`)[0].errors.includes("Invalid SHP management number"));
  const missing = preview(`${header}\n${row("SHP-43")}\n`)[0];
  assert.equal(missing.resolvedShipmentId, 43);
  assert.equal(missing.shipmentFound, false);
  assert.ok(missing.errors.includes("Shipment not found"));
});

test("duplicate management, duplicate Shipment, differing candidates and existing tracking conflict", () => {
  const rows = preview(`${header}\n${row("SHP-42", "AAA")}\n${row("SHP-42", "BBB")}\n`,
    [{ id: 42, trackingNumber: "OLD" }]);
  for (const item of rows) {
    assert.ok(item.errors.includes("Duplicate management number"));
    assert.ok(item.errors.includes("Duplicate resolved Shipment"));
    assert.ok(item.errors.includes("Conflicting tracking numbers for the same Shipment"));
    assert.ok(item.errors.includes("Existing Shipment tracking number conflicts with candidate"));
    assert.equal(item.importableLater, false);
  }
});

test("unknown aggregate/detail pair keeps raw codes and cannot imply a delivery state", () => {
  for (const [aggregate, detail] of [["10", "ZZ"], ["ZZ", "0A"], ["20", "20"]]) {
    const result = preview(`${header}\n${row("SHP-42", "123", aggregate, detail)}\n`)[0];
    assert.equal(result.aggregateStatusCode, aggregate);
    assert.equal(result.detailStatusCode, detail);
    assert.equal(result.confirmedDescriptionOrNull, null);
    assert.ok(result.warnings.includes("Unverified delivery status codes"));
    assert.equal(result.importableLater, false);
  }
});

test("conservative file and row limits", () => {
  assert.throws(() => parseYupuriHistory(Buffer.alloc(YUPURI_HISTORY_MAX_BYTES + 1)));
  const many = `${header}\n${Array(YUPURI_HISTORY_MAX_ROWS + 1).fill(row()).join("\n")}`;
  assert.throws(() => parseYupuriHistory(cp932(many)), /row limit/);
});
