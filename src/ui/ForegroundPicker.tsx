import { Star } from "lucide-react";

import { simulateCvdHex, type CvdView } from "../color/cvd";
import type { ForegroundCandidate } from "../color/scale";
import type { ModeKey, RoleDef } from "../profiles/types";
import { ApcaReadingBadge, WcagBadge } from "./Badges";

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
          const failing = !candidate.acceptable;
          const wcagFails = !candidate.meetsRequirement;
          return (
            <label
              key={candidate.label}
              className="foreground-option"
              title={`${candidate.hex} on ${surfaceHex}: APCA Lc ${candidate.lc.toFixed(0)}, WCAG ${candidate.wcagRatio.toFixed(2)}:1${
                wcagFails ? ". Below 4.5:1, so text here would fail 1.4.3 AA." : ""
              }${failing ? " Weak by APCA, so hard to read regardless of the ratio." : ""}`}
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
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  textDecoration: failing ? "line-through" : undefined,
                }}
              >
                {candidate.label}
                {candidate.recommended && <Star size={11} fill="currentColor" aria-hidden="true" />}
              </span>
              <ApcaReadingBadge lc={candidate.lc} />
              {/* A foreground is text, so it always answers to 1.4.3's 4.5:1 —
                  never to role.requirement, which is what the surface itself
                  (not the text on it) has to clear. */}
              <WcagBadge ratio={candidate.wcagRatio} requirement="body" />
              <span className="visually-hidden">
                {candidate.recommended ? "recommended, " : ""}
                {wcagFails ? "fails 4.5 to 1" : "meets 4.5 to 1"}, APCA Lc {candidate.lc.toFixed(0)}
                {failing ? ", too weak to read here" : ""}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
