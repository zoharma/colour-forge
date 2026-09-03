/** Material Design 2 core palette, and MUI's default intent colours.
 *
 *  Two jobs. The 500s are seed candidates — the set most non-Diamond work
 *  starts from, so they are one click rather than a hex to look up. The MUI
 *  intents are the comparison family for the generic profile: a real, shipped
 *  palette that a lot of applications are literally using, which is a far more
 *  useful thing to check a new colour against than a set invented here.
 *
 *  These are quoted values, not generated ones. */

export interface MaterialHue {
  name: string;
  hex: string;
}

/** The Material Design 2 palette at shade 500. */
export const MATERIAL_500: MaterialHue[] = [
  { name: "Red", hex: "#f44336" },
  { name: "Pink", hex: "#e91e63" },
  { name: "Purple", hex: "#9c27b0" },
  { name: "Deep Purple", hex: "#673ab7" },
  { name: "Indigo", hex: "#3f51b5" },
  { name: "Blue", hex: "#2196f3" },
  { name: "Light Blue", hex: "#03a9f4" },
  { name: "Cyan", hex: "#00bcd4" },
  { name: "Teal", hex: "#009688" },
  { name: "Green", hex: "#4caf50" },
  { name: "Light Green", hex: "#8bc34a" },
  { name: "Lime", hex: "#cddc39" },
  { name: "Yellow", hex: "#ffeb3b" },
  { name: "Amber", hex: "#ffc107" },
  { name: "Orange", hex: "#ff9800" },
  { name: "Deep Orange", hex: "#ff5722" },
  { name: "Brown", hex: "#795548" },
  { name: "Grey", hex: "#9e9e9e" },
  { name: "Blue Grey", hex: "#607d8b" },
];

/** MUI's default theme palette (v5/v6), `main` for each intent. These are the
 *  colours an unstyled MUI application is already shipping. */
export const MUI_DEFAULT_INTENTS: MaterialHue[] = [
  { name: "primary", hex: "#1976d2" },
  { name: "secondary", hex: "#9c27b0" },
  { name: "error", hex: "#d32f2f" },
  { name: "warning", hex: "#ed6c02" },
  { name: "info", hex: "#0288d1" },
  { name: "success", hex: "#2e7d32" },
];
