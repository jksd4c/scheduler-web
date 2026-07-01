const { loadEnvConfig } = require("@next/env");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
  return path.join(os.tmpdir(), `ecg-smoke-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.${kind}`);
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

  const invalidLogin = await login("__smoke_missing_user__", "__smoke_wrong_password__");
  assert(invalidLogin.response.status === 401, "invalid credentials are rejected with 401");

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
  const details = [error.name, error.code, error.message].filter(Boolean).join(" ");
  console.error(`SMOKE_TEST_FAILED ${details || "unknown error"}`);
  process.exit(1);
});
