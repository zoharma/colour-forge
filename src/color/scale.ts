/** Turning one seed colour into a full role set, per mode. */

import { apcaHex, apcaYHex } from "./apca";
import { hexToOklch } from "./oklch";
import { pinnedCurves, pinnedStep, type PinSpec } from "./pin";
import { retreatWithinBound, solveStep, type ContrastPolicy, type SolvedStep, type StepContext } from "./solver";
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

export function generateScale(
  profile: Profile,
  mode: ModeKey,
  seedHex: string,
  policy: ContrastPolicy = "wcag-relaxed",
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

  const ctxs: (StepContext | undefined)[] = [];
  const steps = Array.from({ length: profile.scaleSize }, (_, i) => {
    const requirement = requirements[i] ?? "none";
    const targetLc = curves.targetLc[i] ?? 0;

    if (i === pinnedIndex) {
      ctxs.push(undefined);
      return pinnedStep(profile, mode, seedHex, targetLc, requirement);
    }

    const ctx: StepContext = {
      hue: H,
      chroma: C * (curves.chromaMultiplier[i] ?? 1),
      backgroundHex: modeSpec.background,
      backgroundY,
      backgroundIsLight,
      requirement,
      policy,
    };
    ctxs.push(ctx);
    return solveStep(ctx, targetLc);
  });

  separateCollapsedSteps(steps, ctxs, pinnedIndex);
  return steps;
}

/** Below this Lc gap, two adjacent steps read as the same swatch — matches
 *  the floor the `ramp-collapse` audit finding uses, with a little headroom
 *  so a fix doesn't land right back on the line. */
const STEP_SEPARATION = 2.5;

/** Two steps can land within visual noise of each other even in the
 *  correct order: hue protection solves each step independently, snapping
 *  it to wherever this hue's chroma-retention floor happens to sit, and two
 *  different curve targets can both get pulled onto nearly the same point.
 *
 *  Only a step whose verdict is "hue-protected" is touched here — that is
 *  the one negotiable position in the pair. A `wcag-bound` step is holding
 *  a real requirement and does not move for this; a step already sitting
 *  on its own ideal target has nothing left to give back. Where the
 *  eligible step is retreated only as far toward its own ideal target as
 *  it takes to clear the gap — not all the way, and not past it. Where
 *  neither side is negotiable, the collision is real and the
 *  `ramp-collapse` finding is the honest answer, not a forced fix here. */
function separateCollapsedSteps(
  steps: SolvedStep[],
  ctxs: (StepContext | undefined)[],
  pinnedIndex: number | undefined,
): void {
  for (let i = 1; i < steps.length; i++) {
    if (i === pinnedIndex || i - 1 === pinnedIndex) continue;

    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    const gap = Math.abs(cur.lc) - Math.abs(prev.lc);
    if (gap < -0.5 || gap >= STEP_SEPARATION) continue;

    if (cur.verdict === "hue-protected") {
      steps[i] = retreatStep(cur, ctxs[i]!, Math.abs(prev.lc));
    } else if (prev.verdict === "hue-protected") {
      steps[i - 1] = retreatStep(prev, ctxs[i - 1]!, Math.abs(cur.lc));
    }
  }
}

/** Re-solve `step` bounded to stay at least `STEP_SEPARATION` away from
 *  `neighborLc`, retreating toward its own ideal target — not past it — in
 *  whichever direction it actually moved to get here. Deriving the bound
 *  from the step's own movement rather than assuming a direction is what
 *  makes this safe to call for either side of the pair. */
function retreatStep(step: SolvedStep, ctx: StepContext, neighborLc: number): SolvedStep {
  const movedUp = Math.abs(step.lc) > step.targetLc;
  const bounded: StepContext = movedUp
    ? { ...ctx, nextTargetLc: neighborLc - STEP_SEPARATION }
    : { ...ctx, prevTargetLc: neighborLc + STEP_SEPARATION };
  return retreatWithinBound(bounded, step.targetLc);
}

export type RoleSet = Record<string, SolvedStep>;

export function computeRoles(profile: Profile, mode: ModeKey, scale: SolvedStep[]): RoleSet {
  const roles: RoleSet = {};
  for (const role of profile.roles) {
    const step = scale[role.index[mode]];
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
  /** Whether this candidate is a reasonable choice by the measure this
   *  surface's foreground actually goes by (see `foregroundStrategy`) — not
   *  always the same thing as `meetsRequirement`. A candidate can fail WCAG
   *  and still be `acceptable` here, when the role trusts APCA for its
   *  foreground and this candidate reads fine by APCA. Drives the "this
   *  option is poor, don't pick it" signal in the UI; `meetsRequirement`
   *  stays the honest WCAG number regardless. */
  acceptable: boolean;
  /** Set on the one the tool would pick if nobody intervenes. */
  recommended: boolean;
}

/** Highest |Lc| wins outright — WCAG only breaks a tie within `APCA_TIE_LC`
 *  of the leader. Used for "More APCA", where legibility is trusted over
 *  the ratio even when the gap between them is large. */
const APCA_TIE_LC = 3;

/** Below this, a foreground is genuinely hard to read regardless of what
 *  WCAG says about it — roughly APCA's own cited floor for anything short
 *  of large, infrequent text. Used only to decide whether an APCA-trusting
 *  candidate is worth warning about; the real recommendation still comes
 *  from `bestByApca`/`bestByCompliance`. */
const APCA_ACCEPTABLE_LC = 45;

/** Which measure a surface role's foreground actually goes by.
 *
 *  "More APCA" and "Full WCAG 2.2" are absolute — every role's foreground
 *  follows the same measure the policy names, full stop. "System default"
 *  is where the balance is role-aware rather than a single number: a role
 *  that already carries its own real WCAG requirement (`solid`'s 3:1, say)
 *  has already had APCA decide how far it can push contrast without losing
 *  the hue, so its foreground trusts APCA too — WCAG's ratio is exactly
 *  what misjudges a saturated fill as darker or lighter than it reads, and
 *  a "compliant" foreground there can be the harder one to actually read.
 *  A role with no requirement of its own (`container`'s tint) has nothing
 *  pulling it toward a particular contrast, so its foreground defers to
 *  WCAG instead — the safer choice for a surface with no enforced floor,
 *  and it is what leaves room for the subtler, lighter shade. */
function foregroundStrategy(policy: ContrastPolicy, roleRequirement: WcagRequirement): "apca" | "compliance" {
  if (policy === "hue-first") return "apca";
  if (policy === "wcag-strict") return "compliance";
  return roleRequirement === "none" ? "compliance" : "apca";
}

function bestByApca<T extends { lc: number; meetsRequirement: boolean }>(candidates: T[]): T | undefined {
  let best: T | undefined;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    const gap = Math.abs(c.lc) - Math.abs(best.lc);
    if (Math.abs(gap) <= APCA_TIE_LC && c.meetsRequirement !== best.meetsRequirement) {
      if (c.meetsRequirement) best = c;
      continue;
    }
    if (gap > 0) best = c;
  }
  return best;
}

/** A candidate that meets the requirement always beats one that doesn't,
 *  regardless of the APCA gap between them — APCA only breaks a tie among
 *  candidates on the same side of that line. Used for "System default" and
 *  "Full WCAG 2.2", where the policy's whole point is not shipping a
 *  foreground that fails. */
function bestByCompliance<T extends { lc: number; meetsRequirement: boolean }>(candidates: T[]): T | undefined {
  let best: T | undefined;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    if (c.meetsRequirement !== best.meetsRequirement) {
      if (c.meetsRequirement) best = c;
      continue;
    }
    if (Math.abs(c.lc) > Math.abs(best.lc)) best = c;
  }
  return best;
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
  seedHex: string,
  requirement: WcagRequirement = "body",
  policy: ContrastPolicy = "wcag-relaxed",
  role?: RoleDef,
): ForegroundCandidate[] {
  const modeSpec = profile.modes[mode];
  const surfaceIsLight = isLightBackground(surfaceHex);
  const strategy = foregroundStrategy(policy, role?.requirement ?? "none");
  // Named for the role this foreground is actually for — "On-surface" shown
  // as a candidate on every role's picker read as if it belonged to the
  // `surface` role specifically, even when what's being chosen is solid's
  // or container's own foreground.
  const roleLabel = role?.label ?? "Surface";

  const { H, C } = hexToOklch(seedHex);
  const baseCtx: StepContext = {
    hue: H,
    chroma: C,
    backgroundHex: surfaceHex,
    backgroundY: apcaYHex(surfaceHex),
    backgroundIsLight: surfaceIsLight,
    requirement,
    policy,
  };

  // "On {role}" — a tinted near-black/near-white, the same strong, safe,
  // near-maximum-contrast role White/Black play, but part of the hue's own
  // scale rather than a fixed neutral unrelated to it. Always the scale's
  // own extreme (step 12): this one is not the trust-APCA-or-hold-WCAG
  // split below, it is the "as much contrast as this hue can still take"
  // option regardless of policy.
  const lastTargetLc = modeSpec.targetLc[modeSpec.targetLc.length - 1] ?? 90;
  const opposite = solveStep(baseCtx, lastTargetLc).hex;

  // "Tinted" — a shallower tinted alternative, solved against this surface
  // specifically. How deep it goes follows the same trust-APCA-or-hold-WCAG
  // split as which candidate gets recommended below: roughly where
  // `text`/`base` itself sits (step 10) when this role trusts APCA, which
  // is comfortable pushing a hue further into contrast than WCAG's ratio
  // credits it for; shallower (step 8) when it trusts WCAG instead — still
  // meaningfully less contrasty than the APCA case, just not as pale as
  // step 7.
  //
  // "Shallower target" does not reliably mean "shallower result", though:
  // hue protection is not monotonic in the target (see solver.ts), so a
  // hue can need real protection at step 10 while sailing through step 8
  // untouched — landing the "WCAG" candidate *past* the "APCA" one despite
  // asking for less. So the APCA depth is solved first and used as a live
  // ceiling on the WCAG one, rather than trusting the two nominal targets
  // to stay in the order their step numbers suggest.
  const apcaTargetLc = modeSpec.targetLc[9] ?? lastTargetLc;
  const apcaTinted = solveStep(baseCtx, apcaTargetLc);

  let tinted = apcaTinted;
  if (strategy !== "apca") {
    const wcagTargetLc = modeSpec.targetLc[7] ?? apcaTargetLc;
    const ceiling = Math.max(0, Math.abs(apcaTinted.lc) - APCA_TIE_LC);
    tinted = solveStep({ ...baseCtx, nextTargetLc: ceiling }, Math.min(wcagTargetLc, ceiling));
  }

  const raw = [
    { label: "White", hex: "#ffffff" },
    { label: "Black", hex: "#000000" },
    { label: "Theme text", hex: modeSpec.onSurface },
    { label: `On ${roleLabel}`, hex: opposite },
    { label: "Tinted", hex: tinted.hex },
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
      const meetsRequirement = meetsWcag(ratio, requirement);
      return {
        label: c.label,
        hex: c.hex,
        lc: apcaHex(c.hex, surfaceHex),
        wcagRatio: ratio,
        meetsRequirement,
        acceptable: strategy === "apca" ? Math.abs(apcaHex(c.hex, surfaceHex)) >= APCA_ACCEPTABLE_LC : meetsRequirement,
        recommended: false,
      };
    });

  // Which candidate gets recommended follows the same trust-APCA-or-hold-
  // WCAG split as the rest of the solver, because a role solved under
  // "Full WCAG 2.2" and then paired with a foreground that fails WCAG would
  // break the one promise that policy makes. See `foregroundStrategy` for
  // how the split itself is decided.
  //
  // Trusting APCA: pick the most legible candidate by APCA — the measure
  // this tool trusts to actually predict readability — full stop. A
  // saturated orange or yellow is the classic case where the two disagree
  // hard, because WCAG's linear-luminance ratio rates it far brighter than
  // it reads, so black-on-orange can clear 4.5:1 while measurably harder to
  // read than a white that clears barely 3:1. WCAG's verdict is still shown
  // on every candidate, never hidden, and the human can always override.
  //
  // Trusting WCAG: never recommend a candidate that fails while one that
  // passes is available — APCA only breaks a tie among candidates on the
  // same side of that line. The gap can be large by Lc and still be the
  // wrong trade: an olive-yellow surface can read APCA as preferring white
  // by more than ten Lc while WCAG rates it barely 3:1 against a compliant
  // black at nearly 7:1 — a real conflict, but not one this side of the
  // split should paper over by picking APCA anyway.
  const chosen = strategy === "apca" ? bestByApca(candidates) : bestByCompliance(candidates);
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
  policy: ContrastPolicy = "wcag-relaxed",
  pin?: PinSpec,
): Draft {
  const forMode = (mode: ModeKey): ModeResult => {
    const scale = generateScale(profile, mode, seedHex, policy, pin);
    const roles = computeRoles(profile, mode, scale);
    const foregrounds: Record<string, ForegroundCandidate[]> = {};
    for (const role of foregroundRoles(profile)) {
      const step = roles[role.key];
      if (step)
        foregrounds[role.key] = foregroundCandidates(profile, mode, step.hex, seedHex, "body", policy, role);
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
