import { NextResponse } from "next/server";
import { createUserSession, USER_ROLE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const email = String(body.email ?? "").trim() || null;
    const hospitalId = String(body.hospitalId ?? "").trim();
    const departmentId = String(body.departmentId ?? "").trim();
    const unitName = String(body.unitName ?? "").trim();

    if (!username || !displayName || password.length < 8 || !hospitalId || !departmentId || !unitName) {
      return NextResponse.json({ message: "请完整填写注册信息，密码至少 8 位" }, { status: 400 });
    }

    const department = await prisma.department.findFirst({
      where: { id: departmentId, hospitalId, isActive: true, hospital: { isActive: true } },
      include: { hospital: true }
    });

    if (!department || !department.hospital) {
      return NextResponse.json({ message: "请选择有效的医院和科室" }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : [])
        ]
      },
      select: { username: true, phone: true, email: true }
    });

    if (existing) {
      return NextResponse.json({ message: "用户名、手机号或邮箱已被使用" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          displayName,
          phone,
          email,
          passwordHash: hashSecret(password),
          role: USER_ROLE.SCHEDULER_ADMIN,
          hospitalId,
          departmentId,
          mustChangePassword: false,
          isActive: true
        }
      });

      const unit = await tx.unit.upsert({
        where: { departmentId_name: { departmentId, name: unitName } },
        update: {
          hospitalId,
          isActive: true
        },
        create: {
          hospitalId,
          departmentId,
          name: unitName,
          isActive: true,
          createdByUserId: user.id
        }
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { unitId: unit.id },
        include: { hospital: true, department: true, unit: true }
      });

      return { user: updatedUser, unit };
    });

    await writeAuditLog({
      actorUserId: result.user.id,
      hospitalId,
      departmentId,
      unitId: result.unit.id,
      action: "REGISTER_SCHEDULER_ADMIN",
      targetType: "User",
      targetId: result.user.id,
      afterJson: {
        username: result.user.username,
        displayName: result.user.displayName,
        role: result.user.role,
        hospitalId,
        departmentId,
        unitId: result.unit.id
      },
      request
    });

    await createUserSession(result.user.id);
    return NextResponse.json({ ok: true, redirectTo: "/dashboard" }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "注册失败" }, { status: 500 });
  }
}
