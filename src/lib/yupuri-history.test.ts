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
const shipment = (overrides: Partial<Parameters<typeof resolveYupuriHistory>[1][number]> = {}) => ({
  id: 42, direction: "OUTBOUND" as const, status: "DRAFT", trackingNumber: null as string | null,
  actualShippedAt: null as Date | null, deliveredAt: null as Date | null, ...overrides,
});
const preview = (text: string, shipments = [shipment()]) =>
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
  assert.equal(rows[1].trackingChange, "NONE");
  assert.ok(rows[2].errors.some(error => error.includes("6 columns")));
  assert.equal(rows[3].trackingNumberCandidate, "  ");
  assert.ok(rows[3].errors.some(error => error.includes("Tracking number")));
  assert.equal(rows[3].trackingChange, "NONE");
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
    [shipment({ trackingNumber: "OLD" })]);
  for (const item of rows) {
    assert.ok(item.errors.includes("Duplicate management number"));
    assert.ok(item.errors.includes("Duplicate resolved Shipment"));
    assert.ok(item.errors.includes("Conflicting tracking numbers for the same Shipment"));
    assert.ok(item.errors.includes("Existing Shipment tracking number conflicts with candidate"));
    assert.equal(item.importableLater, false);
  }
});

test("official Japan Post descriptions remain read-only preview candidates", () => {
  for (const [aggregate, detail, description] of [
    ["10", "01", "引受予定"], ["10", "0A", "引受予定"],
    ["11", "01", "引受"], ["12", "14", "通過"], ["13", "19", "発送"],
    ["14", "83", "車船輸送"], ["30", "00", "到着"], ["50", "01", "持出中"],
    ["51", "33", "最寄局保管"], ["52", "01", "配達完了"],
    ["52", "34", "返還完了"], ["53", "38", "配達完了"],
    ["60", "48", "局内保管"], ["61", "51", "転送"],
    ["62", "65", "処分"], ["63", "70", "保管延長"],
    ["64", "73", "休日保管"], ["65", "56", "調査中"],
  ]) {
    const result = preview(`${header}\n${row("SHP-42", "123", aggregate, detail)}\n`)[0];
    assert.equal(result.confirmedDescriptionOrNull, description, `${aggregate}/${detail}`);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.importableLater, true);
  }
});

test("official descriptions map only to explicit Shipment status candidates", () => {
  for (const [aggregate, detail, candidate] of [
    ["10", "0A", "AWAITING_ACCEPTANCE"], ["11", "01", "SHIPPED"],
    ["12", "14", "IN_TRANSIT"], ["12", "15", "IN_TRANSIT"], ["12", "16", "IN_TRANSIT"],
    ["12", "17", "IN_TRANSIT"], ["13", "19", "IN_TRANSIT"], ["14", "83", "IN_TRANSIT"],
    ["30", "00", "IN_TRANSIT"], ["50", "01", "OUT_FOR_DELIVERY"],
    ["52", "01", "DELIVERED"], ["51", "30", "EXCEPTION"],
    ["51", "33", "EXCEPTION"], ["52", "34", "EXCEPTION"],
    ["60", "48", "EXCEPTION"], ["60", "49", "EXCEPTION"], ["60", "77", "EXCEPTION"],
    ["60", "99", "EXCEPTION"], ["61", "51", "EXCEPTION"], ["61", "79", "EXCEPTION"],
    ["62", "44", "EXCEPTION"], ["62", "65", "EXCEPTION"], ["62", "66", "EXCEPTION"],
    ["63", "67", "EXCEPTION"], ["63", "68", "EXCEPTION"], ["63", "72", "EXCEPTION"],
    ["63", "78", "EXCEPTION"], ["63", "79", "EXCEPTION"], ["63", "80", "EXCEPTION"],
    ["63", "70", "EXCEPTION"], ["64", "73", "EXCEPTION"], ["65", "56", "EXCEPTION"],
  ]) {
    const result = preview(`${header}\n${row("SHP-42", "123", aggregate, detail)}\n`)[0];
    assert.equal(result.statusCandidate, candidate, `${aggregate}/${detail}`);
    assert.equal(result.statusChange, "CANDIDATE");
  }
  const counterHandoff = preview(`${header}\n${row("SHP-42", "123", "53", "37")}\n`)[0];
  assert.equal(counterHandoff.confirmedDescriptionOrNull, "窓口渡し");
  assert.equal(counterHandoff.statusCandidate, null);
  assert.equal(counterHandoff.statusChange, "NONE");
  assert.equal(counterHandoff.importableLater, false);
  assert.ok(counterHandoff.warnings.includes("Official description has no normalized Shipment status candidate"));
});

test("same status and tracking are no-op; raw date fields and current dates remain distinct", () => {
  const acceptance = "20260102030405";
  const completion = "20260203040506";
  const rows = preview(`${header}\n"SHP-42","123","${acceptance}","${completion}","10","0A"\n`,
    [shipment({ status: "AWAITING_ACCEPTANCE", trackingNumber: "123",
      actualShippedAt: new Date("2026-01-01T00:00:00.000Z"), deliveredAt: null })]);
  assert.equal(rows[0].statusChange, "NO_CHANGE");
  assert.equal(rows[0].trackingChange, "NO_CHANGE");
  assert.equal(rows[0].acceptanceRelatedValue, acceptance);
  assert.equal(rows[0].deliveryCompletionCandidate, completion);
  assert.equal(rows[0].currentShipment?.actualShippedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(rows[0].currentShipment?.deliveredAt, null);
  assert.deepEqual(rows[0].errors, []);
});

test("tracking conflict, INBOUND and CANCELLED block preview candidates", () => {
  for (const [current, blocker] of [
    [shipment({ trackingNumber: "OLD" }), "Existing Shipment tracking number conflicts with candidate"],
    [shipment({ direction: "INBOUND" }), "INBOUND Shipment is not a supported synchronization target"],
    [shipment({ status: "CANCELLED" }), "CANCELLED Shipment is not a supported synchronization target"],
  ] as const) {
    const result = preview(`${header}\n${row("SHP-42", "123")}\n`, [current])[0];
    assert.ok(result.errors.includes(blocker));
    assert.equal(result.importableLater, false);
    assert.equal(result.statusCandidate, "AWAITING_ACCEPTANCE");
  }
});

test("official dash pair has no description and is distinct from an unknown pair", () => {
  const dash = preview(`${header}\n${row("SHP-42", "123", "11", "0D")}\n`)[0];
  assert.equal(dash.confirmedDescriptionOrNull, null);
  assert.equal(dash.statusCandidate, null);
  assert.ok(dash.warnings.includes("Official delivery status table lists this pair without a description"));
  assert.equal(dash.importableLater, false);

  const unknown = preview(`${header}\n${row("SHP-42", "123", "ZZ", "ZZ")}\n`)[0];
  assert.equal(unknown.confirmedDescriptionOrNull, null);
  assert.equal(unknown.statusCandidate, null);
  assert.ok(unknown.warnings.includes("Unverified delivery status codes"));
  assert.equal(unknown.importableLater, false);
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
