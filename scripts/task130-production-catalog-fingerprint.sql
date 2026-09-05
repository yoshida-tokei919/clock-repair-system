-- Task130 production catalog fingerprint (read-only).
-- Run with psql and a read-only production connection:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/task130-production-catalog-fingerprint.sql
-- No DDL or DML is present in this file.
WITH objects AS (
  SELECT 'table:' || tablename AS value
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
  UNION ALL
  SELECT 'column:' || table_name || ':' || ordinal_position || ':' || column_name || ':' || data_type || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, '')
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
  UNION ALL
  SELECT 'constraint:' || conrelid::regclass::text || ':' || conname || ':' || pg_catalog.pg_get_constraintdef(oid, true)
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'index:' || schemaname || ':' || tablename || ':' || indexname || ':' || indexdef
  FROM pg_catalog.pg_indexes AS i
  WHERE i.schemaname = 'public'
  UNION ALL
  SELECT 'enum:' || t.typname || ':' || e.enumsortorder || ':' || e.enumlabel
  FROM pg_catalog.pg_type AS t
  JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
  JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
)
SELECT count(*)::integer AS object_count,
       md5(string_agg(value, chr(10) ORDER BY value)) AS md5
FROM objects;
