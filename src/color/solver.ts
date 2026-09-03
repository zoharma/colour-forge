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
import { meetsWcag, wcagRatioHex, type WcagRequirement } from "./wcag";

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
  requirement: WcagRequirement;
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
}

/** Solve for the colour that hits `targetLc` against the context background,
 *  holding hue and requested chroma, moving only lightness. */
function solveAtTarget(ctx: StepContext, targetLc: number): Omit<SolvedStep, "verdict" | "targetLc"> {
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
  };
}

const clearsWcag = (step: { wcagRatio: number }, requirement: WcagRequirement): boolean =>
  meetsWcag(step.wcagRatio, requirement);

/** Lowest target Lc in [lo, hi] whose solved step clears WCAG. Contrast rises
 *  monotonically with the target, so the predicate is a step function. */
function lowestTargetClearingWcag(ctx: StepContext, lo: number, hi: number): number | null {
  if (!clearsWcag(solveAtTarget(ctx, hi), ctx.requirement)) return null;
  let low = lo;
  let high = hi;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;
    if (clearsWcag(solveAtTarget(ctx, mid), ctx.requirement)) high = mid;
    else low = mid;
  }
  return high;
}

/** Highest target Lc at or below `idealLc` that still keeps enough chroma.
 *  Retention improves monotonically as the target eases off, so this is the
 *  furthest the solver can go before the colour stops looking like itself. */
function highestTargetKeepingChroma(ctx: StepContext, idealLc: number): number {
  let lo = 0;
  let hi = idealLc;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (solveAtTarget(ctx, mid).chromaRetention >= CHROMA_RETENTION_FLOOR) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function solveStep(ctx: StepContext, idealTargetLc: number): SolvedStep {
  const finish = (targetLc: number, verdict: ContrastVerdict): SolvedStep => ({
    ...solveAtTarget(ctx, targetLc),
    targetLc: idealTargetLc,
    verdict,
  });

  const ideal = solveAtTarget(ctx, idealTargetLc);

  // WCAG asks for more than APCA did. Rare, but it is exactly the case an
  // APCA-only tool ships a finding on: give it the least extra contrast that
  // satisfies the criterion rather than jumping to the maximum.
  if (!clearsWcag(ideal, ctx.requirement)) {
    const bound = lowestTargetClearingWcag(ctx, idealTargetLc, MAX_TARGET_LC);
    if (bound === null) return finish(MAX_TARGET_LC, "below-both");
    return finish(bound, "wcag-bound");
  }

  // Nothing to protect: an achromatic seed, or a step with no meaningful
  // separation asked of it in the first place.
  if (ctx.chroma <= 0 || idealTargetLc < 1 || ideal.chromaRetention >= CHROMA_RETENTION_FLOOR) {
    return finish(idealTargetLc, "apca-met");
  }

  // The hue cannot reach its APCA target without washing out. Ease off as far
  // as it needs — then put WCAG under it as a floor.
  const relaxed = highestTargetKeepingChroma(ctx, idealTargetLc);
  if (clearsWcag(solveAtTarget(ctx, relaxed), ctx.requirement)) {
    return finish(relaxed, "hue-protected");
  }

  const bound = lowestTargetClearingWcag(ctx, relaxed, idealTargetLc);
  // The ideal cleared WCAG, so a bound between the two always exists.
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
