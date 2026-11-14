// Production entry: `npm start`. Runs the built site on Node and wakes the in-process scheduler
// (catalog seeding and store imports) as soon as the server answers.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (!existsSync("dist")) {
  console.error("dist/ yoxdur. Əvvəlcə `npm run build` işlədin.");
  process.exit(1);
}
const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";
const child = spawn(
  process.execPath,
  [
    "--no-warnings=ExperimentalWarning",
    "node_modules/vinext/dist/cli.js",
    "start",
    "-p",
    port,
    "-H",
    host,
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));

for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    if (r.ok) {
      console.log(`Qəpik hazırdır: http://${host}:${port}`);
      break;
    }
  } catch {}
}
