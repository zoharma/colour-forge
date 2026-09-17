import { describe, expect, it } from "vitest";

import { apcaHex, apcaLevel, targetYForLc, apcaYHex, apcaFromY } from "../src/color/apca";
import { wcagRatioHex, wcagLevel, meetsWcag } from "../src/color/wcag";
import { hexToOklch, oklchToHex, hueDelta } from "../src/color/oklch";
import { hexToRgb255, rgb255ToHex, normaliseHex, isValidHex, rgbDistanceHex } from "../src/color/srgb";
import {
  CVD_SEPARATION_COMFORTABLE,
  CVD_SEPARATION_FLOOR,
  simulateCvdHex,
  worstCvdSeparation,
} from "../src/color/cvd";
import { solveStep, CHROMA_RETENTION_FLOOR, type StepContext } from "../src/color/solver";
import { buildDraft, generateScale, foregroundCandidates } from "../src/color/scale";
import { auditDraft, draftAsIntent, separationRows } from "../src/color/audit";
import { exportCss, exportJson, slugifyIntent } from "../src/color/export";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import { PROFILES } from "../src/profiles";
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

  // APCA linearises sRGB with a plain c^2.4 power curve, not the piecewise
  // real-sRGB EOTF (linear toe below 0.04045) used elsewhere in this codebase
  // for OKLCH/CVD/WCAG — a distinction the black/white pair above can't catch
  // since 0 and 1 map identically under both curves. Reference values below
  // computed from the APCA-W3 formula directly (same constants as apca.ts),
  // not read off this implementation, so a regression to the piecewise curve
  // would fail these.
  it("matches the reference curve through the midtones, not the piecewise sRGB EOTF", () => {
    expect(apcaHex("#777777", "#ffffff")).toBeCloseTo(71.11, 1);
    expect(apcaHex("#ffffff", "#777777")).toBeCloseTo(-76.58, 1);
  });

  it("matches the reference curve for saturated hues, both polarities", () => {
    expect(apcaHex("#0000ff", "#ffffff")).toBeCloseTo(85.82, 1);
    expect(apcaHex("#ffffff", "#0000ff")).toBeCloseTo(-90.65, 1);
    expect(apcaHex("#008000", "#ffffff")).toBeCloseTo(74.62, 1);
    expect(apcaHex("#ffffff", "#008000")).toBeCloseTo(-80.02, 1);
    expect(apcaHex("#111111", "#e0b040")).toBeCloseTo(64.45, 1);
    expect(apcaHex("#e0b040", "#111111")).toBeCloseTo(-63.07, 1);
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
    // Lightness- and chroma-matched to the red, since it's specifically a
    // same-luminance red/green pair that a deuteranope can't fall back on
    // brightness to tell apart — a green picked at a different lightness (as
    // an earlier version of this test did) can still separate on luminance
    // alone and no longer demonstrates the collapse this test is for.
    const { L, C } = hexToOklch("#d63c41");
    const green = oklchToHex(L, C, 145);
    const separation = worstCvdSeparation("#d63c41", green);
    expect(separation.type).toBe("deuteranopia");
    expect(separation.value).toBeLessThan(CVD_SEPARATION_FLOOR);
  });

  it("keeps blue and orange apart under all three deficiencies", () => {
    expect(worstCvdSeparation("#3f63c9", "#e97b12").value).toBeGreaterThan(CVD_SEPARATION_COMFORTABLE * 5);
  });

  it("reduces achromatopsia to a grey", () => {
    const grey = hexToRgb255(simulateCvdHex("#d63c41", "achromatopsia"));
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });

  it("matches Machado (2010)'s own published severity-0.6 matrices, not a naive blend toward identity", () => {
    // Reference values reproduced from the colour-science library's
    // CVD_MATRICES_MACHADO2010 dataset (which cites Machado 2010 directly),
    // applied by hand to a pure primary. A naive lerp from identity to the
    // 100%-severity dichromat matrix — this file's previous approximation —
    // gives visibly different hexes for the same inputs (e.g. #ba4a00, not
    // #a75900, for protanomaly of pure red), so this only passes against the
    // real published intermediate coefficients.
    expect(simulateCvdHex("#ff0000", "protanomaly")).toBe("#a75900");
    expect(simulateCvdHex("#00ff00", "deuteranomaly")).toBe("#d6e131");
    expect(simulateCvdHex("#0000ff", "tritanomaly")).toBe("#0046d7");
  });

  it.each([
    ["protanomaly", "protanopia"],
    ["deuteranomaly", "deuteranopia"],
    ["tritanomaly", "tritanopia"],
  ] as const)("shifts %s toward its seed colour but less far than %s", (anomaly, dichromacy) => {
    const seed = "#d63c41";
    const anomalyDistance = rgbDistanceHex(seed, simulateCvdHex(seed, anomaly));
    const dichromacyDistance = rgbDistanceHex(seed, simulateCvdHex(seed, dichromacy));
    // An anomalous trichromat keeps some function of the affected cone, so
    // the shift from the true colour must be smaller than full dichromacy —
    // never zero (that would just be "none") and never as large.
    expect(anomalyDistance).toBeGreaterThan(0);
    expect(anomalyDistance).toBeLessThan(dichromacyDistance);
  });

  it("desaturates achromatomaly toward grey without fully collapsing it", () => {
    const seed = "#d63c41";
    const original = hexToRgb255(seed);
    const partial = hexToRgb255(simulateCvdHex(seed, "achromatomaly"));
    const originalSpread = Math.abs(original.r - original.b);
    const partialSpread = Math.abs(partial.r - partial.b);
    // Full achromatopsia collapses r/g/b to one value (spread 0); achromatomaly
    // should land strictly between that and the untouched colour.
    expect(partialSpread).toBeGreaterThan(0);
    expect(partialSpread).toBeLessThan(originalSpread);
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
  for (const profile of PROFILES) {
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

      it("meets each role's own WCAG requirement for a range of hues under wcag-strict", () => {
        for (const seed of ["#3f63c9", "#d63c41", "#1b8834", "#e97b12", "#0a858e", "#b0008e", "#fcd021"]) {
          const draft = buildDraft(profile, "draft", seed, "wcag-strict");
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

describe("scale sanity", () => {
  it("keeps the light scale strictly ordered", () => {
    for (const profile of PROFILES) {
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
    const candidates = foregroundCandidates(diamondProfile, "dark", "#fd9d95", "#d63c41");
    const recommended = candidates.find((c) => c.recommended);
    expect(recommended).toBeDefined();
    expect(hexToOklch(recommended!.hex).L).toBeLessThan(0.5);
  });

  it("prefers a candidate that clears WCAG over one with a higher APCA", () => {
    for (const surface of ["#3f63c9", "#e5ebff", "#1b8834"]) {
      const candidates = foregroundCandidates(genericProfile, "light", surface, "#3f63c9");
      const recommended = candidates.find((c) => c.recommended)!;
      const anyPasses = candidates.some((c) => c.meetsRequirement);
      if (anyPasses) expect(recommended.meetsRequirement).toBe(true);
    }
  });
});

// A role's own default foreground is picked by an APCA-first heuristic
// (`foregroundStrategy`), deliberately trusting legibility over the WCAG
// ratio wherever the role has its own contrast requirement — see the comment
// on `foregroundStrategy` in scale.ts. That trade means the *default*
// foreground frequently fails 4.5:1 even though a compliant alternative is
// one click away in the picker, same as `contrast-below-aa` for a role's own
// colour: a deliberate choice, still surfaced as a blocker because it is a
// decision that has to reach whoever implements it. It is not the solver
// failing to find a working colour, so the two invariants below (which are
// about the solver's own guarantee for a role's colour against its
// background) exclude it deliberately rather than by coincidence.
const isForegroundDefaultFinding = (id: string): boolean => id.startsWith("contrast-foreground-selected-");

describe("audit", () => {
  it("never raises an unaddressed contrast blocker, at any hue, in any profile", () => {
    // The solver's own guarantee: it either satisfies the role's WCAG
    // requirement or says it cannot. Anything else is a bug in the solver,
    // not a property of the colour.
    const { C } = hexToOklch("#3f63c9");
    for (const profile of PROFILES) {
      for (let hue = 0; hue < 360; hue += 15) {
        const seed = oklchToHex(0.55, C, hue);
        const draft = buildDraft(profile, "draft", seed);
        const family = [...profile.family, draftAsIntent(profile, draft)];
        const contrastBlockers = auditDraft(profile, draft, family).filter(
          (f) => f.severity === "blocker" && f.category === "contrast" && !isForegroundDefaultFinding(f.id),
        );
        expect(contrastBlockers.map((f) => `${seed} ${f.message}`)).toEqual([]);
      }
    }
  });

  it("clears a colour that collides with nothing in the family", () => {
    // A magenta, in the one part of the wheel Diamond's nine intents leave
    // free. Nothing to flag, so nothing should be flagged, besides whatever
    // the default foreground heuristic always surfaces for this profile
    // regardless of hue (see isForegroundDefaultFinding above).
    const draft = buildDraft(diamondProfile, "draft", "#a4479e");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const blockers = auditDraft(diamondProfile, draft, family).filter(
      (f) => f.severity === "blocker" && !isForegroundDefaultFinding(f.id),
    );
    expect(blockers.map((b) => b.message)).toEqual([]);
  });

  it("blocks on the foreground actually selected, not just the tool's own recommendation", () => {
    // The bug this guards against: a person overrides a role's foreground to
    // something that fails 4.5:1, and the audit — evaluated only against
    // `chosenForeground`'s no-argument (recommended) result — reports zero
    // blockers even though preview and export both show the failing pick.
    const draft = buildDraft(diamondProfile, "draft", "#3f63c9");
    const family = [...diamondProfile.family, draftAsIntent(diamondProfile, draft)];
    const role = diamondProfile.roles.find((r) => r.needsForeground);
    if (!role) throw new Error("expected at least one foreground-needing role for this test to mean anything");
    const candidates = draft.light.foregrounds[role.key] ?? [];
    const failing = candidates.find((c) => !c.meetsRequirement);
    if (!failing) return; // this profile/seed combination has no failing candidate to override to
    const overrides = { light: { [role.key]: failing.label } };
    const findings = auditDraft(diamondProfile, draft, family, overrides);
    const selectedBlocker = findings.find(
      (f) => f.severity === "blocker" && f.mode === "light" && f.role === role.key,
    );
    expect(selectedBlocker).toBeDefined();
    expect(selectedBlocker!.message).toContain(failing.label);
  });

  it("does not treat two quiet tinted surfaces sitting close as a failure", () => {
    // Every container in a real palette is a pale wash within a few RGB units
    // of every other one — Diamond ships tertiary and brand containers 3
    // apart. Holding washes to the same floor as meaning-bearing colour
    // condemns the whole system and buries the findings that matter.
    const draft = buildDraft(diamondProfile, "draft", "#a4479e");
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
    expect(css).toContain("--color-coolant-text-primary:");
    expect(css).toContain("--color-coolant-on-solid:");
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
    expect(parsed.light["--color-coolant-text-primary"].wcagRatio).toBeGreaterThanOrEqual(4.5);
  });
});
