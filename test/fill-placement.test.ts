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

  it("never walks a light fill off the page chasing the peak", () => {
    // A seed already sitting on its hue's cusp has a ramp that peaks at the
    // palest end, so an unfloored search hands back a fill at 1.19:1 that the
    // eye reads as the page. The border is meant to supplement a fill, not be
    // the whole component.
    const role = filledRole(genericProfile);
    for (const seed of ["#e3e60f", "#ffeb3b", "#cddc39", "#f5f7c0", "#eaffea", "#fffbe0"]) {
      const step = buildDraft(genericProfile, "x", seed).light.roles[role.key]!;
      expect(step.wcagRatio, `${seed} -> ${step.hex}`).toBeGreaterThanOrEqual(1.3);
    }
  });

  it("leaves the hues that already sit just above the floor exactly where they were", () => {
    // The floor exists for the degenerate case, so it must not quietly pull in
    // the six hues this whole behaviour was built for.
    const role = filledRole(genericProfile);
    const expected: Record<string, string> = {
      "#ffeb3b": "#f1de30", // yellow  1.33:1
      "#cddc39": "#d5e531", // lime    1.35:1
      "#009688": "#65f0dd", // teal    1.35:1
      "#8bc34a": "#aaed5d", // light green 1.36:1
      "#4caf50": "#62d867", // green   1.76:1
      "#00bcd4": "#1fd2ec", // cyan    1.77:1
    };
    for (const [seed, hex] of Object.entries(expected)) {
      expect(buildDraft(genericProfile, "x", seed).light.roles[role.key]!.hex, seed).toBe(hex);
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

describe("a fill that lands on another role's step", () => {
  it("is reported, since two roles the same colour is a lost distinction", () => {
    // Yellow's light fill slides onto the step Surface strong already holds.
    const draft = buildDraft(genericProfile, "x", "#ffeb3b");
    const role = filledRole(genericProfile);
    const step = draft.light.roles[role.key]!;
    const clashing = genericProfile.roles.filter(
      (r) => r.key !== role.key && draft.light.roles[r.key]?.hex === step.hex,
    );
    expect(clashing.length, "expected this hue to collide").toBeGreaterThan(0);

    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    const found = findings.find((f) => f.id === `role-collision-light-${role.key}`);
    expect(found).toBeDefined();
    expect(found!.message).toContain(clashing[0]!.label);
  });

  it("says nothing when every role has its own colour", () => {
    // Red does not move, so nothing can collide with it.
    const draft = buildDraft(genericProfile, "x", "#f44336");
    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    expect(findings.filter((f) => f.id.startsWith("role-collision-"))).toHaveLength(0);
  });
});
