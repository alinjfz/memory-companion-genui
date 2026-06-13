"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MirrorRenderer, parseA2UISurface } from "@/a2ui/MirrorRenderer";
import { CaretakerMemoryStudio } from "@/components/caretaker/CaretakerMemoryStudio";
import "@/a2ui/theme.css";
import type { AppState, MemoryPolicy } from "@/lib/app-state-types";
import {
  createEmptyMemory,
  createEmptyProfile,
  createMemoryId,
  parseCarePlanText,
  type Memory,
  type PatientProfile,
} from "@/lib/echoes";
import type { PatientStepPayload } from "@/lib/patient-step-service";
import {
  clearSession,
  readSession,
  stateBody,
  stateQuery,
  writeCaretakerSession,
  authHeaders,
} from "@/lib/session";
import { extractPdfText } from "@/lib/pdf";

type OnboardingStep = "patient" | "import" | "memories" | "routine" | "preferences" | "done";
type AuthMode = "signin" | "signup";

const ONBOARDING_STEPS: OnboardingStep[] = [
  "patient",
  "import",
  "memories",
  "routine",
  "preferences",
  "done",
];

function defaultMemoryPolicy(memory: Memory): MemoryPolicy {
  if (/wife|husband|partner/i.test(memory.relationship)) return "redirect";
  return "show";
}

function buildPolicies(profile: PatientProfile) {
  return Object.fromEntries(
    profile.key_memories.map((memory) => [memory.id, defaultMemoryPolicy(memory)]),
  ) as Record<string, MemoryPolicy>;
}

function syncFirstName(profile: PatientProfile): PatientProfile {
  const first = profile.name.trim().split(/\s+/)[0] ?? profile.first_name;
  return { ...profile, first_name: first || profile.first_name };
}

export default function CaretakerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [onboarding, setOnboarding] = useState(true);
  const [step, setStep] = useState<OnboardingStep>("patient");
  const [profile, setProfile] = useState<PatientProfile>(createEmptyProfile());
  const [policies, setPolicies] = useState<Record<string, MemoryPolicy>>({});
  const [activity, setActivity] = useState<AppState["activity"]>([]);
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<"memories" | "routine" | "about">("memories");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<PatientStepPayload | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [caretakerName, setCaretakerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const effectivePolicies = useMemo(
    () => ({ ...buildPolicies(profile), ...policies }),
    [profile, policies],
  );

  const loadState = useCallback(async () => {
    const session = readSession();
    if (!session.patientCode || !session.caretakerToken) {
      setAuthenticated(false);
      setReady(true);
      return;
    }

    const response = await fetch(`/api/state?${stateQuery(session)}`).catch(() => null);
    if (!response?.ok) {
      if (response?.status === 401 || response?.status === 404) {
        clearSession();
        setStatus("Your saved home was not found. Create or connect again.");
      }
      setAuthenticated(false);
      setReady(true);
      return;
    }

    const data = (await response.json().catch(() => null)) as AppState | null;
    if (!data) {
      setAuthenticated(false);
      setReady(true);
      return;
    }

    setProfile(data.profile);
    setPolicies(data.memoryPolicies);
    setActivity(data.activity);
    setAccessCode(data.accessCode);
    setOnboarding(!data.onboardingComplete);
    setAuthenticated(true);
    setReady(true);
  }, []);

  async function persist(nextProfile: PatientProfile, complete = false, nextPolicies = policies) {
    const session = readSession();
    setBusy(true);
    setStatus("Saving...");
    const synced = syncFirstName(nextProfile);
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        stateBody(session, {
          profile: synced,
          state: {
            memoryPolicies: nextPolicies,
            onboardingComplete: complete ? true : undefined,
          },
        }),
      ),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setStatus("Save failed.");
      return false;
    }
    const data = (await response.json().catch(() => null)) as AppState | null;
    if (data) {
      setProfile(data.profile);
      setPolicies(data.memoryPolicies);
      setActivity(data.activity);
      setAccessCode(data.accessCode);
      if (complete) setOnboarding(false);
    }
    setStatus(complete ? "All set." : "Saved.");
    return true;
  }

  async function handleSignup() {
    if (!caretakerName.trim() || !email.trim() || password.length < 6) {
      setStatus("Add your name, email, and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signup",
        caretakerName: caretakerName.trim(),
        email: email.trim(),
        password,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(data?.error ?? "Could not create account.");
      return;
    }
    const data = (await response.json()) as { token: string; accessCode: string; state: AppState };
    writeCaretakerSession({
      accessCode: data.accessCode,
      token: data.token,
      email: email.trim(),
      caretakerName: caretakerName.trim(),
    });
    setAccessCode(data.accessCode);
    setProfile(data.state.profile);
    setPolicies(data.state.memoryPolicies);
    setOnboarding(true);
    setStep("patient");
    setAuthenticated(true);
    setStatus(`Account created. Patient home code: ${data.accessCode}`);
  }

  async function handleSignin() {
    if (!email.trim() || password.length < 6) {
      setStatus("Enter your email and password.");
      return;
    }
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signin",
        email: email.trim(),
        password,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(data?.error ?? "Could not sign in.");
      return;
    }
    const data = (await response.json()) as { token: string; accessCode: string; state: AppState };
    writeCaretakerSession({
      accessCode: data.accessCode,
      token: data.token,
      email: email.trim(),
      caretakerName: data.state.caretakerName || caretakerName.trim() || "Caretaker",
    });
    setAccessCode(data.accessCode);
    setProfile(data.state.profile);
    setPolicies(data.state.memoryPolicies);
    setActivity(data.state.activity);
    setOnboarding(!data.state.onboardingComplete);
    setAuthenticated(true);
    setStatus(`Signed in. Patient home code: ${data.accessCode}`);
  }

  async function loadDemoData() {
    const session = readSession();
    if (!session.caretakerToken) {
      setStatus("Sign in first.");
      return;
    }
    setBusy(true);
    setStatus("Loading demo data...");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "loadDemo",
        token: session.caretakerToken,
        demoId: "george-thomas",
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(data?.error ?? "Demo load failed.");
      return;
    }
    const data = (await response.json()) as { state: AppState };
    const nextProfile = syncFirstName(data.state.profile);
    setProfile(nextProfile);
    setPolicies(buildPolicies(nextProfile));
    setActivity(data.state.activity);
    setOnboarding(true);
    setStep("patient");
    setStatus("George Thomas demo loaded — review and continue.");
  }

  useEffect(() => {
    const session = readSession();
    if (session.role && session.role !== "caretaker") {
      router.push(session.role === "patient" ? "/patient" : "/");
      return;
    }
    setCaretakerName(session.caretakerName);
    setEmail(session.caretakerEmail);
    void loadState();
  }, [router, loadState]);

  useEffect(() => {
    if (!authenticated || onboarding) return;
    const timer = window.setInterval(() => void loadState(), 5000);
    return () => window.clearInterval(timer);
  }, [authenticated, onboarding, loadState]);

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const latestEvent = activity[0];

  async function handlePdf(file: File) {
    setStatus(`Reading ${file.name}...`);
    try {
      const { text } = await extractPdfText(file);
      const parsed = parseCarePlanText(text);
      const next = syncFirstName(parsed);
      setProfile(next);
      setPolicies(buildPolicies(next));
      setStatus("Care plan imported.");
    } catch {
      setStatus("Could not read that file.");
    }
  }

  function addMemory() {
    setProfile((current) => ({
      ...current,
      key_memories: [...current.key_memories, createEmptyMemory()],
    }));
  }

  function updateMemory(index: number, patch: Partial<Memory>) {
    setProfile((current) => ({
      ...current,
      key_memories: current.key_memories.map((memory, i) => {
        if (i !== index) return memory;
        const next = { ...memory, ...patch };
        if (patch.title && !patch.id) next.id = createMemoryId(patch.title);
        return next;
      }),
    }));
  }

  function removeMemory(index: number) {
    setProfile((current) => ({
      ...current,
      key_memories: current.key_memories.filter((_, i) => i !== index),
    }));
  }

  function addTask() {
    setProfile((current) => ({
      ...current,
      daily_tasks: [...current.daily_tasks, { time: "9:00 AM", description: "A gentle step", icon: "✨" }],
    }));
  }

  function addMedication() {
    setProfile((current) => ({
      ...current,
      medications: [...current.medications, { name: "Medicine", dose: "1 tablet", time: "Morning" }],
    }));
  }

  async function finishOnboarding() {
    const synced = syncFirstName(profile);
    const nextPolicies = effectivePolicies;
    setPolicies(nextPolicies);
    await persist(synced, true, nextPolicies);
  }

  const loadPreviewMoment = useCallback(
    async (action: "wake" | "advance" | "moment", nextStep: number) => {
      const session = readSession();
      if (!session.patientCode || !session.caretakerToken) return;
      setPreviewBusy(true);
      try {
        const response = await fetch("/api/patient-a2ui", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(session),
          },
          body: JSON.stringify({
            action,
            step: nextStep,
            accessCode: session.patientCode,
          }),
        });
        if (!response.ok) throw new Error("preview failed");
        const data = (await response.json()) as PatientStepPayload;
        setPreviewPayload(data);
        setPreviewIndex(data.step);
      } catch {
        setStatus("Preview could not load. Save your changes and try again.");
        setPreviewOpen(false);
      } finally {
        setPreviewBusy(false);
      }
    },
    [],
  );

  async function openPatientPreview() {
    const saved = await persist(profile, false, effectivePolicies);
    if (!saved) return;
    setPreviewOpen(true);
    setPreviewPayload(null);
    setPreviewIndex(0);
    await loadPreviewMoment("wake", 0);
  }

  async function handlePreviewOkay() {
    if (previewBusy || !previewPayload) return;
    if (!previewPayload.showOkay) return;
    await loadPreviewMoment("advance", previewIndex);
  }

  const onboardingTitle = useMemo(() => {
    switch (step) {
      case "patient":
        return "Who are you caring for?";
      case "import":
        return "Bring in what you know";
      case "memories":
        return "Shape their memories";
      case "routine":
        return "Daily rhythm";
      case "preferences":
        return "Little comforts";
      case "done":
        return "Ready to begin";
      default:
        return "Echoes";
    }
  }, [step]);

  if (!ready) {
    return (
      <main className="caretaker-shell">
        <div className="caretaker-bg" aria-hidden="true" />
        <p className="caretaker-loading">Loading...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="caretaker-shell">
        <div className="caretaker-bg" aria-hidden="true" />
        <div className="caretaker-inner">
          <header className="caretaker-header">
            <span className="home-brand-mark">✦</span>
            <h1>Caretaker sign in</h1>
            <p className="caretaker-lead">Sign in with email to manage memories and daily rhythm.</p>
          </header>

          <section className="caretaker-card">
            <div className="caretaker-row">
              <button
                className={authMode === "signin" ? "caretaker-primary" : "caretaker-secondary"}
                type="button"
                onClick={() => setAuthMode("signin")}
              >
                Sign in
              </button>
              <button
                className={authMode === "signup" ? "caretaker-primary" : "caretaker-secondary"}
                type="button"
                onClick={() => setAuthMode("signup")}
              >
                Create account
              </button>
            </div>

            <div className="caretaker-form">
              {authMode === "signup" ? (
                <label>
                  Your name
                  <input
                    className="caretaker-input"
                    value={caretakerName}
                    onChange={(e) => setCaretakerName(e.target.value)}
                    placeholder="Helen"
                  />
                </label>
              ) : null}
              <label>
                Email
                <input
                  className="caretaker-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="helen@example.com"
                />
              </label>
              <label>
                Password
                <input
                  className="caretaker-input"
                  type="password"
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                />
              </label>
            </div>

            {status ? <p className="caretaker-status">{status}</p> : null}

            <div className="caretaker-actions">
              {authMode === "signup" ? (
                <button className="caretaker-primary" type="button" disabled={busy} onClick={() => void handleSignup()}>
                  {busy ? "Creating..." : "Create account"}
                </button>
              ) : (
                <button className="caretaker-primary" type="button" disabled={busy} onClick={() => void handleSignin()}>
                  {busy ? "Signing in..." : "Sign in"}
                </button>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (onboarding) {
    return (
      <main className="caretaker-shell">
        <div className="caretaker-bg" aria-hidden="true" />
        <div className="caretaker-inner">
          <header className="caretaker-header">
            <span className="home-brand-mark">✦</span>
            <p className="caretaker-eyebrow">
              Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
            </p>
            <h1>{onboardingTitle}</h1>
            {accessCode ? <p className="caretaker-code">Patient code: {accessCode}</p> : null}
          </header>

          <section className="caretaker-card">
            {step === "patient" && (
              <div className="caretaker-form">
                <p className="caretaker-lead">
                  Start with your loved one&apos;s details, or load the George Thomas demo to explore.
                </p>
                <button className="caretaker-secondary" type="button" disabled={busy} onClick={() => void loadDemoData()}>
                  Load demo data (George Thomas)
                </button>
                <label>
                  Full name
                  <input
                    className="caretaker-input"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="George Thomas"
                  />
                </label>
                <label>
                  Age
                  <input
                    className="caretaker-input"
                    type="number"
                    value={profile.age || ""}
                    onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Home area
                  <input
                    className="caretaker-input"
                    value={profile.location_area}
                    onChange={(e) => setProfile({ ...profile, location_area: e.target.value })}
                    placeholder="Bristol"
                  />
                </label>
              </div>
            )}

            {step === "import" && (
              <div className="caretaker-form">
                <p className="caretaker-lead">Upload a care plan PDF or skip and fill things in by hand.</p>
                <label className="caretaker-upload">
                  <strong>Upload PDF</strong>
                  <span>We read it locally on your device.</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePdf(file);
                    }}
                  />
                </label>
              </div>
            )}

            {step === "memories" && (
              <CaretakerMemoryStudio
                profile={profile}
                policies={effectivePolicies}
                compact
                onUpdateMemory={updateMemory}
                onUpdatePolicy={(memoryId, policy) =>
                  setPolicies((current) => ({ ...current, [memoryId]: policy }))
                }
                onAddMemory={addMemory}
                onRemoveMemory={removeMemory}
              />
            )}

            {step === "routine" && (
              <div className="caretaker-stack">
                <p className="caretaker-kicker">Daily steps</p>
                {profile.daily_tasks.map((task, index) => (
                  <article key={`task-${index}`} className="caretaker-item caretaker-row">
                    <input
                      className="caretaker-input caretaker-input-short"
                      value={task.time}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          daily_tasks: profile.daily_tasks.map((item, i) =>
                            i === index ? { ...item, time: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <input
                      className="caretaker-input"
                      value={task.description}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          daily_tasks: profile.daily_tasks.map((item, i) =>
                            i === index ? { ...item, description: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </article>
                ))}
                <button className="caretaker-secondary" type="button" onClick={addTask}>
                  Add a step
                </button>
                <p className="caretaker-kicker">Medications</p>
                {profile.medications.map((med, index) => (
                  <article key={`med-${index}`} className="caretaker-item caretaker-row">
                    <input
                      className="caretaker-input"
                      value={med.name}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          medications: profile.medications.map((item, i) =>
                            i === index ? { ...item, name: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <input
                      className="caretaker-input caretaker-input-short"
                      value={med.dose}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          medications: profile.medications.map((item, i) =>
                            i === index ? { ...item, dose: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <input
                      className="caretaker-input caretaker-input-short"
                      value={med.time}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          medications: profile.medications.map((item, i) =>
                            i === index ? { ...item, time: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </article>
                ))}
                <button className="caretaker-secondary" type="button" onClick={addMedication}>
                  Add medication
                </button>
              </div>
            )}

            {step === "preferences" && (
              <div className="caretaker-form">
                <label>
                  Favourite music
                  <input
                    className="caretaker-input"
                    value={profile.music_preference}
                    onChange={(e) => setProfile({ ...profile, music_preference: e.target.value })}
                  />
                </label>
                <label>
                  Loved one name
                  <input
                    className="caretaker-input"
                    value={profile.family_members[0]?.name ?? ""}
                    onChange={(e) => {
                      const member = profile.family_members[0] ?? {
                        name: "",
                        relationship: "family",
                        age: 0,
                        location: profile.location_area,
                      };
                      setProfile({ ...profile, family_members: [{ ...member, name: e.target.value }] });
                    }}
                  />
                </label>
                <input
                  className="caretaker-input"
                  value={profile.family_members[0]?.relationship ?? ""}
                  onChange={(e) => {
                    const member = profile.family_members[0] ?? {
                      name: "",
                      relationship: "",
                      age: 0,
                      location: profile.location_area,
                    };
                    setProfile({
                      ...profile,
                      family_members: [{ ...member, relationship: e.target.value }],
                    });
                  }}
                  placeholder="daughter"
                />
                <label>
                  Other comforts
                  <input
                    className="caretaker-input"
                    value={profile.other_preferences.join(", ")}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        other_preferences: e.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
            )}

            {step === "done" && (
              <div className="caretaker-done">
                <p className="caretaker-lead">
                  {profile.first_name || profile.name || "Your patient"} is ready.
                </p>
                <p className="caretaker-code">Share this code on the patient device: {accessCode}</p>
                <ul className="caretaker-summary">
                  <li>{profile.key_memories.length} memories</li>
                  <li>{profile.daily_tasks.length} daily steps</li>
                  <li>{profile.medications.length} medications</li>
                </ul>
              </div>
            )}

            {status ? <p className="caretaker-status">{status}</p> : null}

            <div className="caretaker-actions">
              {stepIndex > 0 && step !== "done" ? (
                <button className="caretaker-secondary" type="button" onClick={() => setStep(ONBOARDING_STEPS[stepIndex - 1])}>
                  Back
                </button>
              ) : null}
              {step === "done" ? (
                <button className="caretaker-primary" type="button" disabled={busy} onClick={() => void finishOnboarding()}>
                  {busy ? "Saving..." : "Open caretaker home"}
                </button>
              ) : (
                <button
                  className="caretaker-primary"
                  type="button"
                  disabled={step === "patient" && !profile.name.trim()}
                  onClick={() => setStep(ONBOARDING_STEPS[stepIndex + 1])}
                >
                  Continue
                </button>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="caretaker-shell">
      <div className="caretaker-bg" aria-hidden="true" />
      <div className="caretaker-inner caretaker-dashboard">
        <header className="caretaker-header caretaker-header-row">
          <div>
            <p className="caretaker-eyebrow">Caretaker</p>
            <h1>{profile.first_name || profile.name}</h1>
            <p className="caretaker-code">Patient code: {accessCode}</p>
            <p className="caretaker-meta">
              {latestEvent ? `${latestEvent.description} · ${latestEvent.timestamp}` : "All quiet right now."}
            </p>
          </div>
          <button
            className="caretaker-text-btn"
            type="button"
            onClick={() => {
              clearSession();
              router.push("/");
            }}
          >
            Leave
          </button>
        </header>

        <div className="caretaker-tabs">
          {(["memories", "routine", "about"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={dashboardTab === tab ? "caretaker-tab active" : "caretaker-tab"}
              onClick={() => setDashboardTab(tab)}
            >
              {tab === "memories" ? "Memories" : tab === "routine" ? "Routine" : "About"}
            </button>
          ))}
        </div>

        <section className="caretaker-card">
          {dashboardTab === "memories" && (
            <CaretakerMemoryStudio
              profile={profile}
              policies={effectivePolicies}
              onUpdateMemory={updateMemory}
              onUpdatePolicy={(memoryId, policy) =>
                setPolicies((current) => ({ ...current, [memoryId]: policy }))
              }
              onAddMemory={addMemory}
              onRemoveMemory={removeMemory}
            />
          )}

          {dashboardTab === "routine" && (
            <div className="caretaker-stack">
              {profile.daily_tasks.map((task, index) => (
                <article key={`dash-task-${index}`} className="caretaker-item caretaker-row">
                  <span className="caretaker-chip">{task.icon}</span>
                  <input
                    className="caretaker-input caretaker-input-short"
                    value={task.time}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        daily_tasks: profile.daily_tasks.map((item, i) =>
                          i === index ? { ...item, time: e.target.value } : item,
                        ),
                      })
                    }
                  />
                  <input
                    className="caretaker-input"
                    value={task.description}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        daily_tasks: profile.daily_tasks.map((item, i) =>
                          i === index ? { ...item, description: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </article>
              ))}
              <button className="caretaker-secondary" type="button" onClick={addTask}>
                Add step
              </button>
            </div>
          )}

          {dashboardTab === "about" && (
            <div className="caretaker-form">
              <label>
                Music
                <input
                  className="caretaker-input"
                  value={profile.music_preference}
                  onChange={(e) => setProfile({ ...profile, music_preference: e.target.value })}
                />
              </label>
              <label>
                Location
                <input
                  className="caretaker-input"
                  value={profile.location_area}
                  onChange={(e) => setProfile({ ...profile, location_area: e.target.value })}
                />
              </label>
              <button className="caretaker-secondary" type="button" disabled={busy} onClick={() => void loadDemoData()}>
                Load demo data (George Thomas)
              </button>
              <div className="caretaker-row">
                <a className="caretaker-secondary" href="/research">
                  Open research (Linkup)
                </a>
                <a className="caretaker-secondary" href="/family">
                  Family activity log
                </a>
              </div>
            </div>
          )}

          {status ? <p className="caretaker-status">{status}</p> : null}

          <div className="caretaker-actions">
            <button
              className="caretaker-primary"
              type="button"
              disabled={busy}
              onClick={() => void persist(profile, false, effectivePolicies)}
            >
              {busy ? "Saving..." : "Save changes"}
            </button>
            <button className="caretaker-secondary" type="button" onClick={() => void openPatientPreview()}>
              Preview patient view
            </button>
          </div>
        </section>
      </div>

      {previewOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Patient preview">
          <section className="patient-preview-modal caretaker-card">
            <div className="caretaker-header-row">
              <div>
                <p className="caretaker-eyebrow">Patient preview</p>
                <h2>{profile.first_name || profile.name || "Patient"}</h2>
                <p className="caretaker-meta">This is what they see, one card at a time.</p>
              </div>
              <button className="caretaker-text-btn" type="button" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>

            <div className="patient-preview-stage">
              {previewPayload ? (
                <>
                  <MirrorRenderer
                    surface={parseA2UISurface(previewPayload.surface)}
                    single
                    step={previewPayload.step}
                    total={previewPayload.total}
                    theme={previewPayload.theme}
                  />
                  {previewPayload.showOkay ? (
                    <button
                      className="patient-moment-okay"
                      type="button"
                      disabled={previewBusy}
                      onClick={() => void handlePreviewOkay()}
                    >
                      {previewBusy ? "One moment..." : previewPayload.okayLabel}
                    </button>
                  ) : null}
                </>
              ) : (
                <article className="patient-moment-card mood-greeting">
                  <p className="patient-moment-body">
                    {previewBusy ? "Loading preview..." : "No preview yet."}
                  </p>
                </article>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
