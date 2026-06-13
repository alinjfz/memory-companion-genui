# MemoryBridge — AI Coding Agent Guide

> London A2A + A2UI Hackathon — June 13, 2026 — Google London (Central St Giles)
> Team: Ali + teammate | Track 2: Generative UI | Stack: Next.js 15 + FastAPI + LangGraph

---

## What This App Is

**MemoryBridge** is an Alzheimer's daily companion. A caregiver uploads a care plan PDF.
The agent reads it and generates a completely personalised interface for the patient —
different cognitive complexity, different content, different emotional tone — all from
the same agent, all via A2UI generative UI. No two patients see the same screen.

**The demo killer:** PANIC button → UI transforms → ElevenLabs voice calms the patient →
Linkup finds their favourite song → MusicCard renders. Judges won't forget it.

**Why it wins judging:**
- Originality: Generative UI used for cognitive accessibility, not cosmetics
- Creative A2UI: same 8 components, completely different surface per patient stage (early/mid/late)
- Technical: multi-agent (patient, research, setup), ElevenLabs TTS, Linkup deep search
- Economic: 982k UK dementia patients, £42.5bn cost, £8.8k–£44.9k per delayed care home admission

---

## Hard Rules

1. **Never bump `@copilotkit/*`, `langchain*`, or `langgraph*`** — versions are pinned.
2. **Never change `ChatGoogleGenerativeAI(...)`** in any agent file — model is FROZEN at Gemini 3.5 Flash.
3. **After editing any A2UI component**, run `pnpm validate-widget <path>` then `pnpm smoke`.
4. **Every new A2UI component needs 3 things** — definition in `definitions.ts`, renderer in `renderers.tsx`, one-line mirror in `agent/src/catalog.py` `CATALOG_PROMPT`.
5. **Patient screen language**: max 10 words per sentence, never use "Alzheimer's" or "dementia", always use first name only, always warm and reassuring.
6. **Do not add new top-level npm dependencies** without checking if one already exists.
7. **`OFFLINE=1 pnpm dev`** disables LLM calls during development — use it to avoid burning API credits.

---

## Required Sponsors (must be visible in demo + footer)

| Sponsor | How we use it |
|---|---|
| **CopilotKit + AG-UI** | The agent↔frontend live event stream. Powers all generative UI. |
| **A2UI (Google)** | Declarative UI spec — agent emits JSON, frontend renders. Our 8 components. |
| **Linkup** | Research agent: clinical guidance, local UK resources, music discovery. |
| **ElevenLabs** | TTS voice in panic mode: "Margaret, you're safe at home." |
| **Google Gemini 3.5 Flash** | The LLM behind all agents. FROZEN — do not change. |

Footer must credit all of them. Judges will look.

---

## Project Structure

```
src/
├── app/
│   ├── setup/page.tsx                           # Caregiver uploads PDF care plan
│   ├── patient/page.tsx                         # Patient adaptive screen (A2UI canvas + CopilotKit chat)
│   ├── family/page.tsx                          # Family monitoring: activity log + live status
│   ├── research/page.tsx                        # Caregiver Linkup Q&A
│   └── api/
│       ├── copilotkit-patient/[[...slug]]/route.ts
│       ├── copilotkit-research/[[...slug]]/route.ts
│       └── activity-log/route.ts
├── a2ui/
│   ├── theme.css                                # MemoryBridge palette — edit HERE for colours
│   ├── catalog/
│   │   ├── definitions.ts                       # All 8 component Zod schemas — ADD NEW COMPONENTS HERE
│   │   ├── renderers.tsx                        # All 8 React renderers — ADD NEW RENDERERS HERE
│   │   └── index.ts
│   └── MirrorRenderer.tsx
├── components/
│   ├── brand/Brand.tsx                          # Logo, Nav, PageHeader
│   ├── patient/PatientShell.tsx                 # CopilotKit + SurfaceCanvas wrapper
│   ├── patient/patient.css                      # Patient shell brand tokens
│   └── family/                                  # ActivityLog + LiveStatus
└── lib/
    ├── utils.ts
    └── pdf.ts                                   # Client-side PDF parsing (pdfjs-dist)

agent/
├── main.py                                      # FastAPI app — mounts all agents at :8123
├── src/
│   ├── patient_agent.py                         # Morning briefing + memory Q&A + panic mode
│   ├── research_agent.py                        # Linkup deep search
│   ├── setup_agent.py                           # PDF extraction only (no streaming)
│   ├── pdf_tools.py                             # TypedDicts + care plan extractor prompt
│   ├── linkup_tools.py                          # Linkup API wrapper
│   ├── elevenlabs_tools.py                      # ElevenLabs TTS wrapper
│   ├── catalog.py                               # CATALOG_ID + CATALOG_PROMPT (mirror of definitions.ts)
│   └── a2ui/schemas/
│       ├── morning_briefing.json
│       └── panic_surface.json

data/
└── margaret-care-plan.pdf                       # THE demo PDF — always use this for demos
```

---

## The 4 Pages

| Route | Who | What |
|---|---|---|
| `/setup` | Caregiver | Upload care plan PDF → review extracted profile → approve |
| `/patient` | Patient | Adaptive A2UI surface: morning briefing, memory Q&A, panic mode |
| `/family` | Family | Activity log (left) + live status panel (right) |
| `/research` | Caregiver | Linkup-powered clinical Q&A with EvidenceCards |

---

## The 8 A2UI Components

| Component | Screen | Purpose |
|---|---|---|
| `PatientGreeting` | /patient | "Good morning Margaret, Tuesday 13 June" — large warm header |
| `MemoryCard` | /patient | Family photo + story for reminiscence therapy |
| `DailyTask` | /patient | One large-text task card (complexity adapts: early=5 tasks, mid=3, late=1-2) |
| `MedicationReminder` | /patient | Clear pill reminder with times |
| `PanicOptions` | /patient (panic) | 4 big buttons: Play music / Talk / See family / Breathe |
| `CalmingMessage` | /patient (panic) | Full-screen calming overlay, auto-plays ElevenLabs TTS audio |
| `MusicCard` | /patient (panic) | Linkup-found song recommendation |
| `EvidenceCard` | /research | Linkup-sourced clinical guidance with NHS citation |

**Adding a new component — always do all 3 steps or it silently won't render:**
1. Add Zod schema to `src/a2ui/catalog/definitions.ts`
2. Add React renderer to `src/a2ui/catalog/renderers.tsx`
3. Add one-line description to `CATALOG_PROMPT` in `agent/src/catalog.py`

---

## The 3 Agents

### Patient Agent (`agent/src/patient_agent.py`) — `POST /patient`

Three modes, selected by message intent:

**Morning Briefing** — triggered by "render my morning" or page load
- Calls `render_morning_briefing(profile)` tool
- Emits: PatientGreeting + MemoryCard (top memory) + DailyTask × N + MedicationReminder
- N tasks: early stage = 5, mid = 3, late = 1-2

**Memory Q&A** — triggered by questions: "do I have a child?", "who is Sarah?"
- Looks up `profile.family_members` + `profile.key_memories`
- Emits: MemoryCard with photo hint + story

**Panic Mode** — triggered by `__PANIC__` message or distress language ("scared", "lost", "help")
- Emits CalmingMessage (fires ElevenLabs TTS server-side → returns audioUrl)
- Then emits PanicOptions with 4 options
- "Play music" → calls `linkup_music_search(profile.music_preference)` → emits MusicCard

System prompt: "You are a compassionate companion for {first_name} who has {stage}-stage memory difficulties. Use only their first name. Keep all language under 10 words per sentence. Never mention their diagnosis. Be warm, concrete, reassuring."

### Research Agent (`agent/src/research_agent.py`) — `POST /research`

Single tool: `linkup_deep_search(query: str)`. Always cites source. Always returns EvidenceCard(s).

Use cases:
- Clinical: "What helps with evening agitation?" → NHS NICE CG42
- Local: "Dementia support groups near Leeds" → local cafés + NHS services
- Personalised: "Frank Sinatra concerts 1960s" → reminiscence content
- Family: "How to talk to someone with mid-stage Alzheimer's" → Alzheimer's Society guide

### Setup Agent (`agent/src/setup_agent.py`) — `POST /setup`

One job: extract `PatientProfile` TypedDict from PDF text. No streaming, returns JSON.
Frontend stores in `sessionStorage`. Never call again — extraction is expensive.

---

## PatientProfile TypedDict

```python
class PatientProfile(TypedDict):
    name: str
    first_name: str
    age: int
    stage: Literal["early", "mid", "late"]
    daily_tasks: list[DailyTask]        # time, description, icon (emoji)
    medications: list[Medication]        # name, dose, time
    key_memories: list[Memory]           # max 3: title, story, photo_hint, relationship
    family_members: list[Person]         # name, relationship, age, location
    music_preference: str                # "Frank Sinatra"
    other_preferences: list[str]         # ["Yorkshire tea", "gardening", "jigsaws"]
    location_area: str                   # "Leeds"
```

---

## Panic Flow (the demo highlight — explain this clearly to judges)

```
Patient presses PANIC button
  → frontend sends { message: "__PANIC__" } to patient agent
  → agent emits CalmingMessage { message: "You're safe at home, Margaret.", audioText: "..." }
  → agent calls ElevenLabs TTS → audioUrl returned → included in CalmingMessage props
  → CalmingMessage renderer auto-plays audio via <audio autoPlay>
  → agent emits PanicOptions with 4 large buttons
  → patient taps "Play my music"
  → frontend sends { message: "__MUSIC__" }
  → agent calls linkup_music_search("Frank Sinatra")
  → agent emits MusicCard { artist: "Frank Sinatra", songTitle: "Fly Me to the Moon", ... }
```

---

## Family View (`/family`)

No agent needed. Pure React + 5-second polling of `/api/activity-log`.

Patient agent writes events to an in-memory store when things happen.
Event types: `task_completed`, `memory_viewed`, `panic`, `panic_resolved`, `medication_taken`.

Left panel = activity timeline (newest first, panic events highlighted amber).
Right panel = current status ("Active", "In memory mode", "Panic resolved 2 min ago") + today's stats.

---

## Theme

Edit `src/a2ui/theme.css` for agent-rendered A2UI surfaces.
Edit `src/components/patient/patient.css` for the patient shell chrome.

Key tokens:
```css
--primary: #2d6a9f;        /* NHS trust blue */
--accent: #7ec8a4;         /* calm green */
--background: #faf8f5;     /* warm off-white — not harsh clinical white */
--radius: 20px;            /* large, friendly, no sharp edges */
/* patient screen: base font 22px for accessibility */
/* panic overlay: --panic-bg: #f0f7ff */
```

Font: `Nunito` (rounded, approachable) via `next/font/google`.

Run `pnpm theme:reset` if layout breaks.

---

## Environment Variables

```bash
# .env (copy from .env.example)
GEMINI_API_KEY=...          # free key: aistudio.google.com/apikey
LINKUP_API_KEY=...          # linkup.so
ELEVENLABS_API_KEY=...      # elevenlabs.io

PATIENT_AGENT_URL=http://localhost:8123/patient
RESEARCH_AGENT_URL=http://localhost:8123/research
SETUP_AGENT_URL=http://localhost:8123/setup
```

---

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install all deps (also installs Python agent via postinstall) |
| `pnpm dev` | Boot Next.js :3000 + FastAPI :8123 concurrently |
| `pnpm run doctor` | Preflight env check — run this first if something is broken |
| `pnpm smoke` | Full gate: validators + pins + offline check — run before demo |
| `pnpm validate-widget <path>` | Validate an A2UI component JSON |
| `OFFLINE=1 pnpm dev` | Dev without LLM calls — canned responses, saves API credits |

---

## The Demo PDF

Always use `data/margaret-care-plan.pdf`.

```
Margaret Thompson, 74, Leeds, mid-stage Alzheimer's
Daughter: Sarah (30, London) | Son: James (34, Leeds) | Cat: Whiskers
Music: Frank Sinatra, Dean Martin, The Beatles
Daily routine: 8am breakfast, 10am garden walk, 12pm lunch, 3pm call with Sarah, 6pm dinner
Medications: Donepezil 10mg (morning), Memantine 10mg (evening)
Memories: Blackpool Ballroom 1972, Sarah's wedding York Minster 1998, 25yr career Leeds General Infirmary
```

---

## Demo Script (5 minutes, rehearse 3× before judging)

1. `/setup` → upload margaret PDF → watch extraction → approve profile
2. `/patient` → Morning Briefing renders: PatientGreeting + MemoryCard + 3 DailyTasks + MedicationReminder
3. Ask: **"Do I have a child?"** → MemoryCard: "Your daughter Sarah is 30. She loves you very much."
4. Press **PANIC** → voice plays → PanicOptions appear → "Play my music" → MusicCard: Frank Sinatra
5. `/research` → **"What helps with evening agitation in Alzheimer's?"** → EvidenceCard with NHS citation
6. `/family` → show activity log with panic event logged

**If something breaks during demo:** have a rehearsed recovery line. The panic moment is the anchor — if everything else fails, that one sequence will still win the crowd.

---

## What NOT to Do

- Don't use "Alzheimer's" or "dementia" anywhere visible to the patient
- Don't add sharp UI elements to the patient screen (no tables, no dense lists, no small text)
- Don't call PDF extraction more than once per session (cache in `sessionStorage`)
- Don't add `framer-motion` — existing CSS transitions are enough
- Don't change the Gemini model or provider
- Don't reintroduce an A2UI envelope inspector panel (use MirrorRenderer pill instead)
- Don't poll the activity log faster than every 5 seconds
