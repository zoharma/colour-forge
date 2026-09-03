import { describe, expect, it } from "vitest";

import { auditDraft, draftAsIntent } from "../src/color/audit";
import { hexToOklch, hueCusp } from "../src/color/oklch";
import { buildDraft } from "../src/color/scale";
import { meetsWcag } from "../src/color/wcag";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import { MATERIAL_500 } from "../src/profiles/material";
import type { ModeKey, Profile } from "../src/profiles/types";

const MODES: ModeKey[] = ["light", "dark"];
const PROFILES = [genericProfile, diamondProfile];

const filledRole = (p: Profile) => p.roles.find((r) => r.wantsSaturation)!;

/** Hues whose gamut peaks light, so the profile's declared step lands well
 *  below their cusp and hands back a muddy version of the colour. */
const LIGHT_PEAKED = ["#ffeb3b", "#cddc39", "#009688", "#4caf50", "#00bcd4", "#8bc34a"];
/** Hues that peak dark. Their most chromatic step is *away* from the page, so
 *  they are the ones an unconstrained chroma search sends wandering. */
const DARK_PEAKED = ["#3f51b5", "#673ab7"];

describe("cusp-aware chroma", () => {
  it("finds a plausible cusp for every hue", () => {
    for (const { name, hex } of MATERIAL_500) {
      const cusp = hueCusp(hexToOklch(hex).H);
      expect(cusp.L, name).toBeGreaterThan(0.3);
      expect(cusp.L, name).toBeLessThan(0.98);
      expect(cusp.C, name).toBeGreaterThan(0);
    }
  });

  it("puts yellow's peak somewhere light and indigo's somewhere dark", () => {
    // The whole premise: one fixed step cannot serve both.
    expect(hueCusp(hexToOklch("#ffeb3b").H).L).toBeGreaterThan(0.8);
    expect(hueCusp(hexToOklch("#3f51b5").H).L).toBeLessThan(0.5);
  });
});

describe("the fill lands on its most chromatic reachable step", () => {
  it("gives light-peaked hues a more saturated fill than the declared step", () => {
    for (const seed of LIGHT_PEAKED) {
      const draft = buildDraft(genericProfile, "x", seed);
      const role = filledRole(genericProfile);
      const step = draft.light.roles[role.key]!;
      const declared = draft.light.scale[role.index.light]!;
      expect(step.chroma, seed).toBeGreaterThan(declared.chroma);
    }
  });

  it("leaves a hue already at its peak exactly where it was", () => {
    // Red and pink peak near their declared step, so there is nothing to gain
    // and the rule must not invent a move.
    for (const seed of ["#f44336", "#e91e63"]) {
      const draft = buildDraft(genericProfile, "x", seed);
      const role = filledRole(genericProfile);
      expect(draft.light.roles[role.key]!.stepIndex, seed).toBe(role.index.light);
    }
  });
});

describe("the two constraints that make the rule safe", () => {
  it("never moves a fill toward the background", () => {
    // The guard that keeps indigo out of a near-navy while its siblings sit
    // four steps lighter. Asserted across every hue, not just the two that
    // motivated it.
    for (const profile of PROFILES) {
      const role = filledRole(profile);
      for (const { name, hex } of MATERIAL_500) {
        const draft = buildDraft(profile, "x", hex);
        for (const mode of MODES) {
          const step = draft[mode].roles[role.key]!;
          const declared = draft[mode].scale[role.index[mode]]!;
          expect(step.L, `${profile.id} ${name} ${mode}`).toBeGreaterThanOrEqual(declared.L);
        }
      }
    }
  });

  it("holds dark mode to its contrast requirement", () => {
    // On a dark page every bright form already measures far above the floor,
    // so there is never a reason to buy brightness with conformance.
    for (const profile of PROFILES) {
      const role = filledRole(profile);
      for (const { name, hex } of MATERIAL_500) {
        const step = buildDraft(profile, "x", hex).dark.roles[role.key]!;
        expect(meetsWcag(step.wcagRatio, role.requirement), `${profile.id} ${name}`).toBe(true);
      }
    }
  });

  it("never moves a near-neutral, where 'most chromatic' is noise", () => {
    // Grey's steps differ by thousandths of chroma. Ranking on that sends the
    // fill to a pale grey at 1.76:1, which is not a brighter grey, just wrong.
    for (const profile of PROFILES) {
      const role = filledRole(profile);
      for (const seed of ["#9e9e9e", "#757575", "#ffffff", "#000000"]) {
        const draft = buildDraft(profile, "x", seed);
        for (const mode of MODES) {
          expect(draft[mode].roles[role.key]!.stepIndex, `${seed} ${mode}`).toBe(role.index[mode]);
        }
      }
    }
  });

  it("never trades to a less saturated step, at any hue", () => {
    for (const profile of PROFILES) {
      const role = filledRole(profile);
      for (const { name, hex } of MATERIAL_500) {
        const draft = buildDraft(profile, "x", hex);
        for (const mode of MODES) {
          const step = draft[mode].roles[role.key]!;
          const declared = draft[mode].scale[role.index[mode]]!;
          expect(step.chroma, `${profile.id} ${name} ${mode}`).toBeGreaterThanOrEqual(declared.chroma);
        }
      }
    }
  });

  it("moves dark-peaked hues nowhere, in either mode", () => {
    for (const seed of DARK_PEAKED) {
      const role = filledRole(genericProfile);
      const draft = buildDraft(genericProfile, "x", seed);
      expect(draft.light.roles[role.key]!.stepIndex, seed).toBe(role.index.light);
    }
  });
});

describe("what the move costs is reported", () => {
  it("raises a border warning exactly when the light fill drops under its requirement", () => {
    const role = filledRole(genericProfile);
    for (const { name, hex } of MATERIAL_500) {
      const draft = buildDraft(genericProfile, "x", hex);
      const step = draft.light.roles[role.key]!;
      const flagged = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]).some(
        (f) => f.id === `fill-placement-light-${role.key}`,
      );
      expect(flagged, `${name} ${step.hex} ${step.wcagRatio.toFixed(2)}:1`).toBe(
        !meetsWcag(step.wcagRatio, role.requirement),
      );
    }
  });

  it("reports the step a role actually took, not the one it was declared at", () => {
    for (const seed of LIGHT_PEAKED) {
      const role = filledRole(genericProfile);
      const draft = buildDraft(genericProfile, "x", seed);
      const step = draft.light.roles[role.key]!;
      expect(draft.light.scale[step.stepIndex]!.hex, seed).toBe(step.hex);
    }
  });
});
