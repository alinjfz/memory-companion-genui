import "server-only";

import {
  createEmptyProfile,
  type ActivityEvent,
  type Memory,
  type PatientProfile,
} from "@/lib/echoes";
import type { AppState } from "@/lib/app-state-types";
import {
  buildMemoryPoliciesFromProfile,
  defaultMemoryPolicy,
  firstFamilyName,
  type MemoryPolicy,
  type MusicTrack,
  type PatientMode,
  type PlaybackStatus,
} from "@/lib/app-state-helpers";
import { createMemoryImage } from "@/lib/memory-image";
import {
  createEmptyAppState,
  getActiveRecord,
  recordToAppState,
  setActiveRecord,
  updateActiveRecord,
} from "@/lib/patient-store";

export type { AppState, Role } from "@/lib/app-state-types";
export type { MemoryPolicy, PatientMode, PlaybackStatus, MusicTrack } from "@/lib/app-state-helpers";
export { createMemoryImage } from "@/lib/memory-image";

export interface PatientCardBase {
  id: string;
  kind: string;
}

export interface GreetingCard extends PatientCardBase {
  kind: "greeting";
  title: string;
  subtitle: string;
}

export interface ReassuranceCard extends PatientCardBase {
  kind: "reassurance";
  title: string;
  body: string;
}

export interface MemoryCard extends PatientCardBase {
  kind: "memory";
  title: string;
  story: string;
  photoHint: string;
  relationship: string;
  policy: MemoryPolicy;
  imageUrl?: string;
}

export interface TaskCard extends PatientCardBase {
  kind: "tasks";
  title: string;
  items: Array<{ time: string; description: string; icon: string }>;
}

export interface MedicationCard extends PatientCardBase {
  kind: "medication";
  title: string;
  items: Array<{ name: string; dose: string; time: string; taken?: boolean }>;
}

export interface PanicCard extends PatientCardBase {
  kind: "panic";
  title: string;
  body: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
    icon: string;
  }>;
}

export interface TalkCard extends PatientCardBase {
  kind: "talk";
  title: string;
  body: string;
  suggestion: string;
}

export interface MusicCard extends PatientCardBase {
  kind: "music";
  title: string;
  artist: string;
  sourceName: string;
  sourceUrl: string;
  streamUrl: string;
  memoryTouch: string;
}

export type PatientCard =
  | GreetingCard
  | ReassuranceCard
  | MemoryCard
  | TaskCard
  | MedicationCard
  | PanicCard
  | TalkCard
  | MusicCard;

export interface PatientViewModel {
  heading: string;
  prompt: string;
  mode: PatientMode;
  cards: PatientCard[];
}

const MUSIC_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

function makeActivityId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function applyPartialToRecord(
  record: NonNullable<ReturnType<typeof getActiveRecord>>,
  partial: Partial<AppState>,
) {
  return {
    ...record,
    profile: partial.profile ?? record.profile,
    activity: partial.activity ?? record.activity,
    memoryPolicies: partial.memoryPolicies ?? record.memoryPolicies,
    caregiverPin: partial.caregiverPin ?? record.caregiverPin,
    currentTrack: partial.currentTrack ?? record.currentTrack,
    currentMode: partial.currentMode ?? record.currentMode,
    patientPrompt: partial.patientPrompt ?? record.patientPrompt,
    onboardingComplete: partial.onboardingComplete ?? record.onboardingComplete,
    caretakerName: partial.caretakerName ?? record.caretakerName,
  };
}

export function getState(): AppState {
  const record = getActiveRecord();
  if (!record) return createEmptyAppState();
  return recordToAppState(record);
}

export function setState(next: AppState) {
  const record = getActiveRecord();
  if (!record) return createEmptyAppState();
  setActiveRecord({
    ...record,
    profile: next.profile,
    activity: next.activity,
    memoryPolicies: next.memoryPolicies,
    caregiverPin: next.caregiverPin,
    currentMode: next.currentMode,
    currentTrack: next.currentTrack,
    patientPrompt: next.patientPrompt,
    onboardingComplete: next.onboardingComplete,
    caretakerName: next.caretakerName,
    accessCode: next.accessCode || record.accessCode,
  });
  return getState();
}

export function patchState(partial: Partial<AppState>) {
  const record = getActiveRecord();
  if (!record) return createEmptyAppState();
  setActiveRecord(applyPartialToRecord(record, partial));
  return getState();
}

export function resetState(profile?: PatientProfile) {
  const record = getActiveRecord();
  if (!record) return createEmptyAppState();
  const nextProfile = profile ?? createEmptyProfile();
  setActiveRecord({
    ...record,
    profile: nextProfile,
    activity: [],
    memoryPolicies: buildMemoryPoliciesFromProfile(nextProfile),
    currentMode: "home",
    currentTrack: null,
    patientPrompt: "",
    onboardingComplete: Boolean(profile),
  });
  return getState();
}

export function saveProfile(profile: PatientProfile) {
  return patchState({
    profile,
    memoryPolicies: buildMemoryPoliciesFromProfile(profile),
  });
}

export function updateActivity(event: Omit<ActivityEvent, "id"> & { id?: string }) {
  const record = getActiveRecord();
  if (!record) return createEmptyAppState();
  const activity = [
    {
      id: event.id ?? makeActivityId("activity"),
      timestamp: event.timestamp,
      type: event.type,
      description: event.description,
      severity: event.severity,
    },
    ...record.activity,
  ];
  return patchState({ activity });
}

function cleanText(input: string) {
  return input
    .replace(/\b(died|dead|death|passed away|passed|loss)\b/gi, "family")
    .replace(/\b(Alzheimer's|dementia)\b/gi, "memory support")
    .trim();
}

function safeMemoryStory(memory: Memory, policy: MemoryPolicy, profile: PatientProfile) {
  const story = cleanText(memory.story);
  const familyName = firstFamilyName(profile);

  if (policy === "hide") {
    return "Here is something gentle from your life.";
  }

  if (policy === "redirect") {
    return `Would you like to call ${familyName} or see a happy photo?`;
  }

  if (policy === "soften") {
    return story.replace(/\b(you|your)\b/gi, "you");
  }

  return story;
}

function getMusicTrack(profile: PatientProfile): MusicTrack {
  const preference = profile.music_preference.trim();
  return {
    title: preference || "A favourite song",
    artist: preference || "Someone they love",
    sourceName: "SoundHelix",
    sourceUrl: "https://www.soundhelix.com/",
    streamUrl: MUSIC_URL,
    memoryTouch: preference
      ? `${profile.first_name} loves ${preference}.`
      : `${profile.first_name} loves familiar music.`,
    status: "idle",
  };
}

export function setMusicTrack(profile: PatientProfile) {
  return patchState({ currentTrack: getMusicTrack(profile) });
}

export function setPlaybackStatus(status: PlaybackStatus) {
  const state = getState();
  if (!state.currentTrack) return state;
  return patchState({ currentTrack: { ...state.currentTrack, status } });
}

export function setPatientPrompt(prompt: string) {
  return patchState({ patientPrompt: prompt });
}

export function setPatientMode(mode: PatientMode) {
  return patchState({ currentMode: mode });
}

export function updateMemoryPolicy(memoryId: string, policy: MemoryPolicy) {
  const state = getState();
  return patchState({
    memoryPolicies: {
      ...state.memoryPolicies,
      [memoryId]: policy,
    },
  });
}

export function buildPatientView(
  state: AppState,
  prompt = state.patientPrompt,
): PatientViewModel {
  const profile = state.profile;
  const familyName = firstFamilyName(profile);
  const greetingDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(new Date());

  const cards: PatientCard[] = [
    {
      id: "greeting",
      kind: "greeting",
      title: `Hello, ${profile.first_name || "friend"}`,
      subtitle: greetingDate,
    },
    {
      id: "reassurance",
      kind: "reassurance",
      title: "You are safe. We are nearby.",
      body: "Take one breath. Then choose one small thing.",
    },
  ];

  const question = prompt.toLowerCase();
  const sensitive = /wife|husband|partner|died|dead|passed|loss/.test(question);

  const chosenMemory =
    profile.key_memories.find((memory) =>
      sensitive ? /wife|husband|partner/i.test(memory.relationship) : true,
    ) ?? profile.key_memories[0];

  if (chosenMemory) {
    const policy = state.memoryPolicies[chosenMemory.id] ?? defaultMemoryPolicy(chosenMemory);
    const safeStory = safeMemoryStory(chosenMemory, policy, profile);

    if (policy !== "hide" || !sensitive) {
      cards.push({
        id: `memory-${chosenMemory.id}`,
        kind: "memory",
        title: chosenMemory.title,
        story: safeStory,
        photoHint: chosenMemory.photoHint,
        relationship: chosenMemory.relationship,
        policy,
        imageUrl: createMemoryImage(chosenMemory),
      });
    }
  }

  const taskCount = Math.min(profile.daily_tasks.length, 2);
  if (taskCount > 0) {
    cards.push({
      id: "tasks",
      kind: "tasks",
      title: "Today",
      items: profile.daily_tasks.slice(0, taskCount),
    });
  }

  if (profile.medications.length > 0) {
    cards.push({
      id: "medication",
      kind: "medication",
      title: "Medication",
      items: profile.medications.map((med, index) => ({
        ...med,
        taken: index === 0,
      })),
    });
  }

  if (/panic|scared|help|lost|afraid/.test(question)) {
    return {
      heading: `Hello, ${profile.first_name || "friend"}`,
      prompt,
      mode: "panic",
      cards: [
        cards[0],
        cards[1],
        {
          id: "panic",
          kind: "panic",
          title: "You are safe here.",
          body: "Press I am fine!, or choose one gentle option.",
          options: [
            {
              id: "talk",
              label: "Talk to me",
              description: "A calm reply and a simple card.",
              icon: "💬",
            },
            {
              id: "music",
              label: "Play music",
              description: "Use a familiar song that you like.",
              icon: "🎵",
            },
            {
              id: "family",
              label: "See family",
              description: `Bring ${familyName} closer.`,
              icon: "👪",
            },
            {
              id: "fine",
              label: "I am fine!",
              description: "Stay calm and return to the main view.",
              icon: "✅",
            },
          ],
        },
      ],
    };
  }

  if (/music|song|sing/.test(question)) {
    const track = getMusicTrack(profile);
    cards.push({
      id: "music",
      kind: "music",
      title: track.title,
      artist: track.artist,
      sourceName: track.sourceName,
      sourceUrl: track.sourceUrl,
      streamUrl: track.streamUrl,
      memoryTouch: track.memoryTouch,
    });
  }

  if (sensitive) {
    cards.push({
      id: "talk",
      kind: "talk",
      title: "Let’s keep this gentle.",
      body: `Would you like to see ${familyName}, a photo, or music?`,
      suggestion: `Call ${familyName} or open a warm memory.`,
    });
  }

  return {
    heading: `Hello, ${profile.first_name || "friend"}`,
    prompt,
    mode: state.currentMode,
    cards,
  };
}

export function createMusicTrack(profile: PatientProfile) {
  return getMusicTrack(profile);
}

export { updateActiveRecord, getActiveRecord, recordToAppState } from "@/lib/patient-store";
