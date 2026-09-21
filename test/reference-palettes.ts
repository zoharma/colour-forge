import { MATERIAL_500 } from "../src/profiles/material";
import { RADIX_9 } from "./radix";

/** Two independently-designed real palettes — Radix leans harder into
 *  muted/earth hues than Material does. */
export const REFERENCE_PALETTE = [...MATERIAL_500, ...RADIX_9];

/** Shared so two files sweeping the hue circle can't land on different
 *  resolutions. Yields 0, 15, 30, ... 345 by default. */
export function* hueCircle(stepDegrees = 15): Generator<number> {
  for (let hue = 0; hue < 360; hue += stepDegrees) yield hue;
}
