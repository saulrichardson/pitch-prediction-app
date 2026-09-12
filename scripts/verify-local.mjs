import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import path from "node:path";

const editionPath = path.resolve(".cache/test-edition.json");
const run = (args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command failed: ${args.join(" ")} (${code})`)),
    );
  });
await run(["--import", "tsx", "scripts/write-test-edition.ts"]);
const server = spawn(
  process.execPath,
  [
    "../../node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: "apps/web",
    stdio: "inherit",
    env: {
      ...process.env,
      STORAGE_MODE: "memory",
      SESSION_SECRET: "local-verification-only",
      REPLAY_EDITION_PATH: editionPath,
    },
  },
);
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null)
      throw new Error("Verification server stopped before readiness.");
    const response = await fetch("http://127.0.0.1:3100/ready").catch(
      () => null,
    );
    if (response?.ok) {
      ready = true;
      break;
    }
    await pause(500);
  }
  if (!ready) throw new Error("Verification server never became ready.");
  await run(["scripts/verify-product-flows.mjs"], {
    ...process.env,
    BASE_URL: "http://127.0.0.1:3100",
  });
  await run(["scripts/verify-game-catalog.mjs"], {
    ...process.env,
    BASE_URL: "http://127.0.0.1:3100",
  });
} finally {
  server.kill("SIGTERM");
}
