import { MATERIAL_500 } from "../src/profiles/material";
import { RADIX_9 } from "../src/profiles/radix";

/** Two independently-designed real palettes, not one designer's taste in
 *  saturation — Radix leans harder into muted/earth hues than Material does.
 *  Shared by every test that sweeps "real colours someone would actually
 *  pick" so the two palettes stay in exactly one place. */
export const REFERENCE_PALETTE = [...MATERIAL_500, ...RADIX_9];
