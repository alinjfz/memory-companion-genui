import { z } from "zod";

export const CATALOG_ID = "echoes-patient-v1";

export const PatientGreetingSchema = z.object({
  name: z.string(),
  dayOfWeek: z.string(),
  dateString: z.string(),
  weatherEmoji: z.string().optional(),
  locationArea: z.string().optional(),
});

export const MemoryCardSchema = z.object({
  title: z.string(),
  story: z.string(),
  photoHint: z.string(),
  relationship: z.string().optional(),
  imageUrl: z.string().optional(),
  /** Ask answers: show story on the card instead of tap-to-read photo only. */
  showStoryInline: z.boolean().optional(),
});

export const DailyTaskSchema = z.object({
  time: z.string(),
  icon: z.string(),
  description: z.string(),
  completed: z.boolean().default(false),
  complexity: z.enum(["simple", "detailed"]).default("simple"),
});

export const MedicationReminderSchema = z.object({
  medications: z.array(
    z.object({
      name: z.string(),
      dose: z.string(),
      time: z.string(),
      taken: z.boolean().default(false),
    }),
  ),
  nextDueIn: z.string().optional(),
});

export const PanicOptionsSchema = z.object({
  patientName: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      icon: z.string(),
      label: z.string(),
      description: z.string(),
      color: z.string(),
    }),
  ),
});

export const CalmingMessageSchema = z.object({
  message: z.string(),
  audioText: z.string(),
  audioUrl: z.string().optional(),
  backgroundEmoji: z.string().optional(),
});

export const MusicCardSchema = z.object({
  artist: z.string(),
  songTitle: z.string(),
  description: z.string(),
  youtubeSearchQuery: z.string().optional(),
  coverEmoji: z.string(),
  audioUrl: z.string().optional(),
});

export const EvidenceCardSchema = z.object({
  suggestion: z.string(),
  source: z.string(),
  url: z.string().optional(),
  confidence: z.enum(["high", "medium"]),
  summary: z.string(),
});

export const MemoryLibraryHeaderSchema = z.object({
  patientName: z.string(),
  memoryCount: z.number(),
  stage: z.string(),
  locationArea: z.string().optional(),
  familySummary: z.string().optional(),
  guidance: z.string(),
});

export const MemoryContextCardSchema = z.object({
  memoryIndex: z.number(),
  memoryTotal: z.number(),
  relationship: z.string(),
  policy: z.enum(["show", "soften", "redirect", "hide"]),
  policyLabel: z.string(),
  policyDescription: z.string(),
  contextNotes: z.string().optional(),
  wordCount: z.number(),
});

export const A2UIComponentSchema = z.discriminatedUnion("component", [
  z.object({ id: z.string(), component: z.literal("PatientGreeting"), props: PatientGreetingSchema }),
  z.object({ id: z.string(), component: z.literal("MemoryCard"), props: MemoryCardSchema }),
  z.object({ id: z.string(), component: z.literal("DailyTask"), props: DailyTaskSchema }),
  z.object({
    id: z.string(),
    component: z.literal("MedicationReminder"),
    props: MedicationReminderSchema,
  }),
  z.object({ id: z.string(), component: z.literal("PanicOptions"), props: PanicOptionsSchema }),
  z.object({ id: z.string(), component: z.literal("CalmingMessage"), props: CalmingMessageSchema }),
  z.object({ id: z.string(), component: z.literal("MusicCard"), props: MusicCardSchema }),
  z.object({ id: z.string(), component: z.literal("EvidenceCard"), props: EvidenceCardSchema }),
  z.object({
    id: z.string(),
    component: z.literal("MemoryLibraryHeader"),
    props: MemoryLibraryHeaderSchema,
  }),
  z.object({
    id: z.string(),
    component: z.literal("MemoryContextCard"),
    props: MemoryContextCardSchema,
  }),
]);

export const A2UISurfaceSchema = z.object({
  catalogId: z.string(),
  components: z.array(A2UIComponentSchema),
});

export type A2UIComponent = z.infer<typeof A2UIComponentSchema>;
export type A2UISurface = z.infer<typeof A2UISurfaceSchema>;
export type PatientGreetingProps = z.infer<typeof PatientGreetingSchema>;
export type MemoryCardProps = z.infer<typeof MemoryCardSchema>;
export type DailyTaskProps = z.infer<typeof DailyTaskSchema>;
export type MedicationReminderProps = z.infer<typeof MedicationReminderSchema>;
export type PanicOptionsProps = z.infer<typeof PanicOptionsSchema>;
export type CalmingMessageProps = z.infer<typeof CalmingMessageSchema>;
export type MusicCardProps = z.infer<typeof MusicCardSchema>;
export type EvidenceCardProps = z.infer<typeof EvidenceCardSchema>;
export type MemoryLibraryHeaderProps = z.infer<typeof MemoryLibraryHeaderSchema>;
export type MemoryContextCardProps = z.infer<typeof MemoryContextCardSchema>;

export const COMPONENT_NAMES = [
  "PatientGreeting",
  "MemoryCard",
  "DailyTask",
  "MedicationReminder",
  "PanicOptions",
  "CalmingMessage",
  "MusicCard",
  "EvidenceCard",
  "MemoryLibraryHeader",
  "MemoryContextCard",
] as const;
