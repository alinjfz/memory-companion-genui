import { NextResponse } from "next/server";
import { getState, updateActivity } from "@/lib/app-state";
import { generatePatientAnswer, generatePatientMoment } from "@/lib/llm";
import {
  buildMomentPlan,
  fallbackAskMoment,
  fallbackMoment,
  momentSpecContext,
  type PatientMoment,
} from "@/lib/patient-moments";
import { activatePatient, connectPatient, getActiveRecord } from "@/lib/patient-store";
import { redisPushActivity } from "@/lib/redis";
import { resolveCaretakerToken } from "@/lib/server-auth";

function bindPatientSession(accessCode: string, pin?: string, request?: Request) {
  if (request) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      return resolveCaretakerToken(
        new Request("http://local", { headers: { authorization: `Bearer ${token}` } }),
      ).then(Boolean);
    }
  }

  if (!accessCode) return Promise.resolve(Boolean(getActiveRecord()));

  if (pin) {
    return Promise.resolve(Boolean(connectPatient(accessCode, pin)));
  }

  return Promise.resolve(Boolean(activatePatient(accessCode)));
}

function nowTimestamp() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date());
}

async function logActivity(accessCode: string, event: Parameters<typeof updateActivity>[0]) {
  updateActivity(event);
  await redisPushActivity(
    accessCode,
    JSON.stringify({ ...event, timestamp: event.timestamp || nowTimestamp() }),
  );
}

async function resolveMoment(step: number): Promise<PatientMoment> {
  const state = getState();
  const profile = state.profile;
  const policies = state.memoryPolicies;
  const plan = buildMomentPlan(profile, policies);
  const boundedStep = Math.max(0, Math.min(step, plan.length - 1));
  const spec = plan[boundedStep];
  const fallback = fallbackMoment(spec, profile, boundedStep, plan.length);

  const moment = await generatePatientMoment({
    profile,
    kind: spec.kind,
    contextJson: momentSpecContext(spec, profile, policies),
    step: boundedStep,
    total: plan.length,
    fallback,
    memoryPolicies: policies,
  });

  if (spec.kind === "memory") {
    moment.imageUrl = fallback.imageUrl;
    moment.memoryId = fallback.memoryId;
    moment.theme = { ...fallback.theme, ...moment.theme, icon: moment.theme.icon || fallback.theme.icon };
  }

  const accessCode = state.accessCode;
  if (spec.kind === "greeting" && accessCode) {
    await logActivity(accessCode, {
      timestamp: nowTimestamp(),
      type: "memory_viewed",
      description: `${profile.first_name} opened their morning greeting`,
      severity: "normal",
    });
  }

  if (spec.kind === "memory" && accessCode) {
    const memory = spec.context.memory as { title?: string };
    await logActivity(accessCode, {
      timestamp: nowTimestamp(),
      type: "memory_viewed",
      description: memory.title ? `${memory.title} memory shown` : "A memory card was shown",
      severity: "normal",
    });
  }

  if (spec.kind === "medication" && accessCode) {
    await logActivity(accessCode, {
      timestamp: nowTimestamp(),
      type: "medication_taken",
      description: "Medication moment acknowledged",
      severity: "normal",
    });
  }

  return moment;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { action?: string; step?: number; message?: string; accessCode?: string; pin?: string }
    | null;

  const accessCode =
    typeof body?.accessCode === "string" ? body.accessCode.trim().toUpperCase() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (accessCode && !(await bindPatientSession(accessCode, pin || undefined, request))) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!accessCode && token) {
    const ok = await bindPatientSession("", undefined, request);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const action = body?.action ?? "wake";
  const step = typeof body?.step === "number" ? body.step : 0;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (action === "ask" && message) {
    const state = getState();
    const plan = buildMomentPlan(state.profile, state.memoryPolicies);
    const fallback = fallbackAskMoment(message, state.profile, step, plan.length, state.memoryPolicies);
    const moment = await generatePatientAnswer({
      profile: state.profile,
      question: message,
      step,
      total: plan.length,
      fallback,
      memoryPolicies: state.memoryPolicies,
    });

    if (fallback.imageUrl) {
      moment.imageUrl = fallback.imageUrl;
      moment.kind = "memory";
      moment.memoryId = fallback.memoryId;
    }

    if (state.accessCode && moment.memoryId) {
      await logActivity(state.accessCode, {
        timestamp: nowTimestamp(),
        type: "memory_viewed",
        description: `Asked about ${moment.title}`,
        severity: "normal",
      });
    }

    return NextResponse.json({ moment });
  }

  if (action === "advance") {
    const moment = await resolveMoment(step + 1);
    return NextResponse.json({ moment });
  }

  if (action === "moment") {
    const moment = await resolveMoment(step);
    return NextResponse.json({ moment });
  }

  const moment = await resolveMoment(0);
  return NextResponse.json({ moment });
}
