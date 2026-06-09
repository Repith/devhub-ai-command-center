import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const environmentPath = resolve(root, ".env");
const templatePath = resolve(root, ".env.example");

try {
  await access(environmentPath, constants.F_OK);
  console.log(".env already exists; leaving it unchanged.");
} catch {
  const template = await readFile(templatePath, "utf8");
  const jwtSecret = randomBytes(48).toString("base64url");
  const environment = template.replace(
    /^JWT_SECRET=.*$/m,
    `JWT_SECRET=${jwtSecret}`
  );

  await writeFile(environmentPath, environment, {
    encoding: "utf8",
    flag: "wx"
  });
  console.log("Created .env with a generated JWT secret.");
}
