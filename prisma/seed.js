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
  const departmentName = requiredEnv("INITIAL_DEPARTMENT_NAME");
  const superAdminUsername = requiredEnv("INITIAL_SUPER_ADMIN_USERNAME");
  const superAdminPassword = requiredEnv("INITIAL_SUPER_ADMIN_PASSWORD");
  const departmentAdminUsername = requiredEnv("INITIAL_DEPARTMENT_ADMIN_USERNAME");
  const departmentAdminPassword = requiredEnv("INITIAL_DEPARTMENT_ADMIN_PASSWORD");

  const department = await prisma.department.upsert({
    where: { name: departmentName },
    update: { isActive: true },
    create: { name: departmentName, isActive: true }
  });

  await prisma.user.upsert({
    where: { username: superAdminUsername },
    update: {
      role: "SUPER_ADMIN",
      departmentId: null,
      isActive: true
    },
    create: {
      username: superAdminUsername,
      passwordHash: hashPassword(superAdminPassword),
      role: "SUPER_ADMIN",
      departmentId: null,
      mustChangePassword: false,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: departmentAdminUsername },
    update: {
      role: "DEPARTMENT_ADMIN",
      departmentId: department.id,
      mustChangePassword: true,
      isActive: true
    },
    create: {
      username: departmentAdminUsername,
      passwordHash: hashPassword(departmentAdminPassword),
      role: "DEPARTMENT_ADMIN",
      departmentId: department.id,
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
