-- v0.1 beta-free organization, registration, feedback, and audit foundation.

CREATE TABLE IF NOT EXISTS "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Hospital_name_key" ON "Hospital"("name");
CREATE INDEX IF NOT EXISTS "Hospital_name_idx" ON "Hospital"("name");

ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;

INSERT INTO "Hospital" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES ('beta_default_hospital', '默认医院', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Department"
SET "hospitalId" = 'beta_default_hospital'
WHERE "hospitalId" IS NULL;

DROP INDEX IF EXISTS "Department_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Department_hospitalId_name_key" ON "Department"("hospitalId", "name");
CREATE INDEX IF NOT EXISTS "Department_hospitalId_idx" ON "Department"("hospitalId");

DO $$
BEGIN
  ALTER TABLE "Department" ADD CONSTRAINT "Department_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Unit" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Unit" ("id", "hospitalId", "departmentId", "name", "isActive", "createdAt", "updatedAt")
SELECT 'unit_' || d."id", d."hospitalId", d."id", '默认病区', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Department" d
WHERE NOT EXISTS (
  SELECT 1 FROM "Unit" u WHERE u."departmentId" = d."id" AND u."name" = '默认病区'
);

UPDATE "User" u
SET
  "displayName" = COALESCE(u."displayName", u."username"),
  "hospitalId" = d."hospitalId",
  "unitId" = COALESCE(u."unitId", 'unit_' || u."departmentId"),
  "role" = CASE WHEN u."role" = 'DEPARTMENT_ADMIN' THEN 'SCHEDULER_ADMIN' ELSE u."role" END
FROM "Department" d
WHERE u."departmentId" = d."id";

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_hospitalId_idx" ON "User"("hospitalId");
CREATE INDEX IF NOT EXISTS "User_unitId_idx" ON "User"("unitId");

CREATE UNIQUE INDEX IF NOT EXISTS "Unit_departmentId_name_key" ON "Unit"("departmentId", "name");
CREATE INDEX IF NOT EXISTS "Unit_hospitalId_idx" ON "Unit"("hospitalId");
CREATE INDEX IF NOT EXISTS "Unit_departmentId_idx" ON "Unit"("departmentId");
CREATE INDEX IF NOT EXISTS "Unit_createdByUserId_idx" ON "Unit"("createdByUserId");

DO $$
BEGIN
  ALTER TABLE "Unit" ADD CONSTRAINT "Unit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Unit" ADD CONSTRAINT "Unit_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Unit" ADD CONSTRAINT "Unit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;
ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
ALTER TABLE "ScheduleTask" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

UPDATE "ScheduleTask" t
SET
  "hospitalId" = d."hospitalId",
  "unitId" = COALESCE(t."unitId", 'unit_' || t."departmentId")
FROM "Department" d
WHERE t."departmentId" = d."id";

CREATE INDEX IF NOT EXISTS "ScheduleTask_hospitalId_idx" ON "ScheduleTask"("hospitalId");
CREATE INDEX IF NOT EXISTS "ScheduleTask_unitId_idx" ON "ScheduleTask"("unitId");
CREATE INDEX IF NOT EXISTS "ScheduleTask_createdByUserId_idx" ON "ScheduleTask"("createdByUserId");

DO $$
BEGIN
  ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "departmentId" TEXT,
    "unitId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pageUrl" TEXT,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX IF NOT EXISTS "Feedback_hospitalId_idx" ON "Feedback"("hospitalId");
CREATE INDEX IF NOT EXISTS "Feedback_departmentId_idx" ON "Feedback"("departmentId");
CREATE INDEX IF NOT EXISTS "Feedback_unitId_idx" ON "Feedback"("unitId");
CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX IF NOT EXISTS "Feedback_type_idx" ON "Feedback"("type");

DO $$
BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OrganizationRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT,
    "hospitalName" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrganizationRequest_requesterUserId_idx" ON "OrganizationRequest"("requesterUserId");
CREATE INDEX IF NOT EXISTS "OrganizationRequest_status_idx" ON "OrganizationRequest"("status");

DO $$
BEGIN
  ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "hospitalId" TEXT,
    "departmentId" TEXT,
    "unitId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_hospitalId_idx" ON "AuditLog"("hospitalId");
CREATE INDEX IF NOT EXISTS "AuditLog_departmentId_idx" ON "AuditLog"("departmentId");
CREATE INDEX IF NOT EXISTS "AuditLog_unitId_idx" ON "AuditLog"("unitId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

DO $$
BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
