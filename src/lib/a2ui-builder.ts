import type { PatientProfile, Stage } from "@/lib/echoes";
import { buildMorningGreeting, createMemoryId } from "@/lib/echoes";
import { createMemoryImage } from "@/lib/memory-image";
import type { MemoryPolicy } from "@/lib/app-state-helpers";
import { themeForMemory } from "@/lib/patient-moments";
import {
  CATALOG_ID,
  type A2UIComponent,
  type A2UISurface,
} from "@/a2ui/catalog/definitions";

const MUSIC_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

export type PatientFlowMode = "morning" | "panic" | "ask";

export type PatientStep = {
  component: A2UIComponent;
  showOkay: boolean;
  okayLabel: string;
  speakText: string;
  theme?: {
    accent: string;
    surface: string;
    text: string;
  };
};

function taskCountForStage(stage: Stage) {
  if (stage === "early") return 5;
  if (stage === "mid") return 3;
  return 2;
}

function memoryStoryForPolicy(
  memory: PatientProfile["key_memories"][number],
  policy: MemoryPolicy,
) {
  if (policy === "hide") return null;
  if (policy === "redirect") {
    return "Someone you love dearly is watching over you with a warm smile.";
  }
  if (policy === "soften") {
    return memory.story.split(".").slice(0, 1).join(".").trim();
  }
  return memory.story;
}

function londonHour() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/London",
    }).format(new Date()),
  );
  return Number.isFinite(hour) ? hour : new Date().getHours();
}

function pickNextTask(profile: PatientProfile) {
  const hour = londonHour();
  const tasks = profile.daily_tasks;
  if (!tasks.length) {
    return { time: "Now", description: "Take one slow breath.", icon: "🌿" };
  }
  if (hour < 10) return tasks[0] ?? tasks[tasks.length - 1];
  if (hour < 13) return tasks[1] ?? tasks[0];
  if (hour < 16) return tasks[2] ?? tasks[tasks.length - 1];
  if (hour < 19) return tasks[3] ?? tasks[tasks.length - 1];
  return tasks[tasks.length - 1] ?? tasks[0];
}

function pickMedication(profile: PatientProfile) {
  const hour = londonHour();
  const morning = profile.medications.find((med) => /morning/i.test(med.time));
  const evening = profile.medications.find((med) => /evening/i.test(med.time));
  if (hour < 14) return morning ?? profile.medications[0] ?? null;
  return evening ?? profile.medications[profile.medications.length - 1] ?? null;
}

export function singleSurface(component: A2UIComponent): A2UISurface {
  return { catalogId: CATALOG_ID, components: [component] };
}

export function buildMorningStepPlan(
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
): PatientStep[] {
  const greeting = buildMorningGreeting(profile);
  const firstName = profile.first_name || profile.name.split(" ")[0] || "friend";
  const steps: PatientStep[] = [
    {
      component: {
        id: "greeting",
        component: "PatientGreeting",
        props: {
          name: firstName,
          dayOfWeek: greeting.dayOfWeek,
          dateString: greeting.dateString,
          weatherEmoji: londonHour() < 12 ? "🌅" : londonHour() < 17 ? "🌤️" : "🌙",
          locationArea: profile.location_area,
        },
      },
      showOkay: true,
      okayLabel: "Okay",
      speakText: `Good morning, ${firstName}. You are safe at home.`,
      theme: {
        accent: "#4a7fb8",
        surface: "linear-gradient(155deg, #f0f7ff 0%, #fdf9f4 100%)",
        text: "#1e4a72",
      },
    },
  ];

  const taskLimit = taskCountForStage(profile.stage);
  profile.daily_tasks.slice(0, taskLimit).forEach((task, index) => {
    steps.push({
      component: {
        id: `task-${index}`,
        component: "DailyTask",
        props: {
          time: task.time,
          icon: task.icon,
          description: task.description,
          completed: false,
          complexity: profile.stage === "early" ? "detailed" : "simple",
        },
      },
      showOkay: true,
      okayLabel: "Okay",
      speakText: `Next, ${task.description.toLowerCase()}.`,
      theme: {
        accent: "#5a9f7a",
        surface: "linear-gradient(155deg, #f2fbf6 0%, #faf8f5 100%)",
        text: "#2d5a45",
      },
    });
  });

  if (!profile.daily_tasks.length) {
    const task = pickNextTask(profile);
    steps.push({
      component: {
        id: "task-0",
        component: "DailyTask",
        props: {
          time: task.time,
          icon: task.icon,
          description: task.description,
          completed: false,
          complexity: "simple",
        },
      },
      showOkay: true,
      okayLabel: "Okay",
      speakText: `Next, ${task.description.toLowerCase()}.`,
      theme: {
        accent: "#5a9f7a",
        surface: "linear-gradient(155deg, #f2fbf6 0%, #faf8f5 100%)",
        text: "#2d5a45",
      },
    });
  }

  profile.key_memories.forEach((memory) => {
    const policy = memoryPolicies[memory.id] ?? "show";
    const story = memoryStoryForPolicy(memory, policy);
    if (!story) return;
    const shortStory = story.split(".").slice(0, 2).join(".").trim();
    const memoryTheme = themeForMemory(memory);
    steps.push({
      component: {
        id: memory.id || createMemoryId(memory.title),
        component: "MemoryCard",
        props: {
          title: memory.title,
          story: shortStory || story,
          photoHint: memory.photoHint,
          relationship: memory.relationship,
          imageUrl: createMemoryImage(memory),
        },
      },
      showOkay: true,
      okayLabel: "Okay",
      speakText: shortStory || memory.title,
      theme: {
        accent: memoryTheme.accent,
        surface: memoryTheme.surface,
        text: memoryTheme.text,
      },
    });
  });

  const medications = profile.medications.length
    ? profile.medications
    : pickMedication(profile)
      ? [pickMedication(profile)!]
      : [];

  medications.forEach((medication, index) => {
    steps.push({
      component: {
        id: `med-${index}`,
        component: "MedicationReminder",
        props: {
          medications: [
            {
              name: medication.name,
              dose: medication.dose,
              time: medication.time,
              taken: false,
            },
          ],
          nextDueIn: medication.time,
        },
      },
      showOkay: true,
      okayLabel: "Taken",
      speakText: `${medication.name} ${medication.dose} now.`,
      theme: {
        accent: "#2d6a9f",
        surface: "linear-gradient(155deg, #eef4fa 0%, #faf8f5 100%)",
        text: "#1e4a72",
      },
    });
  });

  steps.push({
    component: {
      id: "done",
      component: "MemoryCard",
      props: {
        title: "You are all set",
        story: "Rest easy. Tap ask me anything if you need me.",
        photoHint: "☀️",
        relationship: "companion",
      },
    },
    showOkay: false,
    okayLabel: "Okay",
    speakText: `You are all set, ${firstName}. I am here if you need me.`,
    theme: {
      accent: "#7ec8a4",
      surface: "linear-gradient(155deg, #f4faf7 0%, #faf8f5 100%)",
      text: "#3d6b58",
    },
  });

  return steps;
}

export function buildPanicStepPlan(
  profile: PatientProfile,
  audioUrl?: string,
): PatientStep[] {
  const firstName = profile.first_name || "friend";
  return [
    {
      component: {
        id: "calming",
        component: "CalmingMessage",
        props: {
          message: `You are safe at home, ${firstName}.`,
          audioText: `${firstName}, you are safe at home. Take a slow breath with me.`,
          audioUrl,
          backgroundEmoji: "🌿",
        },
      },
      showOkay: false,
      okayLabel: "I feel better now",
      speakText: `You are safe at home, ${firstName}.`,
      theme: {
        accent: "#5b9fd4",
        surface: "linear-gradient(155deg, #f0f7ff 0%, #f4faf7 100%)",
        text: "#1e4a72",
      },
    },
    {
      component: {
        id: "panic-options",
        component: "PanicOptions",
        props: {
          patientName: firstName,
          options: [
            {
              id: "music",
              icon: "🎵",
              label: "Play my music",
              description: profile.music_preference || "Your favourite songs",
              color: "#5b9fd4",
            },
            {
              id: "talk",
              icon: "💬",
              label: "Talk to me",
              description: "I am here with you",
              color: "#7ec8a4",
            },
            {
              id: "family",
              icon: "👨‍👩‍👧",
              label: "See family",
              description: profile.family_members[0]?.name ?? "Someone you love",
              color: "#c4846a",
            },
            {
              id: "breathe",
              icon: "🌬️",
              label: "Breathe",
              description: "Slow breaths together",
              color: "#9bbfd4",
            },
          ],
        },
      },
      showOkay: false,
      okayLabel: "Okay",
      speakText: "Choose what helps you feel calm.",
      theme: {
        accent: "#5b9fd4",
        surface: "linear-gradient(155deg, #f0f7ff 0%, #faf8f5 100%)",
        text: "#1e4a72",
      },
    },
  ];
}

export function buildAskStep(
  profile: PatientProfile,
  memory: PatientProfile["key_memories"][number],
  policy: MemoryPolicy = "show",
): PatientStep {
  const story =
    memoryStoryForPolicy(memory, policy)?.split(".").slice(0, 2).join(".").trim() ||
    memory.title;
  const memoryTheme = themeForMemory(memory);
  return {
    component: {
      id: memory.id,
      component: "MemoryCard",
      props: {
        title: memory.title,
        story,
        photoHint: memory.photoHint,
        relationship: memory.relationship,
        imageUrl: createMemoryImage(memory),
      },
    },
    showOkay: true,
    okayLabel: "Okay",
    speakText: story,
    theme: {
      accent: memoryTheme.accent,
      surface: memoryTheme.surface,
      text: memoryTheme.text,
    },
  };
}

export function buildTalkStep(profile: PatientProfile, body: string, title = "Answer"): PatientStep {
  return {
    component: {
      id: "talk",
      component: "MemoryCard",
      props: {
        title,
        story: body,
        photoHint: "💬",
        relationship: "companion",
      },
    },
    showOkay: true,
    okayLabel: "Okay",
    speakText: body,
    theme: {
      accent: "#c4846a",
      surface: "linear-gradient(155deg, #fdf5f0 0%, #faf8f5 100%)",
      text: "#5c4030",
    },
  };
}

/** @deprecated Use buildMorningStepPlan — returns full surface for previews only */
export function buildMorningBriefingSurface(
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
): A2UISurface {
  const steps = buildMorningStepPlan(profile, memoryPolicies);
  return {
    catalogId: CATALOG_ID,
    components: steps.map((step) => step.component),
  };
}

export function buildMemoryCardSurface(
  profile: PatientProfile,
  memory: PatientProfile["key_memories"][number],
  policy: MemoryPolicy = "show",
): A2UISurface {
  return singleSurface(buildAskStep(profile, memory, policy).component);
}

export function buildPanicSurfaces(profile: PatientProfile, audioUrl?: string): A2UISurface {
  const steps = buildPanicStepPlan(profile, audioUrl);
  return { catalogId: CATALOG_ID, components: steps.map((s) => s.component) };
}

export function buildMusicCardSurface(
  profile: PatientProfile,
  song: { artist: string; songTitle: string; description: string },
): A2UISurface {
  return singleSurface({
    id: "music",
    component: "MusicCard",
    props: {
      artist: song.artist,
      songTitle: song.songTitle,
      description: song.description,
      youtubeSearchQuery: `${song.artist} ${song.songTitle}`,
      coverEmoji: "🎵",
      audioUrl: MUSIC_URL,
    },
  });
}

export function buildEvidenceSurface(evidence: {
  suggestion: string;
  source: string;
  url?: string;
  confidence: "high" | "medium";
  summary: string;
}): A2UISurface {
  return singleSurface({
    id: "evidence",
    component: "EvidenceCard",
    props: evidence,
  });
}
