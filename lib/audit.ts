import { prisma } from "@/lib/prisma";

type AuditInput = {
  actorUserId?: string | null;
  hospitalId?: string | null;
  departmentId?: string | null;
  unitId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null;
  request?: Request;
};

export async function writeAuditLog(input: AuditInput) {
  const forwardedFor = input.request?.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || null;
  const userAgent = input.request?.headers.get("user-agent") || null;

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId || null,
      hospitalId: input.hospitalId || null,
      departmentId: input.departmentId || null,
      unitId: input.unitId || null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || null,
      beforeJson: input.beforeJson === undefined ? undefined : (input.beforeJson as object),
      afterJson: input.afterJson === undefined ? undefined : (input.afterJson as object),
      reason: input.reason || null,
      ip,
      userAgent
    }
  });
}
