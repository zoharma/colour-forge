/** Pinning the seed to a role.
 *
 *  Sometimes the colour is not a suggestion. A brand colour arrives fixed and
 *  the job is "this exact hex has to be the button fill — build the rest
 *  around it", which is a different question from "here is a hue, give me a
 *  ramp".
 *
 *  Two things make or break it:
 *
 *  - **It pins one mode, never both.** A single hex cannot be the right fill
 *    on a white page and on a near-black one; forcing it into both is how a
 *    pinned palette ends up wrong in whichever mode was not being looked at.
 *    The unpinned mode is solved exactly as it would be otherwise, which is
 *    the whole point of solving the two independently in the first place.
 *  - **It is a toggle, not a rule.** Off by default, and the tool suggests
 *    where the colour would sit rather than deciding for you. */

import { apcaHex, apcaYHex } from "./apca";
import { hexToOklch } from "./oklch";
import { wcagRatioHex } from "./wcag";
import type { Conformance, SolvedStep } from "./solver";
import { meetsWcag, type WcagRequirement } from "./wcag";
import type { ModeKey, Profile } from "../profiles/types";

export interface PinSpec {
  mode: ModeKey;
  roleKey: string;
}

/** Where this colour would sit if you did pin it — offered, not applied.
 *
 *  Scored on how close the seed's own measured contrast is to each role's
 *  target in each mode. That is the honest question: a colour "is" a solid
 *  fill in light mode because its separation from a white page is what a
 *  solid fill's separation should be. */
export interface PinSuggestion {
  mode: ModeKey;
  roleKey: string;
  roleLabel: string;
  /** How far the seed's measured Lc is from that role's target. */
  distance: number;
  seedLc: number;
  targetLc: number;
}

export function suggestPin(profile: Profile, seedHex: string): PinSuggestion | undefined {
  let best: PinSuggestion | undefined;

  for (const mode of ["light", "dark"] as ModeKey[]) {
    const spec = profile.modes[mode];
    const seedLc = Math.abs(apcaHex(seedHex, spec.background));

    for (const role of profile.roles) {
      const targetLc = spec.targetLc[role.index[mode]];
      if (targetLc === undefined) continue;
      // Roles whose target APCA cannot measure carry no signal here — every
      // colour is equally far from a target of 2.
      if (targetLc < 10) continue;

      const distance = Math.abs(seedLc - targetLc);
      if (!best || distance < best.distance) {
        best = { mode, roleKey: role.key, roleLabel: role.label, distance, seedLc, targetLc };
      }
    }
  }

  return best;
}

/** The seed itself as a scale step: measured honestly, not solved.
 *
 *  Pinning decides the colour; it does not exempt it from being checked. If a
 *  pinned brand colour cannot carry the role it was pinned to, that is the
 *  single most useful thing the tool can tell you, and it can only say it by
 *  measuring the real value. */
export function pinnedStep(
  profile: Profile,
  mode: ModeKey,
  seedHex: string,
  targetLc: number,
  requirement: WcagRequirement,
): SolvedStep {
  const spec = profile.modes[mode];
  const { L, C, H } = hexToOklch(seedHex);
  const wcagRatio = wcagRatioHex(seedHex, spec.background);
  const conformance: Conformance = meetsWcag(wcagRatio, requirement) ? "meets" : "below-by-choice";

  return {
    hex: seedHex,
    L,
    chroma: C,
    hue: H,
    chromaRetention: 1,
    lc: apcaHex(seedHex, spec.background),
    targetLc,
    usedTargetLc: Math.abs(apcaHex(seedHex, spec.background)),
    wcagRatio,
    requirement,
    // Nothing was eased: the colour was given, not derived.
    effectiveRequirement: requirement,
    conformance,
    verdict: "pinned",
  };
}

/** Curve adjustments that put the pinned role's step on the seed and move the
 *  rest of the ramp with it, so the scale stays a scale rather than becoming
 *  the seed plus eleven unrelated colours.
 *
 *  A piecewise remap, not a shift. Shifting the whole curve by the difference
 *  slides both ends off: the pale steps clamp at zero and collapse onto each
 *  other, and the dark end runs out of range. Instead each half of the ramp is
 *  rescaled into the space the pinned target leaves it — the endpoints stay
 *  where the profile put them, the pinned step lands on the seed, and the
 *  ordering is preserved because both halves stay monotonic.
 *
 *  Chroma is deliberately left alone. Rescaling it so the pinned step "owns"
 *  the full seed chroma sounds tidier and is not: the multiplier curve is the
 *  profile's statement about how saturation should move across the ramp, and
 *  rescaling it inverted neighbouring steps. The pinned step is set to the
 *  seed outright, so it needs no help from the multipliers. */
export function pinnedCurves(
  profile: Profile,
  mode: ModeKey,
  seedHex: string,
  pinnedIndex: number,
): { targetLc: number[]; chromaMultiplier: number[] } {
  const spec = profile.modes[mode];
  const targets = spec.targetLc;
  const nominal = targets[pinnedIndex];
  const first = targets[0];
  const last = targets[targets.length - 1];

  if (nominal === undefined || first === undefined || last === undefined) {
    return { targetLc: targets, chromaMultiplier: spec.chromaMultiplier };
  }

  // Keep the pinned target strictly inside the ramp so neither half collapses.
  const margin = 1;
  const seedLc = Math.min(
    Math.max(Math.abs(apcaHex(seedHex, spec.background)), first + margin),
    last - margin,
  );

  const remap = (t: number, index: number): number => {
    if (index === pinnedIndex) return seedLc;
    if (index < pinnedIndex) {
      const span = nominal - first;
      return span <= 0 ? t : first + ((t - first) * (seedLc - first)) / span;
    }
    const span = last - nominal;
    return span <= 0 ? t : seedLc + ((t - nominal) * (last - seedLc)) / span;
  };

  return {
    targetLc: targets.map(remap),
    chromaMultiplier: spec.chromaMultiplier,
  };
}

export const backgroundLuminance = (profile: Profile, mode: ModeKey): number =>
  apcaYHex(profile.modes[mode].background);
