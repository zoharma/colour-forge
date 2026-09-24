import { describe, expect, it } from "vitest";

import { buildDraft, generateScale, type Draft } from "../src/color/scale";
import { hexToOklch } from "../src/color/oklch";
import { solveStep, effectiveRequirement, type ContrastPolicy } from "../src/color/solver";
import { wcagRatioHex, permittedUsage, oneLevelDown, meetsWcag, type WcagRequirement } from "../src/color/wcag";
import { genericProfile } from "../src/profiles/generic";
import { muiProfile } from "../src/profiles/mui";
import { carbonProfile } from "../src/profiles/carbon";
import { PROFILES, BASELINE_BACKGROUND } from "../src/profiles";
import { REFERENCE_PALETTE, hueCircle } from "./reference-palettes";
import { stepContext } from "./step-context";

const POLICIES: ContrastPolicy[] = ["wcag-strict", "wcag-relaxed", "hue-first"];
const REQUIREMENTS: WcagRequirement[] = ["body", "large", "non-text", "enhanced"];

/** Hues whose identity lives in a band of lightness that 4.5:1 sits outside
 *  of. Forcing conformance on these produces a brown or an olive.
 *
 *  Checked against a synthetic `body`-requirement target rather than a real
 *  profile's `text`/`base` role: this has already been rebuilt twice as the
 *  solver and curves improved — first a gamut-math fix changed which hues
 *  needed the exemption, then moving `text`/`base` onto a step that stays
 *  inside every Material hue's gamut removed the conflict from both
 *  profiles' text roles entirely (a genuinely better outcome for those
 *  roles, but it kept leaving this test with nothing real to check against).
 *  A fixed synthetic context — full seed chroma, a plain light background,
 *  `body` required — tests the exemption *mechanism* directly instead of
 *  wherever a role happens to sit today, so a future curve or role change
 *  can't quietly invalidate it again. */
const CONFLICTED = [
  ["amber", "#ffc107"],
  ["lime", "#cddc39"],
  ["yellow", "#ffeb3b"],
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

const BODY_TEXT_BG = "#fbfbfd";
const DARK_TEXT_BG = "#121212";
const BODY_TEXT_TARGET_LC = 75;

/** The shared synthetic harness every test in this file solves through —
 *  generalised over hue, requirement and background polarity so the sweeps
 *  below can cover the whole hue circle rather than a handful of named
 *  swatches. */
const stepFor = (
  hue: number,
  chroma: number,
  requirement: WcagRequirement,
  policy: ContrastPolicy,
  backgroundIsLight: boolean,
) => {
  const backgroundHex = backgroundIsLight ? BODY_TEXT_BG : DARK_TEXT_BG;
  return solveStep(stepContext(hue, chroma, backgroundHex, requirement, policy), BODY_TEXT_TARGET_LC);
};

const textStep = (seed: string, policy: ContrastPolicy) => {
  const { H, C } = hexToOklch(seed);
  return stepFor(H, C, "body", policy, true);
};

const HUE_CIRCLE_CHROMAS: readonly (readonly [label: string, chroma: number])[] = [
  ["moderate", hexToOklch("#3f63c9").C],
  // Exceeds the sRGB gamut at most hues, so this also exercises hue
  // protection/chroma retention, not just the gamut interior.
  ["gamut-edge", 0.3],
];

type HueCircleSample = {
  requirement: WcagRequirement;
  backgroundIsLight: boolean;
  hue: number;
  chromaLabel: string;
  step: ReturnType<typeof solveStep>;
};

function sweepHueCircle(policy: ContrastPolicy): HueCircleSample[] {
  const samples: HueCircleSample[] = [];
  for (const requirement of REQUIREMENTS) {
    for (const backgroundIsLight of [true, false]) {
      for (const [chromaLabel, chroma] of HUE_CIRCLE_CHROMAS) {
        for (const hue of hueCircle()) {
          samples.push({
            requirement,
            backgroundIsLight,
            hue,
            chromaLabel,
            step: stepFor(hue, chroma, requirement, policy, backgroundIsLight),
          });
        }
      }
    }
  }
  return samples;
}

/** Computed once per policy so the two tests sweeping "wcag-relaxed" don't redo it. */
const HUE_CIRCLE_SWEEPS: Record<"wcag-strict" | "wcag-relaxed", HueCircleSample[]> = {
  "wcag-strict": sweepHueCircle("wcag-strict"),
  "wcag-relaxed": sweepHueCircle("wcag-relaxed"),
};

describe("contrast policy", () => {
  it("defaults to a balance between APCA and WCAG 2.2, not either extreme", () => {
    expect(buildDraft(genericProfile, "x", "#ff9800").policy).toBe("wcag-relaxed");
  });

  it("never returns a colour below the requirement under the strict policy", () => {
    for (const profile of PROFILES) {
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

  it("never drops below the policy's own effective requirement, across the full hue circle in both modes", () => {
    // Rule 1 of the golden thread: `effectiveRequirement` names the live
    // floor for a policy, and the solver must honour it everywhere.
    // `below-both` is the one legitimate exception — nothing at that hue
    // clears even the eased floor.
    //
    // `hue-first` is swept separately below: its effective requirement is
    // always "none", so this would assert nothing for it.
    for (const policy of ["wcag-strict", "wcag-relaxed"] as const) {
      for (const { requirement, backgroundIsLight, hue, chromaLabel, step } of HUE_CIRCLE_SWEEPS[policy]) {
        if (step.verdict === "below-both") continue;
        const effective = effectiveRequirement(requirement, policy);
        expect(
          meetsWcag(step.wcagRatio, effective),
          `${policy}/${requirement}/${backgroundIsLight ? "light" : "dark"} bg/hue ${hue}/${chromaLabel} chroma`,
        ).toBe(true);
      }
    }
  });

  it("gives hue-first no floor at all, for every requirement", () => {
    // The other half of rule 1: "More APCA" never trades chroma for
    // conformance, so its effective requirement is always "none".
    for (const requirement of REQUIREMENTS) {
      expect(effectiveRequirement(requirement, "hue-first")).toBe("none");
    }
  });

  it("under the default policy, a real miss never drops more than one level, across the full hue circle", () => {
    // Rule 2: generalises the fixed-hue check above (line ~106) into a swept
    // property, over the same `sweepHueCircle` domain as rule 1 above.
    // `wcag-relaxed` promises a *named* level down, not an unbounded one —
    // this is the guarantee that promise actually holds.
    let misses = 0;
    for (const { requirement, backgroundIsLight, hue, chromaLabel, step } of HUE_CIRCLE_SWEEPS["wcag-relaxed"]) {
      if (step.verdict === "below-both" || step.conformance === "meets") continue;
      misses++;
      expect(
        meetsWcag(step.wcagRatio, oneLevelDown(requirement)),
        `${requirement}/${backgroundIsLight ? "light" : "dark"} bg/hue ${hue}/${chromaLabel} chroma`,
      ).toBe(true);
    }
    // Guard against the test passing because the sweep never actually
    // exercised the relaxation it exists to check.
    expect(misses).toBeGreaterThan(0);
  });

  it("marks a deliberate miss as chosen, not as an unavoidable failure", () => {
    const step = textStep("#ffc107", "hue-first");
    expect(step.conformance).toBe("below-by-choice");
    expect(step.requirement).toBe("body");
    expect(step.effectiveRequirement).toBe("none");
  });

  it("names what a below-AA colour is actually legal for", () => {
    const step = textStep("#ffc107", "wcag-relaxed");
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
      const step = draft.light.roles.textPrimary!;
      expect(step.wcagRatio).toBeCloseTo(
        wcagRatioHex(step.hex, genericProfile.modes.light.background),
        6,
      );
    }
  });
});

describe("the shared solving background", () => {
  it("defaults every profile's background to BASELINE_BACKGROUND", () => {
    for (const profile of PROFILES) {
      expect(profile.modes.light.background).toBe(BASELINE_BACKGROUND.light);
      expect(profile.modes.dark.background).toBe(BASELINE_BACKGROUND.dark);
    }
  });

  it("solves the same scale step to the same hex across profiles, when no role there carries a requirement", () => {
    // Step index 2 (light) is either unclaimed or claimed by a
    // requirement:"none" role in every current profile — see
    // generic.ts/diamond.ts's "surfaceStrong"/"containerHigh" and
    // material3.ts/carbon.ts/mui.ts's silence on that index. With the same
    // curve and the same background now shared by every profile, nothing
    // should be able to make them diverge here.
    const seed = "#9c27b0";
    const hexes = PROFILES.map((profile) => generateScale(profile, "light", seed)[2]!.hex);
    for (const hex of hexes) expect(hex).toBe(hexes[0]);
  });

  it("still lets a role's own WCAG requirement diverge a profile from the shared baseline", () => {
    // The concrete case that motivated the shared baseline: generic's
    // step 5 (light index 4, "container", requirement "none") and Carbon's
    // same index ("border", requirement "non-text") used to differ partly
    // because of a different background, and partly because of this real
    // per-role requirement. Sharing the background removed the first cause
    // — this asserts the second, legitimate one is still there.
    const seed = "#9c27b0";
    const genericStep = generateScale(genericProfile, "light", seed)[4]!;
    const carbonStep = generateScale(carbonProfile, "light", seed)[4]!;
    expect(carbonStep.hex).not.toBe(genericStep.hex);
    expect(carbonStep.verdict).toBe("wcag-bound");
    expect(genericStep.verdict).toBe("apca-met");
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
    const css = exportCss(genericProfile, buildDraft(genericProfile, "warning", "#ffc107", "hue-first"));
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
    expect(muiProfile.family.map((f) => f.name)).toEqual([
      "primary",
      "secondary",
      "error",
      "warning",
      "info",
      "success",
    ]);
  });

  it("gives every intent a value for every separation role", () => {
    for (const intent of muiProfile.family) {
      for (const mode of ["light", "dark"] as const) {
        for (const role of muiProfile.separationRoles) {
          expect(intent[mode][role], `${intent.name}/${mode}/${role}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("is honest that the per-role values are derived rather than shipped", () => {
    expect(muiProfile.provenance).toMatch(/derived by this tool/i);
  });
});

describe("the generic profile has no comparison family", () => {
  it("ships an empty family, honestly", () => {
    expect(genericProfile.family).toEqual([]);
  });
});

describe("the exemption is never free", () => {
  // Both tests below share this; lazy so filtering to one doesn't pay for both.
  type DraftPair = { profile: (typeof PROFILES)[number]; seed: string; relaxed: Draft; strict: Draft };
  let draftPairsCache: DraftPair[] | undefined;
  const draftPairs = (): DraftPair[] =>
    (draftPairsCache ??= PROFILES.flatMap((profile) =>
      REFERENCE_PALETTE.map(({ hex: seed }) => ({
        profile,
        seed,
        relaxed: buildDraft(profile, "x", seed, "hue-first"),
        strict: buildDraft(profile, "x", seed, "wcag-strict"),
      })),
    ));

  it("only drops below a requirement where doing so buys visible chroma", () => {
    // The invariant that keeps a loosened policy from being a blanket
    // downgrade: every role that came out below its requirement by choice
    // must be meaningfully more colourful than the conformant alternative.
    //
    // Swept over both real reference palettes rather than synthetic hues at
    // a fixed chroma. Whether a hue can hold its requirement depends on
    // where its gamut peaks in lightness, and a normalised sweep flattens
    // exactly that — an earlier version of this test passed while never
    // once triggering the exemption it was meant to check.
    let exemptions = 0;

    for (const { profile, seed, relaxed, strict } of draftPairs()) {
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

    // Guard against the test passing because nothing was ever exempted.
    expect(exemptions).toBeGreaterThan(0);
  });

  it("leaves the strict policy fully conformant across the whole palette", () => {
    for (const { profile, strict } of draftPairs()) {
      for (const mode of ["light", "dark"] as const) {
        for (const role of profile.roles) {
          const step = strict[mode].roles[role.key];
          if (!step) continue;
          expect(step.conformance).not.toBe("below-by-choice");
        }
      }
    }
  });
});
