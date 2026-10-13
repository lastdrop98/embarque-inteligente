import { spawnSync } from "node:child_process";

const url = process.env.LOVABLE_DB_MIGRATION_URL;

if (!url) {
  console.log("[db] LOVABLE_DB_MIGRATION_URL not present; skipping cloud migration.");
  process.exit(0);
}

console.log("[db] Applying Drizzle migrations to the Lovable Cloud database...");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["drizzle-kit", "migrate"],
  { stdio: "inherit", env: process.env }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[db] Cloud migrations applied successfully.");
