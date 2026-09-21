import { MATERIAL_500 } from "../src/profiles/material";
import { RADIX_9 } from "../src/profiles/radix";

/** Two independently-designed real palettes, not one designer's taste in
 *  saturation — Radix leans harder into muted/earth hues than Material does.
 *  Shared by every test that sweeps "real colours someone would actually
 *  pick" so the two palettes stay in exactly one place. */
export const REFERENCE_PALETTE = [...MATERIAL_500, ...RADIX_9];

/** The synthetic hue-circle sweep, shared so two files stepping through it
 *  independently can't quietly land on different resolutions. Yields
 *  0, 15, 30, ... 345 by default — fine enough to catch a hue-dependent
 *  regression, coarse enough to keep the sweeps that use it fast. */
export function* hueCircle(stepDegrees = 15): Generator<number> {
  for (let hue = 0; hue < 360; hue += stepDegrees) yield hue;
}
