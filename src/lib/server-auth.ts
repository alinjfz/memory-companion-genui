import { readCaretakerSession } from "@/lib/caretaker-session";
import { activatePatient, connectPatient, getActiveRecord } from "@/lib/patient-store";

export async function resolveCaretakerToken(request: Request) {
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const urlToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const token = bearer || urlToken;
  if (!token) return null;

  const session = await readCaretakerSession(token);
  if (!session) return null;

  activatePatient(session.accessCode);
  return session;
}

export function resolveLegacyCaretaker(accessCode: string, pin: string) {
  if (!accessCode || !pin) return false;
  return Boolean(connectPatient(accessCode, pin));
}

export function hasActivePatient() {
  return Boolean(getActiveRecord());
}
