-- Task203D: explicit customer delivery preference captured per Repair.
-- Server-only persistence; no existing data is changed.
CREATE TABLE public."RepairDeliveryPreference" (
  "repairId" INTEGER NOT NULL,
  "requestedDeliveryDate" DATE,
  "requestedDeliveryTimeSlot" TEXT NOT NULL,
  "respondedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairDeliveryPreference_pkey" PRIMARY KEY ("repairId")
);

ALTER TABLE public."RepairDeliveryPreference"
  ADD CONSTRAINT "RepairDeliveryPreference_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access; no Data API grants or policies.
ALTER TABLE public."RepairDeliveryPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RepairDeliveryPreference"
  FROM PUBLIC, anon, authenticated, service_role;
