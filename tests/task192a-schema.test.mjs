import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260928_add_scheduler_process_buffers/migration.sql", import.meta.url), "utf8");

test("Task192A process days are nullable and constrained without backfill", () => {
  const setting = schema.match(/model SchedulerSetting \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(setting);
  assert.match(migration, /ALTER TABLE public\."SchedulerSetting"/);
  for (const field of ["runningTestDays", "reworkBufferDays", "shippingBufferDays"]) {
    assert.match(setting, new RegExp(`\\b${field}\\s+Int\\?(?!\\s+@default)`));
    assert.match(migration, new RegExp(`ADD COLUMN "${field}" INTEGER(?=,|\\n)`));
    assert.match(migration, new RegExp(`CHECK \\(\\"${field}\\" IS NULL OR \\"${field}\\" >= 0\\)`));
  }
  assert.doesNotMatch(migration, /\b(?:UPDATE|INSERT|GRANT|REVOKE|ENABLE ROW LEVEL SECURITY)\b/i);
});
