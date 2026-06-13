CATALOG_ID = "echoes-patient-v1"

CATALOG_PROMPT = """
Echoes A2UI catalog (emit JSON surfaces with these components):
- PatientGreeting: warm header with name, dayOfWeek, dateString, locationArea
- MemoryCard: reminiscence card with title, story, photoHint, imageUrl, relationship, showStoryInline (ask answers)
- DailyTask: one task with time, icon, description, complexity
- MedicationReminder: medications array with name, dose, time
- PanicOptions: patientName + 4 large calming options (music, talk, family, breathe)
- CalmingMessage: full-screen calming overlay with message, audioText, audioUrl
- MusicCard: Linkup-found song with artist, songTitle, description
- EvidenceCard: clinical guidance with suggestion, source, url, confidence, summary
- MemoryLibraryHeader: caretaker overview with patientName, memoryCount, stage, familySummary, guidance
- MemoryContextCard: caretaker memory shaping with policy, relationship, contextNotes, wordCount
Rules: max 10 words per sentence on patient screen. Never say Alzheimer's or dementia.
Use first name only. Warm, concrete, reassuring tone.
"""
