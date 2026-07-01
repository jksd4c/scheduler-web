-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "departmentId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentAccessCode" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTask" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDoctor" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "scheduleTaskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doctorType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleDoctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorUnavailableTime" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "scheduleTaskId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorUnavailableTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRequirement" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "scheduleTaskId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "roomNumber" INTEGER NOT NULL,
    "requiredDoctors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "scheduleTaskId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "roomNumber" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConflict" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "scheduleTaskId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "roomNumber" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "missingCount" INTEGER,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Department_name_idx" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentAccessCode_codeHash_key" ON "DepartmentAccessCode"("codeHash");

-- CreateIndex
CREATE INDEX "DepartmentAccessCode_departmentId_idx" ON "DepartmentAccessCode"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentAccessCode_expiresAt_idx" ON "DepartmentAccessCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_departmentId_idx" ON "GuestSession"("departmentId");

-- CreateIndex
CREATE INDEX "GuestSession_expiresAt_idx" ON "GuestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ScheduleTask_departmentId_idx" ON "ScheduleTask"("departmentId");

-- CreateIndex
CREATE INDEX "ScheduleTask_weekStartDate_idx" ON "ScheduleTask"("weekStartDate");

-- CreateIndex
CREATE INDEX "ScheduleTask_status_idx" ON "ScheduleTask"("status");

-- CreateIndex
CREATE INDEX "ScheduleDoctor_departmentId_idx" ON "ScheduleDoctor"("departmentId");

-- CreateIndex
CREATE INDEX "ScheduleDoctor_scheduleTaskId_idx" ON "ScheduleDoctor"("scheduleTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDoctor_scheduleTaskId_name_key" ON "ScheduleDoctor"("scheduleTaskId", "name");

-- CreateIndex
CREATE INDEX "DoctorUnavailableTime_departmentId_idx" ON "DoctorUnavailableTime"("departmentId");

-- CreateIndex
CREATE INDEX "DoctorUnavailableTime_scheduleTaskId_doctorId_idx" ON "DoctorUnavailableTime"("scheduleTaskId", "doctorId");

-- CreateIndex
CREATE INDEX "DoctorUnavailableTime_date_timeSlot_idx" ON "DoctorUnavailableTime"("date", "timeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorUnavailableTime_scheduleTaskId_doctorId_date_timeSlot_key" ON "DoctorUnavailableTime"("scheduleTaskId", "doctorId", "date", "timeSlot");

-- CreateIndex
CREATE INDEX "ScheduleRequirement_departmentId_idx" ON "ScheduleRequirement"("departmentId");

-- CreateIndex
CREATE INDEX "ScheduleRequirement_scheduleTaskId_idx" ON "ScheduleRequirement"("scheduleTaskId");

-- CreateIndex
CREATE INDEX "ScheduleRequirement_date_timeSlot_idx" ON "ScheduleRequirement"("date", "timeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRequirement_scheduleTaskId_date_timeSlot_roomNumber_key" ON "ScheduleRequirement"("scheduleTaskId", "date", "timeSlot", "roomNumber");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_departmentId_idx" ON "ScheduleAssignment"("departmentId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleTaskId_date_timeSlot_idx" ON "ScheduleAssignment"("scheduleTaskId", "date", "timeSlot");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleTaskId_roomNumber_idx" ON "ScheduleAssignment"("scheduleTaskId", "roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_scheduleTaskId_date_timeSlot_doctorId_key" ON "ScheduleAssignment"("scheduleTaskId", "date", "timeSlot", "doctorId");

-- CreateIndex
CREATE INDEX "ScheduleConflict_departmentId_idx" ON "ScheduleConflict"("departmentId");

-- CreateIndex
CREATE INDEX "ScheduleConflict_scheduleTaskId_idx" ON "ScheduleConflict"("scheduleTaskId");

-- CreateIndex
CREATE INDEX "ScheduleConflict_date_timeSlot_idx" ON "ScheduleConflict"("date", "timeSlot");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAccessCode" ADD CONSTRAINT "DepartmentAccessCode_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDoctor" ADD CONSTRAINT "ScheduleDoctor_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDoctor" ADD CONSTRAINT "ScheduleDoctor_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorUnavailableTime" ADD CONSTRAINT "DoctorUnavailableTime_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorUnavailableTime" ADD CONSTRAINT "DoctorUnavailableTime_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorUnavailableTime" ADD CONSTRAINT "DoctorUnavailableTime_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "ScheduleDoctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRequirement" ADD CONSTRAINT "ScheduleRequirement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRequirement" ADD CONSTRAINT "ScheduleRequirement_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "ScheduleDoctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

