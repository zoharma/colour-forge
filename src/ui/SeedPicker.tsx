import { simulateCvdHex, type CvdView } from "../color/cvd";
import type { Profile } from "../profiles/types";

interface Props {
  profile: Profile;
  seedHex: string;
  cvdView: CvdView;
  onPick: (hex: string) => void;
}

/** The profile's own starting palette, as one-click seeds.
 *
 *  Typing a hex to reach the set you always start from is friction for no
 *  reason. It also makes the contrast policy legible by letting you walk the
 *  wheel: the hues that cannot hold AA and stay themselves — the oranges,
 *  ambers and limes — sit right next to the ones that can, so the difference
 *  is two clicks apart rather than theoretical. */
export function SeedPicker({ profile, seedHex, cvdView, onPick }: Props) {
  return (
    <div className="seed-picker" role="group" aria-label={`${profile.seedPaletteLabel} seed colours`}>
      {profile.seedPalette.map((hue) => {
        const selected = hue.hex.toLowerCase() === seedHex.toLowerCase();
        return (
          <button
            key={hue.name}
            type="button"
            className="seed-swatch"
            aria-pressed={selected}
            title={`${hue.name} — ${hue.hex}`}
            style={{ background: simulateCvdHex(hue.hex, cvdView) }}
            onClick={() => onPick(hue.hex)}
          >
            <span className="visually-hidden">
              {hue.name}, {hue.hex}
            </span>
          </button>
        );
      })}
    </div>
  );
}
