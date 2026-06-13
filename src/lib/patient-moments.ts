import {
  buildMorningGreeting,
  type DailyTask,
  type Memory,
  type Medication,
  type PatientProfile,
} from "@/lib/echoes";
import { createMemoryImage } from "@/lib/memory-image";
import type { MemoryPolicy } from "@/lib/app-state-helpers";

export type MomentKind = "greeting" | "task" | "memory" | "medication" | "talk" | "done";

export type MomentTheme = {
  mood: MomentKind;
  accent: string;
  surface: string;
  text: string;
  icon: string;
};

export type MomentSpec = {
  id: string;
  kind: MomentKind;
  context: Record<string, unknown>;
};

export type PatientMoment = {
  step: number;
  total: number;
  kind: MomentKind;
  title: string;
  body: string;
  speakText: string;
  theme: MomentTheme;
  showOkay: boolean;
  okayLabel: string;
  imageUrl?: string;
  memoryId?: string;
};

const THEMES: Record<MomentKind, MomentTheme> = {
  greeting: {
    mood: "greeting",
    accent: "#4a7fb8",
    surface: "linear-gradient(155deg, #f0f7ff 0%, #fdf9f4 100%)",
    text: "#1e4a72",
    icon: "🌅",
  },
  task: {
    mood: "task",
    accent: "#5a9f7a",
    surface: "linear-gradient(155deg, #f2fbf6 0%, #faf8f5 100%)",
    text: "#2d5a45",
    icon: "✓",
  },
  memory: {
    mood: "memory",
    accent: "#7b6bb5",
    surface: "linear-gradient(155deg, #f3f0fb 0%, #fdf9f4 100%)",
    text: "#3d3560",
    icon: "💫",
  },
  medication: {
    mood: "medication",
    accent: "#2d6a9f",
    surface: "linear-gradient(155deg, #eef4fa 0%, #faf8f5 100%)",
    text: "#1e4a72",
    icon: "💊",
  },
  talk: {
    mood: "talk",
    accent: "#c4846a",
    surface: "linear-gradient(155deg, #fdf5f0 0%, #faf8f5 100%)",
    text: "#5c4030",
    icon: "💬",
  },
  done: {
    mood: "done",
    accent: "#7ec8a4",
    surface: "linear-gradient(155deg, #f4faf7 0%, #faf8f5 100%)",
    text: "#3d6b58",
    icon: "☀️",
  },
};

export function themeForMemory(memory: Memory): MomentTheme {
  const rel = memory.relationship.toLowerCase();
  const title = memory.title.toLowerCase();

  if (/wife|husband|partner|anniversary|rose/.test(`${rel} ${title}`)) {
    return {
      mood: "memory",
      accent: "#b8860b",
      surface: "linear-gradient(155deg, #fff8eb 0%, #fdf2f8 100%)",
      text: "#5c4030",
      icon: memory.photoHint || "💍",
    };
  }
  if (/grandson|granddaughter|grand|baby|oliver/.test(`${rel} ${title}`)) {
    return {
      mood: "memory",
      accent: "#6a9fd4",
      surface: "linear-gradient(155deg, #eef6ff 0%, #f8fbff 100%)",
      text: "#2a4a6b",
      icon: memory.photoHint || "👶",
    };
  }
  if (/daughter|son|child|helen/.test(`${rel} ${title}`)) {
    return {
      mood: "memory",
      accent: "#6a9f8a",
      surface: "linear-gradient(155deg, #eef8f2 0%, #faf8f5 100%)",
      text: "#2d5040",
      icon: memory.photoHint || "👨‍👩‍👧",
    };
  }
  if (/career|work|bridge|code/.test(`${rel} ${title}`)) {
    return {
      mood: "memory",
      accent: "#4a6a9f",
      surface: "linear-gradient(155deg, #eef2fa 0%, #f5f8fc 100%)",
      text: "#1e3555",
      icon: memory.photoHint || "💻",
    };
  }
  return { ...THEMES.memory, icon: memory.photoHint || THEMES.memory.icon };
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

function pickNextTask(profile: PatientProfile): DailyTask {
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

function pickMedication(profile: PatientProfile): Medication | null {
  const hour = londonHour();
  const morning = profile.medications.find((med) => /morning/i.test(med.time));
  const evening = profile.medications.find((med) => /evening/i.test(med.time));
  if (hour < 14) return morning ?? profile.medications[0] ?? null;
  return evening ?? profile.medications[profile.medications.length - 1] ?? null;
}

function memoryStoryForPolicy(memory: Memory, policy: MemoryPolicy = "show") {
  if (policy === "hide") return null;
  if (policy === "redirect") {
    return "Someone you love dearly is watching over you with a warm smile.";
  }
  if (policy === "soften") {
    return memory.story.split(".").slice(0, 1).join(".").trim() || memory.story;
  }
  return memory.story;
}

export function buildMomentPlan(
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
): MomentSpec[] {
  const greeting = buildMorningGreeting(profile);
  const task = pickNextTask(profile);
  const medication = pickMedication(profile);

  const plan: MomentSpec[] = [
    { id: "greeting", kind: "greeting", context: { greeting, hour: londonHour() } },
    { id: "task", kind: "task", context: { task } },
  ];

  for (const memory of profile.key_memories) {
    const policy = memoryPolicies[memory.id] ?? "show";
    if (policy === "hide") continue;
    plan.push({
      id: `memory-${memory.id}`,
      kind: "memory",
      context: { memory, policy },
    });
  }

  if (medication) {
    plan.push({ id: "medication", kind: "medication", context: { medication } });
  }

  plan.push({ id: "done", kind: "done", context: { greeting } });

  return plan;
}

export function fallbackMoment(
  spec: MomentSpec,
  profile: PatientProfile,
  step: number,
  total: number,
): PatientMoment {
  const theme = { ...THEMES[spec.kind] };
  const firstName = profile.first_name;

  if (spec.kind === "greeting") {
    const greeting = spec.context.greeting as ReturnType<typeof buildMorningGreeting>;
    const hour = londonHour();
    const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return {
      step,
      total,
      kind: "greeting",
      title: `${salutation}, ${firstName}`,
      body: `It is ${greeting.dayOfWeek}. You are safe at home in ${profile.location_area}.`,
      speakText: `${salutation}, ${firstName}. You are safe at home.`,
      theme: { ...theme, icon: hour < 12 ? "🌅" : hour < 17 ? "🌤️" : "🌙" },
      showOkay: true,
      okayLabel: "Okay",
    };
  }

  if (spec.kind === "task") {
    const task = spec.context.task as DailyTask;
    return {
      step,
      total,
      kind: "task",
      title: "One small step",
      body: `${task.icon} ${task.description}`,
      speakText: `Next, ${task.description.toLowerCase()}.`,
      theme: { ...theme, icon: task.icon || theme.icon },
      showOkay: true,
      okayLabel: "Okay",
    };
  }

  if (spec.kind === "memory") {
    const memory = spec.context.memory as Memory;
    const policy = (spec.context.policy as MemoryPolicy) ?? "show";
    const story =
      memoryStoryForPolicy(memory, policy)?.split(".").slice(0, 2).join(".").trim() ||
      "A warm memory is here for you.";
    const memoryTheme = themeForMemory(memory);
    return {
      step,
      total,
      kind: "memory",
      title: memory.title,
      body: story,
      speakText: story,
      theme: memoryTheme,
      showOkay: true,
      okayLabel: "Okay",
      imageUrl: createMemoryImage(memory),
      memoryId: memory.id,
    };
  }

  if (spec.kind === "medication") {
    const medication = spec.context.medication as Medication;
    return {
      step,
      total,
      kind: "medication",
      title: "Medicine time",
      body: `${medication.name} ${medication.dose}. Take it ${medication.time.toLowerCase()}.`,
      speakText: `${medication.name} ${medication.dose} now.`,
      theme,
      showOkay: true,
      okayLabel: "Taken",
    };
  }

  return {
    step,
    total,
    kind: "done",
    title: "You are all set",
    body: "Rest easy. Tap ask me anything if you need me.",
    speakText: `You are all set, ${firstName}. I am here if you need me.`,
    theme,
    showOkay: false,
    okayLabel: "Okay",
  };
}

const MEMORY_STOP_WORDS = new Set([
  "what",
  "where",
  "when",
  "who",
  "whom",
  "have",
  "does",
  "should",
  "would",
  "could",
  "about",
  "there",
  "this",
  "that",
  "with",
  "from",
  "your",
  "mine",
  "tell",
  "know",
  "remember",
  "help",
  "need",
  "want",
  "like",
  "much",
  "very",
  "some",
  "many",
  "today",
  "now",
  "home",
  "safe",
]);

export function findMemoryForQuestion(
  message: string,
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
): Memory | null {
  const lower = message.toLowerCase().trim();

  for (const member of profile.family_members) {
    const name = member.name.toLowerCase();
    if (name.length > 2 && lower.includes(name)) {
      const match = profile.key_memories.find((memory) => {
        const policy = memoryPolicies[memory.id] ?? "show";
        if (policy === "hide") return false;
        return (
          memory.relationship.toLowerCase().includes(member.relationship.toLowerCase()) ||
          memory.story.toLowerCase().includes(name) ||
          memory.title.toLowerCase().includes(name)
        );
      });
      if (match) return match;
    }
  }

  for (const memory of profile.key_memories) {
    const policy = memoryPolicies[memory.id] ?? "show";
    if (policy === "hide") continue;

    const title = memory.title.toLowerCase().trim();
    if (title.length > 4 && lower.includes(title)) {
      return memory;
    }

    const titleWords = title.split(/\s+/).filter((word) => word.length > 4 && !MEMORY_STOP_WORDS.has(word));
    if (titleWords.some((word) => lower.includes(word))) {
      return memory;
    }
  }

  if (/child|daughter|son|grand|baby|wife|husband|partner|family/.test(lower)) {
    const keyword = lower.includes("grand")
      ? "grand"
      : lower.includes("daughter")
        ? "daughter"
        : lower.includes("son")
          ? "son"
          : lower.includes("wife") || lower.includes("husband")
            ? "wife"
            : lower.includes("family")
              ? "family"
              : "child";
    const match = profile.key_memories.find((memory) => {
      const policy = memoryPolicies[memory.id] ?? "show";
      return policy !== "hide" && memory.relationship.toLowerCase().includes(keyword);
    });
    if (match) return match;
  }

  return null;
}

export function fallbackAskMoment(
  message: string,
  profile: PatientProfile,
  step: number,
  total: number,
  memoryPolicies: Record<string, MemoryPolicy> = {},
): PatientMoment {
  const lower = message.toLowerCase();
  const firstName = profile.first_name;
  const matched = findMemoryForQuestion(message, profile, memoryPolicies);

  if (matched) {
    const policy = memoryPolicies[matched.id] ?? "show";
    const story =
      memoryStoryForPolicy(matched, policy)?.split(".").slice(0, 2).join(".").trim() ||
      matched.title;
    return {
      step,
      total,
      kind: "memory",
      title: matched.title,
      body: story,
      speakText: story,
      theme: themeForMemory(matched),
      showOkay: true,
      okayLabel: "Okay",
      imageUrl: createMemoryImage(matched),
      memoryId: matched.id,
    };
  }

  let body = `I am here with you, ${firstName}.`;

  if (/where am i|where are we|what place|am i home/.test(lower)) {
    const place = profile.location_area?.trim() || "home";
    body = `You are safe at home in ${place}. This is your place.`;
  } else if (/who am i|my name|what is my name/.test(lower)) {
    body = `You are ${firstName}. You are safe at home.`;
  } else if (/what day|what date|what is today|today's date/.test(lower)) {
    const greeting = buildMorningGreeting(profile);
    body = `Today is ${greeting.dayOfWeek}, ${greeting.dateString}.`;
  } else if (/what time|what's the time|time is it/.test(lower)) {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/London",
    }).format(new Date());
    body = `It is ${time}. You are doing fine.`;
  } else if (/what should i do|what now|what next|what do i do/.test(lower)) {
    const task = profile.daily_tasks[0];
    body = task
      ? `Next, ${task.description.toLowerCase()}. One step at a time.`
      : `Take one slow breath. You are safe at home.`;
  } else if (/family|who loves me|who cares/.test(lower)) {
    const names = profile.family_members.slice(0, 2).map((m) => m.name);
    body = names.length
      ? `${names.join(" and ")} love you very much.`
      : `People who care for you are close by.`;
  } else if (/music|song/.test(lower) && profile.music_preference) {
    body = `You love ${profile.music_preference}. That music can feel like home.`;
  } else {
    const person = profile.family_members.find((member) => lower.includes(member.name.toLowerCase()));
    if (person) {
      body = `Yes, ${person.name} is your ${person.relationship}. They love you very much.`;
    }
  }

  return {
    step,
    total,
    kind: "talk",
    title: message.trim(),
    body,
    speakText: body,
    theme: THEMES.talk,
    showOkay: true,
    okayLabel: "Okay",
  };
}

export function profileContextForLlm(
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
) {
  return {
    first_name: profile.first_name,
    name: profile.name,
    age: profile.age,
    stage: profile.stage,
    location_area: profile.location_area,
    music_preference: profile.music_preference,
    other_preferences: profile.other_preferences,
    family_members: profile.family_members,
    daily_tasks: profile.daily_tasks,
    medications: profile.medications,
    key_memories: profile.key_memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      story: memory.story,
      relationship: memory.relationship,
      photoHint: memory.photoHint,
      policy: memoryPolicies[memory.id] ?? "show",
    })),
  };
}

export function momentSpecContext(
  spec: MomentSpec,
  profile: PatientProfile,
  memoryPolicies: Record<string, MemoryPolicy> = {},
) {
  return JSON.stringify({
    kind: spec.kind,
    profile: profileContextForLlm(profile, memoryPolicies),
    context: spec.context,
  });
}
