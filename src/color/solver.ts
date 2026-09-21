/** Solving one step of a scale.
 *
 *  APCA is the working measure, WCAG 2.2 the floor: pure APCA over-corrects
 *  saturated colours (a red pushed to its dark-mode target goes pale pink),
 *  pure WCAG under/over-corrects by lightness — but WCAG is still what a
 *  conformance audit checks.
 *
 *  A step solves to the APCA target, then moves off it (whichever direction
 *  recovers chroma, only as far as needed) to protect its chroma, never
 *  below what WCAG 2.2 requires. Each step reports which of the three
 *  decided it. */

import { apcaFromY, apcaYFromLinearSrgb, targetYForLc } from "./apca";
import { oklchToGamutSafeLinear } from "./oklch";
import { linearToRgb255, rgb255ToHex } from "./srgb";
import { meetsWcag, oneLevelDown, wcagRatioHex, type WcagRequirement } from "./wcag";

/** What to do where WCAG 2.2 and a recognisable colour genuinely conflict.
 *
 *  Some hues can't do both — an orange forced to 4.5:1 becomes a compliant
 *  brown, not an accessible orange. So missing AA is available as a named
 *  decision, carried through to the audit, never firing where there's no
 *  real conflict — including the default, which only concedes one level. */
export type ContrastPolicy =
  /** The default: one named level down where hue and contrast conflict
   *  (body text → large-text-only), not a full chase of either extreme. */
  | "wcag-relaxed"
  /** Solve to the APCA target, keep the hue's chroma, take WCAG wherever
   *  it's free but never trade chroma away to force it. */
  | "hue-first"
  /** Never return a colour below the role's requirement, full stop — even
   *  where that means browner or greyer than the seed. */
  | "wcag-strict";

export const POLICY_LABELS: Record<ContrastPolicy, string> = {
  "hue-first": "More APCA",
  "wcag-relaxed": "System default",
  "wcag-strict": "WCAG Strict",
};

export const DEFAULT_CONTRAST_POLICY: ContrastPolicy = "wcag-relaxed";

export const POLICY_DESCRIPTIONS: Record<ContrastPolicy, string> = {
  "hue-first": "Keeps the hue and its chroma, taking WCAG 2.2 only where it's free.",
  "wcag-relaxed": "Balances the two: drops one contrast level rather than fully chase the hue, where they conflict.",
  "wcag-strict": "Never drops below the role's requirement, whatever it costs the hue.",
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
  /** Moved off the APCA target to stay recognisable; still clears WCAG. */
  | "hue-protected"
  /** WCAG demanded more contrast (or stopped the easing-off short) than
   *  the APCA target — washed out for conformance, not perception. */
  | "wcag-bound"
  /** No lightness for this hue satisfies WCAG for this usage. */
  | "below-both"
  /** Pinned by a person, not solved — still measured and reported. */
  | "pinned";

/** Separate from `verdict` (what decided the colour): a step can be decided
 *  by hue protection and still conform, or by APCA and not. */
export type Conformance =
  | "meets"
  /** Below the requirement because the policy permitted it. */
  | "below-by-choice"
  /** Below it with no policy involved — nothing at this hue clears it. */
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

/** How much requested chroma a step must keep before the solver trades
 *  contrast away to protect it. Tuned against real hues: at 0.75, orange's
 *  darkest roles still slid to dark red; 0.85 keeps orange orange. */
export const CHROMA_RETENTION_FLOOR = 0.85;

/** Below this (negative) Lc gap, a ramp has doubled back. */
export const RAMP_INVERSION_TOLERANCE = -0.5;

/** Shared so `scale.ts` and `audit.ts` can't disagree on this. */
export const isRampInversion = (gap: number): boolean => gap < RAMP_INVERSION_TOLERANCE;

/** The Lc gap between adjacent scale steps, as both the inversion and
 *  collapse checks need it: |Lc| grows monotonically further from
 *  background, so a shrinking gap between two same-signed Lc values is a
 *  ramp problem regardless of light/dark mode. */
export const lcGap = (current: number, previous: number): number => Math.abs(current) - Math.abs(previous);

/** Retention alone is the wrong trigger — near white a pale tint can trip
 *  the floor on a loss too small to see, and easing the target there
 *  recovers nothing (the gamut is narrowest right there), just paying
 *  contrast for no visible gain. So relaxation only happens if it actually
 *  produces meaningfully more chroma than the target did. */
const MIN_CHROMA_GAIN = 0.01;

/** How much extra chroma must be on the table before the solver gives up
 *  the role's real WCAG requirement for it — otherwise a relaxed policy
 *  quietly degrades hues that were already fine (a blue trading AA for an
 *  invisible 0.013 gain). 0.02 sits between what blue/green gain (~0) and
 *  what orange/amber/lime gain (0.035–0.047) by dropping below AA. */
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
  /** Target Lc of the neighbouring steps, if any — caps hue protection's
   *  search so a step can't walk past its neighbour's target and invert
   *  the scale's order. */
  prevTargetLc?: number;
  nextTargetLc?: number;
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
    if (apcaYFromLinearSrgb(lin) > targetY) hi = L;
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
    lc: apcaFromY(apcaYFromLinearSrgb(lin), ctx.backgroundY),
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

/** Target Lc nearest `idealLc`, in whichever direction keeps more chroma.
 *
 *  Scanned, not bisected — retention peaks at one lightness and falls away
 *  both sides, and which side `idealLc` sits on depends on hue *and*
 *  background polarity (a light-mode easing might need *more* contrast on
 *  dark, not less). So: probe both directions from `idealLc`, scan whichever
 *  is rising for the nearest target clearing the floor, refine, and fall
 *  back to the best point found if nothing clears it. */
const SCAN_STEP_LC = 1;

function highestTargetKeepingChroma(ctx: StepContext, idealLc: number): number {
  const upBound = Math.min(MAX_TARGET_LC, ctx.nextTargetLc ?? MAX_TARGET_LC);
  const downBound = Math.max(0, ctx.prevTargetLc ?? 0);

  const idealChroma = solveAtTarget(ctx, idealLc).chroma;
  const downChroma =
    idealLc - SCAN_STEP_LC >= downBound ? solveAtTarget(ctx, idealLc - SCAN_STEP_LC).chroma : -1;
  const upChroma = idealLc + SCAN_STEP_LC <= upBound ? solveAtTarget(ctx, idealLc + SCAN_STEP_LC).chroma : -1;
  if (downChroma < 0 && upChroma < 0) return idealLc;
  const direction = upChroma > downChroma ? 1 : -1;
  const bound = direction > 0 ? upBound : downBound;

  let bestTarget = idealLc;
  let bestChroma = idealChroma;
  let prevTarget = idealLc;

  for (
    let target = idealLc + direction * SCAN_STEP_LC;
    direction > 0 ? target <= bound : target >= bound;
    target += direction * SCAN_STEP_LC
  ) {
    const step = solveAtTarget(ctx, target);
    if (step.chroma > bestChroma) {
      bestChroma = step.chroma;
      bestTarget = target;
    }
    if (step.chromaRetention >= CHROMA_RETENTION_FLOOR) {
      // Refine inside the bracket we just crossed, toward the boundary
      // nearest idealLc — the smallest move off target that still clears
      // the floor.
      let lo = direction > 0 ? prevTarget : target;
      let hi = direction > 0 ? target : prevTarget;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const clears = solveAtTarget(ctx, mid).chromaRetention >= CHROMA_RETENTION_FLOOR;
        if (direction > 0 ? clears : !clears) hi = mid;
        else lo = mid;
      }
      return direction > 0 ? hi : lo;
    }
    prevTarget = target;
  }

  return bestTarget;
}

/** Solve at the best chroma within `ctx`'s target bound, skipping
 *  `solveStep`'s `MIN_CHROMA_GAIN` gate — that gate decides *whether* to
 *  protect a hue at all; here the hue is already protected and colliding
 *  with a neighbour, so the only question left is the best chroma the
 *  bound allows. */
export function retreatWithinBound(ctx: StepContext, idealTargetLc: number): SolvedStep {
  const target = highestTargetKeepingChroma(ctx, idealTargetLc);
  const solved = solveAtTarget(ctx, target);
  const conformance: Conformance = meetsWcag(solved.wcagRatio, ctx.requirement) ? "meets" : "below-by-choice";
  return { ...solved, targetLc: idealTargetLc, verdict: "hue-protected", conformance };
}

export function solveStep(ctx: StepContext, idealTargetLc: number): SolvedStep {
  const required = effectiveRequirement(ctx.requirement, ctx.policy);

  const finish = (targetLc: number, verdict: ContrastVerdict): SolvedStep => {
    const solved = solveAtTarget(ctx, targetLc);
    // Judged against the real requirement, never the eased one — easing
    // it exists precisely so we can say plainly it wasn't met.
    const conformance: Conformance = meetsWcag(solved.wcagRatio, ctx.requirement)
      ? "meets"
      : verdict === "below-both"
        ? "below-unavoidable"
        : "below-by-choice";
    return { ...solved, targetLc: idealTargetLc, verdict, conformance };
  };

  const ideal = solveAtTarget(ctx, idealTargetLc);

  // WCAG asks for more than APCA did — give the least extra contrast that
  // satisfies it, not the maximum.
  if (!clearsWcag(ideal, required)) {
    const bound = lowestTargetClearingWcag(ctx, idealTargetLc, MAX_TARGET_LC);
    if (bound === null) return finish(MAX_TARGET_LC, "below-both");
    return finish(bound, "wcag-bound");
  }

  // Eased requirement met, real one isn't — worth reaching for wherever
  // it's cheap (costs lightness, not hue), so a fine blue doesn't quietly
  // drift below AA. The exemption is for hues that can't do both.
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

  // Can't reach the APCA target without washing out — move off it as far
  // as needed, in whichever direction recovers chroma.
  const relaxed = highestTargetKeepingChroma(ctx, idealTargetLc);
  const relaxedStep = solveAtTarget(ctx, relaxed);

  // Only worth the contrast if it recovers chroma someone can see.
  if (relaxedStep.chroma - ideal.chroma < MIN_CHROMA_GAIN) {
    return finish(idealTargetLc, "apca-met");
  }

  if (clearsWcag(relaxedStep, required)) {
    // Eased requirement met, but if the real one isn't, conformance is
    // being spent — take a compliant alternative if it costs almost
    // nothing extra.
    if (!meetsWcag(relaxedStep.wcagRatio, ctx.requirement)) {
      // relaxed can land either side of idealTargetLc — order the bracket.
      const compliant = lowestTargetClearingWcag(
        ctx,
        Math.min(relaxed, idealTargetLc),
        Math.max(relaxed, idealTargetLc),
        ctx.requirement,
      );
      if (compliant !== null) {
        const compliantStep = solveAtTarget(ctx, compliant);
        if (relaxedStep.chroma - compliantStep.chroma < MIN_CONFORMANCE_SACRIFICE) {
          return finish(compliant, "wcag-bound");
        }
      }
    }
    return finish(relaxed, "hue-protected");
  }

  const bound = lowestTargetClearingWcag(ctx, Math.min(relaxed, idealTargetLc), Math.max(relaxed, idealTargetLc));
  // The ideal cleared the effective requirement, so a bound always exists.
  return finish(bound ?? idealTargetLc, "wcag-bound");
}

export const VERDICT_LABELS: Record<ContrastVerdict, string> = {
  pinned: "Pinned to the seed colour",
  "apca-met": "APCA target met",
  "hue-protected": "Moved off APCA to keep the hue",
  "wcag-bound": "Held up by WCAG 2.2",
  "below-both": "Fails WCAG 2.2 at every lightness",
};

export const VERDICT_EXPLANATIONS: Record<ContrastVerdict, string> = {
  pinned:
    "This is the seed colour itself, placed here because you pinned it. Everything else in this mode was solved around it. The numbers beside it are measured, not targeted. If they fall short, the pinned colour does not suit this role.",
  "apca-met": "Reached the profile's APCA target with the colour's chroma intact.",
  "hue-protected":
    "Hitting the APCA target would have cost this hue too much chroma, so the target was moved (toward more contrast or less, whichever side had the colour) to the point where it still reads as itself. Still clears WCAG 2.2 for how this role is used.",
  "wcag-bound":
    "WCAG 2.2 decided this one: the colour would have kept more of its chroma at lower contrast, but that would have dropped it under the criterion for this role's usage.",
  "below-both":
    "No lightness of this hue clears WCAG 2.2 for this usage against this background. Change the hue, the background, or how the role is used.",
};
