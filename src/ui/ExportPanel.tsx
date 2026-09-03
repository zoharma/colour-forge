import { useState } from "react";

import { exportCss, exportJson, exportScaleCss } from "../color/export";
import type { Draft } from "../color/scale";
import type { ModeKey, Profile } from "../profiles/types";

interface Props {
  profile: Profile;
  draft: Draft;
  foregroundOverrides: Partial<Record<ModeKey, Record<string, string>>>;
}

type Format = "css" | "scale" | "json";

const FORMAT_LABELS: Record<Format, string> = {
  css: "Roles",
  scale: "Full scale",
  json: "JSON",
};

const FORMAT_NOTES: Record<Format, string> = {
  css: "The named roles only, in this profile's own token naming.",
  scale: "Every step of both ramps as numbered tokens, including the ones no role claims.",
  json: "The roles with their measurements, for a token pipeline rather than a stylesheet.",
};

export function ExportPanel({ profile, draft, foregroundOverrides }: Props) {
  const [format, setFormat] = useState<Format>("css");
  const [annotate, setAnnotate] = useState(false);
  const [status, setStatus] = useState("");

  const options = { foregroundOverrides, includeMeasurements: annotate };
  const output =
    format === "css"
      ? exportCss(profile, draft, options)
      : format === "scale"
        ? exportScaleCss(profile, draft, options)
        : exportJson(profile, draft, options);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setStatus("Copied.");
    } catch {
      setStatus("Copy failed — select the text and copy manually.");
    }
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 10 }}>
        <div className="segmented" role="group" aria-label="Output format">
          {(["css", "scale", "json"] as Format[]).map((f) => (
            <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
        <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8125rem" }}>
            <input type="checkbox" checked={annotate} onChange={(e) => setAnnotate(e.target.checked)} />
            Annotate with measurements
          </label>
          <button className="btn" type="button" onClick={copy}>
            Copy
          </button>
        </span>
      </div>

      <label className="visually-hidden" htmlFor="export-output">
        Generated {format.toUpperCase()} for the {draft.name} intent
      </label>
      <textarea id="export-output" className="output" readOnly spellCheck={false} value={output} />
      <p className="foot-note" aria-live="polite">
        {status || `${FORMAT_NOTES[format]} Nothing is written back to any file — review, then paste in by hand.`}
      </p>
    </>
  );
}
