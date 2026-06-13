import type { CSSProperties } from "react";
import type { PatientMoment } from "@/lib/patient-moments";

export function PatientMomentCard({
  moment,
  busy = false,
  onOkay,
}: {
  moment: PatientMoment;
  busy?: boolean;
  onOkay?: () => void;
}) {
  const theme = moment.theme;

  return (
    <article
      className={`patient-moment-card mood-${moment.kind}${moment.memoryId ? ` memory-${moment.memoryId}` : ""}`}
      style={
        {
          "--moment-accent": theme.accent,
          "--moment-surface": theme.surface,
          "--moment-text": theme.text,
        } as CSSProperties
      }
    >
      <div className="patient-moment-icon" aria-hidden="true">
        {theme.icon}
      </div>

      {moment.imageUrl ? (
        <div className="patient-moment-photo">
          <img src={moment.imageUrl} alt="" />
        </div>
      ) : null}

      <h1 className="patient-moment-title">{moment.title}</h1>
      <p className="patient-moment-body">{moment.body}</p>

      {moment.showOkay && onOkay ? (
        <button className="patient-moment-okay" type="button" disabled={busy} onClick={onOkay}>
          {busy ? "One moment..." : moment.okayLabel}
        </button>
      ) : null}
    </article>
  );
}
