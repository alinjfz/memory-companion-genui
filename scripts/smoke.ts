#!/usr/bin/env node
/** pnpm smoke — typecheck + agent routes + A2UI ops helper */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let ok = true;

function run(name: string, cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  const pass = res.status === 0;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) ok = false;
}

run("typecheck", "pnpm", ["typecheck"]);
run("patient tests", "pnpm", ["test:runtime"]);

const py = spawnSync(
  "python3",
  ["-c", "from main import app; assert any(getattr(r, 'path', '') == '/patient' for r in app.routes)"],
  { cwd: join(root, "agent"), stdio: "pipe", encoding: "utf8" },
);
if (py.status === 0) {
  console.log("PASS agent /patient route");
} else if ((py.stderr ?? "").includes("No module named")) {
  console.log("SKIP agent /patient route (run pnpm install / pip install -r agent/requirements.txt)");
} else {
  console.log("FAIL agent /patient route");
  if (py.stderr) console.error(py.stderr);
  ok = false;
}

const opsPath = join(root, "src/lib/a2ui-ops.ts");
const opsSrc = existsSync(opsPath) ? readFileSync(opsPath, "utf8") : "";
const opsOk = opsSrc.includes("createSurface") && opsSrc.includes("updateComponents");
console.log(`${opsOk ? "PASS" : "FAIL"} a2ui v0.9 ops helper`);
if (!opsOk) ok = false;

process.exit(ok ? 0 : 1);
