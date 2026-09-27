import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migrationName = '20260927_z_order_lead_time_blocking_foundation';
const migration = readFileSync(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), 'utf8');
const seed = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
const model = name => schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '';

test('migration follows the existing scheduler foundation', () => {
  const names = readdirSync(new URL('../prisma/migrations/', import.meta.url)).sort();
  assert.ok(names.indexOf(migrationName) > names.indexOf('20260927_add_work_time_standard_settings'));
});

test('Prisma keeps supplier, shipping, and repair planning separate', () => {
  assert.match(model('SupplierLeadTimeSetting'), /supplierId\s+Int\s+@id/);
  assert.match(model('SupplierLeadTimeSetting'), /manualProcessingLeadDays\s+Int\?/);
  assert.match(model('ProcurementShippingMethod'), /name\s+String\s+@unique/);
  assert.match(model('ProcurementShippingMethod'), /manualTransitLeadDays\s+Int\?/);
  assert.match(model('RepairPlanningState'), /repairId\s+Int\s+@id/);
  assert.match(model('RepairPlanningState'), /remainingWorkMinutes\s+Int\?/);
  assert.match(model('RepairPlanningState'), /resumeEligibleDate\s+DateTime\?\s+@db\.Date/);
  assert.match(model('RepairPlanningState'), /reviewDate\s+DateTime\?\s+@db\.Date/);
  for (const reason of ['ADDITIONAL_PART_POSSIBLE', 'REPAIR_METHOD_REVIEW', 'WAITING_CUSTOMER', 'WAITING_OUTSOURCE', 'WAITING_PARTS', 'OTHER']) {
    assert.match(schema, new RegExp(`enum RepairBlockReason \\{[\\s\\S]*?\\b${reason}\\b`));
    assert.ok(migration.includes(`'${reason}'`));
  }
  assert.match(model('OrderRequest'), /procurementShippingMethodId\s+Int\?/);
  assert.match(model('OrderRequest'), /expectedArrivalDate\s+DateTime\?\s+@db\.Date/);
  assert.match(model('OrderRequest'), /@@index\(\[procurementShippingMethodId\]\)/);
  assert.match(model('OrderRequest'), /@@index\(\[expectedArrivalDate\]\)/);
  assert.doesNotMatch(model('OrderRequest'), /actualArrivalDate/);
  assert.doesNotMatch(model('Repair'), /partsReadyDate/);
});

test('migration enforces nullability, checks, relations, and indexes', () => {
  for (const [table, field] of [
    ['SupplierLeadTimeSetting', 'manualProcessingLeadDays'],
    ['ProcurementShippingMethod', 'manualTransitLeadDays'],
    ['RepairPlanningState', 'remainingWorkMinutes'],
  ]) {
    assert.match(migration, new RegExp(`"${table}_${field}_check"[\\s\\S]*?"${field}" IS NULL OR "${field}" >= 0`));
  }
  assert.match(migration, /"RepairPlanningState_blockReasonNote_check"[\s\S]*?btrim\("blockReasonNote"\)/);
  assert.match(migration, /"RepairPlanningState_blocked_reason_check"[\s\S]*?"blocked" AND "blockReason" IS NOT NULL[\s\S]*?NOT "blocked" AND "blockReason" IS NULL/);
  assert.match(migration, /"expectedArrivalDate" DATE/);
  assert.match(migration, /"resumeEligibleDate" DATE/);
  assert.match(migration, /"reviewDate" DATE/);
  for (const fk of ['SupplierLeadTimeSetting_supplierId_fkey', 'OrderRequest_procurementShippingMethodId_fkey', 'RepairPlanningState_repairId_fkey']) {
    assert.ok(migration.includes(`CONSTRAINT "${fk}"`));
  }
  assert.match(migration, /"OrderRequest_procurementShippingMethodId_fkey"[\s\S]*?ON DELETE SET NULL/);
  for (const index of ['ProcurementShippingMethod_name_key', 'OrderRequest_procurementShippingMethodId_idx', 'OrderRequest_expectedArrivalDate_idx']) {
    assert.ok(migration.includes(`INDEX "${index}"`));
  }
  assert.ok(migration.indexOf('ADD COLUMN "expectedArrivalDate" DATE') < migration.indexOf('CREATE INDEX "OrderRequest_expectedArrivalDate_idx"'));
});

test('new tables are server-only, and no shipping rows are seeded', () => {
  for (const table of ['SupplierLeadTimeSetting', 'ProcurementShippingMethod', 'RepairPlanningState']) {
    assert.ok(migration.includes(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`));
  }
  assert.match(migration, /REVOKE ALL ON TABLE public\."SupplierLeadTimeSetting", public\."ProcurementShippingMethod", public\."RepairPlanningState"\s+FROM anon, authenticated, service_role;/);
  assert.match(migration, /REVOKE ALL ON SEQUENCE public\."ProcurementShippingMethod_id_seq"\s+FROM anon, authenticated, service_role;/);
  assert.doesNotMatch(migration, /\bGRANT\b|CREATE POLICY|INSERT INTO/);
  assert.doesNotMatch(seed, /procurementShippingMethod|supplierLeadTimeSetting|repairPlanningState/i);
  assert.doesNotMatch(migration, /Cousins|DHL|INSERT INTO/);
});
