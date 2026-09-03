import { apcaHex } from "../color/apca";
import { simulateCvdHex, type CvdView } from "../color/cvd";
import type { Draft } from "../color/scale";
import { displayStep, type ModeKey, type Profile } from "../profiles/types";
import { ApcaBadge, VerdictBadge, WcagBadge } from "./Badges";
import { ForegroundPicker } from "./ForegroundPicker";
import { Preview } from "./Preview";

interface Props {
  profile: Profile;
  draft: Draft;
  mode: ModeKey;
  cvdView: CvdView;
  foregroundOverrides: Record<string, string>;
  onForegroundChange: (roleKey: string, label: string) => void;
}

export function ScalePanel({ profile, draft, mode, cvdView, foregroundOverrides, onForegroundChange }: Props) {
  const spec = profile.modes[mode];
  const result = draft[mode];

  // The simulation is applied at render only. Every measurement in the panel
  // is computed from the real colour, because simulating and then measuring
  // would report contrast for vision nobody has — a dichromat sees the
  // original colour's luminance, not the simulation's.
  const shown = (hex: string) => simulateCvdHex(hex, cvdView);

  const background = shown(spec.background);
  const onSurface = shown(spec.onSurface);
  const border = mode === "light" ? "#dde1e8" : "#282c35";

  return (
    <div className="mode-panel" style={{ background }}>
      <div
        className="mode-head"
        style={{ background: shown(spec.surface), color: onSurface, borderColor: border }}
      >
        <span>{mode}</span>
        <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7, textTransform: "none" }}>
          {spec.background}
        </span>
      </div>

      <div className="scale-strip" role="list" aria-label={`${mode} mode scale, ${result.scale.length} steps`}>
        {result.scale.map((step, i) => {
          const roles = profile.roles.filter((r) => r.index[mode] === i).map((r) => r.label);
          // Each swatch picks its own label colour. One shared foreground goes
          // unreadable at whichever end of the ramp it does not suit, and the
          // dark end is exactly where the step numbers matter most. Measured
          // against the colour actually on screen, so the numbers stay
          // readable under a colour-vision simulation too.
          const swatch = shown(step.hex);
          const labelColour =
            Math.abs(apcaHex("#ffffff", swatch)) >= Math.abs(apcaHex("#000000", swatch))
              ? "#ffffff"
              : "#000000";
          const label = `Step ${displayStep(i)}: ${step.hex}${roles.length ? `, used by ${roles.join(" and ")}` : ", unassigned"}`;
          return (
            <div
              key={i}
              role="listitem"
              className="scale-swatch"
              style={{ background: shown(step.hex) }}
              title={`${label}. APCA Lc ${step.lc.toFixed(0)}, WCAG ${step.wcagRatio.toFixed(2)}:1`}
            >
              <span className="idx" style={{ color: labelColour }} aria-hidden="true">
                {displayStep(i)}
              </span>
              <span className="visually-hidden">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="role-list">
        {profile.roles.map((role) => {
          const step = result.roles[role.key];
          if (!step) return null;
          return (
            <div key={role.key}>
              <div className="role-row" style={{ color: onSurface }}>
                <span className="chip" style={{ background: shown(step.hex) }} aria-hidden="true" />
                <span>
                  <span className="role-name">{role.label}</span>{" "}
                  <span className="role-meta">
                    step {displayStep(role.index[mode])} · {step.hex}
                  </span>
                </span>
                <span className="role-badges">
                  <VerdictBadge verdict={step.verdict} />
                  <ApcaBadge lc={step.lc} targetLc={step.targetLc} verdict={step.verdict} />
                  <WcagBadge ratio={step.wcagRatio} requirement={role.requirement} />
                </span>
              </div>

              {role.needsForeground && result.foregrounds[role.key] && (
                <ForegroundPicker
                  mode={mode}
                  role={role}
                  surfaceHex={step.hex}
                  candidates={result.foregrounds[role.key] ?? []}
                  selected={foregroundOverrides[role.key]}
                  cvdView={cvdView}
                  onChange={(label) => onForegroundChange(role.key, label)}
                />
              )}
            </div>
          );
        })}
      </div>

      <Preview
        profile={profile}
        draft={draft}
        mode={mode}
        cvdView={cvdView}
        foregroundOverrides={foregroundOverrides}
      />
    </div>
  );
}
