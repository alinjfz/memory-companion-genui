import { NextResponse } from "next/server";
import {
  getState,
  patchState,
  resetState,
  saveProfile,
  updateActivity,
  updateMemoryPolicy,
  type AppState,
  type MemoryPolicy,
} from "@/lib/app-state";
import { activatePatient, getActiveRecord } from "@/lib/patient-store";
import type { PatientProfile } from "@/lib/echoes";
import { hasActivePatient, resolveCaretakerToken, resolveLegacyCaretaker } from "@/lib/server-auth";

async function resolveSession(
  request: Request,
  body: { accessCode?: string; pin?: string; token?: string } | null,
) {
  const token =
    typeof body?.token === "string"
      ? body.token.trim()
      : request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (token) {
    const session = await resolveCaretakerToken(
      new Request(request.url, { headers: { authorization: `Bearer ${token}` } }),
    );
    return Boolean(session);
  }

  const accessCode =
    typeof body?.accessCode === "string" ? body.accessCode.trim().toUpperCase() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (accessCode && pin) {
    return resolveLegacyCaretaker(accessCode, pin);
  }

  return hasActivePatient();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessCode = searchParams.get("accessCode")?.trim().toUpperCase() ?? "";
  const token = searchParams.get("token")?.trim() ?? "";
  const pin = searchParams.get("pin")?.trim() ?? "";

  if (token) {
    const session = await resolveCaretakerToken(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (accessCode && pin) {
    if (!resolveLegacyCaretaker(accessCode, pin)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (accessCode) {
    if (!activatePatient(accessCode)) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    const state = getState();
    return NextResponse.json({ ...state, caregiverPin: "" });
  } else if (!getActiveRecord()) {
    return NextResponse.json({ error: "No active patient session." }, { status: 401 });
  }

  const state = getState();
  if (accessCode && !pin && !token) {
    return NextResponse.json({ ...state, caregiverPin: "" });
  }
  return NextResponse.json({ ...state, caregiverPin: "" });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        accessCode?: string;
        pin?: string;
        token?: string;
        profile?: PatientProfile;
        memoryPolicy?: {
          memoryId?: string;
          policy?: MemoryPolicy;
        };
        activity?: Parameters<typeof updateActivity>[0];
        state?: Partial<AppState>;
      }
    | null;

  if (!(await resolveSession(request, body))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let current = patchState({});

  if (body?.action === "reset") {
    current = resetState(body.profile);
  }

  if (body?.profile) {
    current = saveProfile(body.profile);
  }

  if (body?.memoryPolicy?.memoryId && body.memoryPolicy.policy) {
    current = updateMemoryPolicy(body.memoryPolicy.memoryId, body.memoryPolicy.policy);
  }

  if (body?.activity) {
    current = updateActivity(body.activity);
  }

  if (body?.state) {
    current = patchState(body.state);
  }

  return NextResponse.json({ ...current, caregiverPin: "" });
}
