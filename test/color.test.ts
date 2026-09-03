import { describe, expect, it } from "vitest";

import { apcaHex, apcaLevel, targetYForLc, apcaYHex, apcaFromY } from "../src/color/apca";
import { wcagRatioHex, wcagLevel, meetsWcag } from "../src/color/wcag";
import { hexToOklch, oklchToHex, hueDelta } from "../src/color/oklch";
import { hexToRgb255, rgb255ToHex, normaliseHex, isValidHex } from "../src/color/srgb";
import { simulateCvdHex, worstCvdSeparation } from "../src/color/cvd";
import { solveStep, CHROMA_RETENTION_FLOOR, type StepContext } from "../src/color/solver";
import { buildDraft, generateScale, foregroundCandidates } from "../src/color/scale";
import { auditDraft, draftAsIntent, separationRows } from "../src/color/audit";
import { exportCss, exportJson, slugifyIntent } from "../src/color/export";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import { WCAG_MINIMUM } from "../src/color/wcag";
import type { ModeKey } from "../src/profiles/types";

const MODES: ModeKey[] = ["light", "dark"];

describe("sRGB helpers", () => {
  it("round-trips hex through rgb", () => {
    expect(rgb255ToHex(hexToRgb255("#3f63c9"))).toBe("#3f63c9");
  });

  it("expands three-digit hex", () => {
    expect(normaliseHex("#abc")).toBe("#aabbcc");
  });

  it("validates hex input", () => {
    expect(isValidHex("#3f63c9")).toBe(true);
    expect(isValidHex("3f63c9")).toBe(true);
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("#gggggg")).toBe(false);
    expect(isValidHex("")).toBe(false);
  });
});

describe("APCA", () => {
  // Reference values from the APCA-W3 published test vectors.
  it("matches published black-on-white and white-on-black values", () => {
    expect(apcaHex("#000000", "#ffffff")).toBeCloseTo(106.04, 1);
    expect(apcaHex("#ffffff", "#000000")).toBeCloseTo(-107.88, 1);
  });

  it("signs dark-on-light positive and light-on-dark negative", () => {
    expect(apcaHex("#111111", "#eeeeee")).toBeGreaterThan(0);
    expect(apcaHex("#eeeeee", "#111111")).toBeLessThan(0);
  });

  it("returns zero for identical colours", () => {
    expect(apcaHex("#3f63c9", "#3f63c9")).toBe(0);
  });

  it("inverts: solving for a target Y reproduces the target Lc", () => {
    const bgY = apcaYHex("#ffffff");
    for (const target of [30, 45, 60, 75, 90]) {
      const y = targetYForLc(bgY, target, true);
      expect(apcaFromY(y, bgY)).toBeCloseTo(target, 0);
    }
  });

  it("inverts against a dark background too", () => {
    const bgY = apcaYHex("#0e1017");
    for (const target of [30, 45, 60, 75, 90]) {
      const y = targetYForLc(bgY, target, false);
      expect(Math.abs(apcaFromY(y, bgY))).toBeCloseTo(target, 0);
    }
  });

  it("bands Lc into the published usage levels", () => {
    expect(apcaLevel(90)).toBe("body");
    expect(apcaLevel(-65)).toBe("large");
    expect(apcaLevel(50)).toBe("non-text");
    expect(apcaLevel(20)).toBe("insufficient");
  });
});

describe("WCAG 2.2", () => {
  it("computes the canonical extremes", () => {
    expect(wcagRatioHex("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(wcagRatioHex("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(wcagRatioHex("#3f63c9", "#ffffff")).toBeCloseTo(wcagRatioHex("#ffffff", "#3f63c9"), 10);
  });

  it("bands ratios into levels", () => {
    expect(wcagLevel(21)).toBe("AAA");
    expect(wcagLevel(5)).toBe("AA");
    expect(wcagLevel(3.2)).toBe("AA Large");
    expect(wcagLevel(2)).toBe("fail");
  });

  it("treats a boundary ratio as meeting its requirement", () => {
    expect(meetsWcag(4.5, "body")).toBe(true);
    expect(meetsWcag(4.49, "body")).toBe(false);
    expect(meetsWcag(0, "none")).toBe(true);
  });
});

describe("OKLCH", () => {
  it("round-trips a hex through OKLCH", () => {
    const { L, C, H } = hexToOklch("#3f63c9");
    expect(oklchToHex(L, C, H)).toBe("#3f63c9");
  });

  it("holds hue while moving lightness", () => {
    const { C, H } = hexToOklch("#d63c41");
    const lighter = hexToOklch(oklchToHex(0.8, C * 0.5, H));
    expect(hueDelta(lighter.H, H)).toBeLessThan(2);
  });

  it("measures hue distance the short way round", () => {
    expect(hueDelta(350, 10)).toBeCloseTo(20, 5);
    expect(hueDelta(10, 350)).toBeCloseTo(20, 5);
  });
});

describe("CVD simulation", () => {
  it("leaves colours alone under normal vision", () => {
    expect(simulateCvdHex("#d63c41", "none")).toBe("#d63c41");
  });

  it("collapses red and green under deuteranopia", () => {
    const separation = worstCvdSeparation("#1b8834", "#d63c41");
    // These two are a legible pair to normal vision and famously not to a
    // deuteranope — the check exists precisely to catch this.
    expect(separation.value).toBeLessThan(60);
  });

  it("keeps blue and orange apart under all three deficiencies", () => {
    expect(worstCvdSeparation("#3f63c9", "#e97b12").value).toBeGreaterThan(60);
  });

  it("reduces achromatopsia to a grey", () => {
    const grey = hexToRgb255(simulateCvdHex("#d63c41", "achromatopsia"));
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });
});

describe("solver: APCA target with a WCAG floor", () => {
  const context = (hex: string, background: string, requirement: StepContext["requirement"]): StepContext => {
    const { H, C } = hexToOklch(hex);
    const backgroundY = apcaYHex(background);
    return {
      hue: H,
      chroma: C,
      backgroundHex: background,
      backgroundY,
      backgroundIsLight: backgroundY > 0.4,
      requirement,
      policy: "wcag-strict" as const,
    };
  };

  it("hits the APCA target when the hue can afford it", () => {
    const step = solveStep(context("#3f63c9", "#ffffff", "body"), 75);
    expect(step.verdict).toBe("apca-met");
    expect(Math.abs(step.lc)).toBeCloseTo(75, 0);
  });

  it("never returns a colour below its WCAG requirement unless nothing can meet it", () => {
    for (const seed of ["#3f63c9", "#d63c41", "#1b8834", "#e97b12", "#fcd021", "#0a858e", "#b0008e"]) {
      for (const background of ["#ffffff", "#f6f6f9", "#0e1017", "#161820"]) {
        for (const requirement of ["body", "non-text"] as const) {
          for (const target of [30, 51, 66, 75]) {
            const step = solveStep(context(seed, background, requirement), target);
            if (step.verdict === "below-both") continue;
            expect(step.wcagRatio).toBeGreaterThanOrEqual(WCAG_MINIMUM[requirement] - 1e-6);
          }
        }
      }
    }
  });

  it("eases off APCA rather than washing a saturated hue out", () => {
    // A yellow cannot reach a high Lc against white without losing its
    // chroma entirely — the case the hue protection exists for.
    const step = solveStep(context("#fcd021", "#ffffff", "non-text"), 75);
    expect(step.verdict).not.toBe("apca-met");
    expect(Math.abs(step.lc)).toBeLessThan(75);
  });

  it("keeps a protected step above the chroma retention floor", () => {
    const step = solveStep(context("#fcd021", "#ffffff", "none"), 75);
    expect(step.verdict).toBe("hue-protected");
    expect(step.chromaRetention).toBeGreaterThanOrEqual(CHROMA_RETENTION_FLOOR - 0.02);
  });

  it("keeps a dark-mode red from turning into a pale pink", () => {
    // The motivating case: pure APCA pushes a red on a dark background so
    // light it stops being red. Protection should hold real chroma while
    // still clearing 4.5:1.
    const step = solveStep(context("#d63c41", "#0e1017", "body"), 74);
    expect(step.wcagRatio).toBeGreaterThanOrEqual(4.5);
    expect(step.chroma).toBeGreaterThan(0.09);
    const { L } = hexToOklch(step.hex);
    expect(L).toBeLessThan(0.85); // not almost-white
  });

  it("does not trade contrast away for chroma it cannot recover", () => {
    // Near white the gamut holds almost no chroma, so a pale step scores a
    // terrible retention ratio while having nothing real to lose. Easing the
    // target off there pays full contrast and gains nothing, and used to
    // collapse neighbouring pale steps onto one colour.
    const pale = context("#3f63c9", "#fbfbfd", "none");
    const stepA = solveStep({ ...pale, chroma: pale.chroma * 0.24 }, 8);
    const stepB = solveStep({ ...pale, chroma: pale.chroma * 0.4 }, 16);
    expect(stepA.hex).not.toBe(stepB.hex);
    expect(Math.abs(stepA.lc)).toBeCloseTo(8, 0);
    expect(Math.abs(stepB.lc)).toBeCloseTo(16, 0);
  });

  it("raises contrast above the APCA target when WCAG demands more", () => {
    const step = solveStep(context("#3f63c9", "#ffffff", "body"), 20);
    expect(step.verdict).toBe("wcag-bound");
    expect(step.wcagRatio).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(step.lc)).toBeGreaterThan(20);
  });

  it("reports a hue that cannot meet its requirement rather than faking one", () => {
    // AAA-enhanced against a mid grey is out of reach at any lightness.
    const step = solveStep(context("#808080", "#767676", "enhanced"), 60);
    expect(step.verdict).toBe("below-both");
  });
});

describe("scale generation", () => {
  for (const profile of [genericProfile, diamondProfile]) {
    describe(profile.id, () => {
      it("produces one step per scale slot in both modes", () => {
        for (const mode of MODES) {
          expect(generateScale(profile, mode, "#3f63c9")).toHaveLength(profile.scaleSize);
        }
      });

      it("orders every scale monotonically away from its background", () => {
        for (const mode of MODES) {
          const scale = generateScale(profile, mode, "#3f63c9");
          const lcs = scale.map((s) => Math.abs(s.lc));
          for (let i = 1; i < lcs.length; i++) {
            // Hue protection can flatten a step, but never invert the ramp.
            expect(lcs[i]).toBeGreaterThanOrEqual((lcs[i - 1] as number) - 6);
          }
        }
      });

      it("gives every role a colour", () => {
        const draft = buildDraft(profile, "draft", "#3f63c9");
        for (const mode of MODES) {
          for (const role of profile.roles) {
            expect(draft[mode].roles[role.key]?.hex).toMatch(/^#[0-9a-f]{6}$/);
          }
        }
      });

      it("meets each role's own WCAG requirement for a range of hues", () => {
        for (const seed of ["#3f63c9", "#d63c41", "#1b8834", "#e97b12", "#0a858e", "#b0008e", "#fcd021"]) {
          const draft = buildDraft(profile, "draft", seed);
          for (const mode of MODES) {
            for (const role of profile.roles) {
              const step = draft[mode].roles[role.key];
              if (!step || step.verdict === "below-both") continue;
              expect(
                step.wcagRatio,
                `${profile.id}/${mode}/${role.key}/${seed} (${step.hex}) ${step.verdict}`,
              ).toBeGreaterThanOrEqual(WCAG_MINIMUM[role.requirement] - 1e-6);
            }
          }
        }
      });
    });
  }
});

describe("fidelity to real shipped tokens", () => {
  // The Diamond curves were fitted to DiamondDSTokens.css, so regenerating a
  // shipped intent from its own seed should land near the real value. This is
  // the check that catches a solver change quietly drifting the output.
  const near = (a: string, b: string, tolerance: number) => {
    const oa = hexToOklch(a);
    const ob = hexToOklch(b);
    expect(Math.abs(oa.L - ob.L), `${a} vs ${b} lightness`).toBeLessThan(tolerance);
  };

  it("reproduces Diamond's shipped primary container and base", () => {
    const draft = buildDraft(diamondProfile, "primary", "#3f63c9");
    near(draft.light.roles.container!.hex, "#e5ebff", 0.03);
    near(draft.light.roles.base!.hex, "#2a4db8", 0.06);
  });

  it("keeps the light scale strictly ordered", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const mode of MODES) {
        const scale = generateScale(profile, mode, "#3f63c9");
        const lightness = scale.map((s) => hexToOklch(s.hex).L);
        for (let i = 1; i < lightness.length; i++) {
          expect(lightness[i], `${profile.id}/${mode} step ${i} duplicates step ${i - 1}`).not.toBeCloseTo(
            lightness[i - 1] as number,
            3,
          );
        }
      }
    }
  });
});

describe("foreground pairing", () => {
  it("picks a dark foreground for a light surface regardless of page mode", () => {
    // A dark-mode surface role is often a light pastel; the choice has to
    // follow the surface, not the mode.
    const scale = generateScale(diamondProfile, "dark", "#d63c41");
    const candidates = foregroundCandidates(diamondProfile, "dark", "#fd9d95", scale);
    const recommended = candidates.find((c) => c.recommended);
    expect(recommended).toBeDefined();
    expect(hexToOklch(recommended!.hex).L).toBeLessThan(0.5);
  });

  it("prefers a candidate that clears WCAG over one with a higher APCA", () => {
    const scale = generateScale(genericProfile, "light", "#3f63c9");
    for (const surface of ["#3f63c9", "#e5ebff", "#1b8834"]) {
      const candidates = foregroundCandidates(genericProfile, "light", surface, scale);
      const recommended = candidates.find((c) => c.recommended)!;
      const anyPasses = candidates.some((c) => c.meetsRequirement);
      if (anyPasses) expect(recommended.meetsRequirement).toBe(true);
    }
  });
});

describe("audit", () => {
  it("never raises a contrast blocker, at any hue, in either profile", () => {
    // The solver's own guarantee: it either satisfies the role's WCAG
    // requirement or says it cannot. Anything else is a bug in the solver,
    // not a property of the colour.
    const { C } = hexToOklch("#3f63c9");
    for (const profile of [genericProfile, diamondProfile]) {
      for (let hue = 0; hue < 360; hue += 15) {
        const seed = oklchToHex(0.55, C, hue);
        const draft = buildDraft(profile, "draft", seed);
        const family = [...profile.family, draftAsIntent(profile, draft)];
        const contrastBlockers = auditDraft(profile, draft, family).filter(
          (f) => f.severity === "blocker" && f.category === "contrast",
        );
        expect(contrastBlockers.map((f) => `${seed} ${f.message}`)).toEqual([]);
      }
    }
  });

  it("clears a colour that collides with nothing in the family", () => {
    // Diamond's nine intents leave very little of the wheel free: sweeping
    // every 5 degrees, this is the only hue with no collision at all. The
    // seed used to be #a4479e, which cleared the floor by 0.9 and stopped
    // clearing it once the chroma curve started following each hue's cusp.
    // Worth knowing why: more chroma in a magenta means more red, protanopia
    // removes red, so a *more* saturated magenta collapses closer to blue.
    const draft = buildDraft(diamondProfile, "draft", "#b33f7f");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const blockers = auditDraft(diamondProfile, draft, family).filter((f) => f.severity === "blocker");
    expect(blockers.map((b) => b.message)).toEqual([]);
  });

  it("does not treat two quiet tinted surfaces sitting close as a failure", () => {
    // Every container in a real palette is a pale wash within a few RGB units
    // of every other one — Diamond ships tertiary and brand containers 3
    // apart. Holding washes to the same floor as meaning-bearing colour
    // condemns the whole system and buries the findings that matter.
    const draft = buildDraft(diamondProfile, "draft", "#b33f7f");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const containerBlockers = auditDraft(diamondProfile, draft, family).filter(
      (f) => f.category === "cvd" && f.role === "container" && f.severity === "blocker",
    );
    expect(containerBlockers).toEqual([]);
  });

  it("still holds meaning-bearing roles to the tighter floor", () => {
    const solidRow = separationRows(diamondProfile, diamondProfile.family).find(
      (r) => r.role === "solid" && r.mode === "dark",
    );
    const containerRow = separationRows(diamondProfile, diamondProfile.family).find(
      (r) => r.role === "container" && r.mode === "dark",
    );
    expect(solidRow!.floor).toBeGreaterThan(containerRow!.floor);
  });

  it("flags a colour that collides with an existing intent under CVD", () => {
    // Seeded almost exactly on Diamond's shipped success green.
    const draft = buildDraft(diamondProfile, "newthing", "#1b8834");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const findings = auditDraft(diamondProfile, draft, family);
    expect(findings.some((f) => f.category === "cvd" && f.severity === "blocker")).toBe(true);
  });

  it("sorts blockers ahead of warnings and notes", () => {
    const draft = buildDraft(diamondProfile, "newthing", "#1b8834");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const severities = auditDraft(diamondProfile, draft, family).map((f) => f.severity);
    const ranked = [...severities].sort(
      (a, b) => ({ blocker: 0, warning: 1, note: 2 })[a] - ({ blocker: 0, warning: 1, note: 2 })[b],
    );
    expect(severities).toEqual(ranked);
  });

  it("says nothing about family parity when there is no family", () => {
    const empty = { ...genericProfile, family: [] };
    const draft = buildDraft(empty, "draft", "#3f63c9");
    const findings = auditDraft(empty, draft, [draftAsIntent(empty, draft)]);
    expect(findings.every((f) => f.category !== "cvd")).toBe(true);
  });
});

describe("export", () => {
  it("writes the profile's own token names", () => {
    const draft = buildDraft(diamondProfile, "coolant", "#0a858e");
    const css = exportCss(diamondProfile, draft);
    expect(css).toContain("--ds-coolant:");
    expect(css).toContain("--ds-coolant-container:");
    expect(css).toContain("--ds-on-coolant-solid:");
    expect(css).toContain('[data-mode="dark"]');
  });

  it("uses the generic naming convention for the generic profile", () => {
    const draft = buildDraft(genericProfile, "coolant", "#0a858e");
    const css = exportCss(genericProfile, draft);
    expect(css).toContain("--color-coolant-text:");
    expect(css).toContain("--color-coolant-on-fill:");
  });

  it("emits only valid hex values", () => {
    const draft = buildDraft(diamondProfile, "coolant", "#0a858e");
    const declarations = exportCss(diamondProfile, draft).match(/:\s*(#[0-9a-fA-F]{6});/g) ?? [];
    expect(declarations.length).toBeGreaterThan(10);
  });

  it("makes an intent name safe to use as a custom property", () => {
    expect(slugifyIntent("  Beam Status ")).toBe("beam-status");
    expect(slugifyIntent("!!!")).toBe("draft");
    expect(slugifyIntent("")).toBe("draft");
  });

  it("carries the measurements into JSON output", () => {
    const draft = buildDraft(genericProfile, "coolant", "#0a858e");
    const parsed = JSON.parse(exportJson(genericProfile, draft));
    expect(parsed.intent).toBe("coolant");
    expect(parsed.light["--color-coolant-text"].wcagRatio).toBeGreaterThanOrEqual(4.5);
  });
});
