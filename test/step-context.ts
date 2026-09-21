import { apcaYHex } from "../src/color/apca";
import { isLightBackground } from "../src/color/scale";
import type { ContrastPolicy, StepContext } from "../src/color/solver";
import type { WcagRequirement } from "../src/color/wcag";

/** Shared `StepContext` builder — uses the real `isLightBackground`, not a
 *  second copy of its cutoff. */
export function stepContext(
  hue: number,
  chroma: number,
  backgroundHex: string,
  requirement: WcagRequirement,
  policy: ContrastPolicy,
): StepContext {
  return {
    hue,
    chroma,
    backgroundHex,
    backgroundY: apcaYHex(backgroundHex),
    backgroundIsLight: isLightBackground(backgroundHex),
    requirement,
    policy,
  };
}
