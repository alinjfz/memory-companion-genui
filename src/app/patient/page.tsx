"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PatientMomentCard } from "@/components/PatientMomentCard";
import type { PatientMoment } from "@/lib/patient-moments";
import { clearSession, readSession, writePatientSession } from "@/lib/session";

const ROLE_KEY = "echoes.role";

type SpeechRecognitionResultLike = {
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const ctor =
    (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition ??
    (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition;
  return ctor ? new ctor() : null;
}

export default function PatientPage() {
  const router = useRouter();
  const spokeRef = useRef("");
  const wakeStartedRef = useRef(false);
  const [moment, setMoment] = useState<PatientMoment | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [error, setError] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [linked, setLinked] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leavePin, setLeavePin] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaveStale, setLeaveStale] = useState(false);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.98;
    window.speechSynthesis.speak(utterance);
  }, []);

  const loadMoment = useCallback(
    async (action: "wake" | "advance" | "moment" | "ask", nextStep: number, message?: string) => {
      const code = readSession().patientCode || accessCode;
      if (!code) {
        setBusy(false);
        setError("Missing home code.");
        return;
      }

      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/patient-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            step: nextStep,
            message,
            accessCode: code,
          }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "request failed");
        }
        const data = (await response.json()) as { moment?: PatientMoment };
        if (!data.moment) throw new Error("missing moment");
        setMoment(data.moment);
        setStep(data.moment.step);
        if (spokeRef.current !== data.moment.speakText) {
          spokeRef.current = data.moment.speakText;
          speak(data.moment.speakText);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error && loadError.message === "Patient not found."
            ? "This home is not ready yet. Ask your caretaker to finish setup."
            : "Something went quiet. Tap okay to try again.";
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [speak, accessCode],
  );

  const startListening = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setError("Voice is not available on this device.");
      return;
    }

    window.speechSynthesis?.cancel();
    setListening(true);
    setError("");
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        void loadMoment("ask", step, transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError("I did not catch that. Try again.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }, [loadMoment, step]);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognition()));
    const stored = window.localStorage.getItem(ROLE_KEY);
    if (stored === "family") {
      window.localStorage.setItem(ROLE_KEY, "caretaker");
    }
    const role = stored === "family" ? "caretaker" : stored;
    if (role && role !== "patient") {
      router.push(role === "caretaker" ? "/caretaker" : "/");
      return;
    }
    const session = readSession();
    if (session.patientCode) {
      setAccessCode(session.patientCode);
      setLinked(true);
    }
  }, [router]);

  useEffect(() => {
    if (!linked || !accessCode || wakeStartedRef.current) return;
    wakeStartedRef.current = true;
    spokeRef.current = "";
    void loadMoment("wake", 0);
  }, [linked, accessCode, loadMoment]);

  async function linkPatient() {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setError("Enter the home code from your caretaker.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/state?accessCode=${encodeURIComponent(code)}`).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("That code did not work. Check with your caretaker.");
      return;
    }
    writePatientSession(code);
    wakeStartedRef.current = false;
    setAccessCode(code);
    setLinked(true);
  }

  async function handleOkay() {
    if (busy) return;
    if (!moment) {
      await loadMoment("wake", 0);
      return;
    }
    if (moment.kind === "done" || !moment.showOkay) return;
    if (moment.kind === "talk") {
      spokeRef.current = "";
      await loadMoment("moment", step);
      return;
    }
    spokeRef.current = "";
    await loadMoment("advance", step);
  }

  function openLeaveModal() {
    setLeavePin("");
    setLeaveError("");
    setLeaveStale(false);
    setLeaveOpen(true);
  }

  function finishLeave() {
    clearSession();
    router.push("/");
  }

  async function confirmLeave() {
    const code = readSession().patientCode || accessCode;
    const pin = leavePin.trim();
    if (!code) {
      setLeaveError("Missing home code.");
      return;
    }
    if (!pin) {
      setLeaveError("Enter your caretaker's password.");
      return;
    }

    setLeaveBusy(true);
    setLeaveError("");
    try {
      const response = await fetch("/api/patient-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code, pin }),
      });
      if (response.status === 404) {
        setLeaveStale(true);
        setLeaveError("This home is no longer set up on this device.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setLeaveError(data?.error ?? "That passcode is not correct.");
        return;
      }
      finishLeave();
    } catch {
      setLeaveError("Something went wrong. Try again.");
    } finally {
      setLeaveBusy(false);
    }
  }

  if (!linked) {
    return (
      <main className="patient-focus-shell">
        <div className="patient-focus-bg" aria-hidden="true" />
        <section className="patient-focus-stage">
          <article className="patient-moment-card mood-greeting">
            <h1 className="patient-moment-title">Enter home code</h1>
            <p className="patient-moment-body">Your caretaker can share this with you.</p>
            <input
              className="caretaker-input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="ECHO-7K2M"
            />
            {error ? <p className="patient-focus-error">{error}</p> : null}
            <button className="patient-moment-okay" type="button" disabled={busy} onClick={() => void linkPatient()}>
              {busy ? "One moment..." : "Continue"}
            </button>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="patient-focus-shell">
      <div className="patient-focus-bg" aria-hidden="true" />

      <button className="patient-focus-exit" type="button" onClick={openLeaveModal}>
        Leave
      </button>

      <section className="patient-focus-stage">
        {moment ? (
          <PatientMomentCard moment={moment} busy={busy} onOkay={() => void handleOkay()} />
        ) : (
          <article className="patient-moment-card mood-greeting">
            <p className="patient-moment-body">{busy ? "Waking gently..." : "Hello."}</p>
            {!busy ? (
              <button className="patient-moment-okay" type="button" onClick={() => void handleOkay()}>
                Try again
              </button>
            ) : null}
          </article>
        )}

        {error ? <p className="patient-focus-error">{error}</p> : null}

        <div className="patient-focus-actions">
          <button
            className={`patient-ask-btn${listening ? " listening" : ""}`}
            type="button"
            disabled={busy || listening || !moment}
            onClick={startListening}
          >
            <span className="patient-ask-icon" aria-hidden="true">
              {listening ? "◉" : "🎙"}
            </span>
            {listening ? "Listening..." : "Ask me anything"}
          </button>
          {!voiceSupported ? (
            <p className="patient-focus-note">Voice works best in Chrome or Safari.</p>
          ) : null}
        </div>
      </section>

      {leaveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm leave">
          <section className="patient-leave-modal">
            <h2 className="patient-leave-title">Leave this screen?</h2>
            <p className="patient-leave-body">
              Enter your caretaker&apos;s password. This helps avoid leaving by accident.
            </p>
            <input
              className="caretaker-input"
              type="password"
              autoComplete="off"
              value={leavePin}
              onChange={(e) => setLeavePin(e.target.value)}
              placeholder="Caretaker password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmLeave();
              }}
            />
            {leaveError ? <p className="patient-focus-error">{leaveError}</p> : null}
            <div className="patient-leave-actions">
              <button
                className="patient-leave-cancel"
                type="button"
                disabled={leaveBusy}
                onClick={() => setLeaveOpen(false)}
              >
                Stay
              </button>
              {leaveStale ? (
                <button className="patient-leave-confirm" type="button" onClick={finishLeave}>
                  Return home
                </button>
              ) : (
                <button
                  className="patient-leave-confirm"
                  type="button"
                  disabled={leaveBusy}
                  onClick={() => void confirmLeave()}
                >
                  {leaveBusy ? "Checking..." : "Leave"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
