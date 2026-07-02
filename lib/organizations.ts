import { prisma } from "@/lib/prisma";

export async function getActiveOrganizationOptions() {
  return prisma.hospital.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    include: {
      departments: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function getOrCreateDefaultUnit(departmentId: string, actorUserId?: string | null) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    include: { hospital: true, units: { orderBy: { createdAt: "asc" } } }
  });

  if (!department) {
    return null;
  }

  const existing = department.units[0];
  if (existing) {
    return prisma.unit.findUnique({
      where: { id: existing.id },
      include: { department: true, hospital: true }
    });
  }

  return prisma.unit.create({
    data: {
      hospitalId: department.hospitalId,
      departmentId: department.id,
      name: "默认病区",
      isActive: true,
      createdByUserId: actorUserId || null
    },
    include: { department: true, hospital: true }
  });
}

export async function getDefaultActiveUnit(actorUserId?: string | null) {
  const existing = await prisma.unit.findFirst({
    where: { isActive: true, department: { isActive: true } },
    orderBy: { createdAt: "asc" },
    include: { department: true, hospital: true }
  });
  if (existing) {
    return existing;
  }

  const department = await prisma.department.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    include: { hospital: true }
  });

  if (department) {
    return getOrCreateDefaultUnit(department.id, actorUserId);
  }

  const hospital = await prisma.hospital.upsert({
    where: { name: "默认医院" },
    update: { isActive: true },
    create: { name: "默认医院", isActive: true }
  });
  const createdDepartment = await prisma.department.create({
    data: { hospitalId: hospital.id, name: "默认科室", isActive: true }
  });
  return prisma.unit.create({
    data: {
      hospitalId: hospital.id,
      departmentId: createdDepartment.id,
      name: "默认病区",
      isActive: true,
      createdByUserId: actorUserId || null
    },
    include: { department: true, hospital: true }
  });
}

export async function findActiveDepartmentWithHospital(departmentId: string, hospitalId?: string) {
  return prisma.department.findFirst({
    where: {
      id: departmentId,
      isActive: true,
      ...(hospitalId ? { hospitalId } : {})
    },
    include: { hospital: true }
  });
}
