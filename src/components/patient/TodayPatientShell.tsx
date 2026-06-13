"use client";

import { useAgent } from "@copilotkit/react-core/v2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MirrorRenderer, parseA2UISurface } from "@/a2ui/MirrorRenderer";
import type { A2UISurface } from "@/a2ui/catalog/definitions";
import { patientStepBus } from "@/a2ui/patient-step-bus";
import { PatientProviders } from "@/components/patient/PatientProviders";
import "@/a2ui/theme.css";
import "@/components/patient/patient.css";
import type { DailyTask, Memory, PatientProfile } from "@/lib/echoes";
import type { PatientStepPayload } from "@/lib/patient-step-service";
import { clearSession, readSession, writePatientSession } from "@/lib/session";

const ROLE_KEY = "echoes.role";

const QUICK_ASKS = [
  "Where am I?",
  "Who am I?",
  "Do I have family?",
  "What should I do now?",
] as const;

type PatientFlowMode = "morning" | "panic" | "ask";

type StepPayload = {
  surface?: unknown;
  step?: number;
  total?: number;
  showOkay?: boolean;
  okayLabel?: string;
  speakText?: string;
  mode?: PatientFlowMode;
  theme?: { accent: string; surface: string; text: string };
  componentType?: string;
};

function currentCardLabel(componentType?: string) {
  switch (componentType) {
    case "PatientGreeting":
      return "Good morning";
    case "DailyTask":
      return "Today's step";
    case "MemoryCard":
      return "A memory";
    case "MedicationReminder":
      return "Medicine";
    default:
      return "Your moment";
  }
}

type DashboardAnchor = {
  label: string;
  value: string;
  detail: string;
  icon: string;
  compact?: boolean;
};

type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
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
    (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
  return ctor ? new ctor() : null;
}

function londonNow() {
  const now = new Date();
  return {
    day: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/London" }).format(now),
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(now),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    }).format(now),
    minutes: (() => {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(now),
      );
      const minute = Number(
        new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone: "Europe/London" }).format(now),
      );
      return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : now.getHours() * 60 + now.getMinutes();
    })(),
  };
}

function parseClockMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function findTask(tasks: DailyTask[], patterns: RegExp[]) {
  return tasks.find((task) =>
    patterns.some((pattern) => pattern.test(`${task.time} ${task.description}`.toLowerCase())),
  );
}

function parseMedMinutes(value: string) {
  return parseClockMinutes(value) ?? parseTimeOfDayMinutes(value);
}

function parseTimeOfDayMinutes(value: string) {
  const lower = value.toLowerCase();
  if (/morning|breakfast/.test(lower)) return 8 * 60;
  if (/noon|midday|lunch/.test(lower)) return 12 * 60;
  if (/afternoon/.test(lower)) return 15 * 60;
  if (/evening|night|bedtime/.test(lower)) return 18 * 60;
  return null;
}

function pickLatestMedication(profile: PatientProfile) {
  if (!profile.medications.length) return null;

  const now = londonNow();
  const ranked = profile.medications
    .map((med, index) => {
      const minutes = parseMedMinutes(med.time);
      return minutes === null ? null : { med, minutes, index };
    })
    .filter((entry): entry is { med: (typeof profile.medications)[number]; minutes: number; index: number } =>
      Boolean(entry),
    )
    .sort((a, b) => a.minutes - b.minutes);

  if (!ranked.length) return profile.medications[profile.medications.length - 1] ?? null;

  const upcoming = ranked.find((entry) => entry.minutes >= now.minutes);
  return (upcoming ?? ranked[ranked.length - 1]).med;
}

function buildAnchors(profile: PatientProfile): DashboardAnchor[] {
  const call = findTask(profile.daily_tasks, [/\bcall\b/i, /\bphone\b/i, /\btalk\b/i, /\bvideo\b/i]);
  const medication = pickLatestMedication(profile);

  return [
    {
      label: "Meds",
      value: medication ? medication.name : "None listed",
      detail: medication ? medication.time : "Today",
      icon: "💊",
    },
    {
      label: "Call",
      value: call?.time ?? "Today",
      detail: "",
      icon: "📞",
      compact: true,
    },
  ];
}

function memoryPreview(memory: Memory) {
  if (memory.photoPath) return memory.photoPath;
  const seed = memory.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = seed % 360;
  const title = memory.title.replace(/'/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="${title}">
    <defs>
      <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue} 70% 88%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 70% 78%)"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" rx="32" fill="url(#g)" />
    <text x="32" y="180" font-size="72" font-family="Arial, sans-serif">${memory.photoHint}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function fetchDashboardProfile(accessCode: string) {
  const response = await fetch(`/api/state?accessCode=${encodeURIComponent(accessCode)}`).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as { profile?: PatientProfile } | null;
  return data?.profile ?? null;
}

async function fetchStepFallback(
  accessCode: string,
  payload: Record<string, string | number>,
): Promise<StepPayload> {
  const response = await fetch("/api/patient-a2ui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode, ...payload }),
  });
  if (!response.ok) throw new Error("failed");
  return (await response.json()) as StepPayload;
}

export function TodayPatientShell() {
  return (
    <PatientProviders>
      <PatientDashboard />
    </PatientProviders>
  );
}

function PatientDashboard() {
  const router = useRouter();
  const { agent } = useAgent({ agentId: "patient_agent" });
  const spokeRef = useRef("");
  const wakeRef = useRef(false);
  const morningStepRef = useRef(0);
  const helpMusicTimerRef = useRef<number | null>(null);

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [surface, setSurface] = useState<A2UISurface | null>(null);
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(1);
  const [cardTheme, setCardTheme] = useState<
    { accent: string; surface: string; text: string } | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [askText, setAskText] = useState("");
  const [askSurface, setAskSurface] = useState<A2UISurface | null>(null);
  const [askTheme, setAskTheme] = useState<{ accent: string; surface: string; text: string } | undefined>();
  const [askLoading, setAskLoading] = useState(false);
  const [cardComponentType, setCardComponentType] = useState<string | undefined>();
  const [lastAskQuestion, setLastAskQuestion] = useState("");
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leavePin, setLeavePin] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpError, setHelpError] = useState("");
  const [helpSurface, setHelpSurface] = useState<A2UISurface | null>(null);
  const [helpStep, setHelpStep] = useState(0);
  const [helpTotal, setHelpTotal] = useState(0);
  const [helpShowOkay, setHelpShowOkay] = useState(false);
  const [helpOkayLabel, setHelpOkayLabel] = useState("Okay");
  const [helpTheme, setHelpTheme] = useState<{ accent: string; surface: string; text: string } | undefined>();
  const [agentReady, setAgentReady] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  const clock = useMemo(() => londonNow(), [clockTick]);
  const anchors = useMemo(() => (profile ? buildAnchors(profile) : []), [profile, clockTick]);
  const selectedMemory = useMemo(
    () => profile?.key_memories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [profile, selectedMemoryId],
  );
  const helpIsMusic = helpSurface?.components[0]?.component === "MusicCard";

  useEffect(() => setAgentReady(Boolean(agent)), [agent]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((v) => v + 1), 30_000);
    return () => {
      window.clearInterval(timer);
      if (helpMusicTimerRef.current !== null) window.clearTimeout(helpMusicTimerRef.current);
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    if (spokeRef.current === text) return;
    spokeRef.current = text;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.98;
    window.speechSynthesis.speak(utterance);
  }, []);

  const applyStep = useCallback(
    (data: StepPayload) => {
      if (data.mode === "ask") {
        setAskSurface(parseA2UISurface(data.surface));
        setAskTheme(data.theme);
        if (data.speakText) speak(data.speakText);
        return;
      }

      setSurface(parseA2UISurface(data.surface));
      setStep(data.step ?? 0);
      setTotal(data.total ?? 1);
      setCardTheme(data.theme);
      setCardComponentType(data.componentType);
      if (data.mode === "morning") morningStepRef.current = data.step ?? 0;
      if (data.speakText) speak(data.speakText);
    },
    [speak],
  );

  useEffect(() => {
    return patientStepBus.subscribe((payload: PatientStepPayload) => applyStep(payload));
  }, [applyStep]);

  const loadAskStep = useCallback(
    async (message: string) => {
      const code = readSession().patientCode || accessCode;
      if (!code) return;
      setAskLoading(true);
      setError("");
      try {
        const data = await fetchStepFallback(code, {
          action: "ask",
          message,
          step: morningStepRef.current,
        });
        applyStep({ ...data, mode: "ask" });
      } catch {
        setError("Your companion is quiet. Try again in a moment.");
      } finally {
        setAskLoading(false);
      }
    },
    [accessCode, applyStep],
  );

  const loadStep = useCallback(
    async (payload: Record<string, string | number>) => {
      const code = readSession().patientCode || accessCode;
      if (!code) return;
      if (payload.action === "ask") {
        await loadAskStep(String(payload.message ?? ""));
        return;
      }
      setBusy(true);
      setError("");
      patientStepBus.reset();

      const action = { accessCode: code, ...payload };
      let captured = false;

      try {
        if (agent) {
          let resolved = false;
          const unsub = agent.subscribe({
            onEvent({ event }) {
              const typed = event as { type?: string; name?: string; value?: StepPayload };
              if (typed.type !== "CUSTOM" && typed.type !== "Custom") return;
              if (typed.name === "echoes-patient-step" && typed.value) {
                applyStep(typed.value);
                captured = true;
                resolved = true;
              }
            },
          });

          agent.addMessage({
            id: crypto.randomUUID(),
            role: "user",
            content: JSON.stringify(action),
          });
          await agent.runAgent({ forwardedProps: { patientAction: action } });
          unsub.unsubscribe();

          if (!resolved) {
            const fromBus = patientStepBus.latest();
            if (fromBus) {
              applyStep(fromBus);
              captured = true;
            }
          }
        }

        if (!captured) {
          applyStep(await fetchStepFallback(code, payload));
        }
      } catch {
        try {
          applyStep(await fetchStepFallback(code, payload));
        } catch {
          setError("Something went quiet. Try again.");
        }
      } finally {
        setBusy(false);
      }
    },
    [accessCode, agent, applyStep, loadAskStep],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(ROLE_KEY);
    if (stored === "family") window.localStorage.setItem(ROLE_KEY, "caretaker");
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
    if (!linked || !accessCode) return;
    void fetchDashboardProfile(accessCode).then((next) => {
      if (next) setProfile(next);
    });
  }, [linked, accessCode]);

  useEffect(() => {
    if (!linked || !accessCode || !agentReady || wakeRef.current) return;
    wakeRef.current = true;
    spokeRef.current = "";
    void loadStep({ action: "wake", step: 0 });
  }, [linked, accessCode, agentReady, loadStep]);

  async function linkPatient() {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setError("Enter the home code.");
      return;
    }
    setBusy(true);
    const profileData = await fetchDashboardProfile(code);
    setBusy(false);
    if (!profileData) {
      setError("That code did not work.");
      return;
    }
    writePatientSession(code);
    wakeRef.current = false;
    setAccessCode(code);
    setProfile(profileData);
    setLinked(true);
  }

  function handlePrev() {
    if (busy || step <= 0) return;
    spokeRef.current = "";
    void loadStep({ action: "back", step });
  }

  function handleNext() {
    if (busy || step >= total - 1) return;
    spokeRef.current = "";
    void loadStep({ action: "advance", step });
  }

  function dismissAsk() {
    setAskSurface(null);
    setAskTheme(undefined);
    spokeRef.current = "";
  }

  function submitAsk(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy || askLoading) return;
    setAskText("");
    setLastAskQuestion(trimmed);
    spokeRef.current = "";
    void loadAskStep(trimmed);
  }

  function startListening() {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setError("Voice is not available on this device.");
      return;
    }
    window.speechSynthesis?.cancel();
    setListening(true);
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) submitAsk(transcript);
    };
    recognition.onerror = () => setError("I did not catch that. Try again.");
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  async function fetchHelpStep(payload: Record<string, string | number>) {
    const code = readSession().patientCode || accessCode;
    if (!code) throw new Error("missing code");
    return fetchStepFallback(code, payload);
  }

  async function openHelp() {
    if (helpMusicTimerRef.current !== null) {
      window.clearTimeout(helpMusicTimerRef.current);
      helpMusicTimerRef.current = null;
    }
    setHelpOpen(true);
    setHelpBusy(true);
    setHelpError("");
    try {
      const data = await fetchHelpStep({ action: "panic", step: 0, message: "__PANIC__" });
      setHelpSurface(parseA2UISurface(data.surface));
      setHelpStep(data.step ?? 0);
      setHelpTotal(data.total ?? 0);
      setHelpShowOkay(Boolean(data.showOkay));
      setHelpOkayLabel(data.okayLabel ?? "Okay");
      setHelpTheme(data.theme);
      if (data.speakText) speak(data.speakText);
    } catch {
      setHelpError("Help is quiet right now.");
    } finally {
      setHelpBusy(false);
    }
  }

  async function advanceHelp(nextStep: number) {
    setHelpBusy(true);
    setHelpError("");
    try {
      const data = await fetchHelpStep({ action: "panic", step: nextStep });
      setHelpSurface(parseA2UISurface(data.surface));
      setHelpStep(data.step ?? nextStep);
      setHelpTotal(data.total ?? 0);
      setHelpShowOkay(Boolean(data.showOkay));
      setHelpOkayLabel(data.okayLabel ?? "Okay");
      setHelpTheme(data.theme);
      if (data.speakText) speak(data.speakText);
    } catch {
      setHelpError("Help is quiet right now.");
    } finally {
      setHelpBusy(false);
    }
  }

  async function requestMusic() {
    setHelpBusy(true);
    setHelpError("");
    try {
      const data = await fetchHelpStep({ action: "music", step: 0, message: "__MUSIC__" });
      setHelpSurface(parseA2UISurface(data.surface));
      setHelpStep(data.step ?? 0);
      setHelpTotal(data.total ?? 0);
      setHelpShowOkay(Boolean(data.showOkay));
      setHelpOkayLabel(data.okayLabel ?? "Okay");
      setHelpTheme(data.theme);
      if (data.speakText) speak(data.speakText);
    } catch {
      setHelpError("Music is quiet right now.");
    } finally {
      setHelpBusy(false);
    }
  }

  async function confirmLeave() {
    const code = readSession().patientCode || accessCode;
    if (!leavePin.trim()) {
      setLeaveError("Enter your caretaker's password.");
      return;
    }
    setLeaveBusy(true);
    const response = await fetch("/api/patient-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: code, pin: leavePin.trim() }),
    });
    setLeaveBusy(false);
    if (!response.ok) {
      setLeaveError("That password is not correct.");
      return;
    }
    clearSession();
    router.push("/");
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
    <main className="patient-shell">
      <div className="patient-focus-bg" aria-hidden="true" />

      <button className="patient-dashboard-leave" type="button" onClick={() => setLeaveOpen(true)}>
        Leave
      </button>

      <section className="patient-dashboard-shell">
        <header className="patient-dashboard-header">
          <div className="patient-dashboard-heading">
            <p className="patient-dashboard-kicker">Your safe companion</p>
            <h1>Hi, {profile?.first_name || "Home"}</h1>
            <p className="patient-dashboard-subtitle">
              {clock.day} · {clock.date} · {clock.time}
            </p>
          </div>
          <p className="patient-dashboard-status" aria-live="polite">
            {busy ? "Thinking..." : "You are safe"}
          </p>
        </header>

        <section className="patient-dashboard-card" aria-label="Today's card">
          <div className="patient-dashboard-card-head">
            <span className="patient-dashboard-label">{currentCardLabel(cardComponentType)}</span>
            <span className="patient-dashboard-step">
              {step + 1} of {total}
            </span>
          </div>
          <div className="patient-a2ui-stage" aria-live="polite">
          <div className="patient-a2ui-nav">
            <button
              className="patient-a2ui-nav-btn"
              type="button"
              disabled={busy || step <= 0}
              onClick={handlePrev}
              aria-label="Previous card"
            >
              Prev
            </button>
            <div className="patient-a2ui-card-slot">
              {busy && !surface ? <p className="patient-dashboard-note">One moment...</p> : null}
              <MirrorRenderer
                key={`morning-${step}`}
                surface={surface}
                single
                step={step}
                total={total}
                theme={cardTheme}
                onPanicSelect={(id) => {
                  if (id === "music") void loadStep({ action: "music", message: "__MUSIC__", step: 0 });
                }}
              />
            </div>
            <button
              className="patient-a2ui-nav-btn"
              type="button"
              disabled={busy || step >= total - 1}
              onClick={handleNext}
              aria-label="Next card"
            >
              Next
            </button>
          </div>
          </div>
        </section>

        {profile?.key_memories.length ? (
          <section className="patient-memory-gallery" aria-label="Memory photos">
            <h2 className="patient-memory-gallery-title">Memories</h2>
            <div className="patient-memory-gallery-grid">
              {profile.key_memories.map((memory) => {
                const preview = memoryPreview(memory);
                const active = selectedMemoryId === memory.id;
                return (
                  <button
                    key={memory.id}
                    type="button"
                    className={`patient-memory-gallery-item${active ? " active" : ""}`}
                    onClick={() => setSelectedMemoryId(active ? null : memory.id)}
                    aria-expanded={active}
                    aria-label={`Memory: ${memory.title}`}
                  >
                    {preview ? <img src={preview} alt="" /> : null}
                  </button>
                );
              })}
            </div>
            {selectedMemory ? (
              <article className="patient-memory-gallery-story">
                <h3>{selectedMemory.title}</h3>
                <p>{selectedMemory.story}</p>
              </article>
            ) : null}
          </section>
        ) : null}

        <section className="patient-dashboard-strip" aria-label="Today at a glance">
          {anchors.map((anchor) => (
            <article key={anchor.label} className="patient-dashboard-chip">
              <span className="patient-dashboard-chip-icon" aria-hidden="true">
                {anchor.icon}
              </span>
              {anchor.compact ? (
                <strong className="patient-dashboard-chip-compact">{anchor.value}</strong>
              ) : (
                <>
                  <span className="patient-dashboard-chip-label">{anchor.label}</span>
                  <strong>{anchor.value}</strong>
                  {anchor.detail ? <small>{anchor.detail}</small> : null}
                </>
              )}
            </article>
          ))}
        </section>

        <section className="patient-ask-panel" aria-label="Ask me anything">
          <h2 className="patient-ask-title">Ask me anything</h2>
          <p className="patient-ask-lead">Speak or type. I answer using your memories and care plan.</p>
          <form
            className="patient-ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitAsk(askText);
            }}
          >
            <input
              className="patient-ask-input"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Where am I? Who am I?"
              disabled={busy || askLoading || listening}
              aria-label="Your question"
            />
            <button
              className="patient-ask-submit"
              type="submit"
              disabled={busy || askLoading || listening || !askText.trim()}
            >
              Ask
            </button>
            <button
              className={`patient-ask-voice${listening ? " listening" : ""}`}
              type="button"
              disabled={busy || askLoading || listening}
              onClick={startListening}
              aria-label="Ask with your voice"
            >
              {listening ? "…" : "🎤"}
            </button>
          </form>
          <div className="patient-ask-chips">
            {QUICK_ASKS.map((question) => (
              <button
                key={question}
                className="patient-ask-chip"
                type="button"
                disabled={busy || askLoading || listening}
                onClick={() => submitAsk(question)}
              >
                {question}
              </button>
            ))}
          </div>
          {askLoading ? <p className="patient-ask-note">Thinking with your memories...</p> : null}
          {lastAskQuestion ? <p className="patient-ask-question">You asked: {lastAskQuestion}</p> : null}
          {askSurface ? (
            <div className="patient-ask-result" aria-live="polite">
              <MirrorRenderer surface={askSurface} single pill={false} theme={askTheme} />
              <button className="patient-ask-dismiss" type="button" onClick={dismissAsk}>
                Okay
              </button>
            </div>
          ) : null}
        </section>

        {error ? <p className="patient-dashboard-error">{error}</p> : null}

        <div className="patient-dashboard-actions patient-dashboard-actions-single">
          <button className="patient-dashboard-help" type="button" disabled={helpBusy || busy} onClick={() => void openHelp()}>
            I need help
          </button>
        </div>
      </section>

      {leaveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm leave">
          <section className="patient-leave-modal">
            <h2 className="patient-leave-title">Leave this screen?</h2>
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
              <button className="patient-leave-cancel" type="button" disabled={leaveBusy} onClick={() => setLeaveOpen(false)}>
                Stay
              </button>
              <button className="patient-leave-confirm" type="button" disabled={leaveBusy} onClick={() => void confirmLeave()}>
                {leaveBusy ? "Checking..." : "Leave"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Help">
          <section className="patient-help-modal">
            <div className="patient-help-top">
              <div>
                <p className="patient-help-kicker">Help</p>
                <h2>{profile?.first_name || "Home"}</h2>
              </div>
              <button
                className="patient-help-close"
                type="button"
                onClick={() => {
                  if (helpMusicTimerRef.current !== null) window.clearTimeout(helpMusicTimerRef.current);
                  setHelpOpen(false);
                  setHelpError("");
                }}
              >
                Back
              </button>
            </div>
            {helpBusy && !helpSurface ? <p className="patient-dashboard-note">One moment...</p> : null}
            {helpError ? <p className="patient-dashboard-error">{helpError}</p> : null}
            <MirrorRenderer
              surface={helpSurface}
              single
              pill={false}
              step={helpStep}
              total={helpTotal}
              theme={helpTheme}
              onPanicSelect={(id) => {
                if (id === "music") void requestMusic();
              }}
            />
            {helpShowOkay ? (
              <button
                className="patient-dashboard-help confirm"
                type="button"
                disabled={helpBusy}
                onClick={() => {
                  if (helpIsMusic) {
                    setHelpOpen(false);
                    return;
                  }
                  void advanceHelp(helpStep + 1);
                }}
              >
                {helpOkayLabel}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
