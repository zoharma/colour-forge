import { apcaYHex } from "../src/color/apca";
import type { ContrastPolicy, StepContext } from "../src/color/solver";
import type { WcagRequirement } from "../src/color/wcag";

/** Builds the `StepContext` shape `solveStep` expects, from the pieces every
 *  test actually varies — hue/chroma, which background, what the role
 *  requires and which policy is under test — so that shape isn't
 *  hand-assembled independently in more than one test file. */
export function stepContext(
  hue: number,
  chroma: number,
  backgroundHex: string,
  requirement: WcagRequirement,
  policy: ContrastPolicy,
): StepContext {
  const backgroundY = apcaYHex(backgroundHex);
  return {
    hue,
    chroma,
    backgroundHex,
    backgroundY,
    backgroundIsLight: backgroundY > 0.4,
    requirement,
    policy,
  };
}
