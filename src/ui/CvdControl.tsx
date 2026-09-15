import { CVD_LABELS, type CvdView } from "../color/cvd";

const VIEWS: CvdView[] = [
  "none",
  "protanomaly",
  "protanopia",
  "deuteranomaly",
  "deuteranopia",
  "tritanomaly",
  "tritanopia",
  "achromatomaly",
  "achromatopsia",
];

export const CVD_NOTES: Record<CvdView, string> = {
  none: "",
  protanopia:
    "No working long-wavelength cones, so reds darken and slide toward the greens. Roughly 1% of men.",
  protanomaly:
    "Long-wavelength cones present but shifted, a weaker version of protanopia. More common than the full dichromacy, around 1% of men.",
  deuteranopia:
    "No working medium-wavelength cones. The most common dichromacy, about 1% of men, and the one that red/green status pairs fail.",
  deuteranomaly:
    "Medium-wavelength cones present but shifted, a weaker version of deuteranopia. The most common colour vision deficiency overall, around 5% of men.",
  tritanopia:
    "No working short-wavelength cones, so blues and greens converge. Rare, and affects all genders about equally.",
  tritanomaly:
    "Short-wavelength cones present but shifted, a weaker version of tritanopia. Rare, and affects all genders about equally.",
  achromatopsia:
    "No colour discrimination at all. Very rare, but it is also what a monochrome print or a failing display does to your palette.",
  achromatomaly:
    "Reduced colour discrimination, a weaker version of achromatopsia. Very rare on its own.",
};

/** Applied across every swatch, table cell and preview at once, because the
 *  question is never what one colour becomes. It is whether the set still
 *  tells its own members apart.
 *
 *  Sits beside the light/dark control because it is the same kind of thing: a
 *  way of looking at the whole page rather than a property of the colour
 *  being designed. */
export function CvdControl({ view, onChange }: { view: CvdView; onChange: (view: CvdView) => void }) {
  return (
    <>
      <label className="visually-hidden" htmlFor="cvd-view">
        Simulate colour vision
      </label>
      <select
        id="cvd-view"
        className="view-select"
        value={view}
        onChange={(e) => onChange(e.target.value as CvdView)}
      >
        {VIEWS.map((v) => (
          <option key={v} value={v}>
            {CVD_LABELS[v]}
          </option>
        ))}
      </select>
    </>
  );
}
