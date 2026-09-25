/** APCA-W3 lightness contrast (Lc), plus the inverse the solver needs.
 *
 *  Constants are the published APCA-W3 0.1.9 set. The sign of Lc carries
 *  meaning: positive = dark text on a light background, negative = light
 *  text on a dark background. Most call sites want the magnitude, but the
 *  sign is what tells you a pairing has flipped polarity, so it is kept. */

import { clamp01, hexToRgb255, linearToRgb255, type Rgb } from "./srgb";

/** What Lc means, shared verbatim by the in-app "How the target contrast is
 *  chosen" panel and the About dialog so the two can't independently drift
 *  on the wording — each renders its own bold "Lc" before this, since `<b>`
 *  vs `<strong>` differs between them. README.md's own explanation is kept
 *  matching by hand, since markdown can't import this. */
export const LC_EXPLANATION =
  '("Lightness Contrast"): a signed score, roughly 0 to 108, rather than a ratio. Positive means ' +
  "dark text on a light background, negative means light text on a dark one; most figures shown are " +
  "the magnitude.";

const SRCO = 0.2126729;
const SGCO = 0.7151522;
const SBCO = 0.072175;

/** APCA-W3 linearises sRGB with a plain c^2.4 power curve — no piecewise
 *  linear toe below 0.04045, unlike the real sRGB EOTF that srgb.ts uses for
 *  everything else (OKLCH, CVD simulation, WCAG luminance). Reusing that EOTF
 *  here quietly disagrees with the reference implementation through the
 *  midtones: #777777 on white measures Lc ~71.1 by APCA's own curve, not the
 *  ~67.8 the piecewise curve gives. Black and white are unaffected (0 and 1
 *  map identically under both), which is why endpoint-only tests miss this. */
const apcaGammaChannel = (c255: number): number => (c255 / 255) ** 2.4;

const apcaLinearFromRgb255 = (rgb: Rgb): Rgb => ({
  r: apcaGammaChannel(rgb.r),
  g: apcaGammaChannel(rgb.g),
  b: apcaGammaChannel(rgb.b),
});

const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;

const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE_BOW = 1.14;
const SCALE_WOB = 1.14;
const LO_BOW_OFFSET = 0.027;
const LO_WOB_OFFSET = 0.027;
const LO_CLIP = 0.1;
const DELTA_Y_MIN = 0.0005;

/** Expects channels already linearised APCA's own way — either via
 *  `apcaYHex` or `apcaYFromLinearSrgb`, never the raw output of
 *  `hexToLinear`/`oklchToGamutSafeLinear`, which use the real sRGB EOTF. */
export const apcaY = (lin: Rgb): number => SRCO * lin.r + SGCO * lin.g + SBCO * lin.b;

export const apcaYHex = (hex: string): number => apcaY(apcaLinearFromRgb255(hexToRgb255(hex)));

/** Bridges physically-linear sRGB (from `hexToLinear` or an OKLab gamut
 *  mapping, both real-EOTF) into APCA's measure: re-encode to sRGB-255, then
 *  decode again with APCA's own c^2.4 curve. Needed anywhere a candidate
 *  colour is produced from linear-light maths rather than typed in as hex —
 *  the solver's bisection loop, chiefly. */
export const apcaYFromLinearSrgb = (lin: Rgb): number => apcaY(apcaLinearFromRgb255(linearToRgb255(lin)));

const softClamp = (y: number): number => (y > BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP);

export function apcaFromY(textY: number, backgroundY: number): number {
  const txtY = softClamp(textY);
  const bgY = softClamp(backgroundY);
  if (Math.abs(bgY - txtY) < DELTA_Y_MIN) return 0;

  if (bgY > txtY) {
    const sapc = (bgY ** NORM_BG - txtY ** NORM_TXT) * SCALE_BOW;
    return sapc < LO_CLIP ? 0 : (sapc - LO_BOW_OFFSET) * 100;
  }
  const sapc = (bgY ** REV_BG - txtY ** REV_TXT) * SCALE_WOB;
  return sapc > -LO_CLIP ? 0 : (sapc + LO_WOB_OFFSET) * 100;
}

export function apcaHex(textHex: string, backgroundHex: string): number {
  return apcaFromY(apcaYHex(textHex), apcaYHex(backgroundHex));
}

/** Invert APCA: the linear luminance a text colour needs to reach `targetLc`
 *  against a known background. Lets the scale generator solve for lightness
 *  directly rather than bisecting on colour and measuring. */
export function targetYForLc(backgroundY: number, targetLc: number, wantDarkerThanBg: boolean): number {
  const bgY = softClamp(backgroundY);
  if (wantDarkerThanBg) {
    const sapc = targetLc / 100 + LO_BOW_OFFSET;
    const base = bgY ** NORM_BG - sapc / SCALE_BOW;
    return clamp01(Math.max(base, 1e-6) ** (1 / NORM_TXT));
  }
  const sapc = -targetLc / 100 - LO_WOB_OFFSET;
  const base = bgY ** REV_BG - sapc / SCALE_WOB;
  return clamp01(Math.max(base, 1e-6) ** (1 / REV_TXT));
}

/** APCA's own guidance, condensed. Lc is a continuum, not a pass/fail gate —
 *  these are the levels the tool reports against, not a conformance claim. */
export function apcaLevel(lc: number): "body" | "large" | "non-text" | "insufficient" {
  const mag = Math.abs(lc);
  if (mag >= 75) return "body";
  if (mag >= 60) return "large";
  if (mag >= 45) return "non-text";
  return "insufficient";
}
