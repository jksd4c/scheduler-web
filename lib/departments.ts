import { prisma } from "@/lib/prisma";

export async function getDefaultDepartmentId() {
  const name = process.env.INITIAL_DEPARTMENT_NAME?.trim() || "心电图室";
  const department = await prisma.department.upsert({
    where: { name },
    update: {},
    create: { name }
  });

  return department.id;
}
