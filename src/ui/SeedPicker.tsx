import { MATERIAL_500 } from "../profiles/material";
import { simulateCvdHex, type CvdView } from "../color/cvd";

interface Props {
  seedHex: string;
  cvdView: CvdView;
  onPick: (hex: string) => void;
}

/** The Material Design 2 palette at 500, as one-click seeds.
 *
 *  This is the set most non-Diamond work starts from, and typing a hex to get
 *  at it is friction for no reason. It also makes the contrast policy legible
 *  by letting you walk the wheel: the hues that cannot hold AA and stay
 *  themselves — the oranges, ambers and limes — are right next to the ones
 *  that can, so the difference is two clicks apart rather than theoretical. */
export function SeedPicker({ seedHex, cvdView, onPick }: Props) {
  return (
    <div className="seed-picker" role="group" aria-label="Material Design 500 palette">
      {MATERIAL_500.map((hue) => {
        const selected = hue.hex.toLowerCase() === seedHex.toLowerCase();
        return (
          <button
            key={hue.name}
            type="button"
            className="seed-swatch"
            aria-pressed={selected}
            title={`${hue.name} 500 — ${hue.hex}`}
            style={{ background: simulateCvdHex(hue.hex, cvdView) }}
            onClick={() => onPick(hue.hex)}
          >
            <span className="visually-hidden">
              {hue.name} 500, {hue.hex}
            </span>
          </button>
        );
      })}
    </div>
  );
}
