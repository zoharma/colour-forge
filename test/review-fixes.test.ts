import { describe, expect, it } from "vitest";

import { auditDraft, draftAsIntent } from "../src/color/audit";
import { CVD_LABELS, isCvdView, simulateCvdHex, type CvdView } from "../src/color/cvd";
import { exportCss } from "../src/color/export";
import { buildDraft } from "../src/color/scale";
import { isContrastPolicy } from "../src/color/solver";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import { MATERIAL_500 } from "../src/profiles/material";
import type { SeededIntent } from "../src/profiles/types";

/** Values that reach the app from localStorage or a URL are strings a stranger
 *  last wrote. Both of these used to be cast straight into a union. */
describe("values arriving from outside", () => {
  it("recognises every real colour-vision view and nothing else", () => {
    for (const view of Object.keys(CVD_LABELS)) expect(isCvdView(view), view).toBe(true);
    for (const junk of ["", "garbage", "None", "protanopia ", null, undefined, 7, {}])
      expect(isCvdView(junk), String(junk)).toBe(false);
  });

  it("rejects inherited property names", () => {
    // The first version of this guard used `in`, which walks the prototype
    // chain, so "constructor" passed and then indexed the matrix table with a
    // function — the same blank page the guard was added to prevent, reached
    // by a different route.
    for (const key of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
      expect(isCvdView(key), key).toBe(false);
      expect(() => simulateCvdHex("#ff0000", key as CvdView), key).not.toThrow();
      expect(simulateCvdHex("#ff0000", key as CvdView), key).toBe("#ff0000");
    }
  });

  it("never throws simulating an unknown view", () => {
    // This was a blank page that survived reloads: the bad value was still in
    // localStorage on the way back, so every load threw in the first render.
    for (const junk of ["garbage", "", "PROTANOPIA"]) {
      expect(() => simulateCvdHex("#ff0000", junk as CvdView), junk).not.toThrow();
      expect(simulateCvdHex("#ff0000", junk as CvdView)).toBe("#ff0000");
    }
  });

  it("still simulates the real views", () => {
    expect(simulateCvdHex("#ff0000", "deuteranopia")).not.toBe("#ff0000");
    expect(simulateCvdHex("#ff0000", "none")).toBe("#ff0000");
  });

  it("recognises every contrast policy and nothing else", () => {
    for (const p of ["wcag-strict", "wcag-relaxed", "hue-first"]) expect(isContrastPolicy(p), p).toBe(true);
    for (const junk of ["", "strict", "WCAG-STRICT", null, 3]) expect(isContrastPolicy(junk), String(junk)).toBe(false);
  });
});

/** The live draft used to be recognised by having the same name as the draft,
 *  which made a display name the user edits load-bearing. */
describe("the draft row is identified by its marker, not its name", () => {
  const draft = buildDraft(genericProfile, "draft", "#7b4fb8");

  it("keeps a family row that happens to share the draft's name", () => {
    const family: SeededIntent[] = [
      { name: "draft", light: { fill: "#123456" }, dark: { fill: "#123456" } },
      ...genericProfile.family,
    ];
    const withDraft: SeededIntent[] = [...family, { ...draftAsIntent(genericProfile, draft), isDraft: true }];

    // What the family table hands back, and what the app keeps from it.
    const kept = withDraft.filter((f) => !f.isDraft);
    expect(kept).toHaveLength(family.length);
    expect(kept.some((f) => f.name === "draft" && f.light.fill === "#123456")).toBe(true);
    expect(withDraft.filter((f) => f.isDraft)).toHaveLength(1);
  });

  it("counts a same-named row as a sibling rather than as the draft itself", () => {
    // Filtering siblings by name would drop this row from every separation
    // check while still showing it in the table.
    const collide: SeededIntent = { name: "draft", light: { fill: "#7b4fb8" }, dark: { fill: "#7b4fb8" } };
    const findings = auditDraft(genericProfile, draft, [
      collide,
      { ...draftAsIntent(genericProfile, draft), isDraft: true },
    ]);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("never marks a profile's own intents as the draft", () => {
    for (const profile of [genericProfile, diamondProfile])
      for (const intent of profile.family) expect(intent.isDraft, `${profile.id}/${intent.name}`).toBeUndefined();
  });
});

describe("the export states the reason a step actually had", () => {
  it("says a pinned colour was pinned, not that it was kept for hue", () => {
    // #ffeb3b cannot carry a text role on a light page at any lightness, so
    // pinning it there is exactly the case that used to be mislabelled.
    const role = genericProfile.roles.find((r) => r.requirement === "body")!;
    const pinned = buildDraft(genericProfile, "x", "#ffeb3b", "wcag-strict", {
      mode: "light",
      roleKey: role.key,
    });
    const step = pinned.light.roles[role.key]!;
    expect(step.verdict).toBe("pinned");
    expect(step.conformance).not.toBe("meets");

    const css = exportCss(genericProfile, pinned);
    expect(css).toContain("was pinned to this role");
    expect(css).not.toContain("kept for hue");
  });

  it("never states a reason that contradicts the step's verdict", () => {
    // The general form, swept rather than sampled: whatever states turn out to
    // be reachable, the sentence written into the token file has to match the
    // one the solver recorded. "Kept for hue" is true of the policy exemption
    // and false of a step no lightness could satisfy.
    const reasons: Record<string, string> = {
      pinned: "was pinned to this role",
      "below-both": "no lightness of this hue reaches it",
    };
    let checked = 0;

    for (const profile of [genericProfile, diamondProfile]) {
      // A spread of hues rather than all 19: enough to reach every reachable
      // verdict (asserted below) without solving 500 palettes per run.
      for (const hex of ["#ffeb3b", "#f44336", "#2196f3", "#009688", "#9c27b0"]) {
        for (const role of profile.roles) {
          for (const mode of ["light", "dark"] as const) {
            const draft = buildDraft(profile, "x", hex, "wcag-strict", { mode, roleKey: role.key });
            const step = draft[mode].roles[role.key];
            if (!step || step.conformance === "meets") continue;

            const css = exportCss(profile, draft);
            const expected = reasons[step.verdict] ?? "kept for hue";
            expect(css, `${profile.id}/${mode}/${role.key}/${hex} (${step.verdict})`).toContain(expected);
            for (const [verdict, sentence] of Object.entries(reasons))
              if (verdict !== step.verdict && sentence !== expected)
                expect(css, `${profile.id}/${mode}/${role.key}/${hex}`).not.toContain(sentence);
            checked++;
          }
        }
      }
    }

    // The sweep has to have found the states, or it proves nothing.
    expect(checked, "no non-conforming steps reached").toBeGreaterThan(10);
  });
});

describe("a spaced step keeps the verdict that explains its colour", () => {
  it("never reports a step no lightness can satisfy as one kept for hue", () => {
    // Spacing used to overwrite every verdict with "ramp-spaced", so a
    // below-both step exported as "kept for hue" — nothing was traded away
    // for a hue that cannot reach the criterion anywhere.
    for (const profile of [genericProfile, diamondProfile]) {
      for (const hex of ["#ffeb3b", "#cddc39", "#00bcd4", "#f44336"]) {
        for (const mode of ["light", "dark"] as const) {
          const draft = buildDraft(profile, "x", hex);
          for (const step of draft[mode].scale) {
            if (step.verdict !== "ramp-spaced") continue;
            // The one verdict spacing is allowed to replace had nothing else
            // to say, so a spaced step must never be hiding a real failure.
            expect(step.conformance, `${profile.id}/${mode}/${step.hex}`).toBe("meets");
          }
        }
      }
    }
  });

  it("keeps hue-protected and wcag-bound notes through spacing", () => {
    // These carry audit notes and a badge tone; overwriting them made both
    // disappear from steps that had genuinely eased off or been held out.
    const verdicts = new Set<string>();
    for (const profile of [genericProfile, diamondProfile])
      for (const { hex } of MATERIAL_500)
        for (const mode of ["light", "dark"] as const)
          for (const step of buildDraft(profile, "x", hex)[mode].scale) verdicts.add(step.verdict);

    expect(verdicts.has("hue-protected")).toBe(true);
    expect(verdicts.has("wcag-bound")).toBe(true);
  });
});

describe("the fill-placement warning", () => {
  it("is not raised for a fill that never moved", () => {
    // A pinned fill sits on its declared step. It used to collect "Fill is at
    // its brightest here" plus an invented explanation about a hue peaking in
    // lightness, on top of the correct pinned blocker.
    const role = genericProfile.roles.find((r) => r.wantsSaturation)!;
    const draft = buildDraft(genericProfile, "x", "#ffe98a", "wcag-strict", {
      mode: "light",
      roleKey: role.key,
    });
    const step = draft.light.roles[role.key]!;
    expect(step.stepIndex, "expected the pin to hold the declared step").toBe(role.index.light);

    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    expect(findings.some((f) => f.id === `fill-placement-light-${role.key}`)).toBe(false);
  });
});

describe("CVD findings follow the marked draft", () => {
  it("does not blame the draft for a same-named family row's collisions", () => {
    const draft = buildDraft(diamondProfile, "error", "#2a00ff");
    const asIntent = draftAsIntent(diamondProfile, draft);
    const findings = auditDraft(diamondProfile, draft, [...diamondProfile.family, asIntent]);

    // Every CVD finding must name a pair the draft is actually in.
    for (const f of findings.filter((x) => x.category === "cvd")) {
      const role = diamondProfile.roles.find((r) => r.key === f.role);
      const mine = asIntent[f.mode!][f.role!];
      expect(mine, `${f.id} names a role the draft has no colour for`).toBeTruthy();
      expect(role, f.id).toBeDefined();
    }
  });
});
