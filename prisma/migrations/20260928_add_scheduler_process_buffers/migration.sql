-- Task192A: nullable calendar-day process buffers for future scheduler use.
ALTER TABLE public."SchedulerSetting"
  ADD COLUMN "runningTestDays" INTEGER,
  ADD COLUMN "reworkBufferDays" INTEGER,
  ADD COLUMN "shippingBufferDays" INTEGER,
  ADD CONSTRAINT "SchedulerSetting_running_test_days_check" CHECK ("runningTestDays" IS NULL OR "runningTestDays" >= 0),
  ADD CONSTRAINT "SchedulerSetting_rework_buffer_days_check" CHECK ("reworkBufferDays" IS NULL OR "reworkBufferDays" >= 0),
  ADD CONSTRAINT "SchedulerSetting_shipping_buffer_days_check" CHECK ("shippingBufferDays" IS NULL OR "shippingBufferDays" >= 0);
