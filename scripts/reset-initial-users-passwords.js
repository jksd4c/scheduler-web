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

// The deployed login code currently verifies the app's scrypt hash format.
// Using bcrypt here would require a code deploy before the new hashes could log in.
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
    departmentName: user.department?.name || null
  };
}

async function main() {
  const superAdminUsername = requiredEnv("INITIAL_SUPER_ADMIN_USERNAME");
  const superAdminPassword = requiredEnv("INITIAL_SUPER_ADMIN_PASSWORD");
  const departmentAdminUsername = requiredEnv("INITIAL_DEPARTMENT_ADMIN_USERNAME");
  const departmentAdminPassword = requiredEnv("INITIAL_DEPARTMENT_ADMIN_PASSWORD");
  const departmentName = requiredEnv("INITIAL_DEPARTMENT_NAME");

  const department = await prisma.department.upsert({
    where: { name: departmentName },
    update: { isActive: true },
    create: { name: departmentName, isActive: true }
  });

  const superAdmin = await prisma.user.upsert({
    where: { username: superAdminUsername },
    update: {
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      departmentId: null,
      isActive: true,
      mustChangePassword: false
    },
    create: {
      username: superAdminUsername,
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      departmentId: null,
      isActive: true,
      mustChangePassword: false
    },
    include: { department: true }
  });

  const departmentAdmin = await prisma.user.upsert({
    where: { username: departmentAdminUsername },
    update: {
      passwordHash: hashPassword(departmentAdminPassword),
      role: "DEPARTMENT_ADMIN",
      departmentId: department.id,
      isActive: true,
      mustChangePassword: true
    },
    create: {
      username: departmentAdminUsername,
      passwordHash: hashPassword(departmentAdminPassword),
      role: "DEPARTMENT_ADMIN",
      departmentId: department.id,
      isActive: true,
      mustChangePassword: true
    },
    include: { department: true }
  });

  console.log("已重置 jks");
  console.table([safeUserSummary(superAdmin)]);
  console.log("已重置 xdt");
  console.table([safeUserSummary(departmentAdmin)]);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Reset failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
