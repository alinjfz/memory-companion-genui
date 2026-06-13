import { buildMemoryPoliciesFromProfile } from "@/lib/app-state-helpers";
import { createEmptyProfile, createMemoryId, type PatientProfile } from "@/lib/echoes";
import { hashPassword } from "@/lib/auth-crypto";
import { setActiveRecord, type PatientRecord } from "@/lib/patient-store";

export const TEST_ACCESS_CODE = "ECHO-TEST1";

export function buildTestProfile(): PatientProfile {
  return {
    ...createEmptyProfile(),
    name: "George Thomas",
    first_name: "George",
    age: 76,
    stage: "mid",
    location_area: "Bristol",
    music_preference: "You Are My Sunshine",
    daily_tasks: [
      { time: "8:00 AM", description: "Breakfast with morning tablet", icon: "☕" },
      { time: "3:00 PM", description: "Call Helen on the video tablet", icon: "📱" },
    ],
    medications: [{ name: "Donepezil", dose: "10mg", time: "Morning" }],
    key_memories: [
      {
        id: createMemoryId("Your daughter Helen"),
        title: "Your daughter Helen",
        story: "Helen lives in London. She loves you very much.",
        photoHint: "👧",
        relationship: "daughter",
      },
      {
        id: createMemoryId("Building bridges with code"),
        title: "Building bridges with code",
        story: "You wrote software that kept Bristol's bridges standing.",
        photoHint: "💻",
        relationship: "career",
      },
    ],
    family_members: [{ name: "Helen", relationship: "daughter", age: 41, location: "London" }],
  };
}

export function seedDemoPatientRecord(): PatientRecord {
  const profile = buildTestProfile();
  const record: PatientRecord = {
    accessCode: TEST_ACCESS_CODE,
    caretakerEmail: "test@echoes.local",
    caretakerPasswordHash: hashPassword("test-password"),
    caretakerName: "Test Caretaker",
    profile,
    activity: [],
    memoryPolicies: buildMemoryPoliciesFromProfile(profile),
    caregiverPin: "1234",
    onboardingComplete: true,
    currentMode: "home",
    currentTrack: null,
    patientPrompt: "",
  };
  setActiveRecord(record);
  return record;
}

export function withEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

export function mockFetchOnce(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}
