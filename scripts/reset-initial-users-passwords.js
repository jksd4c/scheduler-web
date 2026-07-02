const crypto = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function safeUserSummary(user) {
  return {
    username: user.username,
    role: user.role,
    active: user.isActive,
    mustChangePassword: user.mustChangePassword,
    hospitalName: user.hospital?.name || null,
    departmentName: user.department?.name || null,
    unitName: user.unit?.name || null
  };
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
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      hospitalId: null,
      departmentId: null,
      unitId: null,
      isActive: true,
      mustChangePassword: false
    },
    create: {
      username: superAdminUsername,
      displayName: superAdminUsername,
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      hospitalId: null,
      departmentId: null,
      unitId: null,
      isActive: true,
      mustChangePassword: false
    },
    include: { hospital: true, department: true, unit: true }
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

  const schedulerAdmin = await prisma.user.upsert({
    where: { username: departmentAdminUsername },
    update: {
      passwordHash: hashPassword(departmentAdminPassword),
      role: "SCHEDULER_ADMIN",
      hospitalId: hospital.id,
      departmentId: department.id,
      unitId: unit.id,
      isActive: true,
      mustChangePassword: true
    },
    create: {
      username: departmentAdminUsername,
      displayName: departmentAdminUsername,
      passwordHash: hashPassword(departmentAdminPassword),
      role: "SCHEDULER_ADMIN",
      hospitalId: hospital.id,
      departmentId: department.id,
      unitId: unit.id,
      isActive: true,
      mustChangePassword: true
    },
    include: { hospital: true, department: true, unit: true }
  });

  console.log("已重置 jks");
  console.table([safeUserSummary(superAdmin)]);
  console.log("已重置 xdt");
  console.table([safeUserSummary(schedulerAdmin)]);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Reset failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
