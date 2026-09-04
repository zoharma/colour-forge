/** Turning one seed colour into a full role set, per mode. */

import { apcaHex, apcaYHex } from "./apca";
import { hexToOklch, hueCusp } from "./oklch";
import { pinnedCurves, pinnedStep, type PinSpec } from "./pin";
import {
  solveStep,
  solveWithoutHueProtection,
  stepAtLightness,
  type ContrastPolicy,
  type SolvedStep,
  type StepContext,
} from "./solver";
import { WCAG_MINIMUM, meetsWcag, wcagRatioHex, type WcagRequirement } from "./wcag";
import type { ModeKey, Profile, RoleDef } from "../profiles/types";

/** A background above this relative luminance is treated as light, which
 *  flips which direction "more separated" means. Read from the actual
 *  background colour rather than the page mode: a dark-mode surface role is
 *  often a light pastel, and its foreground has to follow the surface. */
const LIGHT_BACKGROUND_Y = 0.4;

export const isLightBackground = (hex: string): boolean => apcaYHex(hex) > LIGHT_BACKGROUND_Y;

const strictest = (a: WcagRequirement, b: WcagRequirement): WcagRequirement =>
  WCAG_MINIMUM[a] >= WCAG_MINIMUM[b] ? a : b;

/** Requirement per scale index, taken from whichever roles land on it.
 *  Unmapped steps are spare capacity and answer to nothing. */
function requirementsByIndex(profile: Profile, mode: ModeKey): WcagRequirement[] {
  const out: WcagRequirement[] = Array.from({ length: profile.scaleSize }, () => "none");
  for (const role of profile.roles) {
    const i = role.index[mode];
    if (i >= 0 && i < out.length) out[i] = strictest(out[i] ?? "none", role.requirement);
  }
  return out;
}

/** Smallest lightness difference that reads as a distinct step.
 *
 *  Steps are solved for contrast, and APCA Lc depends on chroma as well as
 *  lightness, so a step can reach a higher contrast target than its neighbour
 *  while sitting at the same lightness. On the shipped curves, generic light
 *  steps 5, 6 and 7 of a blue came out at L 0.659, 0.650 and 0.624: three
 *  swatches nobody could tell apart.
 *
 *  0.035, against an average spacing of about 0.065 across the twelve steps,
 *  so it only binds where the ramp had genuinely collapsed. */
export const MIN_STEP_LIGHTNESS_GAP = 0.035;

/** Smallest gap between the contrast targets two adjacent steps are solved
 *  at, once hue protection has had its say. */
const MIN_STEP_TARGET_GAP = 4;

/** Hue protection is a judgement about a *hue*, but it was being applied as
 *  twelve independent judgements about steps, and the steps disagreed.
 *
 *  Each step eases its own target by as much as its own chroma allows, and
 *  the middle of the ramp asks for the most chroma, so the middle eased
 *  hardest. A yellow's step 6 relaxed all the way to L 0.908 while its
 *  neighbours held at 0.658, leaving the ramp climbing back toward the
 *  background with steps 5 and 7 the same colour.
 *
 *  So the easing is reconciled across the ramp before any colour is fixed:
 *  the used targets are forced back into increasing order with a minimum gap.
 *  The tail eases off together and keeps its shape, rather than each step
 *  bargaining alone and the set ending up out of order. */
function orderedTargets(steps: SolvedStep[]): number[] {
  const targets = steps.map((step) => Math.abs(step.usedTargetLc));

  for (let i = 1; i < targets.length; i++) {
    const previous = targets[i - 1] ?? 0;
    const current = targets[i] ?? 0;
    // Never pull a step below what it already achieved; only push it up to
    // clear its neighbour, so this cannot reduce anyone's contrast.
    if (current < previous + MIN_STEP_TARGET_GAP) {
      targets[i] = Math.min(108, previous + MIN_STEP_TARGET_GAP);
    }
  }

  return targets;
}

/** Last resort for collisions the target ordering cannot see: two steps whose
 *  targets differ properly but which still land at the same lightness because
 *  their chroma differs. Always moves away from the background, so it can only
 *  add contrast and can never undo a WCAG floor. */
function enforceRampSpacing(
  steps: SolvedStep[],
  contexts: StepContext[],
  backgroundIsLight: boolean,
): SolvedStep[] {
  const out = [...steps];

  for (let i = 1; i < out.length; i++) {
    const previous = out[i - 1];
    const current = out[i];
    const ctx = contexts[i];
    if (!previous || !current || !ctx) continue;
    // A pinned step is the one thing here that a person placed deliberately.
    if (current.verdict === "pinned") continue;

    const limit = backgroundIsLight
      ? previous.L - MIN_STEP_LIGHTNESS_GAP
      : previous.L + MIN_STEP_LIGHTNESS_GAP;
    const violates = backgroundIsLight ? current.L > limit : current.L < limit;
    if (!violates) continue;

    // Keep the verdict that explains the colour, not just the one that
    // explains the position. A step can be both hue-protected and spaced, and
    // overwriting the first discards its audit note and its badge. Worse, a
    // spaced `below-both` step used to export as "kept for hue" — the exact
    // contradiction the export's reason selection exists to prevent, since
    // nothing was traded away for a hue that cannot reach the criterion at any
    // lightness. `ramp-spaced` only wins over `apca-met`, which had nothing
    // left to say once the step moved.
    const keep = current.verdict === "apca-met" ? "ramp-spaced" : current.verdict;
    out[i] = stepAtLightness(ctx, Math.min(1, Math.max(0, limit)), current.targetLc, keep);
  }

  return out;
}

/** Slide the chroma curve so its peak sits on the hue's own cusp.
 *
 *  The profile's multiplier array says "ask for the most chroma around here",
 *  and "here" is a step index, which silently assumes every hue peaks at the
 *  same lightness. They do not: red peaks at L 0.58, yellow at 0.88. So the
 *  curve asks yellow for its most saturated colour at the one lightness
 *  yellow cannot deliver it, and asks for a pale wash at the lightness where
 *  yellow is at its best. That is where the muddy mid-yellows come from.
 *
 *  The fix keeps the curve's shape and both its ends, and moves only where
 *  the peak falls: a piecewise-linear remap of the index domain. A hue whose
 *  cusp already sits near the original peak, like red, is left alone.
 *
 *  `stepLightness` is the ramp's own lightness per step, measured from a
 *  first solve rather than assumed, since it depends on the background. */
function cuspAlignedChroma(multipliers: number[], stepLightness: number[], cuspL: number): number[] {
  const last = multipliers.length - 1;
  if (last < 2) return multipliers;

  let peak = 0;
  multipliers.forEach((m, i) => {
    if (m > (multipliers[peak] ?? 0)) peak = i;
  });

  // Which step sits closest to the cusp is where the peak belongs.
  let desired = peak;
  let closest = Number.POSITIVE_INFINITY;
  stepLightness.forEach((L, i) => {
    const d = Math.abs(L - cuspL);
    if (d < closest) {
      closest = d;
      desired = i;
    }
  });

  // Never push the peak onto the very ends: the extremes of a ramp are a
  // near-white and a near-black whatever the hue, and a peak there would ask
  // for chroma that cannot exist and flatten the middle.
  desired = Math.min(last - 1, Math.max(1, desired));
  if (desired === peak) return multipliers;

  const sample = (position: number): number => {
    const clamped = Math.min(last, Math.max(0, position));
    const low = Math.floor(clamped);
    const high = Math.min(last, low + 1);
    const t = clamped - low;
    return (multipliers[low] ?? 0) * (1 - t) + (multipliers[high] ?? 0) * t;
  };

  return multipliers.map((_, i) => {
    // Map this step back onto the original curve, with the peak moved.
    const source =
      i <= desired ? (peak * i) / desired : peak + ((last - peak) * (i - desired)) / (last - desired);
    return sample(source);
  });
}

export function generateScale(
  profile: Profile,
  mode: ModeKey,
  seedHex: string,
  policy: ContrastPolicy = "wcag-strict",
  pin?: PinSpec,
): SolvedStep[] {
  const { H, C } = hexToOklch(seedHex);
  const modeSpec = profile.modes[mode];
  const backgroundY = apcaYHex(modeSpec.background);
  const backgroundIsLight = backgroundY > LIGHT_BACKGROUND_Y;
  const requirements = requirementsByIndex(profile, mode);

  // A pin applies to one mode only. The other is solved exactly as it would
  // be otherwise — a single hex cannot be the right colour against both a
  // white page and a near-black one, and forcing it into both is how a pinned
  // palette ends up wrong in whichever mode nobody was looking at.
  const pinnedRole = pin?.mode === mode ? profile.roles.find((r) => r.key === pin.roleKey) : undefined;
  const pinnedIndex = pinnedRole?.index[mode];

  const curves =
    pinnedIndex === undefined
      ? { targetLc: modeSpec.targetLc, chromaMultiplier: modeSpec.chromaMultiplier }
      : pinnedCurves(profile, mode, seedHex, pinnedIndex);

  // Solve once with the profile's own curve to learn where each step falls in
  // lightness, then align the chroma peak to the hue and solve again.
  const probeContexts: StepContext[] = Array.from({ length: profile.scaleSize }, (_, i) => ({
    hue: H,
    chroma: C * (curves.chromaMultiplier[i] ?? 1),
    backgroundHex: modeSpec.background,
    backgroundY,
    backgroundIsLight,
    requirement: requirements[i] ?? "none",
    policy,
    headroom: modeSpec.chromaHeadroom,
  }));
  const probeLightness = probeContexts.map((ctx, i) => solveStep(ctx, curves.targetLc[i] ?? 0).L);
  const alignedChroma = cuspAlignedChroma(curves.chromaMultiplier, probeLightness, hueCusp(H).L);

  const contexts: StepContext[] = Array.from({ length: profile.scaleSize }, (_, i) => ({
    hue: H,
    chroma: C * (alignedChroma[i] ?? 1),
    backgroundHex: modeSpec.background,
    backgroundY,
    backgroundIsLight,
    requirement: requirements[i] ?? "none",
    headroom: modeSpec.chromaHeadroom,
    policy,
  }));

  const firstPass = contexts.map((ctx, i) => {
    const targetLc = curves.targetLc[i] ?? 0;
    return i === pinnedIndex
      ? pinnedStep(profile, mode, seedHex, targetLc, ctx.requirement)
      : solveStep(ctx, targetLc);
  });

  // Reconcile the easing across the ramp, then re-solve anything it moved.
  const reconciled = orderedTargets(firstPass);
  const secondPass = firstPass.map((step, i) => {
    const ctx = contexts[i];
    const target = reconciled[i];
    if (!ctx || target === undefined || i === pinnedIndex) return step;
    if (Math.abs(target - Math.abs(step.usedTargetLc)) < 0.01) return step;
    return solveWithoutHueProtection(ctx, curves.targetLc[i] ?? 0, target);
  });

  // Stamped last, so every step knows its own position no matter which path
  // produced it: solved, re-solved, spaced or pinned.
  return enforceRampSpacing(secondPass, contexts, backgroundIsLight).map((step, i) => ({
    ...step,
    stepIndex: i,
  }));
}

export type RoleSet = Record<string, SolvedStep>;

/** Where a filled role takes its colour from.
 *
 *  Solved, not chosen. The profile names a step that is right for *contrast*,
 *  and for a hue whose gamut peaks light — yellow, lime, teal, the greens —
 *  that step has no chroma left, so the fill comes out brown. Measured across
 *  Material's 19 core hues, the declared step lands at 3.9-4.4:1 in light
 *  mode for a role that requires 3:1, so nearly every hue is paying chroma
 *  for contrast nothing asked for.
 *
 *  So a filled role slides to its most chromatic step, under two constraints
 *  that between them are the whole rule:
 *
 *  **It only ever moves lighter.** Red and pink already sit at their peak.
 *  Indigo and deep purple peak *dark*, so an unconstrained search sends their
 *  fill to a near-navy at Lc 85 while every sibling sits at Lc 66 — more
 *  chroma, but no longer the same family. Refusing downward moves rules that
 *  out without needing to name a single hue.
 *
 *  **Dark mode keeps its requirement; light mode may spend it.** This looks
 *  asymmetric and is not: on a dark page every bright form already measures
 *  9-14:1, so there is nothing to trade and no reason to allow a trade. On a
 *  light page a genuinely yellow yellow is 1.3:1 and the conflict is real.
 *  There the brightness wins and the cost is reported: the fill can no longer
 *  define its own edge, so it needs a border. 1.4.11 asks for a perceivable
 *  boundary rather than a contrasting fill, so a bordered bright fill
 *  conforms and an unbordered one does not. */

/** Below this, "most chromatic" is ranking noise rather than a colour
 *  decision. Without it a grey fill chases a step with 0.001 more chroma and
 *  lands on #c0c0c0 at 1.76:1, which is not a brighter grey, just a wrong
 *  one. */
const NEUTRAL_CHROMA_FLOOR = 0.03;

/** The least contrast a fill may have against the page and still be a fill.
 *
 *  Light mode lets a fill go under its requirement to keep the hue, and a
 *  border makes that conformant. But the trade only makes sense while the fill
 *  is still doing something: at 1.19:1 the border is not supplementing the
 *  fill, it is the entire component, and the "fill" is a wash the eye reads as
 *  the page. Seeds already sitting on their hue's cusp are what reach that —
 *  their ramp peaks at the palest end, so chasing the peak walks the fill off
 *  the page.
 *
 *  Set just under the six hues this behaviour exists for (yellow 1.33, lime
 *  and teal 1.35, light green 1.36, green 1.76, cyan 1.77), so it rules out
 *  the degenerate case without touching any of them. */
const MIN_FILL_RATIO = 1.3;

function fillIndex(role: RoleDef, mode: ModeKey, scale: SolvedStep[], pin?: PinSpec): number {
  const declared = role.index[mode];
  const base = scale[declared];
  if (!role.wantsSaturation || !base) return declared;
  if (base.chroma < NEUTRAL_CHROMA_FLOOR) return declared;
  // A pin is not a suggestion. "This exact hex is the fill" is the whole
  // feature, so the placement rule has nothing to offer here and moving the
  // role would silently discard the pinned colour.
  if (pin && pin.mode === mode && pin.roleKey === role.key) return declared;

  let best = declared;
  let bestChroma = base.chroma;

  for (let i = 0; i < scale.length; i++) {
    const step = scale[i];
    if (!step || step.chroma <= bestChroma) continue;
    // Lighter only. The declared step is the right contrast position, so a
    // move away from the background is spending headroom the role has; a move
    // toward it is taking the role somewhere its siblings are not.
    if (step.L <= base.L) continue;
    // On a dark page brightness is free, so there is no case for buying it
    // with conformance. On a light page the trade is allowed, but not past the
    // point where what it buys has stopped being a fill.
    if (mode === "dark" && !meetsWcag(step.wcagRatio, role.requirement)) continue;
    if (mode === "light" && step.wcagRatio < MIN_FILL_RATIO) continue;
    best = i;
    bestChroma = step.chroma;
  }

  return best;
}

export function computeRoles(
  profile: Profile,
  mode: ModeKey,
  scale: SolvedStep[],
  pin?: PinSpec,
): RoleSet {
  const roles: RoleSet = {};
  for (const role of profile.roles) {
    const step = scale[fillIndex(role, mode, scale, pin)];
    if (step) roles[role.key] = step;
  }
  return roles;
}

/* ---------------------------------------------------------------------- */
/* Foreground pairing                                                      */
/* ---------------------------------------------------------------------- */

export interface ForegroundCandidate {
  label: string;
  hex: string;
  lc: number;
  wcagRatio: number;
  meetsRequirement: boolean;
  /** Set on the one the tool would pick if nobody intervenes. */
  recommended: boolean;
}

/** Foregrounds offered for a surface role, measured against that surface.
 *
 *  Polarity follows the surface's own lightness, not the page mode. A
 *  dark-mode surface is frequently a light pastel and needs dark text on it
 *  even though everything around it is light-on-dark; deciding from the page
 *  mode instead silently picks the least-bad of a bad set. */
export function foregroundCandidates(
  profile: Profile,
  mode: ModeKey,
  surfaceHex: string,
  scale: SolvedStep[],
  requirement: WcagRequirement = "body",
): ForegroundCandidate[] {
  const modeSpec = profile.modes[mode];
  const surfaceIsLight = isLightBackground(surfaceHex);
  const opposite = surfaceIsLight ? profile.modes.light.onSurface : profile.modes.dark.onSurface;

  // The extreme end of the scale, tinted with the seed hue — a foreground
  // that belongs to the colour family rather than being neutral.
  const tinted = surfaceIsLight ? scale[0] : scale[scale.length - 1];

  const raw = [
    { label: "White", hex: "#ffffff" },
    { label: "Black", hex: "#000000" },
    { label: "On-surface neutral", hex: opposite },
    { label: "Mode on-surface", hex: modeSpec.onSurface },
    ...(tinted ? [{ label: "Tinted", hex: tinted.hex }] : []),
  ];

  // Deduplicate by resolved colour, keeping the first (most descriptive) name.
  const seen = new Set<string>();
  const candidates = raw
    .filter((c) => {
      const key = c.hex.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => {
      const ratio = wcagRatioHex(c.hex, surfaceHex);
      return {
        label: c.label,
        hex: c.hex,
        lc: apcaHex(c.hex, surfaceHex),
        wcagRatio: ratio,
        meetsRequirement: meetsWcag(ratio, requirement),
        recommended: false,
      };
    });

  // Prefer a candidate that clears WCAG; among those, the highest APCA. Both
  // measures agree far more often than not, and where they disagree the one
  // that keeps the audit clean wins — the human can still override.
  let best = -1;
  candidates.forEach((c, i) => {
    const bestSoFar = best >= 0 ? candidates[best] : undefined;
    if (!bestSoFar) {
      best = i;
      return;
    }
    if (c.meetsRequirement !== bestSoFar.meetsRequirement) {
      if (c.meetsRequirement) best = i;
      return;
    }
    if (Math.abs(c.lc) > Math.abs(bestSoFar.lc)) best = i;
  });
  const chosen = candidates[best];
  if (chosen) chosen.recommended = true;

  return candidates;
}

/* ---------------------------------------------------------------------- */
/* The whole draft                                                         */
/* ---------------------------------------------------------------------- */

export interface ModeResult {
  scale: SolvedStep[];
  roles: RoleSet;
  foregrounds: Record<string, ForegroundCandidate[]>;
}

export interface Draft {
  name: string;
  seedHex: string;
  policy: ContrastPolicy;
  pin?: PinSpec;
  seedOklch: ReturnType<typeof hexToOklch>;
  light: ModeResult;
  dark: ModeResult;
}

const foregroundRoles = (profile: Profile): RoleDef[] => profile.roles.filter((r) => r.needsForeground);

export function buildDraft(
  profile: Profile,
  name: string,
  seedHex: string,
  policy: ContrastPolicy = "wcag-strict",
  pin?: PinSpec,
): Draft {
  const forMode = (mode: ModeKey): ModeResult => {
    const scale = generateScale(profile, mode, seedHex, policy, pin);
    const roles = computeRoles(profile, mode, scale, pin);
    const foregrounds: Record<string, ForegroundCandidate[]> = {};
    for (const role of foregroundRoles(profile)) {
      const step = roles[role.key];
      if (step) foregrounds[role.key] = foregroundCandidates(profile, mode, step.hex, scale);
    }
    return { scale, roles, foregrounds };
  };

  return {
    name,
    seedHex,
    policy,
    pin,
    seedOklch: hexToOklch(seedHex),
    light: forMode("light"),
    dark: forMode("dark"),
  };
}

export function chosenForeground(
  draft: Draft,
  mode: ModeKey,
  roleKey: string,
  override?: string,
): ForegroundCandidate | undefined {
  const candidates = draft[mode].foregrounds[roleKey];
  if (!candidates?.length) return undefined;
  if (override) {
    const picked = candidates.find((c) => c.label === override);
    if (picked) return picked;
  }
  return candidates.find((c) => c.recommended) ?? candidates[0];
}
