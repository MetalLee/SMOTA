import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "playwright.cmd" : "playwright";
const result = spawnSync(command, ["install", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "0"
  }
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
