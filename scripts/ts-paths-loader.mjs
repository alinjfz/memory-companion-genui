import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const extensions = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const indexFiles = [
  "/index.ts",
  "/index.tsx",
  "/index.mts",
  "/index.cts",
  "/index.js",
  "/index.mjs",
  "/index.cjs",
];
const nextSubpaths = new Map([
  ["next/server", "next/server.js"],
  ["next/navigation", "next/navigation.js"],
  ["next/link", "next/link.js"],
]);

function resolveLocal(specifier) {
  if (!specifier.startsWith("@/")) return null;

  const base = resolvePath(root, "src", specifier.slice(2));
  const candidates = [...extensions.map((ext) => base + ext), ...indexFiles.map((ext) => base + ext)];
  const hit = candidates.find((candidate) => existsSync(candidate));
  return hit ? pathToFileURL(hit).href : null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === "server-only") {
    return {
      url: pathToFileURL(resolvePath(root, "scripts/server-only-stub.mjs")).href,
      shortCircuit: true,
    };
  }
  const local = resolveLocal(specifier);
  if (local) {
    return { url: local, shortCircuit: true };
  }
  const nextMapped = nextSubpaths.get(specifier);
  if (nextMapped) {
    return defaultResolve(nextMapped, context, defaultResolve);
  }
  return defaultResolve(specifier, context, defaultResolve);
}
