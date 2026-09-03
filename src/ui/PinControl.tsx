import type { PinSpec, PinSuggestion } from "../color/pin";
import type { ModeKey, Profile } from "../profiles/types";

interface Props {
  profile: Profile;
  pin: PinSpec | undefined;
  suggestion: PinSuggestion | undefined;
  onChange: (pin: PinSpec | undefined) => void;
}

/** Pin the seed to one role in one mode.
 *
 *  Off by default and never inferred. The suggestion says where the colour
 *  would sit if you did pin it, which is useful on its own — "this hex reads
 *  as a light-mode fill" is worth knowing even when you then decide not to
 *  pin anything. */
export function PinControl({ profile, pin, suggestion, onChange }: Props) {
  const enabled = Boolean(pin);
  const mode = pin?.mode ?? suggestion?.mode ?? "light";
  const roleKey = pin?.roleKey ?? suggestion?.roleKey ?? profile.roles[0]?.key ?? "";

  return (
    <div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.8125rem" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { mode, roleKey } : undefined)}
        />
        Pin the seed to a role
      </label>

      {enabled && pin && (
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8125rem" }}>
            <span className="visually-hidden">Role to pin the seed to</span>
            <select
              value={pin.roleKey}
              onChange={(e) => onChange({ ...pin, roleKey: e.target.value })}
            >
              {profile.roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>in</span>

          <div className="segmented" role="group" aria-label="Mode to pin in">
            {(["light", "dark"] as ModeKey[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={pin.mode === m}
                onClick={() => onChange({ ...pin, mode: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="policy-note">
        {enabled ? (
          <>
            That role is the seed colour exactly, and the rest of the{" "}
            <strong>{pin?.mode}</strong> ramp is solved around it.{" "}
            <strong>{pin?.mode === "light" ? "Dark" : "Light"} is untouched</strong> — one hex cannot be
            right against both a white page and a near-black one, so pinning both is how half a palette
            ends up wrong. The pinned colour is still measured: if it cannot carry the role, that is
            reported.
          </>
        ) : suggestion ? (
          <>
            Off. Measured against the profile's targets, this colour sits closest to{" "}
            <strong>
              {suggestion.roleLabel} in {suggestion.mode}
            </strong>{" "}
            (Lc {suggestion.seedLc.toFixed(0)} against a target of {suggestion.targetLc}). Turning this on
            would hold it there exactly.
          </>
        ) : (
          <>Off. The seed supplies hue and chroma, and every role is derived from it.</>
        )}
      </p>
    </div>
  );
}
