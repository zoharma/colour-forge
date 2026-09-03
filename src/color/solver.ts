/** Solving one step of a scale.
 *
 *  The tool takes APCA as the working measure and WCAG 2.2 as the floor,
 *  because each one is wrong in a different direction:
 *
 *  - Pure APCA over-corrects at the saturated end. Pushing a red to its
 *    dark-mode Lc target makes it a pale pink that has stopped being red;
 *    the number is satisfied and the colour is useless.
 *  - Pure WCAG 2.x under-corrects in the midtones and over-corrects at the
 *    dark end, which is the whole reason APCA exists — but it is still what
 *    a conformance audit is written against, so it cannot simply be ignored.
 *
 *  So a step is solved to the APCA target, and then allowed to ease off that
 *  target — only as far as this specific hue actually needs, measured live —
 *  to keep its chroma, but never below what WCAG 2.2 requires for how the
 *  role is used. Every step reports which of those three things decided it,
 *  so the compromise is visible instead of buried in a constant. */

import { apcaFromY, apcaY, targetYForLc } from "./apca";
import { oklchToGamutSafeLinear } from "./oklch";
import { linearToRgb255, rgb255ToHex } from "./srgb";
import { meetsWcag, oneLevelDown, wcagRatioHex, type WcagRequirement } from "./wcag";

/** What to do where holding WCAG 2.2 and keeping the colour recognisable
 *  genuinely conflict.
 *
 *  Some hues cannot do both. An orange or a mid green has its identity in a
 *  narrow band of lightness, and 4.5:1 against a light page sits outside it —
 *  push to the ratio and you get a brown or a forest green that is no longer
 *  the colour anyone asked for. Forcing conformance there does not produce an
 *  accessible orange; it produces a compliant brown plus a designer who
 *  overrides the tool by hand and loses the record of why.
 *
 *  So missing AA is available as a decision, with its consequence named and
 *  carried through to the audit and the exported comment. It is never the
 *  default, and it never fires where there is no real conflict. */
export type ContrastPolicy =
  /** Never return a colour below the role's requirement. */
  | "wcag-strict"
  /** Where hue and contrast conflict, allow one named level down — body text
   *  becomes large-text-only, a boundary becomes decorative. Still a level
   *  with a defined meaning, not an unbounded drop. */
  | "wcag-relaxed"
  /** Where they conflict, keep the colour and report exactly what the
   *  resulting ratio is legal for. */
  | "hue-first";

export const POLICY_LABELS: Record<ContrastPolicy, string> = {
  "wcag-strict": "Hold WCAG 2.2",
  "wcag-relaxed": "Allow one level down",
  "hue-first": "Keep the hue",
};

export const POLICY_DESCRIPTIONS: Record<ContrastPolicy, string> = {
  "wcag-strict":
    "Never return a colour below what the role's usage requires. Some hues cannot stay themselves under this and will come out browner or greyer than the seed.",
  "wcag-relaxed":
    "Where hue and contrast genuinely conflict, drop one named level — body text becomes large-text-only, a boundary becomes decorative. The obligation that comes with it is reported.",
  "hue-first":
    "Where they conflict, keep the colour and report what the ratio is actually legal for. Anything below AA needs a non-colour cue alongside it.",
};

/** How the role's requirement is read under a policy. Only the easing-off
 *  path consults this — a step that was never in conflict is unaffected, so
 *  turning the policy down does not quietly degrade a palette that was fine. */
export function effectiveRequirement(
  requirement: WcagRequirement,
  policy: ContrastPolicy,
): WcagRequirement {
  if (policy === "wcag-strict") return requirement;
  if (policy === "hue-first") return "none";
  return oneLevelDown(requirement);
}

export type ContrastVerdict =
  /** Hit the profile's APCA target with the hue intact. */
  | "apca-met"
  /** Eased off the APCA target to keep the colour recognisable. Still clears
   *  WCAG 2.2 for this role's usage. */
  | "hue-protected"
  /** WCAG 2.2 stopped the easing-off short, or demanded more contrast than
   *  the APCA target itself. The colour is more washed out than ideal, and
   *  the reason is conformance rather than perception. */
  | "wcag-bound"
  /** No lightness for this hue satisfies WCAG 2.2 for this usage. Needs a
   *  different hue, a different background, or a different role. */
  | "below-both";

/** Whether the colour meets what its role is required to clear — kept apart
 *  from `verdict`, which says what decided the colour. A step can be decided
 *  by hue protection and still conform, or be decided by APCA and not. */
export type Conformance =
  | "meets"
  /** Below the requirement because the policy permitted it, to keep the hue. */
  | "below-by-choice"
  /** Below it with no policy involved: nothing at this hue could clear it. */
  | "below-unavoidable";

export interface SolvedStep {
  hex: string;
  /** OKLab lightness the solver settled on. */
  L: number;
  /** Chroma surviving gamut mapping. */
  chroma: number;
  hue: number;
  /** Requested chroma actually retained, 0–1. The hue-protection trigger. */
  chromaRetention: number;
  /** Signed APCA Lc against the mode background. */
  lc: number;
  /** APCA Lc the profile asked for at this step. */
  targetLc: number;
  wcagRatio: number;
  /** What the role's usage requires. */
  requirement: WcagRequirement;
  /** What the policy actually held the solver to. */
  effectiveRequirement: WcagRequirement;
  conformance: Conformance;
  verdict: ContrastVerdict;
}

/** How much of the requested chroma a step must keep before the solver
 *  starts trading contrast away to protect it.
 *
 *  Tuned against real hues rather than picked: at 0.75 an orange's darkest
 *  roles still slid far enough toward brown that they read as dark red on
 *  sight, even with the hue angle held 25° away — warm hues converge once
 *  dark and desaturated no matter what the raw angle says. 0.85 keeps
 *  orange recognisably orange at a small contrast cost. */
export const CHROMA_RETENTION_FLOOR = 0.85;

/** Retention alone is the wrong trigger, because it is a ratio and says
 *  nothing about how much colour is actually at stake.
 *
 *  Near white the sRGB gamut holds almost no chroma at all, so a pale tint
 *  asked for 0.039 and given 0.011 scores a retention of 0.29 and trips the
 *  floor — but the 0.028 it "lost" is invisible in a near-white, and easing
 *  the contrast target does not recover any of it, because the lightness
 *  that eases toward is exactly where the gamut is narrowest. Left on
 *  retention alone the solver pays the full contrast cost, gains nothing,
 *  and collapses neighbouring pale steps onto the same colour.
 *
 *  So the relaxation has to earn its keep: it is only taken if it actually
 *  produces meaningfully more chroma than solving at the target did. That is
 *  self-checking rather than another tuned threshold — it fires hard for a
 *  yellow or an orange, which genuinely do recover their character at a
 *  lower target, and not at all for a tint that had no chroma to lose. */
const MIN_CHROMA_GAIN = 0.01;

/** How much extra chroma has to be on the table before the solver will give
 *  up the role's real WCAG requirement to get it.
 *
 *  Relaxing the policy must not quietly degrade a palette that was fine. Left
 *  ungated it does exactly that: a blue will happily trade AA for 0.013 of
 *  chroma, which nobody asked for and nobody can see. Measured against the
 *  hues this exists for — orange gains 0.035 by dropping below AA, amber
 *  0.045, lime 0.047 — while blue, green and the rest gain nothing worth
 *  having. 0.02 sits in the gap, so the exemption reaches the colours that
 *  genuinely cannot do both and leaves everything else conformant. */
const MIN_CONFORMANCE_SACRIFICE = 0.02;

/** Ceiling for the upward search when WCAG needs more than APCA asked for.
 *  Above ~108 nothing in sRGB moves. */
const MAX_TARGET_LC = 108;

const BISECTION_STEPS = 24;

export interface StepContext {
  hue: number;
  /** Chroma requested at this step, before gamut mapping. */
  chroma: number;
  backgroundHex: string;
  backgroundY: number;
  backgroundIsLight: boolean;
  requirement: WcagRequirement;
  policy: ContrastPolicy;
}

/** Solve for the colour that hits `targetLc` against the context background,
 *  holding hue and requested chroma, moving only lightness. */
function solveAtTarget(
  ctx: StepContext,
  targetLc: number,
): Omit<SolvedStep, "verdict" | "targetLc" | "conformance"> {
  const targetY = targetYForLc(ctx.backgroundY, targetLc, ctx.backgroundIsLight);

  // Relative luminance rises monotonically with OKLab L at fixed hue and
  // chroma, so plain bisection converges.
  let lo = 0;
  let hi = 1;
  let L = 0.5;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    L = (lo + hi) / 2;
    const { lin } = oklchToGamutSafeLinear(L, ctx.chroma, ctx.hue);
    if (apcaY(lin) > targetY) hi = L;
    else lo = L;
  }

  const { lin, chromaUsed } = oklchToGamutSafeLinear(L, ctx.chroma, ctx.hue);
  const hex = rgb255ToHex(linearToRgb255(lin));
  return {
    hex,
    L,
    chroma: chromaUsed,
    hue: ctx.hue,
    chromaRetention: ctx.chroma > 0 ? chromaUsed / ctx.chroma : 1,
    lc: apcaFromY(apcaY(lin), ctx.backgroundY),
    wcagRatio: wcagRatioHex(hex, ctx.backgroundHex),
    requirement: ctx.requirement,
    effectiveRequirement: effectiveRequirement(ctx.requirement, ctx.policy),
  };
}

const clearsWcag = (step: { wcagRatio: number }, requirement: WcagRequirement): boolean =>
  meetsWcag(step.wcagRatio, requirement);

/** Lowest target Lc in [lo, hi] whose solved step clears WCAG. Contrast rises
 *  monotonically with the target, so the predicate is a step function. */
function lowestTargetClearingWcag(
  ctx: StepContext,
  lo: number,
  hi: number,
  requirement?: WcagRequirement,
): number | null {
  const required = requirement ?? effectiveRequirement(ctx.requirement, ctx.policy);
  if (!clearsWcag(solveAtTarget(ctx, hi), required)) return null;
  let low = lo;
  let high = hi;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;
    if (clearsWcag(solveAtTarget(ctx, mid), required)) high = mid;
    else low = mid;
  }
  return high;
}

/** Highest target Lc at or below `idealLc` that still keeps enough chroma.
 *
 *  Scanned, not bisected, because retention is **not monotonic in the
 *  target**. It peaks somewhere in the midtones and falls away at both ends:
 *  toward the dark end the gamut narrows as the colour is forced down, and
 *  toward the light end it narrows again as the colour approaches the
 *  background. Amber is the clearest case — its plateau sits around Lc 22–40
 *  at a retention of ~0.92, with 0.15 at Lc 0 and 0.51 at Lc 80.
 *
 *  A bisection over that shape is simply invalid. Probing amber at Lc 37.5
 *  returns 0.846, four thousandths under the floor, so the search steps down
 *  into the pale end, never recovers, and lands on a target with less chroma
 *  than where it started — silently abandoning the protection for the hues
 *  that need it most.
 *
 *  So: scan the range coarsely for the highest target that clears the floor,
 *  then refine that bracket. If nothing clears it, fall back to the peak,
 *  which is the best this hue can do; the caller still checks whether taking
 *  it actually buys any visible chroma. */
const SCAN_STEP_LC = 1;

function highestTargetKeepingChroma(ctx: StepContext, idealLc: number): number {
  let bestChromaTarget = idealLc;
  let bestChroma = -1;

  for (let target = idealLc; target >= 0; target -= SCAN_STEP_LC) {
    const step = solveAtTarget(ctx, target);
    if (step.chroma > bestChroma) {
      bestChroma = step.chroma;
      bestChromaTarget = target;
    }
    if (step.chromaRetention >= CHROMA_RETENTION_FLOOR) {
      // Refine upward inside the one-Lc bracket we just crossed.
      let lo = target;
      let hi = Math.min(target + SCAN_STEP_LC, idealLc);
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (solveAtTarget(ctx, mid).chromaRetention >= CHROMA_RETENTION_FLOOR) lo = mid;
        else hi = mid;
      }
      return lo;
    }
  }

  return bestChromaTarget;
}

export function solveStep(ctx: StepContext, idealTargetLc: number): SolvedStep {
  const required = effectiveRequirement(ctx.requirement, ctx.policy);

  const finish = (targetLc: number, verdict: ContrastVerdict): SolvedStep => {
    const solved = solveAtTarget(ctx, targetLc);
    // Conformance is judged against what the role actually needs, never
    // against the eased requirement — the whole point of easing it is to be
    // able to say plainly that the result does not meet the real one.
    const conformance: Conformance = meetsWcag(solved.wcagRatio, ctx.requirement)
      ? "meets"
      : verdict === "below-both"
        ? "below-unavoidable"
        : "below-by-choice";
    return { ...solved, targetLc: idealTargetLc, verdict, conformance };
  };

  const ideal = solveAtTarget(ctx, idealTargetLc);

  // WCAG asks for more than APCA did. Rare, but it is exactly the case an
  // APCA-only tool ships a finding on: give it the least extra contrast that
  // satisfies the criterion rather than jumping to the maximum.
  if (!clearsWcag(ideal, required)) {
    const bound = lowestTargetClearingWcag(ctx, idealTargetLc, MAX_TARGET_LC);
    if (bound === null) return finish(MAX_TARGET_LC, "below-both");
    return finish(bound, "wcag-bound");
  }

  // The eased requirement is satisfied but the real one is not. Adding
  // contrast here costs lightness, not hue, so under a loosened policy it is
  // still worth doing wherever it is cheap: a blue border sitting at 2.45:1
  // reaches 3:1 for a chroma cost nobody can see, and taking the exemption
  // there would be a palette quietly degraded for nothing. The exemption is
  // for colours that cannot do both, never a general licence.
  if (!meetsWcag(ideal.wcagRatio, ctx.requirement)) {
    const strictBound = lowestTargetClearingWcag(ctx, idealTargetLc, MAX_TARGET_LC, ctx.requirement);
    if (strictBound !== null) {
      const strictStep = solveAtTarget(ctx, strictBound);
      if (ideal.chroma - strictStep.chroma < MIN_CONFORMANCE_SACRIFICE) {
        return finish(strictBound, "wcag-bound");
      }
    }
  }

  // Nothing to protect: an achromatic seed, or a step with no meaningful
  // separation asked of it in the first place.
  if (ctx.chroma <= 0 || idealTargetLc < 1 || ideal.chromaRetention >= CHROMA_RETENTION_FLOOR) {
    return finish(idealTargetLc, "apca-met");
  }

  // The hue cannot reach its APCA target without washing out. Ease off as far
  // as it needs — then put the effective requirement under it as a floor.
  const relaxed = highestTargetKeepingChroma(ctx, idealTargetLc);
  const relaxedStep = solveAtTarget(ctx, relaxed);

  // Only worth the contrast if it recovers chroma someone can see.
  if (relaxedStep.chroma - ideal.chroma < MIN_CHROMA_GAIN) {
    return finish(idealTargetLc, "apca-met");
  }

  if (clearsWcag(relaxedStep, required)) {
    // The eased requirement is satisfied — but if the role's *real* one is
    // not, conformance is being spent, so it has to buy something. Where a
    // compliant alternative exists at nearly the same chroma, take that
    // instead: the exemption is for hues that cannot do both, not a general
    // licence to drift below AA.
    if (!meetsWcag(relaxedStep.wcagRatio, ctx.requirement)) {
      const compliant = lowestTargetClearingWcag(ctx, relaxed, idealTargetLc, ctx.requirement);
      if (compliant !== null) {
        const compliantStep = solveAtTarget(ctx, compliant);
        if (relaxedStep.chroma - compliantStep.chroma < MIN_CONFORMANCE_SACRIFICE) {
          return finish(compliant, "wcag-bound");
        }
      }
    }
    return finish(relaxed, "hue-protected");
  }

  const bound = lowestTargetClearingWcag(ctx, relaxed, idealTargetLc);
  // The ideal cleared the effective requirement, so a bound always exists.
  return finish(bound ?? idealTargetLc, "wcag-bound");
}

export const VERDICT_LABELS: Record<ContrastVerdict, string> = {
  "apca-met": "APCA target met",
  "hue-protected": "Eased off APCA to keep the hue",
  "wcag-bound": "Held up by WCAG 2.2",
  "below-both": "Fails WCAG 2.2 at every lightness",
};

export const VERDICT_EXPLANATIONS: Record<ContrastVerdict, string> = {
  "apca-met": "Reached the profile's APCA target with the colour's chroma intact.",
  "hue-protected":
    "Hitting the APCA target would have cost this hue too much chroma, so the target was eased off to the point where the colour still reads as itself. Still clears WCAG 2.2 for how this role is used.",
  "wcag-bound":
    "WCAG 2.2 decided this one: the colour would have kept more of its chroma at lower contrast, but that would have dropped it under the criterion for this role's usage.",
  "below-both":
    "No lightness of this hue clears WCAG 2.2 for this usage against this background. Change the hue, the background, or how the role is used.",
};
