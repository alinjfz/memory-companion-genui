import { NextResponse } from "next/server";
import { recordToAppState } from "@/lib/app-state";
import { isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import {
  createSessionToken,
  readCaretakerSession,
  saveCaretakerSession,
} from "@/lib/caretaker-session";
import {
  applyDemoToActive,
  createPatientAccount,
  getActiveRecord,
  signInCaretaker,
  activatePatient,
} from "@/lib/patient-store";
import { loadDemoPackage } from "@/lib/demo-data";

async function authResponse(record: NonNullable<ReturnType<typeof getActiveRecord>>) {
  const token = createSessionToken();
  await saveCaretakerSession(token, {
    accessCode: record.accessCode,
    email: record.caretakerEmail,
    caretakerName: record.caretakerName,
    createdAt: Date.now(),
  });
  return NextResponse.json({
    token,
    accessCode: record.accessCode,
    state: recordToAppState(record),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        caretakerName?: string;
        email?: string;
        password?: string;
        demoId?: string;
        token?: string;
      }
    | null;

  const action = body?.action ?? "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const caretakerName =
    typeof body?.caretakerName === "string" ? body.caretakerName.trim() : "";

  if (action === "signup") {
    if (!caretakerName || !isValidEmail(email) || password.length < 6) {
      return NextResponse.json(
        { error: "Add your name, a valid email, and a password of at least 6 characters." },
        { status: 400 },
      );
    }
    const record = createPatientAccount(caretakerName, email, password);
    if (!record) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return authResponse(record);
  }

  if (action === "signin") {
    if (!isValidEmail(email) || password.length < 6) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }
    const record = signInCaretaker(email, password);
    if (!record) {
      return NextResponse.json({ error: "Email or password did not match." }, { status: 401 });
    }
    return authResponse(record);
  }

  if (action === "loadDemo") {
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const session = token ? await readCaretakerSession(token) : null;
    if (!session) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    activatePatient(session.accessCode);
    const demo = loadDemoPackage(body?.demoId ?? "george-thomas");
    if (!demo) {
      return NextResponse.json({ error: "Demo package not found." }, { status: 404 });
    }
    const record = applyDemoToActive(demo);
    if (!record) {
      return NextResponse.json({ error: "Could not load demo." }, { status: 500 });
    }
    return NextResponse.json({
      accessCode: record.accessCode,
      state: recordToAppState(record),
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
