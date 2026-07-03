-- Staff scheduling preferences are soft constraints. They must never override
-- hard eligibility or fairness constraints.
ALTER TABLE "StaffProfile"
  ADD COLUMN "preferredShiftType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "preferenceStrength" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "preferenceNote" TEXT;

ALTER TABLE "ScheduleDoctor"
  ADD COLUMN "preferredShiftType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "preferenceStrength" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "preferenceNote" TEXT;

ALTER TABLE "MemberFeedback"
  ADD COLUMN "preferredShiftType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "preferenceStrength" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "preferenceNote" TEXT;

CREATE INDEX "StaffProfile_preferredShiftType_idx" ON "StaffProfile"("preferredShiftType");
CREATE INDEX "ScheduleDoctor_preferredShiftType_idx" ON "ScheduleDoctor"("preferredShiftType");
CREATE INDEX "MemberFeedback_preferredShiftType_idx" ON "MemberFeedback"("preferredShiftType");
