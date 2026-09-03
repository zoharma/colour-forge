import { simulateCvdHex, type CvdView } from "../color/cvd";
import type { Draft } from "../color/scale";
import { displayStep, type ModeKey, type Profile } from "../profiles/types";
import { ApcaBadge, VerdictBadge, WcagBadge } from "./Badges";

interface Props {
  profile: Profile;
  draft: Draft;
  cvdView: CvdView;
}

/** Every step of both scales, with its hex.
 *
 *  The swatch strip is for judging the ramp; this is for using it. Half the
 *  reason to generate a 12-step scale is the steps no role is named for —
 *  a one-off chart series, a hover state, a future role — and those are
 *  unreachable if the only way to read a value is to hover a square. */
export function ScaleTable({ profile, draft, cvdView }: Props) {
  const modes: ModeKey[] = ["light", "dark"];

  return (
    <div className="scroll-x">
      <table>
        <caption className="visually-hidden">
          Every generated scale step with its hex value and measurements
        </caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            {modes.map((mode) => (
              <th scope="col" key={mode} colSpan={4}>
                {mode}
              </th>
            ))}
          </tr>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Index</span>
            </th>
            {modes.map((mode) => (
              <ModeSubHead key={mode} />
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: profile.scaleSize }, (_, i) => (
            <tr key={i}>
              <th scope="row" style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {displayStep(i)}
              </th>
              {modes.map((mode) => {
                const step = draft[mode].scale[i];
                const roles = profile.roles.filter((r) => r.index[mode] === i);
                if (!step) return <td key={mode} colSpan={4} />;
                return (
                  <ScaleCells
                    key={mode}
                    hex={step.hex}
                    cvdView={cvdView}
                    roleLabels={roles.map((r) => r.label)}
                    lc={step.lc}
                    targetLc={step.targetLc}
                    verdict={step.verdict}
                    wcagRatio={step.wcagRatio}
                    requirement={step.requirement}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModeSubHead() {
  return (
    <>
      <th scope="col">Hex</th>
      <th scope="col">Role</th>
      <th scope="col">APCA</th>
      <th scope="col">WCAG</th>
    </>
  );
}

function ScaleCells({
  hex,
  cvdView,
  roleLabels,
  lc,
  targetLc,
  verdict,
  wcagRatio,
  requirement,
}: {
  hex: string;
  cvdView: CvdView;
  roleLabels: string[];
  lc: number;
  targetLc: number;
  verdict: Parameters<typeof VerdictBadge>[0]["verdict"];
  wcagRatio: number;
  requirement: Parameters<typeof WcagBadge>[0]["requirement"];
}) {
  return (
    <>
      <td>
        <span className="cell-swatch" style={{ background: simulateCvdHex(hex, cvdView) }} aria-hidden="true" />
        <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{hex}</code>
      </td>
      <td className="readout" style={{ fontFamily: "var(--font-ui)" }}>
        {roleLabels.length ? roleLabels.join(", ") : <span style={{ opacity: 0.5 }}>spare</span>}
      </td>
      <td>
        <span style={{ display: "inline-flex", gap: 4 }}>
          <ApcaBadge lc={lc} targetLc={targetLc} verdict={verdict} />
          <VerdictBadge verdict={verdict} />
        </span>
      </td>
      <td>
        <WcagBadge ratio={wcagRatio} requirement={requirement} />
      </td>
    </>
  );
}
