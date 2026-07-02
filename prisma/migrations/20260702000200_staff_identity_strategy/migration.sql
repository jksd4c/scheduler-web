-- Staff identities, scheduling eligibility policies, staff profiles, task snapshots,
-- shift types, and shift-type tag requirements for Fair Scheduling v0.1 beta.

ALTER TABLE "ScheduleDoctor" ADD COLUMN IF NOT EXISTS "staffProfileId" TEXT;
ALTER TABLE "ScheduleDoctor" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ScheduleDoctor" ADD COLUMN IF NOT EXISTS "tagSnapshotJson" JSONB;
ALTER TABLE "ScheduleDoctor" ADD COLUMN IF NOT EXISTS "policySnapshotJson" JSONB;

ALTER TABLE "ScheduleRequirement" ADD COLUMN IF NOT EXISTS "shiftTypeId" TEXT;

CREATE TABLE IF NOT EXISTS "StaffTag" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'CUSTOM',
  "color" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffTagPolicy" (
  "id" TEXT NOT NULL,
  "staffTagId" TEXT NOT NULL,
  "participatesInScheduling" BOOLEAN NOT NULL DEFAULT true,
  "canWorkDayShift" BOOLEAN,
  "canWorkNightShift" BOOLEAN,
  "canWorkWeekend" BOOLEAN,
  "canWorkHoliday" BOOLEAN,
  "canWorkFirstLine" BOOLEAN,
  "canWorkSecondLine" BOOLEAN,
  "canWorkEmergency" BOOLEAN,
  "canWorkOnCall" BOOLEAN,
  "canWorkBackup" BOOLEAN,
  "canWorkIndependently" BOOLEAN,
  "maxShiftsPerWeek" INTEGER,
  "maxWorkDaysPerWeek" INTEGER,
  "maxShiftsPerMonth" INTEGER,
  "maxNightShiftsPerMonth" INTEGER,
  "maxWeekendShiftsPerMonth" INTEGER,
  "maxHolidayShiftsPerMonth" INTEGER,
  "maxConsecutiveWorkDays" INTEGER,
  "allowConsecutiveNightShifts" BOOLEAN,
  "allowDayAndNightSameDay" BOOLEAN,
  "allowDayAfterNightShift" BOOLEAN,
  "minRestHoursAfterNightShift" INTEGER,
  "workloadFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffTagPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffProfile" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT,
  "displayName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffProfileTag" (
  "id" TEXT NOT NULL,
  "staffProfileId" TEXT NOT NULL,
  "staffTagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffProfileTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScheduleParticipant" (
  "id" TEXT NOT NULL,
  "scheduleTaskId" TEXT NOT NULL,
  "scheduleDoctorId" TEXT,
  "staffProfileId" TEXT,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "tagSnapshotJson" JSONB,
  "policySnapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShiftType" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'CUSTOM',
  "isNight" BOOLEAN NOT NULL DEFAULT false,
  "workloadWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "startTime" TEXT,
  "endTime" TEXT,
  "color" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShiftTypeRequiredTag" (
  "id" TEXT NOT NULL,
  "shiftTypeId" TEXT NOT NULL,
  "staffTagId" TEXT NOT NULL,
  "requirementType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftTypeRequiredTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffTag_unitId_name_key" ON "StaffTag"("unitId", "name");
CREATE INDEX IF NOT EXISTS "StaffTag_unitId_idx" ON "StaffTag"("unitId");
CREATE INDEX IF NOT EXISTS "StaffTag_category_idx" ON "StaffTag"("category");
CREATE INDEX IF NOT EXISTS "StaffTag_active_idx" ON "StaffTag"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "StaffTagPolicy_staffTagId_key" ON "StaffTagPolicy"("staffTagId");

CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfile_unitId_displayName_key" ON "StaffProfile"("unitId", "displayName");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfile_unitId_phone_key" ON "StaffProfile"("unitId", "phone");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfile_unitId_email_key" ON "StaffProfile"("unitId", "email");
CREATE INDEX IF NOT EXISTS "StaffProfile_unitId_idx" ON "StaffProfile"("unitId");
CREATE INDEX IF NOT EXISTS "StaffProfile_userId_idx" ON "StaffProfile"("userId");
CREATE INDEX IF NOT EXISTS "StaffProfile_active_idx" ON "StaffProfile"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfileTag_staffProfileId_staffTagId_key" ON "StaffProfileTag"("staffProfileId", "staffTagId");
CREATE INDEX IF NOT EXISTS "StaffProfileTag_staffProfileId_idx" ON "StaffProfileTag"("staffProfileId");
CREATE INDEX IF NOT EXISTS "StaffProfileTag_staffTagId_idx" ON "StaffProfileTag"("staffTagId");

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleParticipant_scheduleDoctorId_key" ON "ScheduleParticipant"("scheduleDoctorId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleParticipant_scheduleTaskId_displayName_key" ON "ScheduleParticipant"("scheduleTaskId", "displayName");
CREATE INDEX IF NOT EXISTS "ScheduleParticipant_scheduleTaskId_idx" ON "ScheduleParticipant"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "ScheduleParticipant_staffProfileId_idx" ON "ScheduleParticipant"("staffProfileId");
CREATE INDEX IF NOT EXISTS "ScheduleParticipant_active_idx" ON "ScheduleParticipant"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftType_unitId_name_key" ON "ShiftType"("unitId", "name");
CREATE INDEX IF NOT EXISTS "ShiftType_unitId_idx" ON "ShiftType"("unitId");
CREATE INDEX IF NOT EXISTS "ShiftType_category_idx" ON "ShiftType"("category");
CREATE INDEX IF NOT EXISTS "ShiftType_active_idx" ON "ShiftType"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftTypeRequiredTag_shiftTypeId_staffTagId_requirementType_key" ON "ShiftTypeRequiredTag"("shiftTypeId", "staffTagId", "requirementType");
CREATE INDEX IF NOT EXISTS "ShiftTypeRequiredTag_shiftTypeId_idx" ON "ShiftTypeRequiredTag"("shiftTypeId");
CREATE INDEX IF NOT EXISTS "ShiftTypeRequiredTag_staffTagId_idx" ON "ShiftTypeRequiredTag"("staffTagId");
CREATE INDEX IF NOT EXISTS "ShiftTypeRequiredTag_requirementType_idx" ON "ShiftTypeRequiredTag"("requirementType");

CREATE INDEX IF NOT EXISTS "ScheduleDoctor_staffProfileId_idx" ON "ScheduleDoctor"("staffProfileId");
CREATE INDEX IF NOT EXISTS "ScheduleRequirement_shiftTypeId_idx" ON "ScheduleRequirement"("shiftTypeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffTag_unitId_fkey') THEN
    ALTER TABLE "StaffTag" ADD CONSTRAINT "StaffTag_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffTagPolicy_staffTagId_fkey') THEN
    ALTER TABLE "StaffTagPolicy" ADD CONSTRAINT "StaffTagPolicy_staffTagId_fkey" FOREIGN KEY ("staffTagId") REFERENCES "StaffTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffProfile_unitId_fkey') THEN
    ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffProfile_userId_fkey') THEN
    ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffProfileTag_staffProfileId_fkey') THEN
    ALTER TABLE "StaffProfileTag" ADD CONSTRAINT "StaffProfileTag_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffProfileTag_staffTagId_fkey') THEN
    ALTER TABLE "StaffProfileTag" ADD CONSTRAINT "StaffProfileTag_staffTagId_fkey" FOREIGN KEY ("staffTagId") REFERENCES "StaffTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleParticipant_scheduleTaskId_fkey') THEN
    ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleParticipant_scheduleDoctorId_fkey') THEN
    ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_scheduleDoctorId_fkey" FOREIGN KEY ("scheduleDoctorId") REFERENCES "ScheduleDoctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleParticipant_staffProfileId_fkey') THEN
    ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShiftType_unitId_fkey') THEN
    ALTER TABLE "ShiftType" ADD CONSTRAINT "ShiftType_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShiftTypeRequiredTag_shiftTypeId_fkey') THEN
    ALTER TABLE "ShiftTypeRequiredTag" ADD CONSTRAINT "ShiftTypeRequiredTag_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShiftTypeRequiredTag_staffTagId_fkey') THEN
    ALTER TABLE "ShiftTypeRequiredTag" ADD CONSTRAINT "ShiftTypeRequiredTag_staffTagId_fkey" FOREIGN KEY ("staffTagId") REFERENCES "StaffTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleDoctor_staffProfileId_fkey') THEN
    ALTER TABLE "ScheduleDoctor" ADD CONSTRAINT "ScheduleDoctor_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleRequirement_shiftTypeId_fkey') THEN
    ALTER TABLE "ScheduleRequirement" ADD CONSTRAINT "ScheduleRequirement_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
