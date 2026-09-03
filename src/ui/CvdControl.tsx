import { CVD_LABELS, type CvdView } from "../color/cvd";

const VIEWS: CvdView[] = ["none", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"];

const NOTES: Record<CvdView, string> = {
  none: "",
  protanopia: "No working long-wavelength cones — reds darken and slide toward the greens. Roughly 1% of men.",
  deuteranopia: "No working medium-wavelength cones. The most common dichromacy, about 1% of men, and the one red/green status pairs fail.",
  tritanopia: "No working short-wavelength cones — blues and greens converge. Rare, and affects all genders about equally.",
  achromatopsia: "No colour discrimination at all. Very rare, but it is also what a monochrome print or a failing display does to your palette.",
};

/** Applied across every swatch, table cell and preview at once, because the
 *  question is never "what does this one colour become" — it is whether the
 *  set still tells its own members apart. */
export function CvdControl({ view, onChange }: { view: CvdView; onChange: (view: CvdView) => void }) {
  return (
    <div>
      <div className="segmented" role="group" aria-label="Simulate colour vision">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}>
            {v === "none" ? "Normal" : CVD_LABELS[v].slice(0, 5)}
          </button>
        ))}
      </div>
      {view !== "none" && (
        <p className="foot-note" style={{ maxWidth: "44ch" }} aria-live="polite">
          <strong>{CVD_LABELS[view]}.</strong> {NOTES[view]} Every number on the page is still measured from
          the real colours — only what you see is simulated.
        </p>
      )}
    </div>
  );
}
