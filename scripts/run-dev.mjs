import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const environmentPath = resolve(root, ".env");
const turboPath = resolve(root, "node_modules", "turbo", "bin", "turbo");

if (!existsSync(environmentPath)) {
  console.error(
    "Missing .env. Run `npm run setup` for a first-time setup or `npm run env:init` to create it."
  );
  process.exit(1);
}

process.loadEnvFile(environmentPath);

const requiredVariables = ["DATABASE_URL", "JWT_SECRET"];
const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]?.trim()
);

if (missingVariables.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVariables.join(", ")}.`
  );
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error(
    "JWT_SECRET must contain at least 32 characters. Delete .env and run `npm run env:init`, or replace the value manually."
  );
  process.exit(1);
}

const turbo = spawn(process.execPath, [turboPath, "run", "dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit"
});

turbo.on("error", (error) => {
  console.error(`Unable to start Turborepo: ${error.message}`);
  process.exit(1);
});

turbo.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
