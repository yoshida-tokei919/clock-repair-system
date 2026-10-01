-- Task198A: physical storage locations and Repair location history. No existing data is changed.
CREATE TYPE public."StorageLocationType" AS ENUM ('ZONE', 'SHELF', 'BOX', 'TRAY', 'OTHER');

CREATE TABLE public."StorageLocation" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "locationType" public."StorageLocationType" NOT NULL DEFAULT 'ZONE',
  "parentId" INTEGER,
  "shortCode" TEXT,
  "nfcUid" TEXT,
  "qrToken" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorageLocation_parentId_check" CHECK (
    "parentId" IS NULL OR "parentId" <> "id"
  )
);

CREATE TABLE public."StorageLocationAssignment" (
  "id" SERIAL NOT NULL,
  "storageLocationId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "assignReason" TEXT,
  "releaseReason" TEXT,
  "assignedBy" INTEGER,
  "releasedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageLocationAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorageLocationAssignment_releasedAt_check" CHECK (
    "releasedAt" IS NULL OR "releasedAt" >= "assignedAt"
  )
);

CREATE UNIQUE INDEX "StorageLocation_shortCode_key" ON public."StorageLocation"("shortCode");
CREATE UNIQUE INDEX "StorageLocation_nfcUid_key" ON public."StorageLocation"("nfcUid");
CREATE UNIQUE INDEX "StorageLocation_qrToken_key" ON public."StorageLocation"("qrToken");
CREATE INDEX "StorageLocation_parentId_idx" ON public."StorageLocation"("parentId");
CREATE INDEX "StorageLocation_locationType_isActive_sortOrder_idx"
  ON public."StorageLocation"("locationType", "isActive", "sortOrder");

-- Prisma cannot model this partial unique index; released rows remain as history.
-- Multiple Repairs may be active in the same location.
CREATE UNIQUE INDEX "StorageLocationAssignment_single_active_repair_idx"
  ON public."StorageLocationAssignment"("repairId") WHERE "releasedAt" IS NULL;
CREATE INDEX "StorageLocationAssignment_storageLocationId_assignedAt_idx"
  ON public."StorageLocationAssignment"("storageLocationId", "assignedAt");
CREATE INDEX "StorageLocationAssignment_repairId_assignedAt_idx"
  ON public."StorageLocationAssignment"("repairId", "assignedAt");

ALTER TABLE public."StorageLocation" ADD CONSTRAINT "StorageLocation_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES public."StorageLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."StorageLocationAssignment" ADD CONSTRAINT "StorageLocationAssignment_storageLocationId_fkey"
  FOREIGN KEY ("storageLocationId") REFERENCES public."StorageLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."StorageLocationAssignment" ADD CONSTRAINT "StorageLocationAssignment_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access; no Data API grants or policies.
ALTER TABLE public."StorageLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StorageLocationAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."StorageLocation", public."StorageLocationAssignment"
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."StorageLocation_id_seq", public."StorageLocationAssignment_id_seq"
  FROM anon, authenticated, service_role;
