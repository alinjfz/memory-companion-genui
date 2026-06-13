#!/usr/bin/env node
/** pnpm doctor — quick preflight for Echoes hackathon demo */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = existsSync(join(root, ".env.local"))
  ? join(root, ".env.local")
  : existsSync(join(root, ".env"))
    ? join(root, ".env")
    : join(root, ".env.example");
const envExample = join(root, ".env.example");
let ok = true;

function check(name: string, pass: boolean, detail: string, hint?: string) {
  console.log(`${pass ? "✓" : "✗"} ${name}: ${detail}`);
  if (!pass && hint) console.log(`  → ${hint}`);
  if (!pass) ok = false;
}

try {
  const node = execSync("node -v", { encoding: "utf8" }).trim();
  check("Node", Number.parseInt(node.slice(1), 10) >= 20, node);
} catch {
  check("Node", false, "not found", "Install Node 20+");
}

try {
  const pnpm = execSync("pnpm -v", { encoding: "utf8" }).trim();
  check("pnpm", Number.parseInt(pnpm, 10) >= 9, pnpm);
} catch {
  check("pnpm", false, "not found", "corepack enable && corepack prepare pnpm@latest --activate");
}

try {
  execSync("python3 -c 'import fastapi'", { stdio: "ignore" });
  check("Python FastAPI", true, "import ok");
} catch {
  check("Python FastAPI", false, "missing", "pnpm install (postinstall) or pip install -r agent/requirements.txt");
}

const envFile = envPath;
if (existsSync(envFile)) {
  const env = readFileSync(envFile, "utf8");
  const offline = /\bOFFLINE=1\b/.test(env);
  const hasLlm = /GEMINI_API_KEY=\S+/.test(env) || /OPENROUTER_API_KEY=\S+/.test(env);
  check("LLM or offline", offline || hasLlm, offline ? "OFFLINE=1" : hasLlm ? "key set" : "none", "Set GEMINI_API_KEY or OFFLINE=1 in .env.local");

  const dataDir = process.env.ECHOES_DATA_DIR?.trim() || join(root, ".echoes");
  check("Data directory", true, dataDir, "Patient DB: .echoes/patients.json (set ECHOES_DATA_DIR to override)");
} else {
  check(".env", false, "missing", "cp .env.example .env.local");
}

process.exit(ok ? 0 : 1);
