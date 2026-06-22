const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || "").replace(/\/$/, "");

if (!baseUrl) {
  console.error("Usage: pnpm smoke:http -- http://127.0.0.1:3000");
  console.error("   or: $env:SMOKE_BASE_URL='http://127.0.0.1:3000'; pnpm smoke:http");
  process.exit(1);
}

const pageChecks = [
  {
    path: "/login?preview=auth",
    statuses: [200],
    contains: ["Sign in to Arc", "Operator Access"],
  },
  {
    path: "/sign-up?preview=auth",
    statuses: [200],
    contains: ["Create your Arc account", "Join with code"],
  },
  {
    path: "/arc",
    statuses: [200, 302, 303, 307, 308],
  },
  {
    path: "/campaigns",
    statuses: [200, 302, 303, 307, 308],
  },
  {
    path: "/library",
    statuses: [200, 302, 303, 307, 308],
  },
  {
    path: "/settings",
    statuses: [200, 302, 303, 307, 308],
  },
];

const apiChecks = [
  {
    path: "/api/v1/arc/health",
    statuses: [401, 503],
  },
  {
    path: "/api/v1/arc/tasks",
    statuses: [401, 503],
  },
];

async function runCheck(check) {
  const url = `${baseUrl}${check.path}`;
  const response = await fetch(url, { redirect: "manual" });
  if (!check.statuses.includes(response.status)) {
    throw new Error(`${check.path} returned ${response.status}; expected ${check.statuses.join(", ")}`);
  }

  if (check.contains?.length && response.status === 200) {
    const body = await response.text();
    for (const text of check.contains) {
      if (!body.includes(text)) {
        throw new Error(`${check.path} did not include expected text: ${text}`);
      }
    }
  }

  console.log(`[smoke:http] ok ${response.status} ${check.path}`);
}

for (const check of [...pageChecks, ...apiChecks]) {
  await runCheck(check);
}

console.log("[smoke:http] HTTP smoke checks passed.");
