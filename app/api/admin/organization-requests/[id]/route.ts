import { NextResponse } from "next/server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await request.json();
    const action = String(body.action ?? "");
    if (action !== "APPROVE" && action !== "REJECT" && action !== "REVIEWING") {
      return NextResponse.json({ message: "操作无效" }, { status: 400 });
    }

    const organizationRequest = await prisma.organizationRequest.findUnique({ where: { id: params.id } });
    if (!organizationRequest) {
      return NextResponse.json({ message: "申请不存在" }, { status: 404 });
    }

    let status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "REVIEWING";
    let hospitalId: string | null = null;
    let departmentId: string | null = null;

    if (action === "APPROVE") {
      const hospital = await prisma.hospital.upsert({
        where: { name: organizationRequest.hospitalName },
        update: { isActive: true },
        create: { name: organizationRequest.hospitalName, isActive: true }
      });
      const department = await prisma.department.upsert({
        where: { hospitalId_name: { hospitalId: hospital.id, name: organizationRequest.departmentName } },
        update: { isActive: true },
        create: { hospitalId: hospital.id, name: organizationRequest.departmentName, isActive: true }
      });
      hospitalId = hospital.id;
      departmentId = department.id;
    }

    const updated = await prisma.organizationRequest.update({
      where: { id: params.id },
      data: { status }
    });

    await writeAuditLog({
      actorUserId: user.id,
      hospitalId,
      departmentId,
      action: "REVIEW_ORGANIZATION_REQUEST",
      targetType: "OrganizationRequest",
      targetId: updated.id,
      beforeJson: { status: organizationRequest.status },
      afterJson: { status, hospitalName: updated.hospitalName, departmentName: updated.departmentName },
      reason: String(body.reason ?? "").trim() || null,
      request
    });

    return NextResponse.json({ organizationRequest: updated });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }
    return NextResponse.json({ message: "处理申请失败" }, { status: 500 });
  }
}
