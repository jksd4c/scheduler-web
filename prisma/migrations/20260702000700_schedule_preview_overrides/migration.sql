ALTER TABLE "ScheduleAssignment" ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduleAssignment" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;

CREATE INDEX IF NOT EXISTS "ScheduleAssignment_scheduleTaskId_manualOverride_idx" ON "ScheduleAssignment"("scheduleTaskId", "manualOverride");
