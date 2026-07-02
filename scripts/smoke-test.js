const { loadEnvConfig } = require("@next/env");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

loadEnvConfig(process.cwd());

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for smoke test`);
  }
  return value;
}

function assert(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
  console.log(`PASS ${label}`);
}

function cookieFrom(headers) {
  const setCookie = headers.getSetCookie();
  if (!setCookie.length) {
    return "";
  }
  return setCookie
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function request(path, options = {}) {
  const url = new URL(path, baseUrl);
  const body = options.body || "";
  const headers = { ...(options.headers || {}) };

  const headerPath = pathJoinTemp("headers");
  const bodyPath = pathJoinTemp("body");
  const args = ["-sS", "--max-time", "30", "-D", headerPath, "-o", bodyPath, "-X", options.method || "GET"];
  if (process.platform === "win32") {
    args.splice(3, 0, "--ssl-no-revoke");
  }

  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }

  if (body) {
    args.push("--data-binary", "@-");
  }
  args.push(url.toString());

  try {
    const command = process.platform === "win32" ? "curl.exe" : "curl";
    const result = spawnSync(command, args, {
      input: body,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`curl exited with status ${result.status}`);
    }

    const rawHeaders = fs.readFileSync(headerPath, "utf8");
    const text = fs.readFileSync(bodyPath, "utf8");
    return buildResponse(rawHeaders, text);
  } finally {
    fs.rmSync(headerPath, { force: true });
    fs.rmSync(bodyPath, { force: true });
  }
}

function pathJoinTemp(kind) {
  return path.join(os.tmpdir(), `fair-schedule-smoke-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.${kind}`);
}

function buildResponse(rawHeaders, text) {
  const blocks = rawHeaders
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const lastBlock = blocks[blocks.length - 1] || "";
  const lines = lastBlock.split(/\r?\n/).filter(Boolean);
  const statusMatch = lines[0]?.match(/^HTTP\/\S+\s+(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const headerMap = new Map();
  const setCookie = [];

  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "set-cookie") {
      setCookie.push(value);
    }
    if (headerMap.has(name)) {
      headerMap.set(name, `${headerMap.get(name)}, ${value}`);
    } else {
      headerMap.set(name, value);
    }
  }

  return {
    status,
    headers: {
      get(name) {
        return headerMap.get(name.toLowerCase()) || null;
      },
      getSetCookie() {
        return setCookie;
      }
    },
    text: async () => text
  };
}

async function jsonRequest(path, options = {}) {
  const response = await request(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { response, data, cookie: cookieFrom(response.headers) };
}

async function login(username, password) {
  return jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

function nextMondayKey() {
  const now = new Date();
  const day = now.getDay() || 7;
  const diff = day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const date = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

async function main() {
  const superAdminUsername = requiredEnv("INITIAL_SUPER_ADMIN_USERNAME");
  const superAdminPassword = requiredEnv("INITIAL_SUPER_ADMIN_PASSWORD");
  const departmentAdminUsername = requiredEnv("INITIAL_DEPARTMENT_ADMIN_USERNAME");
  const departmentAdminPassword = requiredEnv("INITIAL_DEPARTMENT_ADMIN_PASSWORD");

  const loginPage = await request("/login");
  assert(loginPage.status === 200, "/login is accessible");

  const registerPage = await request("/register");
  assert(registerPage.status === 200, "/register is accessible");

  const feedbackUnauth = await request("/feedback");
  assert(feedbackUnauth.status === 307 && feedbackUnauth.headers.get("location")?.includes("/login"), "unauthenticated /feedback is rejected");

  const guestPage = await request("/guest");
  assert(guestPage.status === 200, "/guest is accessible");

  const unauthAdmin = await request("/admin");
  assert(unauthAdmin.status === 307 && unauthAdmin.headers.get("location")?.includes("/login"), "unauthenticated /admin is rejected");

  const unauthDashboard = await request("/dashboard");
  assert(
    unauthDashboard.status === 307 && unauthDashboard.headers.get("location")?.includes("/login"),
    "unauthenticated /dashboard is rejected"
  );

  const superAdminLogin = await login(superAdminUsername, superAdminPassword);
  assert(superAdminLogin.response.status === 200 && superAdminLogin.data.redirectTo === "/admin", "SUPER_ADMIN login redirects to /admin");

  const invalidLogin = await login("__smoke_missing_user__", "__smoke_wrong_password__");
  assert(invalidLogin.response.status === 401, "invalid credentials are rejected with 401");

  const adminPage = await request("/admin", { headers: { Cookie: superAdminLogin.cookie } });
  assert(adminPage.status === 200, "SUPER_ADMIN can access /admin");

  const adminFeedback = await request("/admin/feedback", { headers: { Cookie: superAdminLogin.cookie } });
  assert(adminFeedback.status === 200, "SUPER_ADMIN can access /admin/feedback");

  const departmentAdminLogin = await login(departmentAdminUsername, departmentAdminPassword);
  assert(departmentAdminLogin.response.status === 200, "SCHEDULER_ADMIN login succeeds");
  assert(
    departmentAdminLogin.data.redirectTo === "/dashboard" || departmentAdminLogin.data.redirectTo === "/change-password",
    "SCHEDULER_ADMIN reaches /dashboard or is required to change password"
  );

  if (departmentAdminLogin.data.redirectTo === "/dashboard") {
    const dashboard = await request("/dashboard", { headers: { Cookie: departmentAdminLogin.cookie } });
    assert(dashboard.status === 200, "SCHEDULER_ADMIN can access /dashboard");
  } else {
    const dashboard = await request("/dashboard", { headers: { Cookie: departmentAdminLogin.cookie } });
    assert(dashboard.status === 307 && dashboard.headers.get("location")?.includes("/change-password"), "must-change-password user is forced to /change-password");
  }

  const organization = await prisma.hospital.findFirst({
    where: { isActive: true, departments: { some: { isActive: true } } },
    include: { departments: { where: { isActive: true }, take: 1 } }
  });
  assert(Boolean(organization?.departments[0]), "active hospital and department exist for registration");

  const unique = Date.now().toString(36);
  const registerPassword = `Smoke-${unique}-Pass1`;
  const registerResult = await jsonRequest("/api/register", {
    method: "POST",
    body: JSON.stringify({
      username: `smoke_${unique}`,
      password: registerPassword,
      displayName: `Smoke ${unique}`,
      hospitalId: organization.id,
      departmentId: organization.departments[0].id,
      unitName: `冒烟测试病区-${unique}`
    })
  });
  assert(registerResult.response.status === 201 && registerResult.data.redirectTo === "/dashboard", "public registration creates scheduler admin");

  const registeredDashboard = await request("/dashboard", { headers: { Cookie: registerResult.cookie } });
  assert(registeredDashboard.status === 200, "registered scheduler admin can access /dashboard");

  const registeredAdminApi = await request("/api/admin/hospitals", { headers: { Cookie: registerResult.cookie } });
  assert(registeredAdminApi.status === 403, "registered scheduler admin cannot call SUPER_ADMIN API");

  const feedbackResult = await jsonRequest("/api/feedback", {
    method: "POST",
    headers: { Cookie: registerResult.cookie },
    body: JSON.stringify({
      type: "BUG",
      title: `Smoke feedback ${unique}`,
      content: "Smoke test feedback content."
    })
  });
  assert(feedbackResult.response.status === 201, "registered user can submit feedback");

  const staffTagsPage = await request("/dashboard/staff-tags", { headers: { Cookie: registerResult.cookie } });
  assert(staffTagsPage.status === 200, "SCHEDULER_ADMIN can access staff tag settings");

  const staffPage = await request("/dashboard/staff", { headers: { Cookie: registerResult.cookie } });
  assert(staffPage.status === 200, "SCHEDULER_ADMIN can access staff management");

  const shiftTypesPage = await request("/dashboard/shift-types", { headers: { Cookie: registerResult.cookie } });
  assert(shiftTypesPage.status === 200, "SCHEDULER_ADMIN can access shift type settings");

  async function createTag(name, category, policy) {
    const result = await jsonRequest("/api/staff-tags", {
      method: "POST",
      headers: { Cookie: registerResult.cookie },
      body: JSON.stringify({ name: `${name}-${unique}`, category, policy })
    });
    assert(result.response.status === 201, `created staff tag ${name}`);
    return result.data.tag;
  }

  const internTag = await createTag("实习医生", "TRAINING", {
    canWorkDayShift: true,
    canWorkNightShift: false,
    canWorkSecondLine: false,
    canWorkIndependently: false,
    workloadFactor: 0.5
  });
  const residentTag = await createTag("规培医生", "TRAINING", {
    canWorkDayShift: true,
    canWorkNightShift: true,
    canWorkFirstLine: true,
    maxWorkDaysPerWeek: 5,
    workloadFactor: 0.8
  });
  const firstLineTag = await createTag("一线资格", "DUTY_QUALIFICATION", { canWorkFirstLine: true });
  const secondLineTag = await createTag("二线资格", "DUTY_QUALIFICATION", { canWorkSecondLine: true });
  const nightTag = await createTag("可夜班", "DUTY_QUALIFICATION", { canWorkNightShift: true });

  async function createStaff(displayName, tagIds) {
    const result = await jsonRequest("/api/staff", {
      method: "POST",
      headers: { Cookie: registerResult.cookie },
      body: JSON.stringify({ displayName: `${displayName}-${unique}`, tagIds })
    });
    assert(result.response.status === 201, `created staff ${displayName}`);
    return result.data.staff[0];
  }

  const seniorStaff = await createStaff("二线人员", [secondLineTag.id, nightTag.id]);
  const internStaff = await createStaff("实习人员", [internTag.id, firstLineTag.id]);
  await createStaff("规培人员", [residentTag.id, firstLineTag.id, nightTag.id]);

  async function createShiftType(name, category, isNight, requiredTags) {
    const result = await jsonRequest("/api/shift-types", {
      method: "POST",
      headers: { Cookie: registerResult.cookie },
      body: JSON.stringify({ name: `${name}-${unique}`, category, isNight, requiredTags })
    });
    assert(result.response.status === 201, `created shift type ${name}`);
    return result.data.shiftType;
  }

  await createShiftType("一线班", "FIRST_LINE", false, [{ staffTagId: firstLineTag.id, requirementType: "REQUIRED" }]);
  const secondLineShift = await createShiftType("二线班", "SECOND_LINE", false, [{ staffTagId: secondLineTag.id, requirementType: "REQUIRED" }]);
  const nightShift = await createShiftType("夜班", "NIGHT", true, [
    { staffTagId: nightTag.id, requirementType: "REQUIRED" },
    { staffTagId: internTag.id, requirementType: "FORBIDDEN" }
  ]);

  const weekStartDate = nextMondayKey();
  const taskResult = await jsonRequest("/api/tasks", {
    method: "POST",
    headers: { Cookie: registerResult.cookie },
    body: JSON.stringify({
      weekStartDate,
      mode: "HALF_DAY",
      staffProfileIds: [seniorStaff.id, internStaff.id]
    })
  });
  assert(taskResult.response.status === 201, "created task from staff profiles");
  const taskId = taskResult.data.task.id;

  const requirementsResult = await jsonRequest(`/api/tasks/${taskId}/requirements`, {
    method: "PUT",
    headers: { Cookie: registerResult.cookie },
    body: JSON.stringify({
      records: [
        { date: weekStartDate, weekday: 1, timeSlot: "MORNING", roomNumber: 1, requiredDoctors: 1, enabled: true, shiftTypeId: secondLineShift.id },
        { date: weekStartDate, weekday: 1, timeSlot: "AFTERNOON", roomNumber: 1, requiredDoctors: 2, enabled: true, shiftTypeId: nightShift.id }
      ]
    })
  });
  assert(requirementsResult.response.status === 200, "saved requirements with shift type identity rules");

  const generateResult = await jsonRequest(`/api/tasks/${taskId}/generate`, {
    method: "POST",
    headers: { Cookie: registerResult.cookie },
    body: JSON.stringify({})
  });
  assert(generateResult.response.status === 200, "generated schedule with identity strategy");
  const generatedTask = generateResult.data.task;
  const nightAssignments = generatedTask.assignments.filter((assignment) => assignment.timeSlot === "AFTERNOON");
  assert(nightAssignments.every((assignment) => !assignment.doctor.name.includes("实习人员")), "night shift excludes intern tag");
  assert(generatedTask.conflicts.some((conflict) => conflict.conflictType === "UNFILLED"), "identity shortage creates unfilled conflict");
  assert(generatedTask.stats.identityGroups.length > 0, "fairness report includes identity groups");

  const editAttempt = await jsonRequest("/api/tasks/smoke-test-task/manual-adjust", {
    method: "POST",
    body: JSON.stringify({})
  });
  assert(editAttempt.response.status === 401, "visitor cannot call manual-adjust API");

  const deleteAttempt = await jsonRequest("/api/tasks/smoke-test-task", { method: "DELETE" });
  assert(deleteAttempt.response.status === 401, "visitor cannot delete task");

  const generateAttempt = await jsonRequest("/api/tasks/smoke-test-task/generate", { method: "POST" });
  assert(generateAttempt.response.status === 401, "visitor cannot regenerate schedule");

  console.log("SMOKE_TEST_PASSED");
}

main().catch((error) => {
  const details = [error.name, error.code, error.message].filter(Boolean).join(" ");
  console.error(`SMOKE_TEST_FAILED ${details || "unknown error"}`);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
