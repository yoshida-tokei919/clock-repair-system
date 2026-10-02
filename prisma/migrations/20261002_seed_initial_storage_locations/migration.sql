-- Task198C: insert the initial physical zones without changing existing locations.
DO $$
DECLARE
  zone_name text;
  zone_code text;
  zone_sort_order integer;
  existing public."StorageLocation"%ROWTYPE;
BEGIN
  -- Keep validation and inserts isolated from concurrent location writes.
  LOCK TABLE public."StorageLocation" IN SHARE ROW EXCLUSIVE MODE;

  FOR zone_name, zone_code, zone_sort_order IN
    VALUES
      ('受付処理待ち', 'LOC-000001', 10),
      ('見積り待ち', 'LOC-000002', 20),
      ('見積り調査中', 'LOC-000003', 30),
      ('承認待ち', 'LOC-000004', 40),
      ('部品待ち', 'LOC-000005', 50),
      ('作業待ち', 'LOC-000006', 60),
      ('ランニングテスト中', 'LOC-000007', 70),
      ('発送・引渡し待ち', 'LOC-000008', 80),
      ('要確認', 'LOC-000009', 90)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public."StorageLocation"
      WHERE "name" = zone_name
        AND "shortCode" IS DISTINCT FROM zone_code
    ) THEN
      RAISE EXCEPTION 'Task198C StorageLocation name conflict: % must use shortCode %',
        zone_name, zone_code;
    END IF;

    SELECT * INTO existing
    FROM public."StorageLocation"
    WHERE "shortCode" = zone_code;

    IF FOUND THEN
      IF existing."name" IS DISTINCT FROM zone_name
        OR existing."locationType" IS DISTINCT FROM 'ZONE'::public."StorageLocationType"
        OR existing."parentId" IS NOT NULL
        OR existing."isActive" IS DISTINCT FROM true
        OR existing."sortOrder" IS DISTINCT FROM zone_sort_order
      THEN
        RAISE EXCEPTION 'Task198C StorageLocation definition conflict: shortCode % must match canonical zone %',
          zone_code, zone_name;
      END IF;
    ELSE
      INSERT INTO public."StorageLocation"
        ("name", "locationType", "parentId", "shortCode", "nfcUid", "qrToken", "isActive", "sortOrder", "createdAt", "updatedAt")
      VALUES
        (zone_name, 'ZONE', NULL, zone_code, NULL, NULL, true, zone_sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;
