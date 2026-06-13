import type { Memory, PatientProfile } from "@/lib/echoes";
import { createMemoryImage } from "@/lib/memory-image";
import type { MemoryPolicy } from "@/lib/app-state-helpers";
import { themeForMemory } from "@/lib/patient-moments";
import { CATALOG_ID, type A2UISurface } from "@/a2ui/catalog/definitions";

const POLICY_META: Record<
  MemoryPolicy,
  { label: string; description: string }
> = {
  show: {
    label: "Show as written",
    description: "The patient sees this story exactly as you wrote it.",
  },
  soften: {
    label: "Soften language",
    description: "The patient sees a shorter, gentler first sentence only.",
  },
  redirect: {
    label: "Redirect gently",
    description: "The patient hears warm indirect wording instead of details.",
  },
  hide: {
    label: "Hidden for now",
    description: "This memory stays off the patient screen.",
  },
};

function memoryStoryForPolicy(memory: Memory, policy: MemoryPolicy) {
  if (policy === "hide") return null;
  if (policy === "redirect") {
    return "Someone you love dearly is watching over you with a warm smile.";
  }
  if (policy === "soften") {
    return memory.story.split(".").slice(0, 1).join(".").trim();
  }
  return memory.story;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function familySummary(profile: PatientProfile) {
  const names = profile.family_members.slice(0, 4).map((m) => `${m.name} (${m.relationship})`);
  return names.length ? names.join(" · ") : undefined;
}

function contextNotes(memory: Memory, profile: PatientProfile) {
  const member = profile.family_members.find(
    (m) =>
      memory.relationship.toLowerCase().includes(m.relationship.toLowerCase()) ||
      memory.story.toLowerCase().includes(m.name.toLowerCase()) ||
      memory.title.toLowerCase().includes(m.name.toLowerCase()),
  );
  if (member) {
    return `Linked to ${member.name}, ${member.relationship}${member.location ? ` · ${member.location}` : ""}.`;
  }
  if (memory.story.length > 120) {
    return "Longer story — consider soften for late-stage patients.";
  }
  return undefined;
}

export function buildCaretakerMemoryWorkbenchSurface(
  profile: PatientProfile,
  memory: Memory,
  index: number,
  policies: Record<string, MemoryPolicy>,
): A2UISurface {
  const policy = policies[memory.id] ?? "show";
  const meta = POLICY_META[policy];
  const patientStory = memoryStoryForPolicy(memory, policy);
  const shortStory = patientStory?.split(".").slice(0, 2).join(".").trim() || "";
  const memoryTheme = themeForMemory(memory);
  const total = profile.key_memories.length;

  return {
    catalogId: CATALOG_ID,
    components: [
      {
        id: "library-header",
        component: "MemoryLibraryHeader",
        props: {
          patientName: profile.first_name || profile.name.split(" ")[0] || "Patient",
          memoryCount: total,
          stage: profile.stage,
          locationArea: profile.location_area,
          familySummary: familySummary(profile),
          guidance: "Shape one memory at a time. Preview matches the patient screen.",
        },
      },
      {
        id: "memory-context",
        component: "MemoryContextCard",
        props: {
          memoryIndex: index,
          memoryTotal: total,
          relationship: memory.relationship,
          policy,
          policyLabel: meta.label,
          policyDescription: meta.description,
          contextNotes: contextNotes(memory, profile),
          wordCount: wordCount(memory.story),
        },
      },
      {
        id: memory.id || `memory-${index}`,
        component: "MemoryCard",
        props:
          policy === "hide"
            ? {
                title: "Hidden from patient",
                story: "This memory will not appear on their screen right now.",
                photoHint: "🔒",
                relationship: memory.relationship,
              }
            : {
                title: memory.title || "Untitled memory",
                story: shortStory || patientStory || memory.title,
                photoHint: memory.photoHint,
                relationship: memory.relationship,
                imageUrl: createMemoryImage(memory),
              },
      },
    ],
  };
}

export function buildCaretakerMemoryLibrarySurface(profile: PatientProfile): A2UISurface {
  return {
    catalogId: CATALOG_ID,
    components: [
      {
        id: "library-empty",
        component: "MemoryLibraryHeader",
        props: {
          patientName: profile.first_name || profile.name.split(" ")[0] || "Patient",
          memoryCount: 0,
          stage: profile.stage,
          locationArea: profile.location_area,
          familySummary: familySummary(profile),
          guidance: "Add memories one at a time. Short warm stories work best.",
        },
      },
    ],
  };
}

export { POLICY_META, memoryStoryForPolicy };
