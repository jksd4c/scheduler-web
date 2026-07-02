DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ScheduleTask' AND column_name = 'scheduleMode') THEN
    ALTER TABLE "ScheduleTask" ADD COLUMN "scheduleMode" TEXT NOT NULL DEFAULT 'MEDTECH_ROOM';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ScheduleTask_scheduleMode_idx" ON "ScheduleTask"("scheduleMode");
