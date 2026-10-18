import assert from "node:assert/strict";
import test from "node:test";
import { TimepieceType } from "@prisma/client";
import { formatWatchRef, formatWarrantyIdentifiers, formatWatchHeading, formatWatchInformation, parseTimepieceType, timepieceTypeInputValue, timepieceTypeUpdateForCreateReuse, TIMEPIECE_TYPE_CHOICES } from "./timepiece-type";

test("operator dropdown has exactly the approved four choices", () => {
  assert.deepEqual(TIMEPIECE_TYPE_CHOICES, ["掛時計", "置時計", "懐中時計", "ホールクロック"]);
});

test("operator type choices map to the existing enum", () => {
  for (const [input, expected] of [
    ["", TimepieceType.WRISTWATCH],
    ["掛時計", TimepieceType.WALL_CLOCK],
    ["置時計", TimepieceType.TABLE_CLOCK],
    ["懐中時計", TimepieceType.POCKET_WATCH],
  ] as const) {
    assert.deepEqual(parseTimepieceType(input), { timepieceType: expected, timepieceTypeLabel: null });
  }
});

test("hall clock and arbitrary labels round trip after trimming", () => {
  for (const [input, label] of [["ホールクロック", "ホールクロック"], [" 特殊なクロック ", "特殊なクロック"]]) {
    const parsed = parseTimepieceType(input);
    assert.deepEqual(parsed, { timepieceType: TimepieceType.OTHER, timepieceTypeLabel: label });
    assert.equal(timepieceTypeInputValue(parsed), label);
  }
  assert.deepEqual(parseTimepieceType("  ホールクロック  "), { timepieceType: TimepieceType.OTHER, timepieceTypeLabel: "ホールクロック" });
  assert.deepEqual(parseTimepieceType("   "), { timepieceType: TimepieceType.WRISTWATCH, timepieceTypeLabel: null });
  assert.deepEqual(parseTimepieceType(`  ${"x".repeat(100)}  `), { timepieceType: TimepieceType.OTHER, timepieceTypeLabel: "x".repeat(100) });
  assert.throws(() => parseTimepieceType("x".repeat(101)), /100文字以内/);
  assert.throws(() => parseTimepieceType(123), /形式/);
  assert.equal(timepieceTypeInputValue({ timepieceType: TimepieceType.OTHER }), "その他の時計");
});

test("blank create input preserves reused Watch classification; explicit input updates it", () => {
  assert.deepEqual(timepieceTypeUpdateForCreateReuse(undefined), {});
  assert.deepEqual(timepieceTypeUpdateForCreateReuse("  "), {});
  assert.deepEqual(timepieceTypeUpdateForCreateReuse(" ホールクロック "), { timepieceType: TimepieceType.OTHER, timepieceTypeLabel: "ホールクロック" });
  assert.deepEqual(parseTimepieceType("  "), { timepieceType: TimepieceType.WRISTWATCH, timepieceTypeLabel: null });
});

test("estimate formats brand and model on separate lines with Ref and Ser", () => {
  const watch = { brand: "SEIKO", model: "A", ref: "R1", serial: "S1", timepieceType: TimepieceType.WALL_CLOCK };
  assert.equal(formatWatchInformation(watch, "estimate"), "掛時計 / SEIKO\nA\nRef: R1\nSer: S1");
  assert.equal(formatWatchInformation({ ...watch, timepieceType: TimepieceType.WRISTWATCH, ref: "", serial: "" }, "estimate"), "SEIKO\nA");
});

test("delivery keeps Ref and Ser on one line, omitting missing values", () => {
  const watch = { brand: "SEIKO", model: "A", ref: "R1", serial: "S1", timepieceType: TimepieceType.TABLE_CLOCK };
  assert.equal(formatWatchInformation(watch, "delivery"), "置時計 / SEIKO A\nRef: R1 / Ser: S1");
  assert.equal(formatWatchInformation({ ...watch, ref: "" }, "delivery"), "置時計 / SEIKO A\nSer: S1");
  assert.equal(formatWatchInformation({ ...watch, ref: "", serial: "" }, "delivery"), "置時計 / SEIKO A");
});

test("B2C invoice retains Ref and Serial labels and warranty heading uses the type prefix", () => {
  const watch = { brand: "SEIKO", model: "A", ref: "R1", serial: "S1", timepieceType: TimepieceType.OTHER, timepieceTypeLabel: "ホールクロック" };
  assert.equal(formatWatchInformation(watch, "invoice"), "ホールクロック / SEIKO A\nRef: R1\nSerial: S1");
  assert.equal(formatWatchInformation({ ...watch, timepieceType: TimepieceType.WRISTWATCH, ref: "", serial: "" }, "invoice"), "SEIKO A");
  assert.equal(formatWatchHeading(watch), "ホールクロック / SEIKO A");
  assert.equal(formatWarrantyIdentifiers(watch), "R1 / S1");
  assert.equal(formatWarrantyIdentifiers({ ref: "", serial: "S1" }), "S1");
  assert.equal(formatWarrantyIdentifiers({}), "");
});

test("printed Ref joins model then case with one space, including legacy model-only data", () => {
  for (const [watch, expected] of [
    [{ ref: " R1 ", caseRef: " C1 " }, "R1 C1"],
    [{ ref: " R1 " }, "R1"],
    [{ ref: "  ", caseRef: " C1 " }, "C1"],
    [{ ref: "", caseRef: " " }, ""],
    [{ ref: "R1" }, "R1"],
  ] as const) {
    assert.equal(formatWatchRef(watch), expected);
    const base = { brand: "SEIKO", model: "A", serial: "S1", ...watch };
    assert.equal(formatWatchInformation(base, "estimate"), `SEIKO\nA${expected ? `\nRef: ${expected}` : ""}\nSer: S1`);
    assert.equal(formatWatchInformation(base, "delivery"), `SEIKO A\n${expected ? `Ref: ${expected} / ` : ""}Ser: S1`);
    assert.equal(formatWatchInformation(base, "invoice"), `SEIKO A${expected ? `\nRef: ${expected}` : ""}\nSerial: S1`);
    assert.equal(formatWarrantyIdentifiers(base), `${expected ? `${expected} / ` : ""}S1`);
  }
  assert.equal(formatWarrantyIdentifiers({ ref: " ", caseRef: " " }), "");
});
