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

  const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
      "X-OpenRouter-Title": "Echoes",
    },
    body: JSON.stringify({
      model,
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
      temperature: 0.2,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? parseEvidence(content) : null;
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

function parsePatientMoment(raw: string): PatientMomentDraft | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as PatientMomentDraft;
    if (typeof parsed.title === "string" && typeof parsed.body === "string") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
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

async function callPatientLlm(prompt: string): Promise<PatientMomentDraft | null> {
  const timeoutMs = 8000;

  const run = async (): Promise<PatientMomentDraft | null> => {
    const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
    if (openrouterKey) {
      const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
          "X-OpenRouter-Title": "Echoes",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: PATIENT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === "string") {
          const parsed = parsePatientMoment(content);
          if (parsed) return parsed;
        }
      }
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
          const parsed = parsePatientMoment(content);
          if (parsed) return parsed;
        }
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
}): Promise<PatientMoment> {
  if (process.env.OFFLINE === "1") return params.fallback;

  const prompt = `Answer the patient's spoken question using ALL profile data below.
If a specific memory matches, write as a warm memory card (title + story).
Question: ${params.question}
Full patient profile: ${JSON.stringify(profileContextForLlm(params.profile, params.memoryPolicies))}`;

  const draft = await callPatientLlm(prompt);
  if (!draft?.body) return params.fallback;

  return {
    ...params.fallback,
    title: draft.title ?? params.fallback.title,
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
  };
}

