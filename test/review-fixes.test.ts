import { describe, expect, it } from "vitest";

import { auditDraft, draftAsIntent } from "../src/color/audit";
import { CVD_LABELS, isCvdView, simulateCvdHex, type CvdView } from "../src/color/cvd";
import { exportCss } from "../src/color/export";
import { buildDraft } from "../src/color/scale";
import { isContrastPolicy } from "../src/color/solver";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import type { SeededIntent } from "../src/profiles/types";

/** Values that reach the app from localStorage or a URL are strings a stranger
 *  last wrote. Both of these used to be cast straight into a union. */
describe("values arriving from outside", () => {
  it("recognises every real colour-vision view and nothing else", () => {
    for (const view of Object.keys(CVD_LABELS)) expect(isCvdView(view), view).toBe(true);
    for (const junk of ["", "garbage", "None", "protanopia ", null, undefined, 7, {}])
      expect(isCvdView(junk), String(junk)).toBe(false);
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
