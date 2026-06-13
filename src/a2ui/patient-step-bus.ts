import type { PatientStepPayload } from "@/lib/patient-step-service";

type Listener = (payload: PatientStepPayload) => void;

const listeners = new Set<Listener>();
let latest: PatientStepPayload | null = null;

function samePayload(a: PatientStepPayload | null, b: PatientStepPayload) {
  if (!a) return false;
  return a.step === b.step && a.mode === b.mode && JSON.stringify(a.surface) === JSON.stringify(b.surface);
}

export const patientStepBus = {
  push(payload: PatientStepPayload) {
    if (samePayload(latest, payload)) return;
    latest = payload;
    listeners.forEach((fn) => fn(payload));
  },
  latest() {
    return latest;
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    if (latest) fn(latest);
    return () => {
      listeners.delete(fn);
    };
  },
  reset() {
    latest = null;
  },
};
