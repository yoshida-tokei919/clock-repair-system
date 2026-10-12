CREATE TYPE public."RepairIntakeShippingChoice" AS ENUM ('SHIP_COMPLETED', 'WAIT_ALL');

ALTER TABLE public."Repair"
  ADD CONSTRAINT "Repair_id_repairIntakeInviteId_key" UNIQUE ("id", "repairIntakeInviteId");

CREATE TABLE public."RepairIntakeShippingDecision" (
  "repairIntakeInviteId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "requestOutboxId" INTEGER NOT NULL,
  "choice" public."RepairIntakeShippingChoice",
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairIntakeShippingDecision_pkey" PRIMARY KEY ("repairIntakeInviteId"),
  CONSTRAINT "RepairIntakeShippingDecision_requestOutboxId_key" UNIQUE ("requestOutboxId"),
  CONSTRAINT "RepairIntakeShippingDecision_repairIntakeInviteId_fkey" FOREIGN KEY ("repairIntakeInviteId") REFERENCES public."RepairIntakeInvite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairIntakeShippingDecision_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairIntakeShippingDecision_requestOutboxId_fkey" FOREIGN KEY ("requestOutboxId") REFERENCES public."LineManagerSendOutbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE public."RepairIntakeShippingDecisionRepair" (
  "repairIntakeInviteId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "completedAtRequest" BOOLEAN NOT NULL,
  CONSTRAINT "RepairIntakeShippingDecisionRepair_pkey" PRIMARY KEY ("repairIntakeInviteId", "repairId"),
  CONSTRAINT "RepairIntakeShippingDecisionRepair_repairId_key" UNIQUE ("repairId"),
  CONSTRAINT "RepairIntakeShippingDecisionRepair_repairIntakeInviteId_fkey" FOREIGN KEY ("repairIntakeInviteId") REFERENCES public."RepairIntakeShippingDecision"("repairIntakeInviteId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairIntakeDecisionRepair_membership_fkey" FOREIGN KEY ("repairId", "repairIntakeInviteId") REFERENCES public."Repair"("id", "repairIntakeInviteId") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE public."RepairIntakeShippingDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RepairIntakeShippingDecisionRepair" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RepairIntakeShippingDecision", public."RepairIntakeShippingDecisionRepair" FROM PUBLIC, anon, authenticated, service_role;
