import { it } from "vitest";
import { expect } from "vitest";
import { solveStep } from "../src/color/solver";
import { hexToOklch, oklchToHex } from "../src/color/oklch";
import { apcaYHex, apcaHex, targetYForLc } from "../src/color/apca";
import { wcagRatioHex } from "../src/color/wcag";
import { oklchToGamutSafeLinear } from "../src/color/oklch";
import { apcaY } from "../src/color/apca";

const bg = "#0e1017";
const target = 64; // Diamond's dark `base` target

/** Hit the APCA target exactly, with no hue protection: bisect lightness at
 *  the full requested chroma. This is what a pure-APCA tool produces. */
function pureApca(H: number, C: number) {
  const targetY = targetYForLc(apcaYHex(bg), target, false);
  let lo = 0, hi = 1, L = 0.5;
  for (let i = 0; i < 28; i++) {
    L = (lo + hi) / 2;
    if (apcaY(oklchToGamutSafeLinear(L, C, H).lin) > targetY) hi = L; else lo = L;
  }
  return oklchToHex(L, C, H);
}

/** The case the whole contrast model exists for: a red on a dark background.
 *  Pure APCA insists on a lightness that has stopped being red; the balanced
 *  solve keeps the colour and leans on WCAG 2.2 as the floor instead. Diamond
 *  landing between the two is worth noting — a designer tuning by hand also
 *  pulled back from what pure APCA demanded. */
it("keeps a dark-mode red red, without dropping under WCAG 2.2", () => {
  const { H, C } = hexToOklch("#d63c41");
  const balanced = solveStep(
    { hue: H, chroma: C, backgroundHex: bg, backgroundY: apcaYHex(bg), backgroundIsLight: false, requirement: "body" },
    target,
  );
  for (const [label, hex] of [
    ["pure APCA at Lc 64", pureApca(H, C)],
    ["balanced solve", balanced.hex],
    ["Diamond shipped dark danger", "#ff9088"],
  ] as const) {
    const o = hexToOklch(hex);
    void label;
    void o;
  }

  const pure = hexToOklch(pureApca(H, C));
  const kept = hexToOklch(balanced.hex);

  // Materially more of the colour survives...
  expect(kept.C).toBeGreaterThan(pure.C * 1.3);
  // ...and it is still darker than the pale pink pure APCA produces...
  expect(kept.L).toBeLessThan(pure.L);
  // ...while staying comfortably inside 1.4.3 AA.
  expect(wcagRatioHex(balanced.hex, bg)).toBeGreaterThanOrEqual(4.5);
  expect(balanced.verdict).toBe("hue-protected");
  // The APCA target really was given up on; that is the trade being made.
  expect(Math.abs(balanced.lc)).toBeLessThan(target);
});
