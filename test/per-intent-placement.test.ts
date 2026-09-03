import { describe, expect, it } from "vitest";

import { draftAsIntent, regenerateIntent } from "../src/color/audit";
import { exportCss, exportJson } from "../src/color/export";
import { buildDraft, type FillPlacement } from "../src/color/scale";
import type { ContrastPolicy } from "../src/color/solver";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import type { IntentRecipe } from "../src/profiles/types";

/** The recipe's unions are spelled out in the profile types rather than
 *  imported from the solver, so a profile stays plain data. That is only safe
 *  while the two agree, and nothing else would notice if they drifted. */
describe("recipe types track the solver's", () => {
  it("accepts every contrast policy and every placement", () => {
    const policies: ContrastPolicy[] = ["wcag-strict", "wcag-relaxed", "hue-first"];
    const placements: FillPlacement[] = ["fixed", "cusp"];
    for (const policy of policies) {
      for (const fillPlacement of placements) {
        const recipe: IntentRecipe = { seed: "#7b4fb8", policy, fillPlacement };
        // And back the other way: a recipe is usable as solver arguments.
        const draft = buildDraft(
          genericProfile,
          "x",
          recipe.seed,
          recipe.policy,
          recipe.pin,
          recipe.fillPlacement,
        );
        expect(draft.policy).toBe(policy);
        expect(draft.fillPlacement).toBe(fillPlacement);
      }
    }
  });
});

describe("what carries a recipe", () => {
  it("records the whole draft, not just its seed", () => {
    const pin = { mode: "light", roleKey: "fill" } as const;
    const draft = buildDraft(genericProfile, "grape", "#7b4fb8", "hue-first", pin, "cusp");
    const intent = draftAsIntent(genericProfile, draft);

    expect(intent.recipe).toEqual({
      seed: "#7b4fb8",
      policy: "hue-first",
      fillPlacement: "cusp",
      pin,
    });
  });

  it("omits the pin when nothing was pinned", () => {
    const intent = draftAsIntent(genericProfile, buildDraft(genericProfile, "x", "#7b4fb8"));
    expect(intent.recipe?.pin).toBeUndefined();
  });

  it("gives every generic family row one, since this tool derived them", () => {
    for (const intent of genericProfile.family) {
      expect(intent.recipe, intent.name).toBeDefined();
      expect(intent.recipe?.fillPlacement, intent.name).toBe("fixed");
    }
  });

  it("gives Diamond's shipped intents none, since it did not", () => {
    // These are real tokens read out of sci-react-ui. Handing them a recipe
    // would invite the UI to overwrite measured values with derived ones.
    for (const intent of diamondProfile.family) {
      expect(intent.recipe, intent.name).toBeUndefined();
    }
  });
});

describe("regenerating one intent", () => {
  it("refuses an intent it did not generate", () => {
    for (const intent of diamondProfile.family) {
      expect(regenerateIntent(diamondProfile, intent, "cusp"), intent.name).toBeUndefined();
    }
  });

  it("round-trips exactly at the placement it already had", () => {
    for (const intent of genericProfile.family) {
      const again = regenerateIntent(genericProfile, intent, "fixed");
      expect(again, intent.name).toBeDefined();
      expect(again!.name, intent.name).toBe(intent.name);
      expect(again!.light, intent.name).toEqual(intent.light);
      expect(again!.dark, intent.name).toEqual(intent.dark);
    }
  });

  it("moves only the filled role when the placement changes", () => {
    // Yellow is the case the control exists for: light-peaked, so its fill
    // has somewhere brighter to go while nothing else does.
    const original = draftAsIntent(genericProfile, buildDraft(genericProfile, "amber", "#ffeb3b"));
    const followed = regenerateIntent(genericProfile, original, "cusp")!;

    expect(followed.light.fill).not.toBe(original.light.fill);
    for (const role of genericProfile.roles) {
      if (role.wantsSaturation) continue;
      expect(followed.light[role.key], role.key).toBe(original.light[role.key]);
      expect(followed.dark[role.key], role.key).toBe(original.dark[role.key]);
    }
  });

  it("keeps the rest of the recipe rather than adopting current settings", () => {
    const pin = { mode: "dark", roleKey: "fill" } as const;
    const frozen = draftAsIntent(
      genericProfile,
      buildDraft(genericProfile, "grape", "#7b4fb8", "hue-first", pin, "fixed"),
    );
    const moved = regenerateIntent(genericProfile, frozen, "cusp")!;

    expect(moved.recipe).toEqual({ ...frozen.recipe, fillPlacement: "cusp" });
    // And the pin is honoured on the way through, not merely recorded.
    expect(moved.dark.fill).toBe("#7b4fb8");
  });

  it("survives being regenerated repeatedly", () => {
    const start = draftAsIntent(genericProfile, buildDraft(genericProfile, "amber", "#ffeb3b"));
    const there = regenerateIntent(genericProfile, start, "cusp")!;
    const back = regenerateIntent(genericProfile, there, "fixed")!;
    expect(back.light).toEqual(start.light);
    expect(back.dark).toEqual(start.dark);
  });
});

describe("what the export says about a moved fill", () => {
  const fillVar = "--color-lime-fill";
  const cusp = buildDraft(genericProfile, "lime", "#cddc39", "wcag-strict", undefined, "cusp");
  const fixed = buildDraft(genericProfile, "lime", "#cddc39", "wcag-strict", undefined, "fixed");

  it("names the step it took and the step it was declared at", () => {
    const css = exportCss(genericProfile, cusp);
    const declared = genericProfile.roles.find((r) => r.wantsSaturation)!.index.light;
    expect(css).toContain(`not the profile's step ${declared + 1}`);
    expect(exportCss(genericProfile, fixed)).not.toContain("Follows this hue's peak");
  });

  it("records the obligation the fill picked up, in the file itself", () => {
    // Not gated behind the measurements option: a border is something whoever
    // implements this has to do, and it has to survive the paste.
    const css = exportCss(genericProfile, cusp);
    expect(css).toContain("Needs a border");
    expect(css).toContain("1.4.11");
  });

  it("scores the token against its role's requirement, not its step's", () => {
    // The step a fill moves onto usually has no requirement of its own, so
    // taking the step's answer would file a 1.75:1 fill as conformant.
    const json = JSON.parse(exportJson(genericProfile, cusp));
    const entry = json.light[fillVar];
    const role = genericProfile.roles.find((r) => r.wantsSaturation)!;

    expect(json.fillPlacement).toBe("cusp");
    expect(entry.requirement).toBe(role.requirement);
    expect(entry.wcagRatio).toBeLessThan(3);
    expect(entry.conformance).toBe("below-by-choice");
    expect(entry.step).not.toBe(role.index.light + 1);
  });

  it("leaves a fill that stayed put reported exactly as before", () => {
    const entry = JSON.parse(exportJson(genericProfile, fixed)).light[fillVar];
    const role = genericProfile.roles.find((r) => r.wantsSaturation)!;
    expect(entry.step).toBe(role.index.light + 1);
    expect(entry.conformance).toBe("meets");
  });
});
