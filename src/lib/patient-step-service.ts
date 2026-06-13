import { getState, updateActivity } from "@/lib/app-state";
import { activatePatient, connectPatient, getActiveRecord } from "@/lib/patient-store";
import {
  buildMorningStepPlan,
  buildMusicCardSurface,
  buildPanicStepPlan,
  buildTalkStep,
  singleSurface,
  type PatientFlowMode,
  type PatientStep,
} from "@/lib/a2ui-builder";
import { createMemoryImage } from "@/lib/memory-image";
import { surfaceToA2UIOps } from "@/lib/a2ui-ops";
import { fallbackAskMoment, findMemoryForQuestion, type MomentKind } from "@/lib/patient-moments";
import { generatePatientAnswer, generatePatientMoment, type PatientAnswerSource } from "@/lib/llm";
import { speakCalmingMessage } from "@/lib/elevenlabs";
import { linkupMusicSearch } from "@/lib/linkup";
import type { A2UISurface } from "@/a2ui/catalog/definitions";

export type PatientStepPayload = {
  surface: A2UISurface;
  step: number;
  total: number;
  showOkay: boolean;
  okayLabel: string;
  speakText: string;
  mode: PatientFlowMode;
  theme?: { accent: string; surface: string; text: string };
  a2ui_operations?: ReturnType<typeof surfaceToA2UIOps>;
  source?: PatientAnswerSource;
  componentType?: string;
};

export type PatientActionInput = {
  action?: string;
  message?: string;
  accessCode?: string;
  pin?: string;
  optionId?: string;
  step?: number;
};

function bindSession(accessCode: string, pin?: string) {
  if (!accessCode) return Boolean(getActiveRecord());
  if (pin) return Boolean(connectPatient(accessCode, pin));
  return Boolean(activatePatient(accessCode));
}

function nowTimestamp() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date());
}

function recentActivitySummary() {
  const { activity, profile } = getState();
  return activity
    .slice(0, 8)
    .map((event) => `${event.type}: ${event.description}`)
    .concat([`Patient: ${profile.first_name}, stage ${profile.stage}`]);
}

async function enrichStep(
  step: PatientStep,
  profile: ReturnType<typeof getState>["profile"],
  stepIndex: number,
  total: number,
) {
  if (process.env.OFFLINE === "1") return step;

  const state = getState();
  const kind: MomentKind =
    step.component.component === "MemoryCard"
      ? "memory"
      : step.component.component === "DailyTask"
        ? "task"
        : step.component.component === "PatientGreeting"
          ? "greeting"
          : step.component.component === "MedicationReminder"
            ? "medication"
            : "talk";

  const fallback = {
    step: stepIndex,
    total,
    kind,
    title:
      step.component.component === "MemoryCard"
        ? step.component.props.title
        : step.component.component === "DailyTask"
          ? "One small step"
          : "Hello",
    body:
      step.component.component === "MemoryCard"
        ? step.component.props.story
        : step.component.component === "DailyTask"
          ? step.component.props.description
          : step.speakText,
    speakText: step.speakText,
    theme: {
      mood: kind,
      accent: step.theme?.accent ?? "#4a7fb8",
      surface: step.theme?.surface ?? "#fff",
      text: step.theme?.text ?? "#1e4a72",
      icon: "💫",
    },
    showOkay: step.showOkay,
    okayLabel: step.okayLabel,
    imageUrl:
      step.component.component === "MemoryCard" ? step.component.props.imageUrl : undefined,
  };

  const enriched = await generatePatientMoment({
    profile,
    kind,
    contextJson: JSON.stringify({
      component: step.component,
      theme: step.theme,
      recentActivity: recentActivitySummary(),
      caretakerPlan: {
        daily_tasks: profile.daily_tasks,
        medications: profile.medications,
        key_memories: profile.key_memories.map((m) => m.title),
      },
    }),
    step: stepIndex,
    total,
    fallback,
    memoryPolicies: state.memoryPolicies,
  });

  if (step.component.component === "MemoryCard") {
    return {
      ...step,
      speakText: enriched.speakText,
      component: {
        ...step.component,
        props: {
          ...step.component.props,
          title: enriched.title,
          story: enriched.body,
        },
      },
      theme: {
        accent: enriched.theme.accent,
        surface: enriched.theme.surface,
        text: enriched.theme.text,
      },
    };
  }

  if (step.component.component === "DailyTask") {
    return {
      ...step,
      speakText: enriched.speakText,
      component: {
        ...step.component,
        props: {
          ...step.component.props,
          description: enriched.body,
        },
      },
      theme: {
        accent: enriched.theme.accent,
        surface: enriched.theme.surface,
        text: enriched.theme.text,
      },
    };
  }

  if (step.component.component === "PatientGreeting") {
    return {
      ...step,
      speakText: enriched.speakText,
      component: {
        ...step.component,
        props: {
          ...step.component.props,
        },
      },
      theme: {
        accent: enriched.theme.accent,
        surface: enriched.theme.surface,
        text: enriched.theme.text,
      },
    };
  }

  return step;
}

function stepResponse(
  step: PatientStep,
  index: number,
  total: number,
  mode: PatientFlowMode,
  extras?: { source?: PatientAnswerSource },
): PatientStepPayload {
  const surface = singleSurface(step.component);
  return {
    surface,
    step: index,
    total,
    showOkay: step.showOkay,
    okayLabel: step.okayLabel,
    speakText: step.speakText,
    mode,
    theme: step.theme,
    a2ui_operations: surfaceToA2UIOps(surface, `patient-step-${index}`),
    source: extras?.source,
    componentType: step.component.component,
  };
}

export async function resolvePatientStep(
  input: PatientActionInput,
): Promise<PatientStepPayload | { error: string; status: number }> {
  const accessCode =
    typeof input.accessCode === "string" ? input.accessCode.trim().toUpperCase() : "";
  const pin = typeof input.pin === "string" ? input.pin.trim() : "";
  const action = input.action ?? "wake";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const stepIndex = typeof input.step === "number" ? input.step : 0;

  if (accessCode && !bindSession(accessCode, pin || undefined)) {
    return { error: "Patient not found.", status: 404 };
  }

  const state = getState();
  const profile = state.profile;

  if (action === "music" || message === "__MUSIC__" || input.optionId === "music") {
    const song = await linkupMusicSearch(profile.music_preference || "Frank Sinatra");
    updateActivity({
      timestamp: nowTimestamp(),
      type: "panic_resolved",
      description: `Calming music started — ${song.artist}`,
      severity: "normal",
    });
    const surface = buildMusicCardSurface(profile, song);
    return {
      surface,
      step: 0,
      total: 1,
      showOkay: true,
      okayLabel: "I feel better now",
      speakText: `Here is ${song.artist}.`,
      mode: "panic",
      theme: {
        accent: "#5b9fd4",
        surface: "linear-gradient(155deg, #eef6ff 0%, #faf8f5 100%)",
        text: "#1e4a72",
      },
      a2ui_operations: surfaceToA2UIOps(surface, "patient-music"),
    };
  }

  if (action === "panic" || message === "__PANIC__") {
    const audioUrl =
      (await speakCalmingMessage(
        `${profile.first_name}, you are safe at home. Take a slow breath with me.`,
      )) ?? undefined;
    const plan = buildPanicStepPlan(profile, audioUrl);
    const bounded = Math.max(0, Math.min(stepIndex, plan.length - 1));
    let current = plan[bounded];
    if (current.component.component !== "PanicOptions") {
      current = await enrichStep(current, profile, bounded, plan.length);
    }
    updateActivity({
      timestamp: nowTimestamp(),
      type: bounded === 0 ? "panic" : "panic_resolved",
      description: bounded === 0 ? "Panic button pressed" : "Panic calming step",
      severity: bounded === 0 ? "alert" : "normal",
    });
    return stepResponse(current, bounded, plan.length, "panic");
  }

  if (action === "ask" && message) {
    const memory = findMemoryForQuestion(message, profile, state.memoryPolicies);
    const fallback = fallbackAskMoment(message, profile, stepIndex, 1, state.memoryPolicies);
    const { moment: answer, source } = await generatePatientAnswer({
      profile,
      question: message,
      step: stepIndex,
      total: 1,
      fallback,
      memoryPolicies: state.memoryPolicies,
      matchedMemory: memory ?? undefined,
    });

    const cardTitle = message.trim();
    let askStep = buildTalkStep(profile, answer.body, cardTitle);

    const memoryRecord =
      memory ??
      (answer.memoryId ? profile.key_memories.find((item) => item.id === answer.memoryId) : null);

    if (askStep.component.component === "MemoryCard") {
      askStep = {
        ...askStep,
        component: {
          ...askStep.component,
          props: {
            ...askStep.component.props,
            title: cardTitle,
            story: answer.body,
            showStoryInline: true,
            ...(memoryRecord
              ? {
                  photoHint: memoryRecord.photoHint,
                  relationship: memoryRecord.relationship,
                  imageUrl: createMemoryImage(memoryRecord),
                }
              : {}),
          },
        },
      };
    }

    askStep = {
      ...askStep,
      speakText: answer.speakText,
      theme: {
        accent: answer.theme.accent,
        surface: answer.theme.surface,
        text: answer.theme.text,
      },
    };

    updateActivity({
      timestamp: nowTimestamp(),
      type: "memory_viewed",
      description: `Asked: ${message.slice(0, 80)} (${source})`,
      severity: "normal",
    });
    return stepResponse(askStep, 0, 1, "ask", { source });
  }

  const plan = buildMorningStepPlan(profile, state.memoryPolicies);
  let bounded = Math.max(0, Math.min(stepIndex, plan.length - 1));

  if (action === "advance") {
    bounded = Math.min(bounded + 1, plan.length - 1);
  }

  if (action === "back") {
    bounded = Math.max(bounded - 1, 0);
  }

  let current = plan[bounded];
  if (current.component.component !== "PanicOptions") {
    current = await enrichStep(current, profile, bounded, plan.length);
  }

  if (
    action === "wake" ||
    action === "morning" ||
    action === "advance" ||
    action === "back" ||
    action === "moment"
  ) {
    if (bounded === 0 && (action === "wake" || action === "morning")) {
      updateActivity({
        timestamp: nowTimestamp(),
        type: "memory_viewed",
        description: `${profile.first_name} opened their morning greeting`,
        severity: "normal",
      });
    }
    if (current.component.component === "MemoryCard") {
      updateActivity({
        timestamp: nowTimestamp(),
        type: "memory_viewed",
        description: `${current.component.props.title} memory shown`,
        severity: "normal",
      });
    }
    if (current.component.component === "MedicationReminder") {
      updateActivity({
        timestamp: nowTimestamp(),
        type: "medication_taken",
        description: "Medication moment acknowledged",
        severity: "normal",
      });
    }
  }

  return stepResponse(current, bounded, plan.length, "morning");
}
