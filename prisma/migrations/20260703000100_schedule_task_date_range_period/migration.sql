ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "periodType" TEXT;

UPDATE "ScheduleTask"
SET
  "startDate" = COALESCE("startDate", "weekStartDate"),
  "endDate" = COALESCE("endDate", "weekEndDate"),
  "periodType" = COALESCE("periodType", 'DAYS_7'),
  "name" = COALESCE("name", '排班任务')
WHERE "startDate" IS NULL
   OR "endDate" IS NULL
   OR "periodType" IS NULL
   OR "name" IS NULL;

ALTER TABLE "ScheduleTask" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "ScheduleTask" ALTER COLUMN "endDate" SET NOT NULL;
ALTER TABLE "ScheduleTask" ALTER COLUMN "periodType" SET NOT NULL;
ALTER TABLE "ScheduleTask" ALTER COLUMN "periodType" SET DEFAULT 'DAYS_30';

CREATE INDEX IF NOT EXISTS "ScheduleTask_startDate_idx" ON "ScheduleTask"("startDate");
CREATE INDEX IF NOT EXISTS "ScheduleTask_endDate_idx" ON "ScheduleTask"("endDate");
CREATE INDEX IF NOT EXISTS "ScheduleTask_periodType_idx" ON "ScheduleTask"("periodType");

CREATE TABLE IF NOT EXISTS "SpecialDate" (
  "id" TEXT NOT NULL,
  "hospitalId" TEXT,
  "departmentId" TEXT,
  "unitId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "dateType" TEXT NOT NULL,
  "name" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpecialDate_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SpecialDate_unitId_fkey'
  ) THEN
    ALTER TABLE "SpecialDate" ADD CONSTRAINT "SpecialDate_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SpecialDate_hospitalId_idx" ON "SpecialDate"("hospitalId");
CREATE INDEX IF NOT EXISTS "SpecialDate_departmentId_idx" ON "SpecialDate"("departmentId");
CREATE INDEX IF NOT EXISTS "SpecialDate_unitId_idx" ON "SpecialDate"("unitId");
CREATE INDEX IF NOT EXISTS "SpecialDate_date_idx" ON "SpecialDate"("date");
CREATE INDEX IF NOT EXISTS "SpecialDate_dateType_idx" ON "SpecialDate"("dateType");
CREATE UNIQUE INDEX IF NOT EXISTS "SpecialDate_unitId_date_dateType_key" ON "SpecialDate"("unitId", "date", "dateType");
