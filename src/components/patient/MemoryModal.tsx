"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./MemoryModal.css";

type MemoryModalProps = {
  open: boolean;
  title: string;
  story: string;
  imageUrl?: string;
  photoHint?: string;
  relationship?: string;
  onClose: () => void;
};

export function MemoryModal({
  open,
  title,
  story,
  imageUrl,
  photoHint,
  relationship,
  onClose,
}: MemoryModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const memoryText = story.trim() || title;

  return createPortal(
    <div
      className="patient-memory-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <section
        className="patient-memory-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="patient-memory-modal-close" type="button" onClick={() => onCloseRef.current()}>
          Close
        </button>

        {imageUrl ? (
          <div className="patient-memory-modal-photo">
            <img src={imageUrl} alt="" decoding="async" />
          </div>
        ) : photoHint ? (
          <span className="patient-memory-modal-emoji" aria-hidden="true">
            {photoHint}
          </span>
        ) : null}

        <h2 className="patient-memory-modal-title">{title}</h2>
        {relationship ? <p className="patient-memory-modal-relationship">{relationship}</p> : null}
        <p className="patient-memory-modal-story">{memoryText}</p>
      </section>
    </div>,
    document.body,
  );
}
