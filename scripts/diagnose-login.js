const crypto = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function verifySecret(secret, storedHash) {
  const [scheme, salt, hash] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = crypto.scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function safeError(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || null,
    category:
      String(error?.message || "").includes("Authentication failed against database server")
        ? "DATABASE_AUTH_FAILED"
        : String(error?.message || "").includes("Can't reach database server")
          ? "DATABASE_UNREACHABLE"
          : "UNKNOWN_ERROR"
  };
}

async function checkUser(label, username, password) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { department: true }
  });

  return {
    label,
    username,
    exists: Boolean(user),
    role: user?.role || null,
    active: user?.isActive ?? null,
    mustChangePassword: user?.mustChangePassword ?? null,
    departmentName: user?.department?.name || null,
    passwordMatchesEnvLocal: user ? verifySecret(password || "", user.passwordHash) : false
  };
}

async function main() {
  const superAdminUsername = process.env.INITIAL_SUPER_ADMIN_USERNAME || "jks";
  const departmentAdminUsername = process.env.INITIAL_DEPARTMENT_ADMIN_USERNAME || "xdt";

  const result = {
    envPresence: getEnvPresence(),
    dbReachable: false,
    users: []
  };

  await prisma.$queryRaw`SELECT 1`;
  result.dbReachable = true;
  result.users.push(
    await checkUser("super-admin", superAdminUsername, process.env.INITIAL_SUPER_ADMIN_PASSWORD),
    await checkUser("department-admin", departmentAdminUsername, process.env.INITIAL_DEPARTMENT_ADMIN_PASSWORD)
  );

  console.log(JSON.stringify(result, null, 2));
}

function getEnvPresence() {
  return {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    INITIAL_SUPER_ADMIN_USERNAME: Boolean(process.env.INITIAL_SUPER_ADMIN_USERNAME),
    INITIAL_SUPER_ADMIN_PASSWORD: Boolean(process.env.INITIAL_SUPER_ADMIN_PASSWORD),
    INITIAL_DEPARTMENT_NAME: Boolean(process.env.INITIAL_DEPARTMENT_NAME),
    INITIAL_DEPARTMENT_ADMIN_USERNAME: Boolean(process.env.INITIAL_DEPARTMENT_ADMIN_USERNAME),
    INITIAL_DEPARTMENT_ADMIN_PASSWORD: Boolean(process.env.INITIAL_DEPARTMENT_ADMIN_PASSWORD)
  };
}

main()
  .catch((error) => {
    console.log(
      JSON.stringify(
        {
          envPresence: getEnvPresence(),
          dbReachable: false,
          error: safeError(error)
        },
        null,
        2
      )
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
