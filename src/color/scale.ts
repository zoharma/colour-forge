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

    out[i] = stepAtLightness(ctx, Math.min(1, Math.max(0, limit)), current.targetLc, "ramp-spaced");
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

  return enforceRampSpacing(secondPass, contexts, backgroundIsLight);
}

export type RoleSet = Record<string, SolvedStep>;

/** Where a filled role takes its colour from.
 *
 *  `fixed` keeps the profile's step, which always clears the role's own
 *  contrast requirement but hands you a muddy fill for any hue whose cusp is
 *  light: yellow, lime, teal and the greens all come out brown-ish.
 *
 *  `cusp` lets the role slide to the step nearest the hue's own peak, so a
 *  yellow fill is actually yellow. The cost is real and is reported rather
 *  than hidden: at that lightness the fill no longer reaches 3:1 against the
 *  page on its own, so it needs a border to define its edge. 1.4.11 asks for
 *  a perceivable boundary, not for the fill itself to carry the contrast, so
 *  a bordered bright fill is conformant. An unbordered one is not. */
export type FillPlacement = "fixed" | "cusp";

export const FILL_PLACEMENT_LABELS: Record<FillPlacement, string> = {
  fixed: "Fixed step",
  cusp: "Follow the hue",
};

/** How far a filled role may slide, in steps. Enough to reach the cusp for
 *  the light-peaked hues without letting a role wander into a neighbour's
 *  territory. */
const MAX_FILL_SHIFT = 3;

function fillIndex(
  role: RoleDef,
  mode: ModeKey,
  scale: SolvedStep[],
  cuspL: number,
  placement: FillPlacement,
): number {
  const declared = role.index[mode];
  if (placement === "fixed" || !role.wantsSaturation) return declared;

  let best = declared;
  let bestChroma = scale[declared]?.chroma ?? 0;
  const lowest = Math.max(0, declared - MAX_FILL_SHIFT);
  const highest = Math.min(scale.length - 1, declared + MAX_FILL_SHIFT);

  for (let i = lowest; i <= highest; i++) {
    const step = scale[i];
    if (!step) continue;
    // Nearest the cusp *and* actually more saturated than where we started;
    // a step can sit near the cusp lightness while the curve asks it for
    // almost no chroma, and swapping to that would be a downgrade.
    if (step.chroma > bestChroma + 0.005 && Math.abs(step.L - cuspL) < Math.abs((scale[best]?.L ?? 0) - cuspL)) {
      best = i;
      bestChroma = step.chroma;
    }
  }

  return best;
}

export function computeRoles(
  profile: Profile,
  mode: ModeKey,
  scale: SolvedStep[],
  cuspL?: number,
  placement: FillPlacement = "fixed",
): RoleSet {
  const roles: RoleSet = {};
  for (const role of profile.roles) {
    const index =
      cuspL === undefined ? role.index[mode] : fillIndex(role, mode, scale, cuspL, placement);
    const step = scale[index];
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
  fillPlacement: FillPlacement;
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
  fillPlacement: FillPlacement = "fixed",
): Draft {
  const cuspL = hueCusp(hexToOklch(seedHex).H).L;
  const forMode = (mode: ModeKey): ModeResult => {
    const scale = generateScale(profile, mode, seedHex, policy, pin);
    const roles = computeRoles(profile, mode, scale, cuspL, fillPlacement);
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
    fillPlacement,
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
