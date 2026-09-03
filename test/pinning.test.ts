import { describe, expect, it } from "vitest";

import { buildDraft } from "../src/color/scale";
import { suggestPin } from "../src/color/pin";
import { diamondProfile } from "../src/profiles/diamond";
import { genericProfile } from "../src/profiles/generic";
import type { ModeKey } from "../src/profiles/types";

const MODES: ModeKey[] = ["light", "dark"];

describe("pinning the seed to a role", () => {
  it("is off unless asked for", () => {
    const draft = buildDraft(diamondProfile, "x", "#3f63c9");
    expect(draft.pin).toBeUndefined();
    for (const mode of MODES) {
      for (const step of draft[mode].scale) expect(step.verdict).not.toBe("pinned");
    }
  });

  it("places the seed on the pinned role exactly", () => {
    const draft = buildDraft(diamondProfile, "x", "#3f63c9", "wcag-strict", {
      mode: "light",
      roleKey: "solid",
    });
    expect(draft.light.roles.solid?.hex).toBe("#3f63c9");
    expect(draft.light.roles.solid?.verdict).toBe("pinned");
  });

  it("pins one mode and leaves the other completely alone", () => {
    // The reason an earlier attempt at this failed: a single hex cannot be
    // right against both a white page and a near-black one, so pinning both
    // leaves whichever mode nobody was looking at wrong.
    const seed = "#3f63c9";
    const unpinned = buildDraft(diamondProfile, "x", seed);
    const pinned = buildDraft(diamondProfile, "x", seed, "wcag-strict", {
      mode: "light",
      roleKey: "solid",
    });

    expect(pinned.dark.scale.map((s) => s.hex)).toEqual(unpinned.dark.scale.map((s) => s.hex));
    expect(pinned.light.scale.map((s) => s.hex)).not.toEqual(unpinned.light.scale.map((s) => s.hex));
  });

  it("keeps the pinned mode a ramp rather than the seed plus unrelated colours", () => {
    // Anchored at both ends and never collapsing two steps onto one colour.
    // A plain shift of the curve does exactly that: the pale end clamps at
    // zero and the first steps become the same colour.
    for (const roleKey of ["fill", "text", "border", "surface"]) {
      const draft = buildDraft(genericProfile, "x", "#2196f3", "wcag-strict", {
        mode: "light",
        roleKey,
      });
      const hexes = draft.light.scale.map((s) => s.hex);
      expect(new Set(hexes).size, `${roleKey}: duplicate steps ${hexes.join(" ")}`).toBe(hexes.length);

      const unpinned = buildDraft(genericProfile, "x", "#2196f3");
      // The ends belong to the profile, not to the pin.
      expect(draft.light.scale[0]!.targetLc).toBeCloseTo(unpinned.light.scale[0]!.targetLc, 5);
      expect(draft.light.scale.at(-1)!.targetLc).toBeCloseTo(unpinned.light.scale.at(-1)!.targetLc, 5);
    }
  });

  it("says so when a pin makes the ramp double back", async () => {
    const { auditDraft, draftAsIntent } = await import("../src/color/audit");
    const draft = buildDraft(genericProfile, "x", "#2196f3", "wcag-strict", {
      mode: "light",
      roleKey: "fill",
    });
    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    const inversion = findings.find((f) => f.id.startsWith("ramp-inversion-"));
    expect(inversion?.severity).toBe("warning");
    expect(inversion?.detail).toContain("WCAG floor");
  });

  it("leaves an unpinned ramp with nothing to report", async () => {
    const { auditDraft, draftAsIntent } = await import("../src/color/audit");
    for (const profile of [genericProfile, diamondProfile]) {
      for (const seed of ["#3f63c9", "#0a858e", "#d63c41"]) {
        const draft = buildDraft(profile, "x", seed);
        const findings = auditDraft(profile, draft, [draftAsIntent(profile, draft)]);
        expect(
          findings.filter((f) => f.id.startsWith("ramp-inversion-")),
          `${profile.id}/${seed}`,
        ).toEqual([]);
      }
    }
  });

  it("still measures a pinned colour rather than exempting it", () => {
    // Pinning decides the colour; it does not make it conformant. A brand
    // colour that cannot carry the role it was pinned to is the most useful
    // thing the tool can report.
    const draft = buildDraft(genericProfile, "x", "#ffeb3b", "wcag-strict", {
      mode: "light",
      roleKey: "text",
    });
    const step = draft.light.roles.text!;
    expect(step.hex).toBe("#ffeb3b");
    expect(step.verdict).toBe("pinned");
    expect(step.conformance).not.toBe("meets");
    expect(step.wcagRatio).toBeLessThan(4.5);
  });

  it("reports an unusable pinned colour as a blocker that names the way out", async () => {
    const { auditDraft, draftAsIntent } = await import("../src/color/audit");
    const draft = buildDraft(genericProfile, "x", "#ffeb3b", "wcag-strict", {
      mode: "light",
      roleKey: "text",
    });
    const findings = auditDraft(genericProfile, draft, [draftAsIntent(genericProfile, draft)]);
    const pinned = findings.find((f) => f.id.startsWith("contrast-pinned-"));
    expect(pinned?.severity).toBe("blocker");
    expect(pinned?.detail).toContain("different role");
  });

  it("works for every role in every mode without breaking the scale", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const mode of MODES) {
        for (const role of profile.roles) {
          const draft = buildDraft(profile, "x", "#0a858e", "wcag-strict", { mode, roleKey: role.key });
          expect(draft[mode].roles[role.key]?.hex, `${profile.id}/${mode}/${role.key}`).toBe("#0a858e");
          expect(draft[mode].scale).toHaveLength(profile.scaleSize);
          for (const step of draft[mode].scale) expect(step.hex).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });
});

describe("suggesting where a colour sits", () => {
  it("suggests without applying anything", () => {
    const suggestion = suggestPin(diamondProfile, "#3f63c9");
    expect(suggestion).toBeDefined();
    expect(buildDraft(diamondProfile, "x", "#3f63c9").pin).toBeUndefined();
  });

  it("puts Diamond's shipped solids near a solid-ish role", () => {
    // The curves were fitted so a shipped value lands on its own role; the
    // suggestion is only useful if it agrees.
    const suggestion = suggestPin(diamondProfile, "#3f63c9");
    expect(suggestion?.distance).toBeLessThan(12);
  });

  it("skips targets APCA cannot measure", () => {
    // A container's target is a placeholder of 2; every colour is equally
    // "close" to it, so it carries no signal and must not win by default.
    for (const seed of ["#3f63c9", "#ffeb3b", "#e5ebff", "#0a858e"]) {
      const suggestion = suggestPin(diamondProfile, seed);
      expect(suggestion?.targetLc).toBeGreaterThanOrEqual(10);
    }
  });
});
