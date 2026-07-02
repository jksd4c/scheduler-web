import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const hospitalName = String(body.hospitalName ?? "").trim();
    const departmentName = String(body.departmentName ?? "").trim();
    const applicantName = String(body.applicantName ?? "").trim();
    const contact = String(body.contact ?? "").trim();
    const note = String(body.note ?? "").trim() || null;

    if (!hospitalName || !departmentName || !applicantName || !contact) {
      return NextResponse.json({ message: "请填写医院、科室、申请人和联系方式" }, { status: 400 });
    }

    const organizationRequest = await prisma.organizationRequest.create({
      data: {
        requesterUserId: user?.id ?? null,
        hospitalName,
        departmentName,
        applicantName,
        contact,
        note
      }
    });

    return NextResponse.json({ organizationRequest }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "提交申请失败" }, { status: 500 });
  }
}
