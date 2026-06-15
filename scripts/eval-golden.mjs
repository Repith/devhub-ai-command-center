const defaultApiOrigin = "http://localhost:4000/api/v1";
const apiOrigin = trimTrailingSlash(process.env.API_ORIGIN ?? defaultApiOrigin);
const accessToken = process.env.DEVHUB_ACCESS_TOKEN?.trim();
const mode = process.env.EVAL_GOLDEN_MODE ?? "FULL_AGENT_RUNTIME";
const shouldWait = process.env.EVAL_GOLDEN_WAIT !== "false";
const pollIntervalMs = Number(process.env.EVAL_GOLDEN_POLL_INTERVAL_MS ?? 2000);
const timeoutMs = Number(process.env.EVAL_GOLDEN_TIMEOUT_MS ?? 300000);

if (!accessToken) {
  console.error(
    "Missing DEVHUB_ACCESS_TOKEN. Sign in locally, export a tenant access token, and retry."
  );
  process.exit(1);
}

if (!["FAST_LLM_ONLY", "FULL_AGENT_RUNTIME"].includes(mode)) {
  console.error(
    "EVAL_GOLDEN_MODE must be FAST_LLM_ONLY or FULL_AGENT_RUNTIME."
  );
  process.exit(1);
}

const started = await requestJson("/evaluations/golden-set", {
  body: JSON.stringify({ mode }),
  method: "POST"
});

assertObject(started, "evaluation run");
const evaluationRunId = assertString(started.id, "evaluation run id");
const initialStatus = assertString(started.status, "evaluation run status");

console.log(
  `Started ${mode} golden evaluation ${evaluationRunId} with status ${initialStatus}.`
);

if (!shouldWait) {
  process.exit(0);
}

const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  const report = await requestJson(`/evaluations/${evaluationRunId}`);
  assertObject(report, "evaluation report");
  assertObject(report.run, "evaluation report run");

  const status = assertString(report.run.status, "evaluation report status");
  const results = Array.isArray(report.results) ? report.results : [];
  console.log(
    `Golden evaluation ${evaluationRunId}: ${status}, results ${results.length}.`
  );

  if (["COMPLETED", "FAILED", "CANCELLED"].includes(status)) {
    if (status !== "COMPLETED") {
      process.exit(1);
    }

    const passed = results.filter((result) => result?.passed === true).length;
    console.log(
      `Golden evaluation completed: ${passed}/${results.length} cases passed.`
    );
    process.exit(0);
  }

  await sleep(pollIntervalMs);
}

console.error(
  `Timed out waiting for golden evaluation ${evaluationRunId} after ${timeoutMs}ms.`
);
process.exit(1);

async function requestJson(path, init = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : text || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }

  return body;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${label} to be an object.`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
