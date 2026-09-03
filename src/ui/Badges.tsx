import { apcaLevel } from "../color/apca";
import { VERDICT_EXPLANATIONS, VERDICT_LABELS, type ContrastVerdict } from "../color/solver";
import { WCAG_CRITERION, wcagLevel, type WcagRequirement } from "../color/wcag";

type Tone = "good" | "warn" | "bad" | "neutral";

export function Pill({ tone, title, children }: { tone: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone} tnum`} title={title}>
      {children}
    </span>
  );
}

/** APCA's own usage bands are the wrong thing to colour this against.
 *
 *  A container is supposed to sit at Lc 2 and a dark-mode solid fill at Lc
 *  30 — those are the profile's fitted targets, not shortfalls, and scoring
 *  them against a universal "Lc 45 or it is red" band marks a scale as
 *  failing when every step landed exactly where it was asked to. So the tone
 *  tracks whether the step reached its own target, and the band goes in the
 *  tooltip where it is information rather than a verdict.
 *
 *  Below about Lc 10 APCA clips to zero outright, so a target down there
 *  cannot be measured at all — those steps are positioned by lightness and
 *  say so instead of scoring. */
const APCA_MEASURABLE_FLOOR = 10;

export function ApcaBadge({
  lc,
  targetLc,
  verdict,
}: {
  lc: number;
  targetLc: number;
  verdict: ContrastVerdict;
}) {
  const level = apcaLevel(lc);
  const band = level === "insufficient" ? "below APCA's non-text guidance" : `enough for ${level}`;

  if (targetLc < APCA_MEASURABLE_FLOOR) {
    return (
      <Pill
        tone="neutral"
        title={`Target Lc ${targetLc}. APCA clips contrast this low to zero, so this step is placed by lightness rather than measured — its separation from the background is chroma, not luminance.`}
      >
        Lc &mdash;
      </Pill>
    );
  }

  const metTarget = Math.abs(lc) >= targetLc - 1;
  const tone: Tone = verdict === "below-both" ? "bad" : metTarget ? "good" : "warn";
  return (
    <Pill
      tone={tone}
      title={`APCA Lc ${lc.toFixed(1)} against a target of ${targetLc} — ${metTarget ? "target met" : "eased off the target"}, ${band}.`}
    >
      Lc {Math.abs(lc).toFixed(0)}
    </Pill>
  );
}

/** WCAG is a gate, so the tone is the pass/fail against what this role
 *  actually has to clear — not against 4.5:1 regardless of usage. */
export function WcagBadge({ ratio, requirement }: { ratio: number; requirement: WcagRequirement }) {
  const level = wcagLevel(ratio);
  const passes = requirement === "none" || ratio + 1e-9 >= { body: 4.5, large: 3, "non-text": 3, enhanced: 7, none: 0 }[requirement];
  const tone: Tone = requirement === "none" ? "neutral" : passes ? "good" : "bad";
  return (
    <Pill tone={tone} title={`WCAG 2.2 contrast ${ratio.toFixed(2)}:1 (${level}) — required: ${WCAG_CRITERION[requirement]}`}>
      {ratio.toFixed(1)}:1
    </Pill>
  );
}

/** Which of the three measures decided this colour. The whole point of
 *  showing it is that "washed out" and "washed out for a reason" look
 *  identical in a swatch. */
export function VerdictBadge({ verdict }: { verdict: ContrastVerdict }) {
  const tone: Tone =
    verdict === "apca-met" ? "neutral" : verdict === "hue-protected" ? "warn" : verdict === "wcag-bound" ? "warn" : "bad";
  const short =
    verdict === "apca-met" ? "APCA" : verdict === "hue-protected" ? "hue held" : verdict === "wcag-bound" ? "WCAG held" : "fails";
  if (verdict === "apca-met") return null;
  return (
    <Pill tone={tone} title={`${VERDICT_LABELS[verdict]} — ${VERDICT_EXPLANATIONS[verdict]}`}>
      {short}
    </Pill>
  );
}
