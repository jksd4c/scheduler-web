ALTER TABLE "ScheduleRequirement" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ScheduleRequirement" ADD COLUMN IF NOT EXISTS "sourceWeekday" INTEGER;
CREATE INDEX IF NOT EXISTS "ScheduleRequirement_source_idx" ON "ScheduleRequirement"("source");

ALTER TABLE "StaffProfile" ADD COLUMN IF NOT EXISTS "poolType" TEXT NOT NULL DEFAULT 'CORE';
CREATE INDEX IF NOT EXISTS "StaffProfile_poolType_idx" ON "StaffProfile"("poolType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RosterEntry_staffProfileId_fkey'
  ) THEN
    ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ScheduleWeeklyTemplate" (
  "id" TEXT NOT NULL,
  "scheduleTaskId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "shiftTypeId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "requiredDoctors" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleWeeklyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScheduleDateOverride" (
  "id" TEXT NOT NULL,
  "scheduleTaskId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "shiftTypeId" TEXT NOT NULL,
  "dateType" TEXT,
  "note" TEXT,
  "overrideEnabled" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "requiredDoctors" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleDateOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleWeeklyTemplate_scheduleTaskId_weekday_shiftTypeId_key" ON "ScheduleWeeklyTemplate"("scheduleTaskId", "weekday", "shiftTypeId");
CREATE INDEX IF NOT EXISTS "ScheduleWeeklyTemplate_scheduleTaskId_idx" ON "ScheduleWeeklyTemplate"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "ScheduleWeeklyTemplate_weekday_idx" ON "ScheduleWeeklyTemplate"("weekday");
CREATE INDEX IF NOT EXISTS "ScheduleWeeklyTemplate_shiftTypeId_idx" ON "ScheduleWeeklyTemplate"("shiftTypeId");

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleDateOverride_scheduleTaskId_date_shiftTypeId_key" ON "ScheduleDateOverride"("scheduleTaskId", "date", "shiftTypeId");
CREATE INDEX IF NOT EXISTS "ScheduleDateOverride_scheduleTaskId_idx" ON "ScheduleDateOverride"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "ScheduleDateOverride_date_idx" ON "ScheduleDateOverride"("date");
CREATE INDEX IF NOT EXISTS "ScheduleDateOverride_shiftTypeId_idx" ON "ScheduleDateOverride"("shiftTypeId");
CREATE INDEX IF NOT EXISTS "ScheduleDateOverride_overrideEnabled_idx" ON "ScheduleDateOverride"("overrideEnabled");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduleWeeklyTemplate_scheduleTaskId_fkey'
  ) THEN
    ALTER TABLE "ScheduleWeeklyTemplate" ADD CONSTRAINT "ScheduleWeeklyTemplate_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduleWeeklyTemplate_shiftTypeId_fkey'
  ) THEN
    ALTER TABLE "ScheduleWeeklyTemplate" ADD CONSTRAINT "ScheduleWeeklyTemplate_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduleDateOverride_scheduleTaskId_fkey'
  ) THEN
    ALTER TABLE "ScheduleDateOverride" ADD CONSTRAINT "ScheduleDateOverride_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduleDateOverride_shiftTypeId_fkey'
  ) THEN
    ALTER TABLE "ScheduleDateOverride" ADD CONSTRAINT "ScheduleDateOverride_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
