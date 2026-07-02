import { prisma } from "@/lib/prisma";

export async function getDefaultDepartmentId() {
  const existing = await prisma.department.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  });
  if (existing) {
    return existing.id;
  }

  const hospital = await prisma.hospital.upsert({
    where: { name: "默认医院" },
    update: { isActive: true },
    create: { name: "默认医院", isActive: true }
  });

  const department = await prisma.department.create({
    data: {
      hospitalId: hospital.id,
      name: "默认科室",
      isActive: true
    }
  });

  await prisma.unit.create({
    data: {
      hospitalId: hospital.id,
      departmentId: department.id,
      name: "默认病区",
      isActive: true
    }
  });

  return department.id;
}
