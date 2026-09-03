import { simulateCvdHex, type CvdView } from "../color/cvd";
import type { ForegroundCandidate } from "../color/scale";
import type { ModeKey, RoleDef } from "../profiles/types";

interface Props {
  mode: ModeKey;
  role: RoleDef;
  surfaceHex: string;
  candidates: ForegroundCandidate[];
  selected?: string;
  cvdView: CvdView;
  onChange: (label: string) => void;
}

/** Which foreground goes on this surface. Offered as a choice rather than
 *  decided, because APCA and WCAG can disagree here and resolving that is a
 *  judgement about the specific component, not a rule.
 *
 *  Each option shows a swatch pair — the candidate on the surface — rather
 *  than rendering its own label in its own colours. Doing the latter is more
 *  honest in principle and useless in practice: the failing options are the
 *  ones you most need to read, and they are exactly the ones that come out
 *  invisible. The selected option is previewed at full size below anyway. */
export function ForegroundPicker({ mode, role, surfaceHex, candidates, selected, cvdView, onChange }: Props) {
  const name = `fg-${mode}-${role.key}`;
  const active = selected ?? candidates.find((c) => c.recommended)?.label;

  return (
    <fieldset style={{ border: 0, margin: "6px 0 4px 32px", padding: 0 }}>
      <legend className="visually-hidden">
        Foreground on {role.label} in {mode} mode
      </legend>
      <div className="foreground-options">
        {candidates.map((candidate) => {
          const failing = !candidate.meetsRequirement;
          return (
            <label
              key={candidate.label}
              className="foreground-option"
              title={`${candidate.hex} on ${surfaceHex} — APCA Lc ${candidate.lc.toFixed(0)}, WCAG ${candidate.wcagRatio.toFixed(2)}:1${
                failing ? ". Below 4.5:1 — text here would fail 1.4.3 AA." : ""
              }`}
            >
              <input
                type="radio"
                name={name}
                value={candidate.label}
                checked={active === candidate.label}
                onChange={() => onChange(candidate.label)}
              />
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 14,
                  borderRadius: 3,
                  border: "1px solid rgb(128 128 128 / 0.5)",
                  background: simulateCvdHex(surfaceHex, cvdView),
                  color: simulateCvdHex(candidate.hex, cvdView),
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                A
              </span>
              <span style={{ textDecoration: failing ? "line-through" : undefined }}>
                {candidate.label}
                {candidate.recommended ? " ★" : ""}
              </span>
              <span className={`pill ${failing ? "bad" : "good"} tnum`}>
                {candidate.wcagRatio.toFixed(1)}:1
              </span>
              <span className="visually-hidden">
                {failing ? "fails 4.5 to 1" : "meets 4.5 to 1"}, APCA Lc {candidate.lc.toFixed(0)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
