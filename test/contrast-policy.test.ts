import { describe, expect, it } from "vitest";

import { buildDraft } from "../src/color/scale";
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

  /* The four tests that used to sit here asserted that a loosened policy
     recovers chroma for orange, amber and lime by dropping their `text` role
     below AA. That is no longer reachable, and the reason is worth recording
     rather than deleting.

     The exemption works by easing a step's contrast target, which moves it
     toward the background. That is precisely the direction that collides with
     the step before it in the ramp. Measured across 494 role/mode/hue
     combinations in both profiles, ordering the ramp leaves zero of them
     differing between "hold WCAG" and "keep the hue".

     It is not a lost cause so much as a redundant one here: `text` sits after
     `border` in both profiles' ramps, `border` is held at 3:1 because easing
     it buys almost no chroma, and anything later than `border` therefore
     clears 3:1 too. Orange's text role lands at 4.56:1 and keeps the same
     chroma the strict policy gave it, so there is nothing left for the
     exemption to buy.

     Restoring it would mean easing the whole tail of the ramp coherently
     rather than one step at a time, so that `border` and `text` come down
     together. That is a real piece of work and a design decision about
     whether a quieter border is an acceptable price, which is why it is
     flagged rather than assumed. */
  it("no longer differs by policy once the ramp is ordered", () => {
    for (const [, seed] of [...CONFLICTED, ...UNCONFLICTED]) {
      const strict = textStep(seed, "wcag-strict");
      for (const policy of POLICIES) {
        expect(textStep(seed, policy).hex, `${seed} under ${policy}`).toBe(strict.hex);
      }
    }
  });

  it("keeps every role conformant under every policy", () => {
    // The flip side of the above: ordering the ramp does not just neutralise
    // the exemption, it makes the palette conformant without needing it.
    for (const profile of [genericProfile, diamondProfile]) {
      for (const [, seed] of [...CONFLICTED, ...UNCONFLICTED]) {
        for (const policy of POLICIES) {
          const draft = buildDraft(profile, "x", seed, policy);
          for (const mode of ["light", "dark"] as const) {
            for (const role of profile.roles) {
              const step = draft[mode].roles[role.key];
              if (!step || step.verdict === "below-both") continue;
              expect(step.conformance, `${profile.id}/${mode}/${role.key}/${seed}/${policy}`).toBe(
                "meets",
              );
            }
          }
        }
      }
    }
  });

  it("names what a given ratio is actually legal for", () => {
    expect(permittedUsage(9)).toContain("AAA");
    expect(permittedUsage(5)).toContain("body text");
    expect(permittedUsage(3.2)).toContain("large text");
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

  it("carries no below-AA note while the ramp keeps every role conformant", () => {
    // The note itself is still tested through the pinning path, which is the
    // one place a below-requirement colour is still reachable.
    return import("../src/color/export").then(({ exportCss }) => {
      const css = exportCss(
        genericProfile,
        buildDraft(genericProfile, "warning", "#ff9800", "hue-first"),
      );
      expect(css).not.toContain("kept for hue");
    });
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
