import { describe, expect, it } from "vitest";

import { generateScale, MIN_STEP_LIGHTNESS_GAP } from "../src/color/scale";
import { hexToOklch } from "../src/color/oklch";
import { genericProfile } from "../src/profiles/generic";
import { diamondProfile } from "../src/profiles/diamond";
import { MATERIAL_500 } from "../src/profiles/material";
import type { ModeKey } from "../src/profiles/types";

const MODES: ModeKey[] = ["light", "dark"];

/** Perceptual distance in OKLab. Two ramp steps under about 0.03 read as the
 *  same swatch at a glance. */
function deltaE(a: string, b: string): number {
  const x = hexToOklch(a);
  const y = hexToOklch(b);
  const cartesian = (o: typeof x) =>
    [o.C * Math.cos((o.H * Math.PI) / 180), o.C * Math.sin((o.H * Math.PI) / 180)] as const;
  const [ax, ay] = cartesian(x);
  const [bx, by] = cartesian(y);
  return Math.hypot(x.L - y.L, ax - bx, ay - by);
}

/** A scale has to read as ordered steps. Solving each step for contrast alone
 *  does not give that, because APCA Lc depends on chroma as well as lightness:
 *  before the ramp passes were added, these same checks found 26 inversions
 *  and 148 adjacent pairs below dE 0.03 across this sweep. A yellow's step 6
 *  sat at L 0.908 between neighbours at 0.658, and its steps 5 and 7 came out
 *  the same colour. */
describe("ramp ordering and spacing", () => {
  it("never doubles back, at any hue, in either profile or mode", () => {
    const inversions: string[] = [];

    for (const profile of [genericProfile, diamondProfile]) {
      for (const { name, hex } of MATERIAL_500) {
        for (const mode of MODES) {
          const scale = generateScale(profile, mode, hex);
          for (let i = 1; i < scale.length; i++) {
            const previous = hexToOklch(scale[i - 1]!.hex).L;
            const current = hexToOklch(scale[i]!.hex).L;
            const ordered = mode === "light" ? current < previous : current > previous;
            if (!ordered) {
              inversions.push(
                `${profile.id}/${mode}/${name} step ${i + 1}: L ${previous.toFixed(3)} then ${current.toFixed(3)}`,
              );
            }
          }
        }
      }
    }

    expect(inversions).toEqual([]);
  });

  it("keeps every adjacent pair perceptibly apart", () => {
    const tooClose: string[] = [];

    for (const profile of [genericProfile, diamondProfile]) {
      for (const { name, hex } of MATERIAL_500) {
        for (const mode of MODES) {
          const scale = generateScale(profile, mode, hex);
          for (let i = 1; i < scale.length; i++) {
            const d = deltaE(scale[i - 1]!.hex, scale[i]!.hex);
            if (d < 0.03) {
              tooClose.push(`${profile.id}/${mode}/${name} steps ${i}-${i + 1}: dE ${d.toFixed(3)}`);
            }
          }
        }
      }
    }

    expect(tooClose).toEqual([]);
  });

  it("never produces two identical steps", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const { name, hex } of MATERIAL_500) {
        for (const mode of MODES) {
          const hexes = generateScale(profile, mode, hex).map((s) => s.hex);
          expect(new Set(hexes).size, `${profile.id}/${mode}/${name}: ${hexes.join(" ")}`).toBe(
            hexes.length,
          );
        }
      }
    }
  });

  it("holds the minimum lightness gap where it had to intervene", () => {
    for (const profile of [genericProfile, diamondProfile]) {
      for (const mode of MODES) {
        const scale = generateScale(profile, mode, "#ffeb3b");
        for (let i = 1; i < scale.length; i++) {
          const gap = Math.abs(scale[i]!.L - scale[i - 1]!.L);
          expect(gap, `${profile.id}/${mode} steps ${i}-${i + 1}`).toBeGreaterThanOrEqual(
            MIN_STEP_LIGHTNESS_GAP - 1e-6,
          );
        }
      }
    }
  });

  it("only ever moves a step away from the background, never toward it", () => {
    // The ramp passes must not be able to walk a step back under the WCAG
    // floor the solver just satisfied, so they are only allowed to add
    // contrast. Every step's own requirement still has to hold.
    for (const profile of [genericProfile, diamondProfile]) {
      for (const { hex } of MATERIAL_500) {
        for (const mode of MODES) {
          const scale = generateScale(profile, mode, hex);
          for (const role of profile.roles) {
            const step = scale[role.index[mode]];
            if (!step || step.verdict === "below-both") continue;
            const minimum = { body: 4.5, large: 3, "non-text": 3, enhanced: 7, none: 0 }[
              role.requirement
            ];
            expect(step.wcagRatio, `${profile.id}/${mode}/${role.key}/${hex}`).toBeGreaterThanOrEqual(
              minimum - 1e-6,
            );
          }
        }
      }
    }
  });
});
