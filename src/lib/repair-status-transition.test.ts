import assert from "node:assert/strict";
import test from "node:test";
import {
    ESTIMATING_STATUS,
    getRepairStatusForSave,
    getRepairStatusTransition,
    RECEPTION_STATUS,
    SHIPPING_WAITING_STATUS,
} from "./repair-status-transition";

test("送付待ちから受付への保存は見積明細があっても受付のままにする", () => {
    assert.equal(
        getRepairStatusForSave(SHIPPING_WAITING_STATUS, RECEPTION_STATUS, true),
        RECEPTION_STATUS,
    );
});

test("受付の保存は見積明細があれば従来どおり見積中にする", () => {
    assert.equal(
        getRepairStatusForSave(RECEPTION_STATUS, RECEPTION_STATUS, true),
        ESTIMATING_STATUS,
    );
});

test("送付待ちから受付への保存は見積明細がなくても受付のままにする", () => {
    assert.equal(
        getRepairStatusForSave(SHIPPING_WAITING_STATUS, RECEPTION_STATUS, false),
        RECEPTION_STATUS,
    );
});

test("送付待ちから受付では受付日を設定する", () => {
    const transition = getRepairStatusTransition(SHIPPING_WAITING_STATUS, RECEPTION_STATUS);
    assert.ok(transition.receptionDate instanceof Date);
});

test("受付から送付待ちでは受付日を消去する", () => {
    const transition = getRepairStatusTransition(RECEPTION_STATUS, SHIPPING_WAITING_STATUS);
    assert.equal(transition.receptionDate, null);
});

test("見積中から受付では受付日を変更しない", () => {
    assert.deepEqual(getRepairStatusTransition("見積中", RECEPTION_STATUS), {});
});

test("作業中から受付では受付日を変更しない", () => {
    assert.deepEqual(getRepairStatusTransition("作業中", RECEPTION_STATUS), {});
});

test("送付待ちへの不正な遷移を拒否する", () => {
    assert.throws(
        () => getRepairStatusTransition("作業完了", SHIPPING_WAITING_STATUS),
        /受付の案件のみ/,
    );
});

test("送付待ちから受付以外への遷移を拒否する", () => {
    assert.throws(
        () => getRepairStatusTransition(SHIPPING_WAITING_STATUS, "見積中"),
        /受付のみ/,
    );
});
