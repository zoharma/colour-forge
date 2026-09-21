/** Colour-vision-deficiency simulation — Machado, Oliveira & Fernandes
 *  (2009) matrices at 100% severity, applied in linear light.
 *
 *  Simulation answers "can these two be told apart", not "is this
 *  readable" — contrast is APCA/WCAG's job. Both matter: two intents can
 *  each pass contrast against the page and still be the same colour as
 *  each other to a deuteranope, which is how a red/green status pair
 *  gets shipped. */

import { linearToOklab } from "./oklch";
import { clamp01, hexToLinear, linearToRgb255, rgb255ToHex } from "./srgb";

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

/** Anomalous trichromacy is partial cone loss, not total — Machado (2010)
 *  publishes the intermediate matrices directly rather than as a curve,
 *  since the real model doesn't interpolate linearly (tritanomaly is
 *  non-monotonic partway through). These are the published severity-0.6
 *  matrices (the "moderate-to-strong" range other simulators use too),
 *  from colour-science's `CVD_MATRICES_MACHADO2010`. Achromatomaly has no
 *  published table, so it stays a severity-blended luminance collapse below. */
const ANOMALY_SEVERITY = 0.6;

const ANOMALY_MATRICES: Record<CvdAnomalyType, number[][]> = {
  protanomaly: [
    [0.38545, 0.769005, -0.154455],
    [0.100526, 0.829802, 0.069673],
    [-0.007442, -0.02219, 1.029632],
  ],
  deuteranomaly: [
    [0.498864, 0.674741, -0.173604],
    [0.205199, 0.754872, 0.039929],
    [-0.011131, 0.030969, 0.980162],
  ],
  tritanomaly: [
    [1.104996, -0.046633, -0.058363],
    [-0.032137, 0.971635, 0.060503],
    [0.001336, 0.317922, 0.680742],
  ],
};

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

/** Euclidean distance in OKLab, not raw RGB — RGB weighs every channel
 *  equally regardless of how visible a shift in it actually is, over- and
 *  under-stating separation depending which channel moved. */
function oklabDistance(hexA: string, hexB: string): number {
  const a = linearToOklab(hexToLinear(hexA));
  const b = linearToOklab(hexToLinear(hexB));
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/** Below this, two colours read as effectively the same under that
 *  deficiency — a threshold for raising a question, not a conformance line.
 *
 *  No unit conversion exists from the old RGB-scale floor (a straight ratio
 *  flagged nearly every shipped family as self-colliding), so this was
 *  picked empirically: gather every same-role pair across every shipped
 *  family, split by whether the old metric flagged it, and pick the value
 *  with a low false-positive rate against those already-shipped palettes
 *  (~1 in 200 mis-classified) while still catching most of what the old
 *  metric caught.
 *
 *  Deliberately conservative — it inherits the old metric's blind spots
 *  rather than surfacing every pair OKLab disagrees about, since a more
 *  aggressive threshold needs a person validating specific pairs in a real
 *  CVD simulator, not a blanket recalibration. */
export const CVD_SEPARATION_FLOOR = 0.016;
export const CVD_SEPARATION_COMFORTABLE = 0.027;

export interface CvdSeparation {
  /** Worst separation across all simulated deficiencies — Euclidean distance
   *  in OKLab, where a whole-gamut hue change is on the order of 0.3–0.5. */
  value: number;
  type: CvdType;
}

export function worstCvdSeparation(hexA: string, hexB: string): CvdSeparation {
  let worst: CvdSeparation = { value: Number.POSITIVE_INFINITY, type: "protanopia" };
  for (const type of CVD_TYPES) {
    const d = oklabDistance(simulateCvdHex(hexA, type), simulateCvdHex(hexB, type));
    if (d < worst.value) worst = { value: d, type };
  }
  return worst;
}
