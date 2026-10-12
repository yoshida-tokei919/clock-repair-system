import assert from "node:assert/strict";
import test from "node:test";
import { publicShipmentViews } from "./customer-shipment-status";

const shipment = (overrides: Partial<any> = {}) => ({
  id: 7,
  direction: "OUTBOUND",
  status: "SHIPPED",
  carrierCode: "JAPAN_POST",
  trackingNumber: "123456789012",
  actualShippedAt: new Date("2026-10-13T00:00:00.000Z"),
  deliveredAt: null,
  ...overrides,
});

const repair = (inquiryNumber: string, value: any) => ({
  inquiryNumber,
  shipmentRepairs: [{ shipment: value }],
});

test("public shipment view maps Japan Post lifecycle labels", () => {
  const cases = [
    ["LABEL_ISSUED", "発送準備中"],
    ["AWAITING_ACCEPTANCE", "発送準備中"],
    ["SHIPPED", "発送済み"],
    ["IN_TRANSIT", "輸送中"],
    ["OUT_FOR_DELIVERY", "配達中"],
    ["DELIVERED", "配達完了"],
    ["EXCEPTION", "配送状況を確認中"],
  ] as const;
  for (const [status, label] of cases) {
    assert.equal(publicShipmentViews([repair("T-1", shipment({ status }))])[0]?.label, label);
  }
});

test("same Shipment linked to multiple visible Repairs is shown once", () => {
  const shared = shipment();
  assert.deepEqual(publicShipmentViews([repair("T-1", shared), repair("T-2", shared)]), [{
    id: 7,
    label: "発送済み",
    detail: "郵便局で引受が完了しました。",
    trackingNumber: "123456789012",
    actualShippedAt: shared.actualShippedAt,
    deliveredAt: null,
    inquiryNumbers: ["T-1", "T-2"],
  }]);
});

test("draft, ready, cancelled, inbound and non-Japan-Post shipments stay private", () => {
  const hidden = [
    shipment({ status: "DRAFT" }),
    shipment({ status: "READY" }),
    shipment({ status: "CANCELLED" }),
    shipment({ direction: "INBOUND" }),
    shipment({ carrierCode: "YAMATO" }),
  ];
  assert.deepEqual(publicShipmentViews(hidden.map((value, index) => repair(`T-${index}`, value))), []);
});

test("invalid tracking number is not exposed", () => {
  const view = publicShipmentViews([repair("T-1", shipment({ trackingNumber: "invalid" }))])[0];
  assert.equal(view.trackingNumber, null);
});
