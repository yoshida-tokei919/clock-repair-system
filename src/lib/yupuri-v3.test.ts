import assert from "node:assert/strict";
import test from "node:test";
import * as iconv from "iconv-lite";
import { YupuriV3Error, type YupuriShipment, yupuriTimeCode, yupuriV3Csv, yupuriV3Fields } from "./yupuri-v3";

function shipment(overrides: Partial<YupuriShipment> = {}): YupuriShipment {
  return {
    id: 42, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
    plannedShipDate: new Date("2026-09-25T00:00:00.000Z"),
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
    destinationRecipientName: "\u30c6\u30b9\u30c8\u592a\u90ce", destinationPostalCode: "1040045",
    destinationPrefecture: "\u6771\u4eac\u90fd", destinationCity: "\u4e2d\u592e\u533a",
    destinationStreet: "\u7bc9\u57305-5-5", destinationBuilding: null, destinationPhone: "03-8888-8888",
    ...overrides,
  };
}

function readCsv(bytes: Buffer): string {
  return iconv.decode(bytes, "cp932");
}

test("final PoC structure uses one unquoted, headerless 100-column row", () => {
  const fields = yupuriV3Fields(shipment());
  const populated = Object.fromEntries(fields.flatMap((value, index) => value ? [[index + 1, value]] : []));
  assert.equal(fields.length, 100);
  assert.deepEqual(populated, {
    1: "SHP-42", 3: "0", 6: "20260925", 9: "0", 10: "0", 11: "0", 12: "0", 13: "1100780",
    15: "1040045", 16: "\u6771\u4eac\u90fd\u4e2d\u592e\u533a\u7bc9\u57305-5-5", 18: "\u30c6\u30b9\u30c8\u592a\u90ce", 20: "0", 21: "03-8888-8888",
    23: "0", 26: "0", 27: "0", 28: "0", 30: "6511213", 31: "\u795e\u6238\u5e02\u5317\u533a\u5e83\u9675\u753a1-162-1-401",
    34: "\u30e8\u30b7\u30c0\u6642\u8a08\u4fee\u7406\u5de5\u623f", 37: "090-2041-8275", 39: "0", 43: "0", 44: "0", 45: "0",
    46: "0", 47: "0", 48: "060", 51: "0", 53: "00", 54: "0", 55: "0", 56: "1", 57: "\u8155\u6642\u8a08",
    69: "0", 70: "0", 84: "\u8155\u6642\u8a08", 85: "1", 86: "0", 87: "10", 88: "0",
  });
  assert.deepEqual(yupuriV3Fields(shipment()), fields);
  const bytes = yupuriV3Csv(shipment());
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(bytes.subarray(-2).toString("ascii"), "\r\n");
  assert.equal(bytes.includes(0x22), false);
  assert.equal(readCsv(bytes), `${fields.join(",")}\r\n`);
  assert.equal(readCsv(bytes).slice(0, -2).split(",").length, 100);
  assert.equal(bytes.includes(Buffer.from([0x98, 0x72])), true); // CP932 encoding of the generic watch item.
});

test("destination comes from the Shipment snapshot and both dates use YYYYMMDD", () => {
  const fields = yupuriV3Fields(shipment({
    destinationBuilding: "\u30d3\u30eb3F", destinationRecipientName: "\u5225\u306e\u5b9b\u5148",
    requestedDeliveryDate: new Date("2026-10-03T00:00:00.000Z"),
  }));
  assert.equal(fields[0], "SHP-42");
  assert.equal(fields[15], "\u6771\u4eac\u90fd\u4e2d\u592e\u533a\u7bc9\u57305-5-5\u30d3\u30eb3F");
  assert.equal(fields[17], "\u5225\u306e\u5b9b\u5148");
  assert.equal(fields[5], "20260925");
  assert.equal(fields[51], "20261003");
  assert.equal(fields[56], "\u8155\u6642\u8a08");
  assert.equal(fields[83], "\u8155\u6642\u8a08");
});

test("empty building is optional in the saved destination snapshot", () => {
  assert.equal(yupuriV3Fields(shipment({ destinationBuilding: "" }))[15], "東京都中央区築地5-5-5");
  assert.equal(yupuriV3Fields(shipment({ destinationBuilding: "  " }))[15], "東京都中央区築地5-5-5");
});

test("only explicit official delivery time labels and codes are supported", () => {
  const mappings: [string | null, string][] = [
    [null, "00"], ["", "00"], ["  ", "00"], ["00", "00"],
    ["指定なし", "00"], ["時間指定なし", "00"], ["希望なし", "00"],
    ["\u5348\u524d\u4e2d", "51"], ["12\uff5e14\u6642", "52"], ["14\uff5e16\u6642", "53"],
    ["16\uff5e18\u6642", "54"], ["18\uff5e20\u6642", "55"], ["19\uff5e21\u6642", "57"],
    ["12時～14時", "52"], ["14時～16時", "53"], ["16時～18時", "54"],
    ["18時～20時", "55"], ["19時～21時", "57"],
    ["51", "51"], ["52", "52"], ["53", "53"], ["54", "54"], ["55", "55"], ["57", "57"],
  ];
  for (const [input, expected] of mappings) {
    assert.equal(yupuriTimeCode(input), expected);
    assert.equal(yupuriV3Fields(shipment({ requestedDeliveryTimeSlot: input }))[52], expected);
  }
  for (const input of ["56", "12-14", "12\u301c14\u6642", "evening", "toString", "__proto__"])
    assert.throws(() => yupuriTimeCode(input), YupuriV3Error);
});

test("missing or malformed export data fails before serialization", () => {
  for (const overrides of [
    { plannedShipDate: null }, { destinationRecipientName: " " }, { destinationPostalCode: "123" },
    { destinationPrefecture: "" }, { destinationCity: "" }, { destinationStreet: "" },
    { destinationPhone: "bad" }, { direction: "INBOUND" as const },
    { destinationBuilding: "\0" },
    { requestedDeliveryDate: new Date("2026-10-03T12:00:00.000Z") },
  ]) assert.throws(() => yupuriV3Csv(shipment(overrides)), YupuriV3Error);
});

test("cancelled and already-shipped shipments fail with conflict", () => {
  for (const overrides of [
    { status: "CANCELLED" as const }, { status: "SHIPPED" as const },
    { status: "IN_TRANSIT" as const }, { status: "OUT_FOR_DELIVERY" as const },
    { status: "DELIVERED" as const }, { status: "EXCEPTION" as const },
    { actualShippedAt: new Date() },
  ]) assert.throws(() => yupuriV3Csv(shipment(overrides)),
    (error: unknown) => error instanceof YupuriV3Error && error.status === 409);
});

test("comma and quote enclose all 100 fields; CR and LF fail closed", () => {
  for (const value of ["A,B", 'A"B']) {
    const fields = yupuriV3Fields(shipment({ destinationRecipientName: value }));
    const csv = readCsv(yupuriV3Csv(shipment({ destinationRecipientName: value })));
    assert.equal(csv, fields.map(field => '"' + field.replace(/"/g, '""') + '"').join(",") + "\r\n");
    assert.equal(csv.startsWith('"SHP-42","","0",'), true);
  }
  for (const value of ["A\rB", "A\nB", "A\r\nB", "A\n", "\rA"])
    assert.throws(() => yupuriV3Csv(shipment({ destinationRecipientName: value })),
      (error: unknown) => error instanceof YupuriV3Error && error.status === 422);
});

test("Japanese values round-trip through CP932 and unsupported Unicode fails closed", () => {
  const csv = readCsv(yupuriV3Csv(shipment({ destinationRecipientName: "\u5c71\u7530\u592a\u90ce" })));
  assert.equal(csv.includes("\u5c71\u7530\u592a\u90ce"), true);
  assert.throws(() => yupuriV3Csv(shipment({ destinationRecipientName: "Person \u{1f642}" })), /CP932/);
});
