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

const ANOMALY_BASE = {
  protanomaly: "protanopia",
  deuteranomaly: "deuteranopia",
  tritanomaly: "tritanopia",
} as const;
export type CvdAnomalyType = keyof typeof ANOMALY_BASE;
export const CVD_ANOMALY_TYPES = Object.keys(ANOMALY_BASE) as CvdAnomalyType[];

export type CvdView = CvdType | CvdAnomalyType | "none" | "achromatopsia" | "achromatomaly";

export const CVD_LABELS: Record<CvdView, string> = {
  none: "Regular Vision",
  protanopia: "Protanopia",
  protanomaly: "Protanomaly",
  deuteranopia: "Deuteranopia",
  deuteranomaly: "Deuteranomaly",
  tritanopia: "Tritanopia",
  tritanomaly: "Tritanomaly",
  achromatopsia: "Achromatopsia",
  achromatomaly: "Achromatomaly",
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

const IDENTITY: number[][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Anomalous trichromacy is partial, not total, loss of a cone type — the
 *  Machado paper's own severity table interpolates smoothly from identity
 *  (0%) to the dichromat matrix (100%). We don't have their intermediate
 *  coefficients, so we approximate by blending the dichromat transform
 *  toward identity; 0.6 sits in the "moderate-to-strong" range reported for
 *  anomalous trichromacy and is the severity other simulators (e.g. Coblis)
 *  commonly use for these same labels. Achromatomaly blends the same way
 *  toward the achromatopsia grey. */
const ANOMALY_SEVERITY = 0.6;

function lerpMatrix(from: number[][], to: number[][], t: number): number[][] {
  return from.map((row, i) => row.map((v, j) => v + ((to[i]![j] as number) - v) * t));
}

const ANOMALY_MATRICES: Record<CvdAnomalyType, number[][]> = Object.fromEntries(
  CVD_ANOMALY_TYPES.map((anomaly) => [
    anomaly,
    lerpMatrix(IDENTITY, MATRICES[ANOMALY_BASE[anomaly]], ANOMALY_SEVERITY),
  ]),
) as Record<CvdAnomalyType, number[][]>;

function applyMatrix(m: number[][], lin: { r: number; g: number; b: number }) {
  const row = (i: number) => {
    const [a, b, c] = m[i] as [number, number, number];
    return clamp01(a * lin.r + b * lin.g + c * lin.b);
  };
  return { r: row(0), g: row(1), b: row(2) };
}

export function simulateCvdHex(hex: string, view: CvdView): string {
  if (view === "none") return hex;

  const lin = hexToLinear(hex);

  if (view === "achromatopsia" || view === "achromatomaly") {
    // Rod-only (or partial) vision: collapse toward luminance. Not a
    // Machado matrix — the 2009 model covers the three dichromacies only.
    const y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    const t = view === "achromatopsia" ? 1 : ANOMALY_SEVERITY;
    return rgb255ToHex(
      linearToRgb255({
        r: lin.r + (y - lin.r) * t,
        g: lin.g + (y - lin.g) * t,
        b: lin.b + (y - lin.b) * t,
      }),
    );
  }

  const m = view in ANOMALY_BASE ? ANOMALY_MATRICES[view as CvdAnomalyType] : MATRICES[view as CvdType];
  return rgb255ToHex(linearToRgb255(applyMatrix(m, lin)));
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
