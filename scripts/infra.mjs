import { spawn, spawnSync } from "node:child_process";

const [action = "status"] = process.argv.slice(2);
const command = process.platform === "win32" ? "docker.exe" : "docker";

const engine = spawnSync(command, ["info", "--format", "{{.ServerVersion}}"], {
  encoding: "utf8",
  timeout: 15_000,
  windowsHide: true
});

if (engine.error?.code === "ETIMEDOUT") {
  console.error(
    "Docker Engine did not respond within 15 seconds. Restart Docker Desktop, wait until the engine is ready, then retry."
  );
  process.exit(1);
}

if (engine.status !== 0) {
  console.error(
    engine.stderr?.trim() ||
      "Docker Engine is unavailable. Start Docker Desktop and retry."
  );
  process.exit(1);
}

const argumentsByAction = {
  down: ["compose", "down"],
  logs: ["compose", "logs", "--tail=100", "-f"],
  status: ["compose", "ps"],
  up: ["compose", "up", "-d", "--wait", "postgres", "redis", "qdrant"]
};

const composeArguments = argumentsByAction[action];
if (!composeArguments) {
  console.error(`Unknown infrastructure action: ${action}.`);
  process.exit(1);
}

const compose = spawn(command, composeArguments, {
  env: process.env,
  stdio: "inherit",
  windowsHide: true
});

compose.on("error", (error) => {
  console.error(`Unable to run Docker Compose: ${error.message}`);
  process.exit(1);
});

compose.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
