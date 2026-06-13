# Demo Patient: George Thomas

## Identity
| Field | Value |
|---|---|
| Full name | George Thomas |
| First name | George |
| Age | 76 |
| Location | Bristol |
| Stage | Mid |
| Music | You Are My Sunshine |

---

## Late Wife: Rose Thomas
- Childhood sweethearts — grew up on the same Bristol street
- First dance 1968: "You Are My Sunshine"
- Married 1968, golden anniversary 2018
- Passed away 2023 (3 years ago)
- **DEMO NOTE:** During PANIC, ElevenLabs says: "George, you're safe at home. Rose loved this song." Then plays You Are My Sunshine.
- Memory policy: `redirect` (app gently steers away from grief, shows photos instead)

---

## Daughter: Helen Thomas
- Age 41, lives in London
- She has dark hair and George's jaw — she looks like him
- 1985: George held baby Helen at Bristol Royal Infirmary
- 2024: Helen held George's arm on the Royal Mile, Edinburgh
- The **reversed roles diptych** is the demo's centrepiece emotion
- **Demo trigger:** "Do I have a child?" → Helen memory + reversed photo

---

## Grandson: Oliver Thomas
- Born May 2026 — 6 weeks old at time of hackathon (June 2026)
- Helen's son. George's first grandchild.
- George met Oliver once but doesn't always remember the visit.
- **Demo trigger:** "Do I have a grandchild?" → Oliver memory + newborn photo
- Emotional hook: George has a grandson whose whole life is ahead. George may not remember him tomorrow.

---

## Career Memory
- Software engineer at Severn Engineering Ltd, Bristol (fictional company)
- 30 years writing structural analysis software in C++
- Code used in bridge restoration projects across the UK, including Clifton Suspension Bridge area
- Mentored 12 junior engineers
- Photo: 1994, at his CRT workstation, wireframe bridge model on screen

---

## Daily Tasks
| Time | Task | Icon |
|---|---|---|
| 8:00 AM | Breakfast with morning tablet | ☕ |
| 9:30 AM | Check on the allotment in the garden | 🌱 |
| 12:00 PM | Lunch and a glass of water | 🍲 |
| 3:00 PM | Call Helen on the video tablet | 📱 |
| 6:00 PM | Dinner and evening tablet | 🌙 |

---

## Medications
| Name | Dose | Time |
|---|---|---|
| Donepezil | 10mg | Morning |
| Memantine | 5mg | Evening |

---

## Preferences
- Allotment gardening (tomatoes, runner beans)
- BBC Radio 4
- Crosswords
- Bristol City FC

---

## Photos to Source
See `demo_data/photos/` for full descriptions of each photo:

| File | Memory | Priority |
|---|---|---|
| `photo_rose_golden_anniversary.txt` | 50 years with Rose | ⭐⭐⭐ HIGH — PANIC moment |
| `photo_helen_reversed.txt` | Your daughter Helen | ⭐⭐⭐ HIGH — demo centrepiece |
| `photo_oliver_newborn.txt` | Your grandson Oliver | ⭐⭐⭐ HIGH — emotional hook |
| `photo_george_career.txt` | Building bridges with code | ⭐⭐ MED — context/depth |

Place actual images in `public/demo/` with these filenames:
- `public/demo/rose-golden-anniversary.jpg`
- `public/demo/helen-reversed.jpg`
- `public/demo/oliver-newborn.jpg`
- `public/demo/george-career.jpg`

---

## Demo Script Triggers (updated for George)

1. `/setup` → upload margaret PDF → review extracted profile (will show George's data)
2. `/patient` → Morning Briefing: "Hello George" + Rose memory + 2 daily tasks + medication
3. Ask: **"Do I have a daughter?"** → Helen reversed-roles photo + story
4. Ask: **"Do I have a grandchild?"** → Oliver newborn photo + "You will meet him very soon"
5. Press **PANIC** → ElevenLabs: "George, you're safe. Rose loved this song." → You Are My Sunshine plays → PanicOptions appear
6. Tap **"Play music"** → MusicCard: You Are My Sunshine by Doris Day
7. `/research` → "What helps with evening agitation?" → EvidenceCard
8. `/family` → activity log shows: panic at 2:14 PM, Oliver memory opened at 10:30 AM

---

## Why George Wins the Room

1. **The reversal**: 1985 he held Helen. 2024 she holds him. No words needed.
2. **Oliver**: George has a grandson born 6 weeks ago. He might not remember him tomorrow. That's the whole app in one sentence.
3. **The PANIC song**: "You Are My Sunshine" playing for a man whose sunshine (Rose) is gone. Judges will feel this.
4. **The engineer**: He wrote C++ that kept bridges standing. Now he can't always find his keys. That's the human cost of dementia — not just memory, but identity.
