import type { ActivityEvent, PatientProfile } from "@/lib/echoes";
import type { MemoryPolicy, MusicTrack, PatientMode } from "@/lib/app-state-helpers";

export type { MemoryPolicy, PatientMode, MusicTrack } from "@/lib/app-state-helpers";

export type Role = "patient" | "caretaker";

export interface AppState {
  accessCode: string;
  caretakerName: string;
  caretakerEmail: string;
  profile: PatientProfile;
  activity: ActivityEvent[];
  memoryPolicies: Record<string, MemoryPolicy>;
  caregiverPin: string;
  currentMode: PatientMode;
  currentTrack: MusicTrack | null;
  patientPrompt: string;
  onboardingComplete: boolean;
}
