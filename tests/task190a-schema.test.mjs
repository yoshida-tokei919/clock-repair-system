import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20260927_add_work_time_standard_settings/migration.sql', import.meta.url), 'utf8');

test('scheduler migration replays after WorkTimeActivityType creation', () => {
  const names = readdirSync(new URL('../prisma/migrations/', import.meta.url)).sort();
  assert.ok(names.indexOf('20260927_add_work_time_standard_settings') > names.indexOf('20260927_add_work_time_session'));
});

test('scheduler defaults and seeded rows agree with the schema', () => {
  for (const [field, value] of Object.entries({
    standardDailyMinutes: 480,
    dailyScheduleReviewMinutes: 30,
    repairLearningMinimumSamples: 3,
    repairFullSampleThreshold: 10,
    repairLookbackMonths: 6,
  })) {
    assert.match(schema, new RegExp(`${field}\\s+Int\\s+@default\\(${value}\\)`));
    assert.match(migration, new RegExp(`"${field}" INTEGER NOT NULL DEFAULT ${value}`));
  }
  assert.match(migration, /INSERT INTO public\."SchedulerSetting" \("id", "updatedAt"\) VALUES \(1, CURRENT_TIMESTAMP\)/);
  const rows = [...migration.matchAll(/^  \('(ESTIMATE|INTAKE|INQUIRY|CUSTOMER_CONTACT|PARTS_ORDER|SHIPPING|ADMIN|OTHER)'/gm)];
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map((match) => match[1])).size, 8);
  assert.match(migration, /\('ESTIMATE', 20, 0, 'MANUAL', 'MEAN', 3, 6, 100,/);
  assert.match(migration, /\('INQUIRY', NULL, 60,/);
});

test('database prevents duplicate or cross-type repair standards', () => {
  assert.match(schema, /@@unique\(\[id, repairType\]\)/);
  assert.match(migration, /FOREIGN KEY \("categoryId", "repairType"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "RepairWorkTimeStandard_condition_key"\s+ON public\."RepairWorkTimeStandard"\s*\(\s*"repairType", "categoryId", "targetPartNameId",\s*"actionId", "detailLabel", "driveType"\s*\) NULLS NOT DISTINCT;/);
  assert.doesNotMatch(migration, /coalesce\("targetPartNameId"|coalesce\("actionId"/);
  assert.doesNotMatch(migration, /\bCASE\b/i);
  assert.match(migration, /"RepairWorkTimeStandard_minutes_check" CHECK \("standardMinutes" > 0\)/);
  assert.match(migration, /"RepairWorkTimeStandard_drive_check"/);
});

test('all new tables remain server-only', () => {
  for (const table of ['SchedulerSetting', 'SchedulerActivitySetting', 'RepairWorkTimeStandard']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY`));
  }
  for (const object of [
    'TABLE public."SchedulerSetting", public."SchedulerActivitySetting", public."RepairWorkTimeStandard"',
    'SEQUENCE public."RepairWorkTimeStandard_id_seq"',
  ]) {
    assert.ok(migration.includes(`REVOKE ALL ON ${object}\n  FROM anon, authenticated, service_role;`));
  }
  assert.doesNotMatch(migration, /FROM PUBLIC/);
  assert.doesNotMatch(migration, /REVOKE ALL ON TYPE/);
});
