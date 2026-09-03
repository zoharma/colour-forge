import type { Finding, Severity } from "../color/audit";

const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: "Blocker",
  warning: "Warning",
  note: "Note",
};

/** Findings, ranked. Notes are collapsed by default: the two that fire on
 *  almost every colour ("eased off APCA", "held by WCAG") are the tool
 *  explaining itself, and showing them at the same weight as a real
 *  collision teaches people to skim past all of it. */
export function Findings({ findings }: { findings: Finding[] }) {
  const blockers = findings.filter((f) => f.severity === "blocker");
  const warnings = findings.filter((f) => f.severity === "warning");
  const notes = findings.filter((f) => f.severity === "note");

  if (!findings.length) {
    return (
      <p className="readout">
        Nothing flagged: no contrast failure, no colour-vision collision with the family, no parity or
        visibility issue.
      </p>
    );
  }

  return (
    <>
      <p className="readout" style={{ marginTop: 0 }}>
        <b>{blockers.length}</b> blocker{blockers.length === 1 ? "" : "s"}, <b>{warnings.length}</b> warning
        {warnings.length === 1 ? "" : "s"}, <b>{notes.length}</b> note{notes.length === 1 ? "" : "s"}.
      </p>

      <ul className="findings">
        {[...blockers, ...warnings].map((finding) => (
          <FindingItem key={finding.id} finding={finding} />
        ))}
      </ul>

      {notes.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.8125rem" }}>
            {notes.length} note{notes.length === 1 ? "" : "s"} on how each colour was decided
          </summary>
          <ul className="findings" style={{ marginTop: 10 }}>
            {notes.map((finding) => (
              <FindingItem key={finding.id} finding={finding} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className={`finding ${finding.severity}`}>
      <span className="finding-where">
        {SEVERITY_LABEL[finding.severity]}
        {finding.mode ? ` · ${finding.mode}` : ""}
      </span>
      <div>
        <div className="finding-message">{finding.message}</div>
        {finding.detail && <div className="finding-detail">{finding.detail}</div>}
      </div>
    </li>
  );
}
