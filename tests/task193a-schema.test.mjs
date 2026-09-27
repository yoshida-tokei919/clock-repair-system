import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migrationName = '20260928_z_add_repair_schedule_segment';
const migration = readFileSync(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), 'utf8');
const seed = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
const model = name => schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '';

test('migration follows Task192A in deployment order', () => {
  const names = readdirSync(new URL('../prisma/migrations/', import.meta.url)).sort();
  assert.ok(names.indexOf(migrationName) > names.indexOf('20260928_add_scheduler_process_buffers'));
});

test('Prisma defines one daily aggregate segment per repair and date', () => {
  assert.match(schema, /enum RepairScheduleSegmentSource \{\s*AUTO\s+MANUAL\s*\}/);
  const segment = model('RepairScheduleSegment');
  for (const field of [
    /id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/,
    /repairId\s+Int\b/,
    /workDate\s+DateTime\s+@db\.Date/,
    /plannedMinutes\s+Int\b/,
    /source\s+RepairScheduleSegmentSource\b/,
    /sortOrder\s+Int\s+@default\(0\)/,
    /createdAt\s+DateTime\s+@default\(now\(\)\)/,
    /updatedAt\s+DateTime\s+@updatedAt/,
    /repair\s+Repair\s+@relation\(fields: \[repairId\], references: \[id\], onDelete: Cascade\)/,
    /@@unique\(\[repairId, workDate\]\)/,
    /@@index\(\[workDate, sortOrder\]\)/,
  ]) {
    assert.match(segment, field);
  }
  assert.match(model('Repair'), /scheduleSegments\s+RepairScheduleSegment\[\]/);
});

test('migration enforces the daily key, positive minutes, ordering, and cascade', () => {
  assert.match(migration, /CREATE TYPE public\."RepairScheduleSegmentSource" AS ENUM \('AUTO', 'MANUAL'\);/);
  assert.match(migration, /CREATE TABLE public\."RepairScheduleSegment"\s*\(/);
  assert.match(migration, /"repairId" INTEGER NOT NULL/);
  assert.match(migration, /"workDate" DATE NOT NULL/);
  assert.match(migration, /"source" public\."RepairScheduleSegmentSource" NOT NULL/);
  assert.match(migration, /CONSTRAINT "RepairScheduleSegment_plannedMinutes_check" CHECK \("plannedMinutes" > 0\)/);
  assert.match(migration, /CONSTRAINT "RepairScheduleSegment_sortOrder_check" CHECK \("sortOrder" >= 0\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "RepairScheduleSegment_repairId_workDate_key"\s+ON public\."RepairScheduleSegment"\("repairId", "workDate"\);/);
  assert.match(migration, /CREATE INDEX "RepairScheduleSegment_workDate_sortOrder_idx"\s+ON public\."RepairScheduleSegment"\("workDate", "sortOrder"\);/);
  assert.match(migration, /CONSTRAINT "RepairScheduleSegment_repairId_fkey"\s+FOREIGN KEY \("repairId"\) REFERENCES public\."Repair"\("id"\)\s+ON DELETE CASCADE/);
});

test('migration is server-only and leaves production rows untouched', () => {
  assert.match(migration, /ALTER TABLE public\."RepairScheduleSegment" ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /REVOKE ALL ON TABLE public\."RepairScheduleSegment" FROM anon, authenticated, service_role;/);
  assert.match(migration, /REVOKE ALL ON SEQUENCE public\."RepairScheduleSegment_id_seq" FROM anon, authenticated, service_role;/);
  assert.doesNotMatch(migration, /^\s*(?:GRANT|INSERT|UPDATE|DELETE|CREATE POLICY)\b/im);
  assert.doesNotMatch(migration, /"scheduledDate"/);
  assert.doesNotMatch(seed, /repairScheduleSegment|scheduleSegments/i);
});
