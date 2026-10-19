-- Server-side Prisma tables only. No Supabase Data API GRANT is required or intended.
CREATE TABLE "EstimateOptionSet" (
    "id" SERIAL NOT NULL,
    "repairId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstimateOptionSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EstimateOptionSet_repairId_key" ON "EstimateOptionSet"("repairId");
ALTER TABLE "EstimateOptionSet" ADD CONSTRAINT "EstimateOptionSet_repairId_fkey"
    FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EstimateOptionChoice" (
    "id" SERIAL NOT NULL,
    "setId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateOptionChoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EstimateOptionChoice_kind_check" CHECK ("kind" IN ('PLAN', 'ADD_ON'))
);
CREATE INDEX "EstimateOptionChoice_setId_kind_sortOrder_idx" ON "EstimateOptionChoice"("setId", "kind", "sortOrder");
ALTER TABLE "EstimateOptionChoice" ADD CONSTRAINT "EstimateOptionChoice_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "EstimateOptionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EstimateOptionLine" (
    "id" SERIAL NOT NULL,
    "choiceId" INTEGER NOT NULL,
    "lineType" "RepairLineItemType" NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "displayNameSnapshot" TEXT,
    "notesForCustomerSnapshot" TEXT,
    "workTypeSnapshot" "RepairWorkType",
    "categoryNameSnapshot" TEXT,
    "actionNameSnapshot" TEXT,
    "targetPartNameSnapshot" TEXT,
    "detailLabelSnapshot" TEXT,
    "partsMasterId" INTEGER,
    "pricingRuleId" INTEGER,
    "repairWorkCategoryId" INTEGER,
    "repairWorkActionId" INTEGER,
    "targetPartNameId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateOptionLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EstimateOptionLine_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "EstimateOptionLine_unitPrice_check" CHECK ("unitPrice" >= 0)
);
CREATE INDEX "EstimateOptionLine_choiceId_sortOrder_idx" ON "EstimateOptionLine"("choiceId", "sortOrder");
ALTER TABLE "EstimateOptionLine" ADD CONSTRAINT "EstimateOptionLine_choiceId_fkey"
    FOREIGN KEY ("choiceId") REFERENCES "EstimateOptionChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma server connection only. Explicitly close Data API roles, including sequence use.
REVOKE ALL PRIVILEGES ON TABLE "EstimateOptionSet", "EstimateOptionChoice", "EstimateOptionLine"
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON SEQUENCE "EstimateOptionSet_id_seq", "EstimateOptionChoice_id_seq", "EstimateOptionLine_id_seq"
    FROM PUBLIC, anon, authenticated, service_role;
