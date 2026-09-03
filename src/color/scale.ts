/** Turning one seed colour into a full role set, per mode. */

import { apcaHex, apcaYHex } from "./apca";
import { hexToOklch } from "./oklch";
import { pinnedCurves, pinnedStep, type PinSpec } from "./pin";
import { solveStep, type ContrastPolicy, type SolvedStep, type StepContext } from "./solver";
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

  return Array.from({ length: profile.scaleSize }, (_, i) => {
    const requirement = requirements[i] ?? "none";
    const targetLc = curves.targetLc[i] ?? 0;

    if (i === pinnedIndex) {
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
    return solveStep(ctx, targetLc);
  });
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
    const roles = computeRoles(profile, mode, scale);
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
