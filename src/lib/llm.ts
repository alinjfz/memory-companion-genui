import { buildResearchAnswer } from "@/lib/echoes";
import type { MomentKind, MomentTheme, PatientMoment } from "@/lib/patient-moments";
import { profileContextForLlm } from "@/lib/patient-moments";
import type { PatientProfile } from "@/lib/echoes";
import type { MemoryPolicy } from "@/lib/app-state-helpers";

export type EvidenceCard = {
  suggestion: string;
  source: string;
  url?: string;
  confidence: "high" | "medium";
  summary: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_OPENROUTER_MODEL = "amazon/nova-lite-v1";

function resolveOpenRouterModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

function openRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
    "X-OpenRouter-Title": "Echoes",
  };
}

function openRouterProviderConfig() {
  const order = process.env.OPENROUTER_PROVIDER_ORDER?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    provider: {
      allow_fallbacks: true,
      ...(order?.length ? { order } : {}),
    },
  };
}

/** Amazon Nova on Bedrock often rejects json_object; try plain prompt first. */
function jsonModeAttempts(model: string): boolean[] {
  if (model.startsWith("amazon/")) return [false, true];
  return [true, false];
}

function logOpenRouterError(status: number, detail: string) {
  console.warn("[echoes] OpenRouter LLM failed:", status, detail.slice(0, 240));
  try {
    const parsed = JSON.parse(detail) as {
      error?: { metadata?: { is_byok?: boolean; provider_name?: string } };
    };
    if (status === 403 && parsed.error?.metadata?.is_byok) {
      console.warn(
        "[echoes] Bedrock BYOK auth failed (OpenRouter API key is fine). " +
          "Fix AWS Bedrock credentials at https://openrouter.ai/settings/byok " +
          "or disable 'Always use for this provider' to use OpenRouter credits.",
      );
    }
  } catch {
    // ignore parse errors
  }
}

type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

async function callOpenRouterChat(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  maxTokens?: number;
}): Promise<string | null> {
  for (const useJsonMode of jsonModeAttempts(params.model)) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: openRouterHeaders(params.apiKey),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
        ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        ...openRouterProviderConfig(),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logOpenRouterError(response.status, detail);
      continue;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content;
  }

  return null;
}

function cleanJson(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseEvidence(raw: string): EvidenceCard | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as Partial<EvidenceCard>;
    if (
      typeof parsed.suggestion === "string" &&
      typeof parsed.source === "string" &&
      typeof parsed.summary === "string" &&
      (parsed.confidence === "high" || parsed.confidence === "medium")
    ) {
      return {
        suggestion: parsed.suggestion,
        source: parsed.source,
        summary: parsed.summary,
        confidence: parsed.confidence,
        url: typeof parsed.url === "string" ? parsed.url : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function callOpenRouter(query: string): Promise<EvidenceCard | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = resolveOpenRouterModel();
  const content = await callOpenRouterChat({
    apiKey,
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Return only JSON with keys suggestion, source, url, confidence, summary. Keep it short and practical.",
      },
      {
        role: "user",
        content: `Question: ${query}`,
      },
    ],
  });

  return content ? parseEvidence(content) : null;
}

async function callGemini(query: string): Promise<EvidenceCard | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const response = await fetch(
    `${GEMINI_BASE}/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Return only JSON with keys suggestion, source, url, confidence, summary. Keep it short and practical.\n\nQuestion: " +
                  query,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const content = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  return content ? parseEvidence(content) : null;
}

export async function generateEvidenceCard(query: string): Promise<EvidenceCard> {
  const openrouter = await callOpenRouter(query);
  if (openrouter) return openrouter;

  const gemini = await callGemini(query);
  if (gemini) return gemini;

  return buildResearchAnswer(query);
}

type PatientMomentDraft = {
  title?: string;
  body?: string;
  speakText?: string;
  theme?: Partial<MomentTheme>;
  okayLabel?: string;
};

function extractJsonObject(raw: string): string | null {
  const cleaned = cleanJson(raw);
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      JSON.parse(match[0]);
      return match[0];
    } catch {
      return null;
    }
  }
}

function parsePatientMoment(raw: string, question?: string): PatientMomentDraft | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as PatientMomentDraft;
    if (typeof parsed.body === "string" && parsed.body.trim()) {
      return {
        ...parsed,
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : question?.trim(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export type PatientAnswerSource = "llm" | "fallback" | "offline";

export function isPatientLlmConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
}

const PATIENT_SYSTEM_PROMPT = `You write for a patient companion app called Echoes.
Rules:
- Use only the patient's first name.
- Max 10 words per sentence.
- Never mention Alzheimer's, dementia, or diagnosis.
- Warm, concrete, reassuring tone.
- Keep title under 6 words and body under 2 short sentences.
- For memory cards, honour memory policy: redirect = gentle indirect wording, soften = shorter, hide = do not use.
- Style each card uniquely: pick accent (hex), surface (css gradient), text (hex), icon (emoji) that fit the memory mood.
Return only JSON with keys: title, body, speakText, okayLabel, theme.
theme must include: mood, accent (hex), surface (css gradient), text (hex), icon (emoji).`;

async function callOpenRouterPatientLlm(
  openrouterKey: string,
  model: string,
  prompt: string,
  question?: string,
): Promise<PatientMomentDraft | null> {
  const content = await callOpenRouterChat({
    apiKey: openrouterKey,
    model,
    temperature: 0.55,
    maxTokens: 512,
    messages: [
      { role: "system", content: PATIENT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  if (!content) return null;

  const parsed = parsePatientMoment(content, question);
  if (!parsed) {
    console.warn("[echoes] OpenRouter returned unparseable JSON for patient ask");
  }
  return parsed;
}

async function callPatientLlm(prompt: string, question?: string): Promise<PatientMomentDraft | null> {
  const timeoutMs = 25_000;

  const run = async (): Promise<PatientMomentDraft | null> => {
    const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
    if (openrouterKey) {
      const model = resolveOpenRouterModel();
      const openrouter = await callOpenRouterPatientLlm(openrouterKey, model, prompt, question);
      if (openrouter) return openrouter;
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
      const response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.55,
          },
          contents: [
            {
              parts: [{ text: `${PATIENT_SYSTEM_PROMPT}\n\n${prompt}` }],
            },
          ],
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const content = data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim();
        if (content) {
          const parsed = parsePatientMoment(content, question);
          if (parsed) return parsed;
          console.warn("[echoes] Gemini returned unparseable JSON for patient ask");
        }
      } else {
        const detail = await response.text().catch(() => "");
        console.warn("[echoes] Gemini LLM failed:", response.status, detail.slice(0, 240));
      }
    }

    return null;
  };

  try {
    return await Promise.race([
      run(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }
}

export async function generatePatientMoment(params: {
  profile: PatientProfile;
  kind: MomentKind;
  contextJson: string;
  step: number;
  total: number;
  fallback: PatientMoment;
  memoryPolicies?: Record<string, MemoryPolicy>;
}): Promise<PatientMoment> {
  if (process.env.OFFLINE === "1") return params.fallback;

  const prompt = `Create one patient card.
Kind: ${params.kind}
Step ${params.step + 1} of ${params.total}
Full patient data: ${JSON.stringify(profileContextForLlm(params.profile, params.memoryPolicies))}
Moment context: ${params.contextJson}`;

  const draft = await callPatientLlm(prompt);
  if (!draft?.title || !draft.body) return params.fallback;

  const theme = draft.theme ?? params.fallback.theme;
  return {
    ...params.fallback,
    title: draft.title,
    body: draft.body,
    speakText: draft.speakText ?? draft.body,
    okayLabel: draft.okayLabel ?? params.fallback.okayLabel,
    theme: {
      mood: params.kind,
      accent: theme.accent ?? params.fallback.theme.accent,
      surface: theme.surface ?? params.fallback.theme.surface,
      text: theme.text ?? params.fallback.theme.text,
      icon: theme.icon ?? params.fallback.theme.icon,
    },
  };
}

export async function generatePatientAnswer(params: {
  profile: PatientProfile;
  question: string;
  step: number;
  total: number;
  fallback: PatientMoment;
  memoryPolicies?: Record<string, MemoryPolicy>;
  matchedMemory?: PatientProfile["key_memories"][number];
}): Promise<{ moment: PatientMoment; source: PatientAnswerSource }> {
  if (process.env.OFFLINE === "1") {
    return { moment: params.fallback, source: "offline" };
  }

  if (!isPatientLlmConfigured()) {
    return { moment: params.fallback, source: "fallback" };
  }

  const memoryHint = params.matchedMemory
    ? `\nThe question likely relates to this memory — weave in its details:\n${JSON.stringify({
        title: params.matchedMemory.title,
        story: params.matchedMemory.story,
        relationship: params.matchedMemory.relationship,
        policy: params.memoryPolicies?.[params.matchedMemory.id] ?? "show",
      })}`
    : "";

  const prompt = `The patient just asked a spoken question. Write a warm, personal answer using their REAL profile data below.
Rules:
- Pull in specific names, places, and story details from key_memories when relevant.
- Do NOT give generic reassurance alone — mention at least one concrete detail from their memories or family.
- Max 10 words per sentence. Never mention Alzheimer's or dementia.
- Use their first name only once if needed.
- title: use the patient's question (shortened if needed)
- body: 1–2 short sentences grounded in their data
Question: "${params.question}"
Patient profile (use this data — especially key_memories stories):
${JSON.stringify(profileContextForLlm(params.profile, params.memoryPolicies), null, 2)}${memoryHint}`;

  const draft = await callPatientLlm(prompt, params.question);
  if (!draft?.body) {
    return { moment: params.fallback, source: "fallback" };
  }

  return {
    moment: {
      ...params.fallback,
      title: draft.title ?? params.question.trim(),
      body: draft.body,
      speakText: draft.speakText ?? draft.body,
      kind: params.fallback.imageUrl ? "memory" : params.fallback.kind,
      theme: {
        ...params.fallback.theme,
        accent: draft.theme?.accent ?? params.fallback.theme.accent,
        surface: draft.theme?.surface ?? params.fallback.theme.surface,
        text: draft.theme?.text ?? params.fallback.theme.text,
        icon: draft.theme?.icon ?? params.fallback.theme.icon,
      },
      imageUrl: params.fallback.imageUrl,
      memoryId: params.fallback.memoryId,
    },
    source: "llm",
  };
}

