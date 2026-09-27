-- Task190A: server-only scheduler settings and general repair work standards.
CREATE TYPE public."SchedulerLearningMode" AS ENUM ('MANUAL', 'AUTO');
CREATE TYPE public."SchedulerAggregationMethod" AS ENUM ('MEAN', 'MEDIAN', 'P80');
CREATE TYPE public."SchedulerOutlierMethod" AS ENUM ('NONE', 'IQR');

CREATE TABLE public."SchedulerSetting" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "standardDailyMinutes" INTEGER NOT NULL DEFAULT 480,
  "dailyScheduleReviewMinutes" INTEGER NOT NULL DEFAULT 30,
  "repairLearningMode" public."SchedulerLearningMode" NOT NULL DEFAULT 'AUTO',
  "repairLearningMinimumSamples" INTEGER NOT NULL DEFAULT 3,
  "repairFullSampleThreshold" INTEGER NOT NULL DEFAULT 10,
  "repairEarlyAggregationMethod" public."SchedulerAggregationMethod" NOT NULL DEFAULT 'MEDIAN',
  "defaultAggregationMethod" public."SchedulerAggregationMethod" NOT NULL DEFAULT 'MEAN',
  "repairLookbackMonths" INTEGER NOT NULL DEFAULT 6,
  "repairOutlierMethod" public."SchedulerOutlierMethod" NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchedulerSetting_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "SchedulerSetting_daily_minutes_check" CHECK ("standardDailyMinutes" BETWEEN 1 AND 1440),
  CONSTRAINT "SchedulerSetting_review_minutes_check" CHECK ("dailyScheduleReviewMinutes" BETWEEN 0 AND "standardDailyMinutes"),
  CONSTRAINT "SchedulerSetting_samples_check" CHECK (
    "repairLearningMinimumSamples" >= 1 AND
    "repairFullSampleThreshold" >= "repairLearningMinimumSamples"
  ),
  CONSTRAINT "SchedulerSetting_lookback_check" CHECK ("repairLookbackMonths" BETWEEN 1 AND 120)
);

CREATE TABLE public."SchedulerActivitySetting" (
  "activityType" public."WorkTimeActivityType" NOT NULL,
  "manualStandardMinutes" INTEGER,
  "dailyReservedMinutes" INTEGER NOT NULL DEFAULT 0,
  "learningMode" public."SchedulerLearningMode" NOT NULL DEFAULT 'MANUAL',
  "aggregationMethod" public."SchedulerAggregationMethod" NOT NULL DEFAULT 'MEAN',
  "lookbackMonths" INTEGER NOT NULL DEFAULT 6,
  "fallbackLookbackMonths" INTEGER,
  "minimumSamples" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerActivitySetting_pkey" PRIMARY KEY ("activityType"),
  CONSTRAINT "SchedulerActivitySetting_non_repair_check" CHECK ("activityType" <> 'REPAIR'),
  CONSTRAINT "SchedulerActivitySetting_standard_minutes_check" CHECK ("manualStandardMinutes" IS NULL OR "manualStandardMinutes" > 0),
  CONSTRAINT "SchedulerActivitySetting_reserved_minutes_check" CHECK ("dailyReservedMinutes" BETWEEN 0 AND 1440),
  CONSTRAINT "SchedulerActivitySetting_lookback_check" CHECK ("lookbackMonths" BETWEEN 1 AND 120),
  CONSTRAINT "SchedulerActivitySetting_fallback_lookback_check" CHECK (
    "fallbackLookbackMonths" IS NULL OR "fallbackLookbackMonths" BETWEEN "lookbackMonths" AND 120
  ),
  CONSTRAINT "SchedulerActivitySetting_samples_check" CHECK ("minimumSamples" >= 1)
);

CREATE TABLE public."RepairWorkTimeStandard" (
  "id" SERIAL NOT NULL,
  "repairType" public."RepairWorkType" NOT NULL,
  "categoryId" INTEGER NOT NULL,
  "targetPartNameId" TEXT,
  "actionId" INTEGER,
  "detailLabel" TEXT,
  "driveType" public."WatchDriveType",
  "standardMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairWorkTimeStandard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RepairWorkTimeStandard_minutes_check" CHECK ("standardMinutes" > 0),
  CONSTRAINT "RepairWorkTimeStandard_detail_check" CHECK (
    "detailLabel" IS NULL OR ("detailLabel" <> '' AND "detailLabel" = btrim("detailLabel"))
  ),
  CONSTRAINT "RepairWorkTimeStandard_drive_check" CHECK (
    "repairType" = 'INTERNAL' OR "driveType" IS NULL
  )
);

-- The composite FK prevents an INTERNAL standard from using an EXTERNAL category.
CREATE UNIQUE INDEX "RepairWorkCategory_id_repairType_key"
  ON public."RepairWorkCategory"("id", "repairType");
ALTER TABLE public."RepairWorkTimeStandard" ADD CONSTRAINT "RepairWorkTimeStandard_categoryId_repairType_fkey"
  FOREIGN KEY ("categoryId", "repairType") REFERENCES public."RepairWorkCategory"("id", "repairType")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."RepairWorkTimeStandard" ADD CONSTRAINT "RepairWorkTimeStandard_targetPartNameId_fkey"
  FOREIGN KEY ("targetPartNameId") REFERENCES public."PartNameMaster"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."RepairWorkTimeStandard" ADD CONSTRAINT "RepairWorkTimeStandard_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES public."RepairWorkAction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RepairWorkTimeStandard_repairType_categoryId_idx"
  ON public."RepairWorkTimeStandard"("repairType", "categoryId");
CREATE INDEX "RepairWorkTimeStandard_targetPartNameId_idx"
  ON public."RepairWorkTimeStandard"("targetPartNameId");
CREATE INDEX "RepairWorkTimeStandard_actionId_idx"
  ON public."RepairWorkTimeStandard"("actionId");
-- PostgreSQL 15+ treats NULLs as equal without reserving fake master IDs.
CREATE UNIQUE INDEX "RepairWorkTimeStandard_condition_key"
  ON public."RepairWorkTimeStandard"(
    "repairType", "categoryId", "targetPartNameId",
    "actionId", "detailLabel", "driveType"
  ) NULLS NOT DISTINCT;

INSERT INTO public."SchedulerSetting" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);
INSERT INTO public."SchedulerActivitySetting"
  ("activityType", "manualStandardMinutes", "dailyReservedMinutes", "learningMode", "aggregationMethod", "lookbackMonths", "fallbackLookbackMonths", "minimumSamples", "updatedAt")
VALUES
  ('ESTIMATE', 20, 0, 'MANUAL', 'MEAN', 3, 6, 100, CURRENT_TIMESTAMP),
  ('INTAKE', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('INQUIRY', NULL, 60, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('CUSTOMER_CONTACT', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('PARTS_ORDER', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('SHIPPING', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('ADMIN', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP),
  ('OTHER', NULL, 0, 'MANUAL', 'MEAN', 6, NULL, 3, CURRENT_TIMESTAMP);

ALTER TABLE public."SchedulerSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulerActivitySetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RepairWorkTimeStandard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."SchedulerSetting", public."SchedulerActivitySetting", public."RepairWorkTimeStandard"
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."RepairWorkTimeStandard_id_seq"
  FROM anon, authenticated, service_role;
