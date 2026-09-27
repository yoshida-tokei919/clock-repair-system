-- Task191A: server-only procurement lead times and repair planning state.
CREATE TYPE public."RepairBlockReason" AS ENUM (
  'ADDITIONAL_PART_POSSIBLE',
  'REPAIR_METHOD_REVIEW',
  'WAITING_CUSTOMER',
  'WAITING_OUTSOURCE',
  'WAITING_PARTS',
  'OTHER'
);

CREATE TABLE public."SupplierLeadTimeSetting" (
  "supplierId" INTEGER NOT NULL,
  "manualProcessingLeadDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierLeadTimeSetting_pkey" PRIMARY KEY ("supplierId"),
  CONSTRAINT "SupplierLeadTimeSetting_manualProcessingLeadDays_check"
    CHECK ("manualProcessingLeadDays" IS NULL OR "manualProcessingLeadDays" >= 0)
);

CREATE TABLE public."ProcurementShippingMethod" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "carrierName" TEXT,
  "manualTransitLeadDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementShippingMethod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementShippingMethod_manualTransitLeadDays_check"
    CHECK ("manualTransitLeadDays" IS NULL OR "manualTransitLeadDays" >= 0)
);

CREATE TABLE public."RepairPlanningState" (
  "repairId" INTEGER NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "blockReason" public."RepairBlockReason",
  "blockReasonNote" TEXT,
  "remainingWorkMinutes" INTEGER,
  "resumeEligibleDate" DATE,
  "reviewDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairPlanningState_pkey" PRIMARY KEY ("repairId"),
  CONSTRAINT "RepairPlanningState_remainingWorkMinutes_check"
    CHECK ("remainingWorkMinutes" IS NULL OR "remainingWorkMinutes" >= 0),
  CONSTRAINT "RepairPlanningState_blockReasonNote_check"
    CHECK ("blockReasonNote" IS NULL OR ("blockReasonNote" <> '' AND "blockReasonNote" = btrim("blockReasonNote"))),
  CONSTRAINT "RepairPlanningState_blocked_reason_check"
    CHECK (("blocked" AND "blockReason" IS NOT NULL) OR (NOT "blocked" AND "blockReason" IS NULL))
);

CREATE UNIQUE INDEX "ProcurementShippingMethod_name_key"
  ON public."ProcurementShippingMethod"("name");

ALTER TABLE public."OrderRequest"
  ADD COLUMN "procurementShippingMethodId" INTEGER,
  ADD COLUMN "expectedArrivalDate" DATE;
CREATE INDEX "OrderRequest_procurementShippingMethodId_idx"
  ON public."OrderRequest"("procurementShippingMethodId");
CREATE INDEX "OrderRequest_expectedArrivalDate_idx"
  ON public."OrderRequest"("expectedArrivalDate");

ALTER TABLE public."SupplierLeadTimeSetting" ADD CONSTRAINT "SupplierLeadTimeSetting_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES public."Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."OrderRequest" ADD CONSTRAINT "OrderRequest_procurementShippingMethodId_fkey"
  FOREIGN KEY ("procurementShippingMethodId") REFERENCES public."ProcurementShippingMethod"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."RepairPlanningState" ADD CONSTRAINT "RepairPlanningState_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SupplierLeadTimeSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProcurementShippingMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RepairPlanningState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."SupplierLeadTimeSetting", public."ProcurementShippingMethod", public."RepairPlanningState"
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."ProcurementShippingMethod_id_seq"
  FROM anon, authenticated, service_role;
