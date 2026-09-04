/** OKLab / OKLCH, using Björn Ottosson's published matrices, plus the gamut
 *  mapping the scale generator needs. Chroma is reduced (never lightness)
 *  when a requested colour falls outside sRGB, because the whole tool is
 *  built on holding a target lightness steady. */

import { clamp01, linearToRgb255, rgb255ToHex, hexToLinear, type Rgb } from "./srgb";

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

export interface Oklch {
  L: number;
  C: number;
  H: number;
}

export function linearToOklab(lin: Rgb): Oklab {
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToLinear(lab: Oklab): Rgb {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.hypot(lab.a, lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const hr = (lch.H * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(hr), b: lch.C * Math.sin(hr) };
}

export const hexToOklch = (hex: string): Oklch => oklabToOklch(linearToOklab(hexToLinear(hex)));

const inGamut = (lin: Rgb, eps = 1e-4): boolean =>
  lin.r >= -eps && lin.r <= 1 + eps && lin.g >= -eps && lin.g <= 1 + eps && lin.b >= -eps && lin.b <= 1 + eps;

export interface GamutResult {
  lin: Rgb;
  /** Chroma actually achieved. Below the requested chroma means the colour
   *  was pulled in to fit sRGB — the ratio is what the solver protects. */
  chromaUsed: number;
}

export function oklchToGamutSafeLinear(L: number, C: number, H: number): GamutResult {
  let c = C;
  let lin = oklabToLinear(oklchToOklab({ L, C: c, H }));
  for (let i = 0; i < 24 && !inGamut(lin); i++) {
    c *= 0.92;
    lin = oklabToLinear(oklchToOklab({ L, C: c, H }));
  }
  return {
    lin: { r: clamp01(lin.r), g: clamp01(lin.g), b: clamp01(lin.b) },
    chromaUsed: c,
  };
}

/** The most chroma sRGB holds for this hue at this lightness: the gamut hull.
 *
 *  Asking for far more than exists and reading back what survived is the
 *  cheapest way to find it, and it is exactly what the mapper does anyway. */
const hullCache = new Map<number, number>();

export function gamutChroma(L: number, H: number): number {
  // Memoised because the solver asks for this inside its bisection: every
  // candidate lightness, every step, both modes, on every keystroke. Measured
  // uncached it took buildDraft from 9.6ms to 45.2ms.
  //
  // Keyed on hue and lightness quantised to 1/512, which is far finer than the
  // 8-bit channels the result is rendered into, so the cache cannot move a
  // colour. Bounded by construction: 360 hues x 512 steps worst case, and a
  // session touches a tiny corner of that.
  const key = (((Math.round(H) % 360) + 360) % 360) * 1024 + Math.round(L * 512);
  const cached = hullCache.get(key);
  if (cached !== undefined) return cached;
  const value = oklchToGamutSafeLinear(L, 0.5, H).chromaUsed;
  hullCache.set(key, value);
  return value;
}

export function oklchToHex(L: number, C: number, H: number): string {
  return rgb255ToHex(linearToRgb255(oklchToGamutSafeLinear(L, C, H).lin));
}

/** Shortest angular distance between two hues, 0–180. */
export function hueDelta(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** The lightness at which a hue reaches its greatest chroma in sRGB: its
 *  gamut cusp, and the point where the hue is most itself.
 *
 *  It moves enormously with hue. Red peaks around L 0.58, yellow around 0.88.
 *  A chroma curve that peaks at a fixed step therefore asks red for its best
 *  colour at exactly the right lightness and asks yellow for its best colour
 *  where yellow has none left, which is where the murky mid-yellows come
 *  from. */
export interface Cusp {
  L: number;
  C: number;
}

const cuspCache = new Map<number, Cusp>();

export function hueCusp(hue: number): Cusp {
  // Hue is continuous but the cusp moves slowly, so cache to the degree. The
  // scale is regenerated on every keystroke and this would otherwise be the
  // most expensive thing in the render.
  const key = Math.round(((hue % 360) + 360) % 360);
  const cached = cuspCache.get(key);
  if (cached) return cached;

  const search = (from: number, to: number, stepSize: number): Cusp => {
    let best: Cusp = { L: from, C: -1 };
    for (let L = from; L <= to; L += stepSize) {
      // Ask for far more chroma than sRGB holds; what comes back is the
      // gamut boundary at this lightness.
      const { chromaUsed } = oklchToGamutSafeLinear(L, 0.5, key);
      if (chromaUsed > best.C) best = { L, C: chromaUsed };
    }
    return best;
  };

  const coarse = search(0.05, 0.98, 0.02);
  const refined = search(Math.max(0.02, coarse.L - 0.02), Math.min(0.99, coarse.L + 0.02), 0.004);
  cuspCache.set(key, refined);
  return refined;
}
