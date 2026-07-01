const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

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
  const setCookie = headers.get("set-cookie");
  if (!setCookie) {
    return "";
  }
  return setCookie
    .split(",")
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", ...options });
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

async function main() {
  const superAdminUsername = requiredEnv("INITIAL_SUPER_ADMIN_USERNAME");
  const superAdminPassword = requiredEnv("INITIAL_SUPER_ADMIN_PASSWORD");
  const departmentAdminUsername = requiredEnv("INITIAL_DEPARTMENT_ADMIN_USERNAME");
  const departmentAdminPassword = requiredEnv("INITIAL_DEPARTMENT_ADMIN_PASSWORD");

  const loginPage = await request("/login");
  assert(loginPage.status === 200, "/login is accessible");

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

  const adminPage = await request("/admin", { headers: { Cookie: superAdminLogin.cookie } });
  assert(adminPage.status === 200, "SUPER_ADMIN can access /admin");

  const departmentAdminLogin = await login(departmentAdminUsername, departmentAdminPassword);
  assert(departmentAdminLogin.response.status === 200, "DEPARTMENT_ADMIN login succeeds");
  assert(
    departmentAdminLogin.data.redirectTo === "/dashboard" || departmentAdminLogin.data.redirectTo === "/change-password",
    "DEPARTMENT_ADMIN reaches /dashboard or is required to change password"
  );

  if (departmentAdminLogin.data.redirectTo === "/dashboard") {
    const dashboard = await request("/dashboard", { headers: { Cookie: departmentAdminLogin.cookie } });
    assert(dashboard.status === 200, "DEPARTMENT_ADMIN can access /dashboard");
  } else {
    const dashboard = await request("/dashboard", { headers: { Cookie: departmentAdminLogin.cookie } });
    assert(dashboard.status === 307 && dashboard.headers.get("location")?.includes("/change-password"), "must-change-password user is forced to /change-password");
  }

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
  console.error(`SMOKE_TEST_FAILED ${error.message}`);
  process.exit(1);
});
