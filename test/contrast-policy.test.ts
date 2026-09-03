import { describe, expect, it } from "vitest";

import { buildDraft } from "../src/color/scale";
import { hexToOklch } from "../src/color/oklch";
import { MATERIAL_500 } from "../src/profiles/material";
import { wcagRatioHex, permittedUsage, oneLevelDown } from "../src/color/wcag";
import type { ContrastPolicy } from "../src/color/solver";
import { genericProfile } from "../src/profiles/generic";
import { diamondProfile } from "../src/profiles/diamond";

const POLICIES: ContrastPolicy[] = ["wcag-strict", "wcag-relaxed", "hue-first"];

/** Hues whose identity lives in a band of lightness that 4.5:1 sits outside
 *  of. Forcing conformance on these produces a brown or an olive. */
const CONFLICTED = [
  ["orange", "#ff9800"],
  ["amber", "#ffc107"],
  ["lime", "#cddc39"],
] as const;

/** Hues with room to reach the criterion and stay themselves. The policy
 *  must not touch these — a relaxation that degrades a palette which was
 *  already fine is worse than no relaxation at all. */
const UNCONFLICTED = [
  ["blue", "#2196f3"],
  ["green", "#4caf50"],
  ["indigo", "#3f51b5"],
  ["teal", "#009688"],
] as const;

const textStep = (seed: string, policy: ContrastPolicy) =>
  buildDraft(genericProfile, "x", seed, policy).light.roles.text!;

describe("contrast policy", () => {
  it("defaults to holding WCAG 2.2", () => {
    expect(buildDraft(genericProfile, "x", "#ff9800").policy).toBe("wcag-strict");
  });

  it("never returns a colour below the requirement under the strict policy", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const [, seed] of [...CONFLICTED, ...UNCONFLICTED]) {
        const draft = buildDraft(profile, "x", seed, "wcag-strict");
        for (const mode of ["light", "dark"] as const) {
          for (const role of profile.roles) {
            const step = draft[mode].roles[role.key];
            if (!step || step.verdict === "below-both") continue;
            expect(step.conformance, `${profile.id}/${mode}/${role.key}/${seed}`).toBe("meets");
          }
        }
      }
    }
  });

  it("leaves hues alone that can meet the criterion and stay themselves", () => {
    // The guard that matters most: loosening the policy must not quietly
    // degrade colours that were never in conflict.
    for (const [name, seed] of UNCONFLICTED) {
      const strict = textStep(seed, "wcag-strict");
      for (const policy of POLICIES) {
        const step = textStep(seed, policy);
        expect(step.hex, `${name} changed under ${policy}`).toBe(strict.hex);
        expect(step.conformance).toBe("meets");
      }
    }
  });

  it("recovers real chroma for hues that cannot do both", () => {
    for (const [name, seed] of CONFLICTED) {
      const strict = hexToOklch(textStep(seed, "wcag-strict").hex);
      const kept = hexToOklch(textStep(seed, "hue-first").hex);
      expect(kept.C, `${name} gained no chroma`).toBeGreaterThan(strict.C + 0.02);
      expect(kept.L, `${name} did not get lighter`).toBeGreaterThan(strict.L);
    }
  });

  it("steps down to a named level rather than dropping without bound", () => {
    for (const [name, seed] of CONFLICTED) {
      const step = textStep(seed, "wcag-relaxed");
      // `text` requires 4.5:1, so one level down is 3:1 — and it should land
      // near that line, not somewhere arbitrary below it.
      expect(step.wcagRatio, `${name}`).toBeGreaterThanOrEqual(3);
      expect(step.wcagRatio, `${name}`).toBeLessThan(4.5);
    }
  });

  it("marks a deliberate miss as chosen, not as an unavoidable failure", () => {
    const step = textStep("#ff9800", "hue-first");
    expect(step.conformance).toBe("below-by-choice");
    expect(step.requirement).toBe("body");
    expect(step.effectiveRequirement).toBe("none");
  });

  it("names what a below-AA colour is actually legal for", () => {
    const step = textStep("#ff9800", "wcag-relaxed");
    expect(permittedUsage(step.wcagRatio)).toContain("large text");
    expect(permittedUsage(9)).toContain("AAA");
    expect(permittedUsage(1.5)).toContain("Decoration only".toLowerCase().slice(0, 10));
  });

  it("steps requirements down the standard's own ladder", () => {
    expect(oneLevelDown("enhanced")).toBe("body");
    expect(oneLevelDown("body")).toBe("large");
    expect(oneLevelDown("large")).toBe("none");
    expect(oneLevelDown("non-text")).toBe("none");
    expect(oneLevelDown("none")).toBe("none");
  });

  it("keeps the reported ratio honest against the real background", () => {
    for (const policy of POLICIES) {
      const draft = buildDraft(genericProfile, "x", "#ff9800", policy);
      const step = draft.light.roles.text!;
      expect(step.wcagRatio).toBeCloseTo(
        wcagRatioHex(step.hex, genericProfile.modes.light.background),
        6,
      );
    }
  });
});

describe("full-scale export", () => {
  it("emits every step, including the ones no role claims", async () => {
    const { exportScaleCss } = await import("../src/color/export");
    const draft = buildDraft(genericProfile, "coolant", "#0a858e");
    const css = exportScaleCss(genericProfile, draft);
    // Numbered 1..12, the way people count a scale — not 0..11.
    expect(css).not.toContain("--color-coolant-step-0:");
    for (let i = 1; i <= genericProfile.scaleSize; i++) {
      expect(css).toContain(`--color-coolant-step-${i}:`);
    }
    expect(css).toContain(`--color-coolant-step-${genericProfile.scaleSize}:`);
    expect(css.match(/#[0-9a-f]{6}/g)?.length).toBe(genericProfile.scaleSize * 2);
  });

  it("does not number steps in a way that collides with Material shades", () => {
    // `--x-500` meaning "step 5 of 12" next to a Material 500 seed picker is a
    // trap; the token has to be unmistakably an index.
    return import("../src/color/export").then(({ exportScaleCss }) => {
      const css = exportScaleCss(genericProfile, buildDraft(genericProfile, "coolant", "#0a858e"));
      expect(css).not.toMatch(/--color-coolant-\d00:/);
    });
  });

  it("writes a deliberate AA miss into the role export, not just the UI", async () => {
    const { exportCss } = await import("../src/color/export");
    const css = exportCss(genericProfile, buildDraft(genericProfile, "warning", "#ff9800", "hue-first"));
    expect(css).toContain("kept for hue");
    expect(css).toContain("non-colour cue");
  });

  it("leaves no such comment when everything conforms", async () => {
    const { exportCss } = await import("../src/color/export");
    const css = exportCss(genericProfile, buildDraft(genericProfile, "ocean", "#2196f3", "hue-first"));
    expect(css).not.toContain("kept for hue");
  });
});

describe("the MUI default family", () => {
  it("carries MUI's six default intents", () => {
    expect(genericProfile.family.map((f) => f.name)).toEqual([
      "primary",
      "secondary",
      "error",
      "warning",
      "info",
      "success",
    ]);
  });

  it("gives every intent a value for every separation role", () => {
    for (const intent of genericProfile.family) {
      for (const mode of ["light", "dark"] as const) {
        for (const role of genericProfile.separationRoles) {
          expect(intent[mode][role], `${intent.name}/${mode}/${role}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("is honest that the per-role values are derived rather than shipped", () => {
    expect(genericProfile.provenance).toMatch(/derived by this tool/i);
  });
});

describe("the exemption is never free", () => {
  it("only drops below a requirement where doing so buys visible chroma", () => {
    // The invariant that keeps a loosened policy from being a blanket
    // downgrade: every role that came out below its requirement by choice
    // must be meaningfully more colourful than the conformant alternative.
    //
    // Swept over the real Material palette rather than synthetic hues at a
    // fixed chroma. Whether a hue can hold its requirement depends on where
    // its gamut peaks in lightness, and a normalised sweep flattens exactly
    // that — an earlier version of this test passed while never once
    // triggering the exemption it was meant to check.
    let exemptions = 0;

    for (const profile of [genericProfile, diamondProfile]) {
      for (const { hex: seed } of MATERIAL_500) {
        const relaxed = buildDraft(profile, "x", seed, "hue-first");
        const strict = buildDraft(profile, "x", seed, "wcag-strict");

        for (const mode of ["light", "dark"] as const) {
          for (const role of profile.roles) {
            const loose = relaxed[mode].roles[role.key];
            const tight = strict[mode].roles[role.key];
            if (!loose || !tight) continue;
            if (loose.conformance !== "below-by-choice") continue;

            exemptions++;
            expect(
              loose.chroma - tight.chroma,
              `${profile.id}/${mode}/${role.key} @${seed} gave up ${role.requirement} for nothing`,
            ).toBeGreaterThanOrEqual(0.02 - 1e-9);
          }
        }
      }
    }

    // Guard against the test passing because nothing was ever exempted.
    expect(exemptions).toBeGreaterThan(0);
  });

  it("leaves the strict policy fully conformant across the whole palette", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const { hex: seed } of MATERIAL_500) {
        const draft = buildDraft(profile, "x", seed, "wcag-strict");
        for (const mode of ["light", "dark"] as const) {
          for (const role of profile.roles) {
            const step = draft[mode].roles[role.key];
            if (!step) continue;
            expect(step.conformance).not.toBe("below-by-choice");
          }
        }
      }
    }
  });
});
