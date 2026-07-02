CREATE TABLE IF NOT EXISTS "StaffPool" (
  "id" TEXT NOT NULL,
  "hospitalId" TEXT,
  "departmentId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "scheduleTaskId" TEXT,
  "poolType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RosterEntry" (
  "id" TEXT NOT NULL,
  "hospitalId" TEXT,
  "departmentId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "scheduleTaskId" TEXT,
  "staffPoolId" TEXT,
  "staffProfileId" TEXT,
  "userId" TEXT,
  "poolType" TEXT NOT NULL,
  "expectedName" TEXT NOT NULL,
  "expectedPhone" TEXT,
  "staffType" TEXT,
  "identityTagIds" JSONB,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'WAITING_JOIN',
  "includeInScheduling" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JoinCode" (
  "id" TEXT NOT NULL,
  "hospitalId" TEXT,
  "departmentId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "scheduleTaskId" TEXT,
  "staffPoolId" TEXT,
  "codeHash" TEXT NOT NULL,
  "roleToGrant" TEXT NOT NULL DEFAULT 'MEMBER',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "maxUses" INTEGER,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "JoinCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JoinClaim" (
  "id" TEXT NOT NULL,
  "joinCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rosterEntryId" TEXT,
  "hospitalId" TEXT,
  "departmentId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "scheduleTaskId" TEXT,
  "staffPoolId" TEXT,
  "inputName" TEXT NOT NULL,
  "inputPhone" TEXT NOT NULL,
  "matchStatus" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "rejectReason" TEXT,
  CONSTRAINT "JoinClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemberFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinClaimId" TEXT,
  "rosterEntryId" TEXT,
  "scheduleTaskId" TEXT,
  "hospitalId" TEXT,
  "departmentId" TEXT,
  "unitId" TEXT,
  "title" TEXT,
  "message" TEXT,
  "canWorkShiftTypeIds" JSONB,
  "status" TEXT NOT NULL DEFAULT 'WAITING_IDENTITY_CONFIRMATION',
  "effective" BOOLEAN NOT NULL DEFAULT false,
  "anomalyStatus" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemberFeedbackUnavailableTime" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "timeSlot" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberFeedbackUnavailableTime_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JoinCode_codeHash_key" ON "JoinCode"("codeHash");
CREATE INDEX IF NOT EXISTS "StaffPool_hospitalId_idx" ON "StaffPool"("hospitalId");
CREATE INDEX IF NOT EXISTS "StaffPool_departmentId_idx" ON "StaffPool"("departmentId");
CREATE INDEX IF NOT EXISTS "StaffPool_unitId_idx" ON "StaffPool"("unitId");
CREATE INDEX IF NOT EXISTS "StaffPool_scheduleTaskId_idx" ON "StaffPool"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "StaffPool_poolType_idx" ON "StaffPool"("poolType");
CREATE INDEX IF NOT EXISTS "StaffPool_active_idx" ON "StaffPool"("active");
CREATE INDEX IF NOT EXISTS "StaffPool_unitId_poolType_idx" ON "StaffPool"("unitId", "poolType");
CREATE INDEX IF NOT EXISTS "RosterEntry_hospitalId_idx" ON "RosterEntry"("hospitalId");
CREATE INDEX IF NOT EXISTS "RosterEntry_departmentId_idx" ON "RosterEntry"("departmentId");
CREATE INDEX IF NOT EXISTS "RosterEntry_unitId_idx" ON "RosterEntry"("unitId");
CREATE INDEX IF NOT EXISTS "RosterEntry_scheduleTaskId_idx" ON "RosterEntry"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "RosterEntry_staffPoolId_idx" ON "RosterEntry"("staffPoolId");
CREATE INDEX IF NOT EXISTS "RosterEntry_staffProfileId_idx" ON "RosterEntry"("staffProfileId");
CREATE INDEX IF NOT EXISTS "RosterEntry_userId_idx" ON "RosterEntry"("userId");
CREATE INDEX IF NOT EXISTS "RosterEntry_poolType_idx" ON "RosterEntry"("poolType");
CREATE INDEX IF NOT EXISTS "RosterEntry_status_idx" ON "RosterEntry"("status");
CREATE INDEX IF NOT EXISTS "RosterEntry_includeInScheduling_idx" ON "RosterEntry"("includeInScheduling");
CREATE INDEX IF NOT EXISTS "RosterEntry_unitId_status_idx" ON "RosterEntry"("unitId", "status");
CREATE INDEX IF NOT EXISTS "RosterEntry_scheduleTaskId_status_idx" ON "RosterEntry"("scheduleTaskId", "status");
CREATE INDEX IF NOT EXISTS "JoinCode_hospitalId_idx" ON "JoinCode"("hospitalId");
CREATE INDEX IF NOT EXISTS "JoinCode_departmentId_idx" ON "JoinCode"("departmentId");
CREATE INDEX IF NOT EXISTS "JoinCode_unitId_idx" ON "JoinCode"("unitId");
CREATE INDEX IF NOT EXISTS "JoinCode_scheduleTaskId_idx" ON "JoinCode"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "JoinCode_staffPoolId_idx" ON "JoinCode"("staffPoolId");
CREATE INDEX IF NOT EXISTS "JoinCode_expiresAt_idx" ON "JoinCode"("expiresAt");
CREATE INDEX IF NOT EXISTS "JoinCode_active_idx" ON "JoinCode"("active");
CREATE INDEX IF NOT EXISTS "JoinClaim_joinCodeId_idx" ON "JoinClaim"("joinCodeId");
CREATE INDEX IF NOT EXISTS "JoinClaim_userId_idx" ON "JoinClaim"("userId");
CREATE INDEX IF NOT EXISTS "JoinClaim_rosterEntryId_idx" ON "JoinClaim"("rosterEntryId");
CREATE INDEX IF NOT EXISTS "JoinClaim_hospitalId_idx" ON "JoinClaim"("hospitalId");
CREATE INDEX IF NOT EXISTS "JoinClaim_departmentId_idx" ON "JoinClaim"("departmentId");
CREATE INDEX IF NOT EXISTS "JoinClaim_unitId_idx" ON "JoinClaim"("unitId");
CREATE INDEX IF NOT EXISTS "JoinClaim_scheduleTaskId_idx" ON "JoinClaim"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "JoinClaim_staffPoolId_idx" ON "JoinClaim"("staffPoolId");
CREATE INDEX IF NOT EXISTS "JoinClaim_matchStatus_idx" ON "JoinClaim"("matchStatus");
CREATE INDEX IF NOT EXISTS "JoinClaim_reviewStatus_idx" ON "JoinClaim"("reviewStatus");
CREATE INDEX IF NOT EXISTS "JoinClaim_createdAt_idx" ON "JoinClaim"("createdAt");
CREATE INDEX IF NOT EXISTS "MemberFeedback_userId_idx" ON "MemberFeedback"("userId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_joinClaimId_idx" ON "MemberFeedback"("joinClaimId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_rosterEntryId_idx" ON "MemberFeedback"("rosterEntryId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_scheduleTaskId_idx" ON "MemberFeedback"("scheduleTaskId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_hospitalId_idx" ON "MemberFeedback"("hospitalId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_departmentId_idx" ON "MemberFeedback"("departmentId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_unitId_idx" ON "MemberFeedback"("unitId");
CREATE INDEX IF NOT EXISTS "MemberFeedback_status_idx" ON "MemberFeedback"("status");
CREATE INDEX IF NOT EXISTS "MemberFeedback_effective_idx" ON "MemberFeedback"("effective");
CREATE INDEX IF NOT EXISTS "MemberFeedback_createdAt_idx" ON "MemberFeedback"("createdAt");
CREATE INDEX IF NOT EXISTS "MemberFeedback_unitId_createdAt_idx" ON "MemberFeedback"("unitId", "createdAt");
CREATE INDEX IF NOT EXISTS "MemberFeedback_scheduleTaskId_effective_idx" ON "MemberFeedback"("scheduleTaskId", "effective");
CREATE INDEX IF NOT EXISTS "MemberFeedbackUnavailableTime_feedbackId_idx" ON "MemberFeedbackUnavailableTime"("feedbackId");
CREATE INDEX IF NOT EXISTS "MemberFeedbackUnavailableTime_date_timeSlot_idx" ON "MemberFeedbackUnavailableTime"("date", "timeSlot");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberFeedbackUnavailableTime_feedbackId_fkey') THEN
    ALTER TABLE "MemberFeedbackUnavailableTime"
      ADD CONSTRAINT "MemberFeedbackUnavailableTime_feedbackId_fkey"
      FOREIGN KEY ("feedbackId") REFERENCES "MemberFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
