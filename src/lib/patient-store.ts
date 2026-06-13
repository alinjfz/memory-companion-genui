import "server-only";

import { createEmptyProfile, type ActivityEvent, type PatientProfile } from "@/lib/echoes";
import type { AppState } from "@/lib/app-state-types";
import type { MemoryPolicy, MusicTrack, PatientMode } from "@/lib/app-state-helpers";
import { buildMemoryPoliciesFromProfile } from "@/lib/app-state-helpers";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth-crypto";
import { loadPatientStore, savePatientStore, getPatientsFilePath } from "@/lib/patient-persistence";

export interface PatientRecord {
  accessCode: string;
  caretakerEmail: string;
  caretakerPasswordHash: string;
  caretakerName: string;
  profile: PatientProfile;
  activity: ActivityEvent[];
  memoryPolicies: Record<string, MemoryPolicy>;
  /** @deprecated Legacy field — mirrors caretakerPasswordHash verification */
  caregiverPin: string;
  onboardingComplete: boolean;
  currentMode: PatientMode;
  currentTrack: MusicTrack | null;
  patientPrompt: string;
}

type RootStore = {
  patients: Record<string, PatientRecord>;
  activeCode: string | null;
};

type Holder = typeof globalThis & {
  __echoesPatients?: RootStore;
  __echoesPatientsLoaded?: boolean;
};

function migrateRecord(record: PatientRecord): PatientRecord {
  return {
    ...record,
    caretakerEmail: record.caretakerEmail || `${record.accessCode.toLowerCase()}@echoes.local`,
    caretakerPasswordHash:
      record.caretakerPasswordHash ||
      (record.caregiverPin ? hashPassword(record.caregiverPin) : hashPassword("echoes123")),
    caregiverPin: record.caregiverPin || "",
    activity: Array.isArray(record.activity) ? record.activity : [],
    memoryPolicies: record.memoryPolicies ?? {},
  };
}

function loadRootFromDisk(): RootStore {
  const loaded = loadPatientStore();
  if (!loaded) {
    return { patients: {}, activeCode: null };
  }

  const patients = Object.fromEntries(
    Object.entries(loaded.patients as Record<string, PatientRecord>).map(([code, record]) => [
      code.toUpperCase(),
      migrateRecord({ ...record, accessCode: code.toUpperCase() }),
    ]),
  );

  const root = { patients, activeCode: loaded.activeCode?.toUpperCase() ?? null };
  if (process.env.NODE_ENV !== "test" && Object.keys(patients).length > 0) {
    console.info(
      `[echoes] Loaded ${Object.keys(patients).length} patient record(s) from ${getPatientsFilePath()}`,
    );
  }
  return root;
}

function getRoot(): RootStore {
  const holder = globalThis as Holder;
  if (!holder.__echoesPatientsLoaded) {
    holder.__echoesPatients = loadRootFromDisk();
    holder.__echoesPatientsLoaded = true;
  }
  return holder.__echoesPatients ?? { patients: {}, activeCode: null };
}

function persistRoot(root: RootStore) {
  if (typeof window !== "undefined") return;
  savePatientStore({
    patients: root.patients,
    activeCode: root.activeCode,
  });
}

function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ECHO-${suffix}`;
}

function emptyRecord(
  accessCode: string,
  caretakerName: string,
  email: string,
  passwordHash: string,
): PatientRecord {
  return {
    accessCode,
    caretakerEmail: normalizeEmail(email),
    caretakerPasswordHash: passwordHash,
    caretakerName,
    profile: createEmptyProfile(),
    activity: [],
    memoryPolicies: {},
    caregiverPin: "",
    onboardingComplete: false,
    currentMode: "home",
    currentTrack: null,
    patientPrompt: "",
  };
}

export function recordToAppState(record: PatientRecord): AppState {
  return {
    accessCode: record.accessCode,
    caretakerName: record.caretakerName,
    caretakerEmail: record.caretakerEmail,
    profile: record.profile,
    activity: record.activity,
    memoryPolicies: record.memoryPolicies,
    caregiverPin: "",
    onboardingComplete: record.onboardingComplete,
    currentMode: record.currentMode,
    currentTrack: record.currentTrack,
    patientPrompt: record.patientPrompt,
  };
}

export function createEmptyAppState(): AppState {
  return {
    accessCode: "",
    caretakerName: "",
    caretakerEmail: "",
    profile: createEmptyProfile(),
    activity: [],
    memoryPolicies: {},
    caregiverPin: "",
    onboardingComplete: false,
    currentMode: "home",
    currentTrack: null,
    patientPrompt: "",
  };
}

export function getActiveRecord(): PatientRecord | null {
  const root = getRoot();
  if (!root.activeCode) return null;
  return root.patients[root.activeCode] ?? null;
}

export function getRecord(accessCode: string): PatientRecord | null {
  return getRoot().patients[accessCode.trim().toUpperCase()] ?? null;
}

export function setActiveRecord(record: PatientRecord) {
  const root = getRoot();
  const normalized = { ...record, accessCode: record.accessCode.trim().toUpperCase() };
  root.patients[normalized.accessCode] = normalized;
  root.activeCode = normalized.accessCode;
  persistRoot(root);
  return normalized;
}

export function updateRecord(
  accessCode: string,
  updater: (record: PatientRecord) => PatientRecord,
): PatientRecord | null {
  const normalized = accessCode.trim().toUpperCase();
  const current = getRecord(normalized);
  if (!current) return null;
  const next = updater({ ...current, accessCode: normalized });
  return setActiveRecord(next);
}

export function findPatientByEmail(email: string): PatientRecord | null {
  const normalized = normalizeEmail(email);
  for (const record of Object.values(getRoot().patients)) {
    if (record.caretakerEmail === normalized) return record;
  }
  return null;
}

export function createPatientAccount(caretakerName: string, email: string, password: string) {
  if (findPatientByEmail(email)) return null;
  const accessCode = generateAccessCode();
  const passwordHash = hashPassword(password);
  const record = emptyRecord(accessCode, caretakerName.trim(), email, passwordHash);
  return setActiveRecord(record);
}

export function signInCaretaker(email: string, password: string) {
  const record = findPatientByEmail(email);
  if (!record) return null;
  if (!verifyPassword(password, record.caretakerPasswordHash)) return null;
  const root = getRoot();
  root.activeCode = record.accessCode;
  persistRoot(root);
  return record;
}

/** @deprecated Use signInCaretaker — kept for preview flows */
export function createPatient(caretakerName: string, pin: string) {
  const accessCode = generateAccessCode();
  const passwordHash = hashPassword(pin);
  const record = emptyRecord(accessCode, caretakerName.trim(), `${accessCode.toLowerCase()}@echoes.local`, passwordHash);
  record.caregiverPin = pin.trim();
  return setActiveRecord(record);
}

/** @deprecated Use signInCaretaker */
export function connectPatient(accessCode: string, pin: string) {
  const normalizedCode = accessCode.trim().toUpperCase();
  const record = getRecord(normalizedCode);
  if (!record) return null;
  if (verifyPassword(pin, record.caretakerPasswordHash)) {
    const root = getRoot();
    root.activeCode = normalizedCode;
    persistRoot(root);
    return record;
  }
  if (record.caregiverPin && record.caregiverPin === pin.trim()) {
    const root = getRoot();
    root.activeCode = normalizedCode;
    persistRoot(root);
    return record;
  }
  return null;
}

export function activatePatient(accessCode: string) {
  const normalizedCode = accessCode.trim().toUpperCase();
  const record = getRecord(normalizedCode);
  if (!record || !record.onboardingComplete) return null;
  const root = getRoot();
  root.activeCode = normalizedCode;
  persistRoot(root);
  return record;
}

export function updateActiveRecord(updater: (record: PatientRecord) => PatientRecord) {
  const current = getActiveRecord();
  if (!current) return null;
  return setActiveRecord(updater(current));
}

export function verifyCaregiverPin(accessCode: string, pin: string) {
  const record = getRecord(accessCode.trim().toUpperCase());
  if (!record) return false;
  if (verifyPassword(pin, record.caretakerPasswordHash)) return true;
  return record.caregiverPin === pin.trim();
}

export function activatePatientByCode(accessCode: string) {
  return activatePatient(accessCode);
}

export function applyDemoToActive(demo: {
  profile: PatientProfile;
  activity: ActivityEvent[];
}) {
  const current = getActiveRecord();
  if (!current) return null;
  const next: PatientRecord = {
    ...current,
    profile: demo.profile,
    activity: demo.activity.map((event) => ({ ...event })),
    memoryPolicies: buildMemoryPoliciesFromProfile(demo.profile),
    onboardingComplete: false,
  };
  return setActiveRecord(next);
}

/** Test helper — reset in-memory cache and reload from disk. */
export function reloadPatientStoreFromDisk() {
  const holder = globalThis as Holder;
  holder.__echoesPatients = loadRootFromDisk();
  holder.__echoesPatientsLoaded = true;
  return holder.__echoesPatients;
}
