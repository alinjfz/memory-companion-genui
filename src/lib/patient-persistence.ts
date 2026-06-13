import "server-only";

import fs from "node:fs";
import path from "node:path";

export type PersistedPatientStore = {
  patients: Record<string, unknown>;
  activeCode: string | null;
};

/** Local database folder — set ECHOES_DATA_DIR to override (absolute path). */
export function getEchoesDataDir() {
  const configured = process.env.ECHOES_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), ".echoes");
}

export function getPatientsFilePath() {
  return path.join(getEchoesDataDir(), "patients.json");
}

export function getKvStoreFilePath() {
  return path.join(getEchoesDataDir(), "kv-store.json");
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function loadJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`[echoes] Failed to read ${filePath}:`, error);
    return null;
  }
}

export function saveJsonFile(filePath: string, data: unknown) {
  try {
    ensureDir(path.dirname(filePath));
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, filePath);
  } catch (error) {
    console.error(`[echoes] Failed to write ${filePath}:`, error);
    throw error;
  }
}

export function loadPatientStore(): PersistedPatientStore | null {
  const parsed = loadJsonFile<PersistedPatientStore>(getPatientsFilePath());
  if (!parsed || typeof parsed !== "object" || !parsed.patients) return null;
  return {
    patients: parsed.patients,
    activeCode: parsed.activeCode ?? null,
  };
}

export function savePatientStore(store: PersistedPatientStore) {
  saveJsonFile(getPatientsFilePath(), store);
}
