"use client";

import { useState, useCallback, type CSSProperties } from "react";
import { MemoryModal } from "@/components/patient/MemoryModal";
import type {
  CalmingMessageProps,
  DailyTaskProps,
  EvidenceCardProps,
  MemoryCardProps,
  MemoryContextCardProps,
  MemoryLibraryHeaderProps,
  MedicationReminderProps,
  MusicCardProps,
  PanicOptionsProps,
  PatientGreetingProps,
} from "@/a2ui/catalog/definitions";

export function PatientGreetingRenderer({ props }: { props: PatientGreetingProps }) {
  return (
    <article className="a2ui-card a2ui-greeting">
      <span className="a2ui-emoji" aria-hidden="true">
        {props.weatherEmoji ?? "🌅"}
      </span>
      <h1>
        Good morning, {props.name}
      </h1>
      <p>
        {props.dayOfWeek}, {props.dateString}
        {props.locationArea ? ` · ${props.locationArea}` : ""}
      </p>
    </article>
  );
}

export function MemoryCardRenderer({ props }: { props: MemoryCardProps }) {
  const inlineAnswer = Boolean(props.showStoryInline);
  const canOpen = Boolean(!inlineAnswer && (props.imageUrl || props.story));
  const [open, setOpen] = useState(false);
  const closeModal = useCallback(() => setOpen(false), []);

  if (inlineAnswer) {
    return (
      <article className="a2ui-card a2ui-memory a2ui-memory-inline">
        {props.imageUrl ? (
          <div className="a2ui-memory-photo a2ui-memory-photo-inline">
            <img src={props.imageUrl} alt="" decoding="async" />
          </div>
        ) : props.photoHint ? (
          <span className="a2ui-emoji a2ui-memory-hint" aria-hidden="true">
            {props.photoHint}
          </span>
        ) : null}
        <h2>{props.title}</h2>
        {props.relationship ? <p className="a2ui-memory-inline-rel">{props.relationship}</p> : null}
        <p className="a2ui-memory-inline-story">{props.story}</p>
      </article>
    );
  }

  return (
    <>
      <article className={`a2ui-card a2ui-memory${canOpen ? " photo-only" : ""}`}>
        {props.imageUrl ? (
          <button
            type="button"
            className="a2ui-memory-photo-btn"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Open memory: ${props.title}`}
          >
            <div className="a2ui-memory-photo">
              <img src={props.imageUrl} alt="" decoding="async" />
            </div>
            <span className="a2ui-memory-tap">Tap the photo to read</span>
          </button>
        ) : (
          <button
            type="button"
            className="a2ui-memory-open-btn"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Open memory: ${props.title}`}
          >
            <span className="a2ui-emoji a2ui-memory-hint" aria-hidden="true">
              {props.photoHint}
            </span>
            <span className="a2ui-memory-tap">Tap to read</span>
          </button>
        )}
        {!props.imageUrl ? <h2>{props.title}</h2> : null}
      </article>

      {open ? (
        <MemoryModal
          open
          title={props.title}
          story={props.story}
          imageUrl={props.imageUrl}
          photoHint={props.photoHint}
          relationship={props.relationship}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
}

export function DailyTaskRenderer({ props }: { props: DailyTaskProps }) {
  return (
    <article className="a2ui-card a2ui-task">
      <span className="a2ui-task-time">{props.time}</span>
      <span className="a2ui-emoji" aria-hidden="true">
        {props.icon}
      </span>
      <p>{props.description}</p>
      {props.completed ? <span className="a2ui-badge">Done</span> : null}
    </article>
  );
}

export function MedicationReminderRenderer({ props }: { props: MedicationReminderProps }) {
  return (
    <article className="a2ui-card a2ui-medication">
      <h2>Medicine time</h2>
      {props.nextDueIn ? <p className="a2ui-meta">{props.nextDueIn}</p> : null}
      <ul className="a2ui-med-list">
        {props.medications.map((med) => (
          <li key={`${med.name}-${med.time}`}>
            <strong>{med.name}</strong> {med.dose} · {med.time}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PanicOptionsRenderer({
  props,
  onSelect,
}: {
  props: PanicOptionsProps;
  onSelect?: (id: string) => void;
}) {
  return (
    <article className="a2ui-card a2ui-panic-options">
      <h2>{props.patientName}, choose what helps</h2>
      <div className="a2ui-panic-grid">
        {props.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="a2ui-panic-btn"
            style={{ "--panic-color": option.color } as CSSProperties}
            onClick={() => onSelect?.(option.id)}
          >
            <span aria-hidden="true">{option.icon}</span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </article>
  );
}

export function CalmingMessageRenderer({ props }: { props: CalmingMessageProps }) {
  return (
    <article className="a2ui-card a2ui-calming">
      <span className="a2ui-emoji a2ui-calming-bg" aria-hidden="true">
        {props.backgroundEmoji ?? "🌿"}
      </span>
      <h1>{props.message}</h1>
      {props.audioUrl ? <audio autoPlay src={props.audioUrl} /> : null}
    </article>
  );
}

export function MusicCardRenderer({ props }: { props: MusicCardProps }) {
  const href = props.youtubeSearchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(props.youtubeSearchQuery)}`
    : undefined;
  return (
    <article className="a2ui-card a2ui-music">
      <span className="a2ui-emoji" aria-hidden="true">
        {props.coverEmoji}
      </span>
      <h2>{props.songTitle}</h2>
      <p>{props.artist}</p>
      <p className="a2ui-meta">{props.description}</p>
      {props.audioUrl ? <audio autoPlay controls={false} src={props.audioUrl} /> : null}
      {href ? (
        <a className="a2ui-link" href={href} target="_blank" rel="noreferrer">
          Listen now
        </a>
      ) : null}
    </article>
  );
}

export function EvidenceCardRenderer({ props }: { props: EvidenceCardProps }) {
  return (
    <article className="a2ui-card a2ui-evidence">
      <span className={`a2ui-confidence ${props.confidence}`}>{props.confidence} confidence</span>
      <h2>{props.suggestion}</h2>
      <p>{props.summary}</p>
      <footer>
        <cite>{props.source}</cite>
        {props.url ? (
          <a className="a2ui-link" href={props.url} target="_blank" rel="noreferrer">
            Read source
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export function MemoryLibraryHeaderRenderer({ props }: { props: MemoryLibraryHeaderProps }) {
  return (
    <article className="a2ui-card a2ui-memory-library">
      <p className="a2ui-meta">Memory library</p>
      <h2>{props.patientName}</h2>
      <p className="a2ui-memory-library-stats">
        {props.memoryCount} {props.memoryCount === 1 ? "memory" : "memories"}
        {props.stage ? ` · ${props.stage} stage` : ""}
        {props.locationArea ? ` · ${props.locationArea}` : ""}
      </p>
      {props.familySummary ? <p className="a2ui-memory-library-family">{props.familySummary}</p> : null}
      <p className="a2ui-memory-library-guidance">{props.guidance}</p>
    </article>
  );
}

const POLICY_CLASS: Record<MemoryContextCardProps["policy"], string> = {
  show: "policy-show",
  soften: "policy-soften",
  redirect: "policy-redirect",
  hide: "policy-hide",
};

export function MemoryContextCardRenderer({ props }: { props: MemoryContextCardProps }) {
  return (
    <article className={`a2ui-card a2ui-memory-context ${POLICY_CLASS[props.policy]}`}>
      <div className="a2ui-memory-context-head">
        <span className="a2ui-meta">
          Memory {props.memoryIndex + 1} of {props.memoryTotal}
        </span>
        <span className={`a2ui-policy-badge ${POLICY_CLASS[props.policy]}`}>{props.policyLabel}</span>
      </div>
      <p className="a2ui-memory-context-rel">{props.relationship || "Memory"}</p>
      <p className="a2ui-memory-context-desc">{props.policyDescription}</p>
      {props.contextNotes ? <p className="a2ui-memory-context-notes">{props.contextNotes}</p> : null}
      <p className="a2ui-meta">{props.wordCount} words in story</p>
    </article>
  );
}
