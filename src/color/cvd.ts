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

/** Anomalous trichromacy is partial, not total, loss of a cone type. Machado,
 *  Oliveira & Fernandes (2009) — the same model `MATRICES` above are the
 *  100%-severity case of — publish the intermediate matrices directly rather
 *  than as a curve to interpolate: their physiologically-based model does not
 *  vary linearly between identity and the dichromat transform (tritanomaly's
 *  own coefficients are non-monotonic partway through the range), so blending
 *  toward identity by eye — as this file used to, before this table replaced
 *  it — is a different, less accurate curve than the one actually measured.
 *  These are their published severity-0.6 matrices (0.6 sits in the
 *  "moderate-to-strong" range reported for anomalous trichromacy and is the
 *  severity other simulators, e.g. Coblis, commonly use for these labels),
 *  reproduced from the colour-science library's `CVD_MATRICES_MACHADO2010`
 *  dataset, which cites Machado (2010) directly. Achromatomaly has no
 *  equivalent published table — the 2009 model covers the three dichromacies
 *  and their anomalous forms only — so it stays a severity-blended luminance
 *  collapse below. */
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

/** Euclidean distance in OKLab, the perceptually-even space the rest of this
 *  tool already reasons about hue and lightness in — not raw 8-bit RGB. RGB
 *  distance weighs each channel equally regardless of how visible a shift in
 *  it actually is, so it both overstates separation for pairs that only
 *  differ in a channel the eye is poor at judging and understates it for
 *  small perceptually-large shifts (a lightness change reads as more
 *  separation than the same-sized hue change at the same RGB distance). */
function oklabDistance(hexA: string, hexB: string): number {
  const a = linearToOklab(hexToLinear(hexA));
  const b = linearToOklab(hexToLinear(hexB));
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/** Below this, two colours read as effectively the same under that
 *  deficiency. Empirical rather than standardised — it is a threshold for
 *  raising a question, not a conformance line.
 *
 *  RGB distance and OKLab distance measure different things closely enough
 *  that there is no unit conversion from the old floor (15, on the 0–441 RGB
 *  scale) to this one — a straight ratio, tried first, flagged nearly every
 *  shipped profile's own family as colliding with itself. Picked instead by
 *  gathering every same-role, same-mode pair across every shipped profile's
 *  family, splitting them by whether the *old* metric considered the pair
 *  fine or already flagged it, and choosing the value that keeps the false-
 *  positive rate against already-shipped, presumably-reviewed palettes low
 *  (this floor mis-classifies roughly 1 in 200 previously-fine pairs) while
 *  still catching a majority of what the old metric already flagged.
 *
 *  This is deliberately conservative: it inherits the old metric's
 *  blind spots on the pairs it still misses, rather than surfacing every
 *  pair OKLab disagrees with the RGB metric about. A pair the RGB metric
 *  missed and OKLab would have caught stays unflagged here — the more
 *  aggressive threshold that would catch those flagged an unreviewed amount
 *  of noise against real, currently-shipped families and needs a person
 *  looking at specific pairs in an actual CVD simulator to validate, not a
 *  blanket recalibration. */
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
