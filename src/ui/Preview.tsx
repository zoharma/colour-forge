import { simulateCvdHex, type CvdView } from "../color/cvd";
import { chosenForeground, type Draft } from "../color/scale";
import type { ModeKey, Profile } from "../profiles/types";

interface Props {
  profile: Profile;
  draft: Draft;
  mode: ModeKey;
  cvdView: CvdView;
  foregroundOverrides: Record<string, string>;
}

/** The roles assembled into the components they exist for. Numbers say
 *  whether a pairing is legal; only seeing it says whether it is any good —
 *  and under a simulation, whether the meaning survives at all. */
export function Preview({ profile, draft, mode, cvdView, foregroundOverrides }: Props) {
  const spec = profile.modes[mode];
  const shown = (hex: string) => simulateCvdHex(hex, cvdView);
  const roles = draft[mode].roles;

  // Resolve roles by usage rather than by name, so the preview works for any
  // profile without knowing its vocabulary.
  const byUsage = (usage: string) => profile.roles.find((r) => r.usage === usage && roles[r.key]);
  const fillRole = profile.roles.find((r) => r.needsForeground && r.requirement !== "none" && roles[r.key]);
  const surfaceRole = profile.roles.find((r) => r.needsForeground && r.requirement === "none" && roles[r.key]);
  const textRole = byUsage("text");
  const borderRole = byUsage("boundary");

  const fill = fillRole ? roles[fillRole.key] : undefined;
  const surface = surfaceRole ? roles[surfaceRole.key] : undefined;
  const text = textRole ? roles[textRole.key] : undefined;
  const border = borderRole ? roles[borderRole.key] : undefined;

  const fg = (roleKey?: string) =>
    roleKey ? chosenForeground(draft, mode, roleKey, foregroundOverrides[roleKey])?.hex : undefined;

  return (
    <div className="preview-grid" style={{ borderTop: `1px solid ${shown(spec.surface)}` }}>
      {fill && fillRole && (
        <button
          type="button"
          className="preview-button"
          style={{ background: shown(fill.hex), color: shown(fg(fillRole.key) ?? spec.onSurface) }}
        >
          Filled action
        </button>
      )}

      {surface && surfaceRole && (
        <div
          className="preview-alert"
          style={{
            background: shown(surface.hex),
            color: shown(fg(surfaceRole.key) ?? spec.onSurface),
            borderColor: shown(border?.hex ?? surface.hex),
          }}
        >
          <strong>{draft.name}</strong>
          A quiet notice on the tinted surface, bordered with the boundary role.
        </div>
      )}

      {text && (
        <span className="preview-text" style={{ color: shown(text.hex) }}>
          Coloured text
        </span>
      )}

      {border && (
        <span
          className="preview-chip"
          style={{ borderColor: shown(border.hex), color: shown(text?.hex ?? border.hex) }}
        >
          outlined
        </span>
      )}
    </div>
  );
}
