export const SESSION_KEYS = {
  role: "echoes.role",
  patientCode: "echoes.patient.code",
  caretakerToken: "echoes.caretaker.token",
  caretakerEmail: "echoes.caretaker.email",
  caretakerName: "echoes.caretaker.name",
  /** @deprecated Legacy pin auth */
  caretakerPin: "echoes.caretaker.pin",
} as const;

export function readSession() {
  if (typeof window === "undefined") {
    return {
      role: "",
      patientCode: "",
      caretakerToken: "",
      caretakerEmail: "",
      caretakerPin: "",
      caretakerName: "",
    };
  }

  const role = window.localStorage.getItem(SESSION_KEYS.role) ?? "";
  if (role === "family") {
    window.localStorage.setItem(SESSION_KEYS.role, "caretaker");
  }

  return {
    role: role === "family" ? "caretaker" : role,
    patientCode: window.localStorage.getItem(SESSION_KEYS.patientCode) ?? "",
    caretakerToken: window.localStorage.getItem(SESSION_KEYS.caretakerToken) ?? "",
    caretakerEmail: window.localStorage.getItem(SESSION_KEYS.caretakerEmail) ?? "",
    caretakerPin: window.localStorage.getItem(SESSION_KEYS.caretakerPin) ?? "",
    caretakerName: window.localStorage.getItem(SESSION_KEYS.caretakerName) ?? "",
  };
}

export function writeCaretakerSession(input: {
  accessCode: string;
  token: string;
  email: string;
  caretakerName: string;
}) {
  window.localStorage.setItem(SESSION_KEYS.role, "caretaker");
  window.localStorage.setItem(SESSION_KEYS.patientCode, input.accessCode);
  window.localStorage.setItem(SESSION_KEYS.caretakerToken, input.token);
  window.localStorage.setItem(SESSION_KEYS.caretakerEmail, input.email);
  window.localStorage.setItem(SESSION_KEYS.caretakerName, input.caretakerName);
  window.localStorage.removeItem(SESSION_KEYS.caretakerPin);
}

export function writePatientSession(accessCode: string) {
  window.localStorage.setItem(SESSION_KEYS.role, "patient");
  window.localStorage.setItem(SESSION_KEYS.patientCode, accessCode);
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEYS.role);
  window.localStorage.removeItem(SESSION_KEYS.patientCode);
  window.localStorage.removeItem(SESSION_KEYS.caretakerToken);
  window.localStorage.removeItem(SESSION_KEYS.caretakerEmail);
  window.localStorage.removeItem(SESSION_KEYS.caretakerPin);
  window.localStorage.removeItem(SESSION_KEYS.caretakerName);
}

export function authHeaders(session: ReturnType<typeof readSession>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (session.caretakerToken) headers.Authorization = `Bearer ${session.caretakerToken}`;
  return headers;
}

export function stateQuery(session: ReturnType<typeof readSession>) {
  const params = new URLSearchParams();
  if (session.patientCode) params.set("accessCode", session.patientCode);
  if (session.caretakerToken) params.set("token", session.caretakerToken);
  if (!session.caretakerToken && session.caretakerPin) params.set("pin", session.caretakerPin);
  return params.toString();
}

export function stateBody(session: ReturnType<typeof readSession>, payload: Record<string, unknown>) {
  return {
    ...payload,
    accessCode: session.patientCode,
    token: session.caretakerToken || undefined,
    pin: session.caretakerPin || undefined,
  };
}
