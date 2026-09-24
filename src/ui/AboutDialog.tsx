import { memo, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { VERDICT_EXPLANATIONS, VERDICT_LABELS, type ContrastVerdict } from "../color/solver";

/** Verdicts a badge actually shows in the app. `pinned` is left out here —
 *  it's covered by its own "Pinning a seed to a role" section below, and
 *  isn't part of what this table is explaining. Labels and explanations
 *  come straight from `solver.ts`, the same source `Badges.tsx` renders
 *  its tooltips from, so this table can't independently drift from what a
 *  badge actually says. */
const VERDICT_ORDER: ContrastVerdict[] = ["apca-met", "hue-protected", "wcag-bound", "below-both"];

/** Condensed from README.md — the parts worth having open on the same screen
 *  as the tool, not the full rationale (that stays in the repo, linked at
 *  the bottom). A native <dialog> rather than a hand-rolled modal: focus
 *  trapping, Escape-to-close and the ::backdrop all come for free. */
export const AboutDialog = memo(function AboutDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Whether the mouse actually went down on the backdrop (not just came up
  // there) — a text selection started inside `.about-body` and dragged past
  // the dialog's edge before release lands its `click` on the dialog
  // element too (see the onClick guard below), and would otherwise close
  // the dialog mid-selection.
  const mouseDownOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="about-dialog"
      aria-labelledby="about-title"
      onClose={onClose}
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      // The dialog box itself has no padding of its own (see .about-dialog)
      // — the header/body children fill it edge to edge — so a click
      // landing on the dialog element rather than a child can only be the
      // backdrop. Requiring the press to have *started* there too (not just
      // ended there) is what keeps a selection drag from closing this.
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose();
      }}
    >
      <div className="about-header">
        <h2 id="about-title">About Colour Forge</h2>
        <button type="button" className="btn tiny ghost about-close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="about-body">
        <p>
          Turns one seed colour into a full design-system role set, solved independently for light
          and dark, then checked against APCA, WCAG 2.2 and colour-vision deficiency before it
          reaches a token file. Not tied to any one design system: role names, usage, scale curves
          and token naming all come from a <em>profile</em>.
        </p>

        <h3>The contrast model</h3>
        <p>
          Each step solves to its APCA target, then eases off, only as far as its hue needs and only
          when it actually recovers chroma, never below what WCAG 2.2 requires for how the role is
          used. Every step reports which measure decided it:
        </p>
        <table>
          <thead>
            <tr>
              <th>Verdict</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {VERDICT_ORDER.map((verdict) => (
              <tr key={verdict}>
                <td>{VERDICT_LABELS[verdict]}</td>
                <td>{VERDICT_EXPLANATIONS[verdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          APCA reports contrast as <strong>Lc</strong> ("Lightness Contrast"): a signed score,
          roughly 0 to 108, rather than a ratio. Every Lc figure in the app is shown as a magnitude.
        </p>

        <h3>Pinning a seed to a role</h3>
        <p>
          Sometimes a colour is fixed (a brand hex has to be the button fill) rather than a hue to
          build a ramp from. Pinning fixes one role in one mode — a single hex can't be right against
          both a white and a near-black page — and the other mode still solves independently.
        </p>

        <h3>Colour-vision deficiency</h3>
        <p>
          Simulation is Machado, Oliveira &amp; Fernandes (2009) at 100% severity, toggleable across
          every swatch, table and preview at once. Measurements always come from the real colours;
          simulating and then measuring would report contrast for vision nobody has.
        </p>

        <h3>Profiles</h3>
        <p>
          A profile supplies one design system's role names, usage, CSS naming and comparison
          intents — <strong>Generic</strong>, <strong>MUI</strong>, <strong>Material Design 3</strong>,{" "}
          <strong>IBM Carbon</strong> and <strong>Diamond Light Source</strong> ship today. Every
          profile shares the same solving curve and baseline background, so a design system's
          character comes from its token names and step choices, not a bespoke curve.
        </p>

        <p className="about-footer">
          Full rationale, the CLI, and how to add a profile:{" "}
          <a href="https://github.com/zoharma/colour-forge#readme" target="_blank" rel="noreferrer">
            README on GitHub
          </a>
          .
        </p>
      </div>
    </dialog>
  );
});
