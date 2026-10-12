ALTER TABLE public."Repair"
  ADD CONSTRAINT "Repair_id_repairIntakeInviteId_customerId_key" UNIQUE ("id", "repairIntakeInviteId", "customerId");

CREATE TYPE public."RepairIntakeDeliveryGroupKind" AS ENUM ('COMPLETED_AT_REQUEST', 'REMAINING', 'ALL');

CREATE TABLE public."RepairIntakeDeliveryPreference" (
  "id" TEXT NOT NULL,
  "repairIntakeInviteId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "kind" public."RepairIntakeDeliveryGroupKind" NOT NULL,
  "requestedDeliveryDate" DATE,
  "requestedDeliveryTimeSlot" TEXT NOT NULL,
  "respondedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairIntakeDeliveryPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RepairIntakeDeliveryPreference_repairIntakeInviteId_kind_key" UNIQUE ("repairIntakeInviteId", "kind"),
  CONSTRAINT "RepairIntakeDeliveryPreference_id_repairIntakeInviteId_customerId_key" UNIQUE ("id", "repairIntakeInviteId", "customerId"),
  CONSTRAINT "RepairIntakeDeliveryPreference_repairIntakeInviteId_fkey" FOREIGN KEY ("repairIntakeInviteId") REFERENCES public."RepairIntakeInvite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairIntakeDeliveryPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE public."RepairIntakeDeliveryPreferenceRepair" (
  "preferenceId" TEXT NOT NULL,
  "repairIntakeInviteId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  CONSTRAINT "RepairIntakeDeliveryPreferenceRepair_pkey" PRIMARY KEY ("preferenceId", "repairId"),
  CONSTRAINT "RepairIntakeDeliveryPreferenceRepair_repairId_key" UNIQUE ("repairId"),
  CONSTRAINT "RepairIntakeDeliveryPreferenceRepair_preference_fkey" FOREIGN KEY ("preferenceId", "repairIntakeInviteId", "customerId") REFERENCES public."RepairIntakeDeliveryPreference"("id", "repairIntakeInviteId", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairIntakeDeliveryPreferenceRepair_membership_fkey" FOREIGN KEY ("repairId", "repairIntakeInviteId", "customerId") REFERENCES public."Repair"("id", "repairIntakeInviteId", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE public."RepairIntakeDeliveryPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RepairIntakeDeliveryPreferenceRepair" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RepairIntakeDeliveryPreference", public."RepairIntakeDeliveryPreferenceRepair" FROM PUBLIC, anon, authenticated, service_role;
