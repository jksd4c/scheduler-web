DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StaffTagPolicy' AND column_name = 'schedulingMode') THEN
    ALTER TABLE "StaffTagPolicy" ADD COLUMN "schedulingMode" TEXT NOT NULL DEFAULT 'NORMAL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StaffTagPolicy' AND column_name = 'targetShiftsPerPeriod') THEN
    ALTER TABLE "StaffTagPolicy" ADD COLUMN "targetShiftsPerPeriod" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StaffTagPolicy' AND column_name = 'maxShiftsPerPeriod') THEN
    ALTER TABLE "StaffTagPolicy" ADD COLUMN "maxShiftsPerPeriod" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StaffTagPolicy' AND column_name = 'countInFairness') THEN
    ALTER TABLE "StaffTagPolicy" ADD COLUMN "countInFairness" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
