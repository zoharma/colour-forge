import { simulateCvdHex, type CvdView } from "../color/cvd";
import { isValidHex, normaliseHex } from "../color/srgb";
import type { ModeKey, Profile, SeededIntent } from "../profiles/types";

interface Props {
  profile: Profile;
  family: SeededIntent[];
  draftName: string;
  cvdView: CvdView;
  onChange: (family: SeededIntent[]) => void;
  onReset: () => void;
  onSnapshot: () => void;
}

/** The intents a new colour has to live alongside. Editable, because the
 *  shipped values are a starting point and the interesting question is often
 *  "what if we also changed that one". */
export function FamilyTable({ profile, family, draftName, cvdView, onChange, onReset, onSnapshot }: Props) {
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
                <tr key={`${intent.name}-${index}`}>
                  <td>
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
                  </td>

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
                            <input
                              className="hexfield"
                              type="text"
                              defaultValue={hex}
                              placeholder="—"
                              aria-label={`${intent.name} ${role.label} in ${mode} mode`}
                              onBlur={(e) => setHex(index, mode, role.key, e.target.value.trim())}
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
      <p className="foot-note">
        Blank means the role has no shipped value for that intent — left empty rather than guessed, and
        skipped by the separation checks.
      </p>
    </>
  );
}
