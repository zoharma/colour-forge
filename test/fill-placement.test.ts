import { describe, expect, it } from "vitest";

import { buildDraft } from "../src/color/scale";
import { hueCusp, hexToOklch } from "../src/color/oklch";
import { auditDraft, draftAsIntent } from "../src/color/audit";
import { genericProfile } from "../src/profiles/generic";
import { diamondProfile } from "../src/profiles/diamond";
import { MATERIAL_500 } from "../src/profiles/material";

/** Hues whose gamut peaks light, so the profile's fixed fill step lands well
 *  below their cusp and hands back a muddy version of the colour. */
const LIGHT_PEAKED = ["#ffeb3b", "#cddc39", "#009688", "#4caf50"];
/** Hues that already peak near the fill step and should not move. */
const MID_PEAKED = ["#f44336", "#e91e63"];

const fill = (seed: string, placement: "fixed" | "cusp") =>
  buildDraft(genericProfile, "x", seed, "wcag-strict", undefined, placement).light.roles.fill!;

describe("cusp-aware chroma", () => {
  it("finds a plausible cusp for every hue", () => {
    for (const { name, hex } of MATERIAL_500) {
      const cusp = hueCusp(hexToOklch(hex).H);
      expect(cusp.L, name).toBeGreaterThan(0.3);
      expect(cusp.L, name).toBeLessThan(0.98);
      expect(cusp.C, name).toBeGreaterThan(0);
    }
  });

  it("puts yellow's peak somewhere light and red's somewhere mid", () => {
    // The whole premise: a fixed chroma peak cannot serve both.
    expect(hueCusp(hexToOklch("#ffeb3b").H).L).toBeGreaterThan(0.8);
    expect(hueCusp(hexToOklch("#f44336").H).L).toBeLessThan(0.65);
  });
});

describe("fill placement", () => {
  it("defaults to the profile's own step", () => {
    const draft = buildDraft(genericProfile, "x", "#ffeb3b");
    expect(draft.fillPlacement).toBe("fixed");
    expect(draft.light.roles.fill!.hex).toBe(fill("#ffeb3b", "fixed").hex);
  });

  it("gives light-peaked hues a more saturated fill when following the hue", () => {
    for (const seed of LIGHT_PEAKED) {
      const before = fill(seed, "fixed");
      const after = fill(seed, "cusp");
      expect(after.chroma, seed).toBeGreaterThan(before.chroma + 0.01);
    }
  });

  it("leaves mid-peaked hues where they were", () => {
    for (const seed of MID_PEAKED) {
      expect(fill(seed, "cusp").hex, seed).toBe(fill(seed, "fixed").hex);
    }
  });

  it("never trades to a less saturated step", () => {
    // The step nearest the cusp can be one the curve asks almost no chroma
    // of, and moving there would be a downgrade dressed up as an improvement.
    for (const { name, hex } of MATERIAL_500) {
      for (const profile of [genericProfile, diamondProfile]) {
        const key = profile === genericProfile ? "fill" : "solid";
        for (const mode of ["light", "dark"] as const) {
          const before = buildDraft(profile, "x", hex, "wcag-strict", undefined, "fixed")[mode].roles[key]!;
          const after = buildDraft(profile, "x", hex, "wcag-strict", undefined, "cusp")[mode].roles[key]!;
          expect(after.chroma, `${profile.id}/${mode}/${name}`).toBeGreaterThanOrEqual(before.chroma - 1e-9);
        }
      }
    }
  });

  it("never moves a role that is not a filled one", () => {
    for (const seed of LIGHT_PEAKED) {
      const before = buildDraft(genericProfile, "x", seed, "wcag-strict", undefined, "fixed");
      const after = buildDraft(genericProfile, "x", seed, "wcag-strict", undefined, "cusp");
      for (const role of genericProfile.roles) {
        if (role.wantsSaturation) continue;
        expect(after.light.roles[role.key]!.hex, `${seed}/${role.key}`).toBe(
          before.light.roles[role.key]!.hex,
        );
      }
    }
  });

  it("reports the step a role actually took, not the one it was declared at", () => {
    // The label and the colour have to agree. They did not: the row printed
    // the role's declared step while showing the colour of the step it had
    // moved to, so a fill reading "step 7" was showing step 4's colour.
    for (const { name, hex } of MATERIAL_500) {
      for (const profile of [genericProfile, diamondProfile]) {
        const key = profile === genericProfile ? "fill" : "solid";
        for (const mode of ["light", "dark"] as const) {
          const draft = buildDraft(profile, "x", hex, "wcag-strict", undefined, "cusp");
          const scale = draft[mode].scale;
          for (const role of profile.roles) {
            const step = draft[mode].roles[role.key]!;
            expect(step.stepIndex, `${profile.id}/${mode}/${role.key}/${name}`).toBeGreaterThanOrEqual(0);
            expect(scale[step.stepIndex]!.hex, `${profile.id}/${mode}/${role.key}/${name}`).toBe(step.hex);
          }
          void key;
        }
      }
    }
  });

  it("says a bright fill needs a border, rather than silently shipping it", () => {
    const draft = buildDraft(genericProfile, "x", "#ffeb3b", "wcag-strict", undefined, "cusp");
    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    const flagged = findings.find((f) => f.id.startsWith("fill-placement-"));
    expect(flagged?.severity).toBe("warning");
    expect(flagged?.detail).toContain("border");
    expect(flagged?.detail).toContain("1.4.11");
  });

  it("stays quiet when the brighter fill still clears its requirement", () => {
    // Orange gets brighter and still makes 3:1, so there is nothing to say.
    const draft = buildDraft(genericProfile, "x", "#ff9800", "wcag-strict", undefined, "cusp");
    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    expect(findings.filter((f) => f.id.startsWith("fill-placement-"))).toEqual([]);
    expect(draft.light.roles.fill!.wcagRatio).toBeGreaterThanOrEqual(3);
  });
});
