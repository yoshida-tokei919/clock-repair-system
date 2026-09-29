-- Task196A: reusable physical tags and assignment history. No existing data is changed.
CREATE TYPE public."PhysicalTagStatus" AS ENUM ('ACTIVE', 'RETIRED');

CREATE TABLE public."PhysicalTag" (
  "id" SERIAL NOT NULL,
  "shortCode" TEXT NOT NULL,
  "nfcUid" TEXT,
  "qrToken" TEXT NOT NULL,
  "status" public."PhysicalTagStatus" NOT NULL DEFAULT 'ACTIVE',
  "retiredAt" TIMESTAMP(3),
  "retireReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhysicalTag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicalTag_status_retiredAt_check" CHECK (
    ("status" = 'ACTIVE' AND "retiredAt" IS NULL)
    OR ("status" = 'RETIRED' AND "retiredAt" IS NOT NULL)
  )
);

CREATE TABLE public."PhysicalTagAssignment" (
  "id" SERIAL NOT NULL,
  "physicalTagId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "assignReason" TEXT,
  "releaseReason" TEXT,
  "assignedBy" INTEGER,
  "releasedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhysicalTagAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicalTagAssignment_releasedAt_check" CHECK (
    "releasedAt" IS NULL OR "releasedAt" >= "assignedAt"
  )
);

CREATE UNIQUE INDEX "PhysicalTag_shortCode_key" ON public."PhysicalTag"("shortCode");
CREATE UNIQUE INDEX "PhysicalTag_nfcUid_key" ON public."PhysicalTag"("nfcUid");
CREATE UNIQUE INDEX "PhysicalTag_qrToken_key" ON public."PhysicalTag"("qrToken");

-- Prisma cannot model these partial unique indexes; released rows remain as history.
CREATE UNIQUE INDEX "PhysicalTagAssignment_single_active_tag_idx"
  ON public."PhysicalTagAssignment"("physicalTagId") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX "PhysicalTagAssignment_single_active_repair_idx"
  ON public."PhysicalTagAssignment"("repairId") WHERE "releasedAt" IS NULL;
CREATE INDEX "PhysicalTagAssignment_physicalTagId_assignedAt_idx"
  ON public."PhysicalTagAssignment"("physicalTagId", "assignedAt");
CREATE INDEX "PhysicalTagAssignment_repairId_assignedAt_idx"
  ON public."PhysicalTagAssignment"("repairId", "assignedAt");

-- Restrict deletion of either parent so past assignment links cannot be orphaned or lost.
ALTER TABLE public."PhysicalTagAssignment" ADD CONSTRAINT "PhysicalTagAssignment_physicalTagId_fkey"
  FOREIGN KEY ("physicalTagId") REFERENCES public."PhysicalTag"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."PhysicalTagAssignment" ADD CONSTRAINT "PhysicalTagAssignment_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access; no Data API grants or policies.
ALTER TABLE public."PhysicalTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PhysicalTagAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PhysicalTag", public."PhysicalTagAssignment"
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."PhysicalTag_id_seq", public."PhysicalTagAssignment_id_seq"
  FROM anon, authenticated, service_role;
