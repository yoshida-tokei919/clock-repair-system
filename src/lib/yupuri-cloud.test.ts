import assert from "node:assert/strict";
import test from "node:test";
import {
  YUPURI_CLOUD_HEADERS,
  YupuriCloudError,
  type YupuriCloudShipment,
  yupuriCloudCsv,
  yupuriCloudFields,
  yupuriCloudTimeCode,
} from "./yupuri-cloud";

const NOW = new Date("2030-01-01T00:00:00.000Z");

function shipment(overrides: Partial<YupuriCloudShipment> = {}): YupuriCloudShipment {
  return {
    id: 42,
    direction: "OUTBOUND",
    status: "DRAFT",
    actualShippedAt: null,
    plannedShipDate: new Date("2030-01-02T00:00:00.000Z"),
    requestedDeliveryDate: null,
    requestedDeliveryTimeSlot: null,
    destinationRecipientName: "テスト太郎",
    destinationPostalCode: "1040045",
    destinationPrefecture: "東京都",
    destinationCity: "中央区",
    destinationStreet: "築地5-5-5",
    destinationBuilding: null,
    destinationPhone: "03-8888-8888",
    ...overrides,
  };
}

test("cloud CSV uses exact 17-column header, UTF-8 BOM, CRLF, and fixed values", () => {
  assert.deepEqual(YUPURI_CLOUD_HEADERS, [
    "送り状種別",
    "荷物商品名",
    "個口数",
    "お客さま管理番号（受注番号等）",
    "品名1",
    "サイズ",
    "お届け先郵便番号",
    "お届け先住所1",
    "お届け先氏名1",
    "お届け先電話番号",
    "ご依頼主郵便番号",
    "ご依頼主住所1",
    "ご依頼主氏名1",
    "ご依頼主電話番号",
    "発送予定日",
    "配達希望日",
    "配達希望時間帯",
  ]);

  const fields = yupuriCloudFields(shipment(), NOW);
  assert.equal(fields.length, 17);
  assert.deepEqual(fields, [
    "0",
    "101",
    "1",
    "SHP-42",
    "腕時計",
    "060",
    "1040045",
    "東京都中央区築地5-5-5",
    "テスト太郎",
    "03-8888-8888",
    "6511213",
    "神戸市北区広陵町1-162-1-401",
    "ヨシダ時計修理工房",
    "090-2041-8275",
    "20300102",
    "",
    "",
  ]);

  const bytes = yupuriCloudCsv(shipment(), NOW);
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), true);
  const text = bytes.subarray(3).toString("utf8");
  assert.equal(text.endsWith("\r\n"), true);
  assert.equal(text.includes("\n") && !text.includes("\r\n"), false);
  const lines = text.split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], YUPURI_CLOUD_HEADERS.join(","));
  assert.equal(lines[1], fields.join(","));
  assert.equal(lines[2], "");
});

test("shipment destination snapshot is the only recipient source", () => {
  const fields = yupuriCloudFields(shipment({
    destinationRecipientName: "別の宛先",
    destinationPrefecture: "兵庫県",
    destinationCity: "神戸市北区",
    destinationStreet: "広陵町9-9",
    destinationBuilding: "テスト館2F",
    destinationPostalCode: "6511213",
    destinationPhone: "078-555-1234",
  }), NOW);

  assert.equal(fields[6], "6511213");
  assert.equal(fields[7], "兵庫県神戸市北区広陵町9-9テスト館2F");
  assert.equal(fields[8], "別の宛先");
  assert.equal(fields[9], "078-555-1234");
});

test("delivery date and every supported time slot map to Cloud codes", () => {
  const mappings: Array<[string, string]> = [
    ["指定なし", "00"],
    ["午前中", "51"],
    ["12時～14時", "52"],
    ["14時～16時", "53"],
    ["16時～18時", "54"],
    ["18時～20時", "55"],
    ["19時～21時", "57"],
    ["00", "00"],
    ["51", "51"],
    ["52", "52"],
    ["53", "53"],
    ["54", "54"],
    ["55", "55"],
    ["57", "57"],
  ];

  for (const [input, expected] of mappings) {
    assert.equal(yupuriCloudTimeCode(input), expected);
    const fields = yupuriCloudFields(shipment({ requestedDeliveryTimeSlot: input }), NOW);
    assert.equal(fields[15], "");
    assert.equal(fields[16], expected);
  }

  const withDate = yupuriCloudFields(shipment({
    requestedDeliveryDate: new Date("2030-01-05T00:00:00.000Z"),
    requestedDeliveryTimeSlot: "12時～14時",
  }), NOW);
  assert.equal(withDate[15], "20300105");
  assert.equal(withDate[16], "52");
});

test("unanswered preference stays blank while an explicit no-time preference is 00", () => {
  const unanswered = yupuriCloudFields(shipment({
    requestedDeliveryDate: null,
    requestedDeliveryTimeSlot: null,
  }), NOW);
  assert.equal(unanswered[15], "");
  assert.equal(unanswered[16], "");

  const explicitNone = yupuriCloudFields(shipment({
    requestedDeliveryDate: null,
    requestedDeliveryTimeSlot: "指定なし",
  }), NOW);
  assert.equal(explicitNone[15], "");
  assert.equal(explicitNone[16], "00");

  const dateOnly = yupuriCloudFields(shipment({
    requestedDeliveryDate: new Date("2030-01-05T00:00:00.000Z"),
    requestedDeliveryTimeSlot: null,
  }), NOW);
  assert.equal(dateOnly[15], "20300105");
  assert.equal(dateOnly[16], "00");
});

test("CSV serializer quotes comma and quote according to CSV rules", () => {
  const bytes = yupuriCloudCsv(shipment({ destinationRecipientName: 'A,B "C"' }), NOW);
  const text = bytes.subarray(3).toString("utf8");
  const row = text.split("\r\n")[1];
  assert.equal(row.includes('"A,B ""C"""'), true);
  assert.equal(row.split(",").length > 17, true); // raw split proves quoting is needed rather than field loss.
});

test("invalid shipment state fails closed", () => {
  for (const overrides of [
    { direction: "INBOUND" as const },
    { status: "CANCELLED" as const },
    { status: "SHIPPED" as const },
    { status: "IN_TRANSIT" as const },
    { status: "OUT_FOR_DELIVERY" as const },
    { status: "DELIVERED" as const },
    { status: "EXCEPTION" as const },
    { actualShippedAt: new Date("2030-01-02T12:00:00.000Z") },
  ]) {
    assert.throws(
      () => yupuriCloudCsv(shipment(overrides), NOW),
      (error: unknown) => error instanceof YupuriCloudError && error.status === 409,
    );
  }
});

test("required data, official length limits, record breaks, and obvious unsupported characters fail closed", () => {
  const tooLongAddress = "東".repeat(76);
  const tooLongName = "山".repeat(51);
  for (const overrides of [
    { id: 0 },
    { plannedShipDate: null },
    { plannedShipDate: new Date("2029-12-31T00:00:00.000Z") },
    { destinationRecipientName: " " },
    { destinationRecipientName: tooLongName },
    { destinationRecipientName: "Person 🙂" },
    { destinationPostalCode: "123" },
    { destinationPrefecture: "" },
    { destinationCity: "" },
    { destinationStreet: "" },
    { destinationPrefecture: tooLongAddress, destinationCity: "a", destinationStreet: "b" },
    { destinationPhone: "13-8888-8888" },
    { destinationPhone: "03-888-888" },
    { destinationBuilding: "A\nB" },
    { destinationRecipientName: "A\rB" },
    { requestedDeliveryDate: new Date("2030-01-05T12:00:00.000Z") },
    { requestedDeliveryTimeSlot: "evening" },
  ]) {
    assert.throws(() => yupuriCloudCsv(shipment(overrides), NOW), YupuriCloudError);
  }
});
