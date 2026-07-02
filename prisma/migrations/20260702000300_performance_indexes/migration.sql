CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_role_isActive_idx" ON "User"("role", "isActive");

CREATE INDEX IF NOT EXISTS "ScheduleTask_createdAt_idx" ON "ScheduleTask"("createdAt");
CREATE INDEX IF NOT EXISTS "ScheduleTask_unitId_createdAt_idx" ON "ScheduleTask"("unitId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScheduleTask_departmentId_createdAt_idx" ON "ScheduleTask"("departmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScheduleTask_status_createdAt_idx" ON "ScheduleTask"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "StaffTag_unitId_active_idx" ON "StaffTag"("unitId", "active");
CREATE INDEX IF NOT EXISTS "StaffProfile_unitId_active_idx" ON "StaffProfile"("unitId", "active");
CREATE INDEX IF NOT EXISTS "ShiftType_unitId_active_idx" ON "ShiftType"("unitId", "active");

CREATE INDEX IF NOT EXISTS "ScheduleAssignment_doctorId_idx" ON "ScheduleAssignment"("doctorId");
CREATE INDEX IF NOT EXISTS "ScheduleConflict_scheduleTaskId_severity_idx" ON "ScheduleConflict"("scheduleTaskId", "severity");

CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_unitId_createdAt_idx" ON "Feedback"("unitId", "createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "OrganizationRequest_createdAt_idx" ON "OrganizationRequest"("createdAt");
