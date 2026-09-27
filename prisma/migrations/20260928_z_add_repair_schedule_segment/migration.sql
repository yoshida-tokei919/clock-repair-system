-- Task193A: server-only daily aggregate schedule segments. No existing schedules are backfilled.
CREATE TYPE public."RepairScheduleSegmentSource" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE public."RepairScheduleSegment" (
  "id" SERIAL NOT NULL,
  "repairId" INTEGER NOT NULL,
  "workDate" DATE NOT NULL,
  "plannedMinutes" INTEGER NOT NULL,
  "source" public."RepairScheduleSegmentSource" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairScheduleSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RepairScheduleSegment_plannedMinutes_check" CHECK ("plannedMinutes" > 0),
  CONSTRAINT "RepairScheduleSegment_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "RepairScheduleSegment_repairId_workDate_key"
  ON public."RepairScheduleSegment"("repairId", "workDate");
CREATE INDEX "RepairScheduleSegment_workDate_sortOrder_idx"
  ON public."RepairScheduleSegment"("workDate", "sortOrder");

ALTER TABLE public."RepairScheduleSegment" ADD CONSTRAINT "RepairScheduleSegment_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."RepairScheduleSegment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RepairScheduleSegment" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."RepairScheduleSegment_id_seq" FROM anon, authenticated, service_role;
