import { useEffect, useRef, useState } from "react";

import { simulateCvdHex, type CvdView } from "../color/cvd";
import { FILL_PLACEMENT_LABELS, type FillPlacement } from "../color/scale";
import { isValidHex, normaliseHex } from "../color/srgb";
import { WCAG_CRITERION, meetsWcag, wcagRatioHex } from "../color/wcag";
import type { ModeKey, Profile, SeededIntent } from "../profiles/types";

interface Props {
  profile: Profile;
  family: SeededIntent[];
  draftName: string;
  cvdView: CvdView;
  onChange: (family: SeededIntent[]) => void;
  onReset: () => void;
  onSnapshot: () => void;
  /** Re-derive one row at a new fill placement. Only ever called for rows this
   *  tool generated; a profile's shipped values have nothing to re-derive
   *  from and the control is not offered for them. */
  onPlacementChange: (index: number, placement: FillPlacement) => void;
}

/** One editable hex.
 *
 *  Uncontrolled-with-a-leash, and both halves are load-bearing. It cannot be
 *  fully controlled because a half-typed hex is not a valid colour and would
 *  be rejected keystroke by keystroke. It cannot be fully uncontrolled either,
 *  because a row can now be rewritten underneath it — changing a placement
 *  re-derives every value in the row — and a `defaultValue` would go on
 *  showing the colour that used to be there while the swatch beside it showed
 *  the new one. So it tracks the value it is displaying, except while someone
 *  is typing into it. */
function HexCell({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);

  return (
    <input
      className="hexfield"
      type="text"
      value={text}
      placeholder="—"
      aria-label={label}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        editing.current = false;
        const next = e.target.value.trim();
        // Anything that is not a colour goes back to what was there, rather
        // than sitting in the field looking like it took.
        if (next !== "" && !isValidHex(next)) {
          setText(value);
          return;
        }
        onCommit(next);
      }}
    />
  );
}

/** The intents a new colour has to live alongside. Editable, because the
 *  shipped values are a starting point and the interesting question is often
 *  "what if we also changed that one". */
export function FamilyTable({
  profile,
  family,
  draftName,
  cvdView,
  onChange,
  onReset,
  onSnapshot,
  onPlacementChange,
}: Props) {
  // Nothing to place if the profile has no role whose job is to be the
  // colour, so the column does not appear at all rather than sitting there
  // inert.
  const filledRole = profile.roles.find((r) => r.wantsSaturation);
  const hasFilledRole = Boolean(filledRole);
  const filledRoleLabel = filledRole?.label ?? "Filled";

  /** Which modes of a row have a fill that followed the hue past the point
   *  where it can define its own edge.
   *
   *  The draft gets this as a finding; a family row has to get it here, or the
   *  tool would be generating a value it knows is short of 1.4.11 and saying
   *  nothing — which is not the same as reporting on a shipped value it merely
   *  found that way. */
  const needsBorder = (intent: SeededIntent): ModeKey[] => {
    if (!filledRole || intent.recipe?.fillPlacement !== "cusp") return [];
    return (["light", "dark"] as ModeKey[]).filter((mode) => {
      const hex = intent[mode][filledRole.key];
      if (!hex) return false;
      return !meetsWcag(wcagRatioHex(hex, profile.modes[mode].background), filledRole.requirement);
    });
  };

  const roles = profile.separationRoles
    .map((key) => profile.roles.find((r) => r.key === key))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const update = (index: number, mutate: (intent: SeededIntent) => SeededIntent) =>
    onChange(family.map((intent, i) => (i === index ? mutate(intent) : intent)));

  const setHex = (index: number, mode: ModeKey, roleKey: string, value: string) => {
    if (value !== "" && !isValidHex(value)) return;
    update(index, (intent) => ({
      ...intent,
      [mode]: { ...intent[mode], [roleKey]: value === "" ? "" : normaliseHex(value) },
    }));
  };

  /* Reordering. Order is not cosmetic here: the separation table reports the
     closest pair, and reading the family in the order the design system
     actually presents its intents is what makes a collision between
     neighbours obvious. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Reordering replaces the row that was focused, so the focus has to be put
  // back deliberately or a second arrow press lands nowhere and the move
  // looks like it only half worked.
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const [refocus, setRefocus] = useState<number | null>(null);
  useEffect(() => {
    if (refocus === null) return;
    handles.current[refocus]?.focus();
    setRefocus(null);
  }, [family, refocus]);

  // The live draft is pinned last, since it is re-derived on every keystroke
  // rather than being a row anyone placed.
  const movable = family.filter((f) => f.name !== draftName).length;

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= movable || to >= movable) return;
    const next = [...family];
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    onChange(next);
    setAnnouncement(`${row.name} moved to position ${to + 1} of ${movable}.`);
    setRefocus(to);
  };

  /* Dragging is pointer-only, so the same handle takes arrow keys. The tool
     argues for keyboard access; a reorder that needs a mouse would be the one
     place it did not offer it. */
  const onHandleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(index, index - 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <>
      <div className="flex-between">
        <span className="readout">
          <b>{family.length}</b> intent{family.length === 1 ? "" : "s"} in the comparison set
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" type="button" onClick={onSnapshot}>
            Freeze draft as an intent
          </button>
          <button className="btn ghost" type="button" onClick={onReset}>
            Reset to the profile's values
          </button>
        </span>
      </div>

      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table>
          <caption className="visually-hidden">Intent family, editable per role and mode</caption>
          <thead>
            <tr>
              <th scope="col">Intent</th>
              {hasFilledRole && <th scope="col">{filledRoleLabel} from</th>}
              {(["light", "dark"] as ModeKey[]).map((mode) =>
                roles.map((role) => (
                  <th scope="col" key={`${mode}-${role.key}`}>
                    {mode.slice(0, 1)} · {role.label}
                  </th>
                )),
              )}
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {family.map((intent, index) => {
              const isDraft = intent.name === draftName;
              return (
                <tr
                  key={index}
                  className={dropTarget === index && dragging !== index ? "drop-target" : undefined}
                  onDragOver={(e) => {
                    if (isDraft || dragging === null) return;
                    e.preventDefault();
                    setDropTarget(index);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === index ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging !== null && !isDraft) move(dragging, index);
                    setDragging(null);
                    setDropTarget(null);
                  }}
                >
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {isDraft ? (
                        <span className="drag-handle placeholder" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          className="drag-handle"
                          ref={(el) => {
                            handles.current[index] = el;
                          }}
                          draggable
                          aria-label={`Reorder ${intent.name}, position ${index + 1} of ${movable}. Use the arrow keys to move it.`}
                          onDragStart={(e) => {
                            setDragging(index);
                            e.dataTransfer.effectAllowed = "move";
                            // Firefox will not start a drag without payload.
                            e.dataTransfer.setData("text/plain", String(index));
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setDropTarget(null);
                          }}
                          onKeyDown={(e) => onHandleKeyDown(e, index)}
                        >
                          <span aria-hidden="true">⠿</span>
                        </button>
                      )}
                      {isDraft ? (
                        <span>
                          <strong>{intent.name}</strong>{" "}
                          <span className="pill neutral">live draft</span>
                        </span>
                      ) : (
                        <input
                          className="namefield"
                          type="text"
                          value={intent.name}
                          aria-label={`Name of intent ${index + 1}`}
                          onChange={(e) => update(index, (i) => ({ ...i, name: e.target.value }))}
                        />
                      )}
                    </span>
                  </td>

                  {hasFilledRole && (
                    <td>
                      {intent.recipe ? (
                        <select
                          className="view-select placement-select"
                          value={intent.recipe.fillPlacement}
                          aria-label={`Fill placement for ${intent.name}`}
                          onChange={(e) => onPlacementChange(index, e.target.value as FillPlacement)}
                        >
                          {(["fixed", "cusp"] as FillPlacement[]).map((f) => (
                            <option key={f} value={f}>
                              {FILL_PLACEMENT_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="readout"
                          title="Shipped values, not generated here — there is nothing to re-derive them from."
                        >
                          shipped
                        </span>
                      )}
                      {needsBorder(intent).map((mode) => (
                        <span
                          key={mode}
                          className="pill warn"
                          style={{ marginLeft: 4 }}
                          title={`In ${mode} mode this fill is under ${WCAG_CRITERION[filledRole!.requirement]} against the page, so it cannot define its own edge. 1.4.11 asks for a perceivable boundary rather than a contrasting fill — give it a border and it conforms.`}
                        >
                          {mode.slice(0, 1)} · needs a border
                        </span>
                      ))}
                    </td>
                  )}

                  {(["light", "dark"] as ModeKey[]).map((mode) =>
                    roles.map((role) => {
                      const hex = intent[mode][role.key] ?? "";
                      return (
                        <td key={`${mode}-${role.key}`}>
                          <span
                            className="cell-swatch"
                            style={{ background: hex ? simulateCvdHex(hex, cvdView) : "transparent" }}
                            aria-hidden="true"
                          />
                          {isDraft ? (
                            <span className="readout">{hex || "—"}</span>
                          ) : (
                            <HexCell
                              value={hex}
                              label={`${intent.name} ${role.label} in ${mode} mode`}
                              onCommit={(v) => setHex(index, mode, role.key, v)}
                            />
                          )}
                        </td>
                      );
                    }),
                  )}

                  <td>
                    {!isDraft && (
                      <button
                        className="btn tiny ghost"
                        type="button"
                        aria-label={`Remove ${intent.name}`}
                        onClick={() => onChange(family.filter((_, i) => i !== index))}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="foot-note">
        Drag a row by its handle, or focus the handle and use the arrow keys, to reorder the set. The live
        draft stays last. Blank means the role has no shipped value for that intent — left empty rather than guessed, and
        skipped by the separation checks.
        {hasFilledRole && (
          <>
            {" "}
            Rows marked <b>shipped</b> are real tokens read out of the design system, so they are edited by hand
            rather than re-derived; every other row was generated here and can be re-derived at either placement.
          </>
        )}
      </p>
    </>
  );
}
