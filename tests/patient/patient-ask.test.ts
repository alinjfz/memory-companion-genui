import assert from "node:assert/strict";
import test from "node:test";

import { A2UISurfaceSchema } from "@/a2ui/catalog/definitions";
import { generatePatientAnswer, isPatientLlmConfigured } from "@/lib/llm";
import { fallbackAskMoment, findMemoryForQuestion } from "@/lib/patient-moments";
import { resolvePatientStep } from "@/lib/patient-step-service";
import {
  mockFetchOnce,
  seedDemoPatientRecord,
  TEST_ACCESS_CODE,
  withEnv,
} from "../helpers/patient-fixture.ts";

test("findMemoryForQuestion avoids false positives on orientation questions", () => {
  const { profile } = seedDemoPatientRecord();
  assert.equal(findMemoryForQuestion("What should I do now?", profile), null);
  assert.equal(findMemoryForQuestion("Where am I?", profile), null);
  assert.equal(findMemoryForQuestion("What time is it?", profile), null);
});

test("findMemoryForQuestion matches family intent and names", () => {
  const { profile } = seedDemoPatientRecord();
  const daughterMatch = findMemoryForQuestion("Do I have a daughter?", profile);
  assert.ok(daughterMatch);
  assert.match(daughterMatch!.relationship, /daughter/i);

  const named = findMemoryForQuestion("Who is Helen?", profile);
  assert.ok(named);
  assert.match(named!.story, /Helen/i);
});

test("generatePatientAnswer returns offline source when OFFLINE=1", async () => {
  const { profile } = seedDemoPatientRecord();
  const restoreOffline = withEnv("OFFLINE", "1");
  const restoreKeys = withEnv("OPENROUTER_API_KEY", undefined);
  const restoreGemini = withEnv("GEMINI_API_KEY", undefined);

  try {
    const fallback = fallbackAskMoment("Where am I?", profile, 0, 1);
    const result = await generatePatientAnswer({
      profile,
      question: "Where am I?",
      step: 0,
      total: 1,
      fallback,
    });
    assert.equal(result.source, "offline");
    assert.match(result.moment.body, /safe|home/i);
  } finally {
    restoreGemini();
    restoreKeys();
    restoreOffline();
  }
});

test("generatePatientAnswer uses LLM when API key is configured", async () => {
  const { profile } = seedDemoPatientRecord();
  const restoreOffline = withEnv("OFFLINE", undefined);
  const restoreKey = withEnv("OPENROUTER_API_KEY", "test-key");
  const restoreGemini = withEnv("GEMINI_API_KEY", undefined);
  const restoreFetch = mockFetchOnce(async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Where am I?",
                body: "You are safe at home in Bristol.",
                speakText: "You are safe at home in Bristol.",
                theme: {
                  mood: "talk",
                  accent: "#4a7fb8",
                  surface: "linear-gradient(155deg, #f0f7ff 0%, #faf8f5 100%)",
                  text: "#1e4a72",
                  icon: "🏠",
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  try {
    assert.equal(isPatientLlmConfigured(), true);
    const fallback = fallbackAskMoment("Where am I?", profile, 0, 1);
    const result = await generatePatientAnswer({
      profile,
      question: "Where am I?",
      step: 0,
      total: 1,
      fallback,
    });
    assert.equal(result.source, "llm");
    assert.match(result.moment.body, /Bristol/i);
  } finally {
    restoreFetch();
    restoreGemini();
    restoreKey();
    restoreOffline();
  }
});

test("resolvePatientStep ask always returns A2UI surface with source metadata", async () => {
  seedDemoPatientRecord();
  const restoreOffline = withEnv("OFFLINE", undefined);
  const restoreKey = withEnv("OPENROUTER_API_KEY", "test-key");
  const restoreGemini = withEnv("GEMINI_API_KEY", undefined);
  const restoreFetch = mockFetchOnce(async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Who am I?",
                body: "You are George. You are safe at home.",
                speakText: "You are George. You are safe at home.",
                theme: {
                  mood: "talk",
                  accent: "#4a7fb8",
                  surface: "linear-gradient(155deg, #f0f7ff 0%, #faf8f5 100%)",
                  text: "#1e4a72",
                  icon: "💬",
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  try {
    const result = await resolvePatientStep({
      accessCode: TEST_ACCESS_CODE,
      action: "ask",
      message: "Who am I?",
      step: 0,
    });
    assert.ok(!("error" in result));
    if ("error" in result) return;

    assert.equal(result.mode, "ask");
    assert.equal(result.source, "llm");
    assert.ok(result.surface.components.length > 0);
    const parsed = A2UISurfaceSchema.safeParse(result.surface);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.components[0]?.component, "MemoryCard");
    assert.equal(parsed.data?.components[0]?.props.title, "Who am I?");
    assert.match(String(parsed.data?.components[0]?.props.story), /George/i);
    assert.ok(Array.isArray(result.a2ui_operations));
    assert.ok(result.a2ui_operations!.length > 0);
  } finally {
    restoreFetch();
    restoreGemini();
    restoreKey();
    restoreOffline();
  }
});

test("resolvePatientStep morning wake returns generative card plan", async () => {
  seedDemoPatientRecord();
  const restoreOffline = withEnv("OFFLINE", "1");

  try {
    const result = await resolvePatientStep({
      accessCode: TEST_ACCESS_CODE,
      action: "wake",
      step: 0,
    });
    assert.ok(!("error" in result));
    if ("error" in result) return;

    assert.equal(result.mode, "morning");
    assert.equal(result.componentType, "PatientGreeting");
    const parsed = A2UISurfaceSchema.safeParse(result.surface);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.components[0]?.component, "PatientGreeting");
    assert.ok(result.total > 1);
  } finally {
    restoreOffline();
  }
});
