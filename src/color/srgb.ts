/** sRGB <-> linear-light conversions. Everything downstream measures in
 *  linear light; hex strings are only ever an I/O format. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToRgb255(hex: string): Rgb {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgb255ToHex(rgb: Rgb): string {
  const channel = (v: number) =>
    Math.round(clamp01(v / 255) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** Expand #abc to #aabbcc, and normalise case. */
export function normaliseHex(hex: string): string {
  return rgb255ToHex(hexToRgb255(hex));
}

const srgbToLinearChannel = (c255: number): number => {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const linearToSrgbChannel = (c: number): number => {
  const v = clamp01(c);
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return clamp01(s) * 255;
};

export function rgb255ToLinear(rgb: Rgb): Rgb {
  return {
    r: srgbToLinearChannel(rgb.r),
    g: srgbToLinearChannel(rgb.g),
    b: srgbToLinearChannel(rgb.b),
  };
}

export function linearToRgb255(lin: Rgb): Rgb {
  return {
    r: linearToSrgbChannel(lin.r),
    g: linearToSrgbChannel(lin.g),
    b: linearToSrgbChannel(lin.b),
  };
}

export const hexToLinear = (hex: string): Rgb => rgb255ToLinear(hexToRgb255(hex));

/** Straight Euclidean distance in 8-bit RGB, 0–441. Crude on purpose: it is
 *  used to ask "would these read as the same colour", not to rank hues. */
export function rgbDistanceHex(hexA: string, hexB: string): number {
  const a = hexToRgb255(hexA);
  const b = hexToRgb255(hexB);
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
