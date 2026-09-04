/** Colour-vision-deficiency simulation — Machado, Oliveira & Fernandes
 *  (2009) matrices at 100% severity, applied in linear light.
 *
 *  Simulation answers "can these two be told apart", not "is this
 *  readable" — contrast is APCA/WCAG's job. Both matter: two intents can
 *  each pass contrast against the page and still be the same colour as
 *  each other to a deuteranope, which is how a red/green status pair
 *  gets shipped. */

import { clamp01, hexToLinear, linearToRgb255, rgb255ToHex, rgbDistanceHex } from "./srgb";

export const CVD_TYPES = ["protanopia", "deuteranopia", "tritanopia"] as const;
export type CvdType = (typeof CVD_TYPES)[number];

export type CvdView = CvdType | "none" | "achromatopsia";

export const CVD_LABELS: Record<CvdView, string> = {
  none: "Normal",
  protanopia: "Protanopia",
  deuteranopia: "Deuteranopia",
  tritanopia: "Tritanopia",
  achromatopsia: "Achromatopsia",
};

const MATRICES: Record<CvdType, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Whether a value off the wire is really one of ours. Anything read from
 *  localStorage or a URL is a string someone else last wrote. */
export function isCvdView(value: unknown): value is CvdView {
  return typeof value === "string" && value in CVD_LABELS;
}

export function simulateCvdHex(hex: string, view: CvdView): string {
  if (view === "none") return hex;

  const lin = hexToLinear(hex);
  if (view === "achromatopsia") {
    // Rod-only vision: collapse to luminance. Not a Machado matrix — the
    // 2009 model covers the three dichromacies only.
    const y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    return rgb255ToHex(linearToRgb255({ r: y, g: y, b: y }));
  }

  // Total by construction. The view can arrive from storage or a URL, and an
  // unknown one used to index MATRICES with undefined and throw during the
  // first render — a blank page that survived reloads, because the bad value
  // was still in localStorage on the way back.
  const m = MATRICES[view];
  if (!m) return hex;
  const row = (i: number) => {
    const [a, b, c] = m[i] as [number, number, number];
    return clamp01(a * lin.r + b * lin.g + c * lin.b);
  };
  return rgb255ToHex(linearToRgb255({ r: row(0), g: row(1), b: row(2) }));
}

/** Below this, two colours read as effectively the same under that
 *  deficiency. Empirical rather than standardised — it is a threshold for
 *  raising a question, not a conformance line. */
export const CVD_SEPARATION_FLOOR = 15;
export const CVD_SEPARATION_COMFORTABLE = 25;

export interface CvdSeparation {
  /** Worst separation across all simulated deficiencies, 0–441. */
  value: number;
  type: CvdType;
}

export function worstCvdSeparation(hexA: string, hexB: string): CvdSeparation {
  let worst: CvdSeparation = { value: Number.POSITIVE_INFINITY, type: "protanopia" };
  for (const type of CVD_TYPES) {
    const d = rgbDistanceHex(simulateCvdHex(hexA, type), simulateCvdHex(hexB, type));
    if (d < worst.value) worst = { value: d, type };
  }
  return worst;
}
