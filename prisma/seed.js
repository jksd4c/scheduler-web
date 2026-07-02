const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for database seed.`);
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const hospitalName = process.env.INITIAL_HOSPITAL_NAME?.trim() || "默认医院";
  const departmentName = requiredEnv("INITIAL_DEPARTMENT_NAME");
  const unitName = process.env.INITIAL_UNIT_NAME?.trim() || "默认病区";
  const superAdminUsername = requiredEnv("INITIAL_SUPER_ADMIN_USERNAME");
  const superAdminPassword = requiredEnv("INITIAL_SUPER_ADMIN_PASSWORD");
  const departmentAdminUsername = requiredEnv("INITIAL_DEPARTMENT_ADMIN_USERNAME");
  const departmentAdminPassword = requiredEnv("INITIAL_DEPARTMENT_ADMIN_PASSWORD");

  const hospital = await prisma.hospital.upsert({
    where: { name: hospitalName },
    update: { isActive: true },
    create: { name: hospitalName, isActive: true }
  });

  const department = await prisma.department.upsert({
    where: { hospitalId_name: { hospitalId: hospital.id, name: departmentName } },
    update: { hospitalId: hospital.id, isActive: true },
    create: { hospitalId: hospital.id, name: departmentName, isActive: true }
  });

  const superAdmin = await prisma.user.upsert({
    where: { username: superAdminUsername },
    update: {
      role: "SUPER_ADMIN",
      hospitalId: null,
      departmentId: null,
      unitId: null,
      isActive: true
    },
    create: {
      username: superAdminUsername,
      displayName: superAdminUsername,
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      hospitalId: null,
      departmentId: null,
      unitId: null,
      mustChangePassword: false,
      isActive: true
    }
  });

  const unit = await prisma.unit.upsert({
    where: { departmentId_name: { departmentId: department.id, name: unitName } },
    update: { hospitalId: hospital.id, isActive: true },
    create: {
      hospitalId: hospital.id,
      departmentId: department.id,
      name: unitName,
      isActive: true,
      createdByUserId: superAdmin.id
    }
  });

  await prisma.user.upsert({
    where: { username: departmentAdminUsername },
    update: {
      role: "SCHEDULER_ADMIN",
      hospitalId: hospital.id,
      departmentId: department.id,
      unitId: unit.id,
      mustChangePassword: true,
      isActive: true
    },
    create: {
      username: departmentAdminUsername,
      displayName: departmentAdminUsername,
      passwordHash: hashPassword(departmentAdminPassword),
      role: "SCHEDULER_ADMIN",
      hospitalId: hospital.id,
      departmentId: department.id,
      unitId: unit.id,
      mustChangePassword: true,
      isActive: true
    }
  });

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
