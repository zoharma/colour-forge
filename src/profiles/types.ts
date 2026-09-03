import type { WcagRequirement } from "../color/wcag";

export type ModeKey = "light" | "dark";

/** How a role is used in the interface. This is the whole reason the tool
 *  can say anything useful about WCAG: "is 4.5:1 required here" is a
 *  question about usage, not about the colour. A container is a surface and
 *  answers to nothing on its own; the text you put on it does. */
export type RoleUsage =
  | "text" // coloured text or icons on the page background
  | "surface" // a filled area that other content sits on
  | "boundary" // borders, focus rings, component outlines — 1.4.11
  | "accent"; // supporting emphasis, usually a boundary in practice

export interface RoleDef {
  key: string;
  label: string;
  /** Which step of the generated 12-step scale this role takes, per mode.
   *  Modes are indexed independently on purpose — see ProfileMode. */
  index: Record<ModeKey, number>;
  usage: RoleUsage;
  /** What the role itself must clear against the mode background. */
  requirement: WcagRequirement;
  /** True when the role is a surface that needs a paired foreground token. */
  needsForeground?: boolean;
  /** CSS custom property name, with `{intent}` substituted. */
  cssVar: string;
  /** CSS custom property for the paired foreground, when needsForeground. */
  foregroundCssVar?: string;
  /** How far this role must stay from the same role on other intents, on the
   *  0–441 RGB scale under simulated colour-vision deficiency.
   *
   *  Not one number for the whole system, because the question the floor
   *  answers is "if two intents differed only here, would a user lose
   *  information?" — and for a quiet tinted wash the answer is no. Two
   *  containers being similar is how container systems are built; it is the
   *  icon and the label that carry the meaning, not the wash. Applying a
   *  meaning-bearing floor to them condemns every real palette and buries
   *  the findings that matter. Defaults in SEPARATION_FLOOR below. */
  separationFloor?: number;
  description: string;
}

export interface ProfileMode {
  /** The page background roles are solved against. */
  background: string;
  /** The raised surface used for the container-visibility check. */
  surface: string;
  /** The neutral foreground of this mode — a foreground candidate, and the
   *  colour a `text` role is implicitly competing with. */
  onSurface: string;
  /** Target APCA Lc per scale step, and the chroma multiplier applied to the
   *  seed colour's chroma at that step.
   *
   *  Light and dark are separate arrays rather than one curve inverted,
   *  because the same role does not sit at the same relative position in
   *  both modes: a saturated fill can carry far less luminance separation on
   *  a dark page (chroma alone reads as distinct) than it must on a light
   *  one. One shared curve cannot fit both; two can. */
  targetLc: number[];
  chromaMultiplier: number[];
  /** Selector the exported CSS block is written under. */
  selector: string;
}

export interface SeededIntent {
  name: string;
  /** Role key → hex, per mode. Sparse: a role with no shipped value yet is
   *  simply absent rather than guessed. */
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  /** Shown in the UI so it is obvious what the numbers were derived from. */
  provenance: string;
  scaleSize: number;
  modes: Record<ModeKey, ProfileMode>;
  roles: RoleDef[];
  /** Roles compared across the intent family for CVD separation. Usually the
   *  surfaces and fills, since those are what carry meaning side by side. */
  separationRoles: string[];
  /** Existing intents to check a new colour against. Empty is valid — the
   *  family checks simply report that there is nothing to compare with. */
  family: SeededIntent[];
  cssHeader?: string;
  /** One-click seeds offered for this profile, and what to call them.
   *
   *  Profile-specific because the useful starting set is: for a system the
   *  tool does not know, the Material palette most work begins from; for one
   *  it does, that system's own shipped intents, so "make me another one like
   *  these" starts from the real value rather than a hex looked up elsewhere. */
  seedPaletteLabel: string;
  seedPalette: { name: string; hex: string }[];
}

export const roleByKey = (profile: Profile, key: string): RoleDef | undefined =>
  profile.roles.find((r) => r.key === key);

/** Default CVD separation floors, by whether the role has a contrast duty of
 *  its own. A role that must clear a WCAG criterion is one whose colour
 *  carries meaning — text, a border, a filled action — so two intents landing
 *  on the same colour there is a real loss. A role with no requirement is a
 *  background wash, where similarity is normal and only an outright duplicate
 *  is worth mentioning. */
export const SEPARATION_FLOOR = { meaningBearing: 15, wash: 6 } as const;

export const separationFloorFor = (role: RoleDef): number =>
  role.separationFloor ?? (role.requirement === "none" ? SEPARATION_FLOOR.wash : SEPARATION_FLOOR.meaningBearing);

/** A wash falling under its floor is worth saying; it is not a defect the way
 *  two indistinguishable status colours are. */
export const separationSeverityFor = (role: RoleDef): "blocker" | "warning" =>
  role.requirement === "none" ? "warning" : "blocker";

/** Scale steps are stored 0-based, because they index arrays, and shown
 *  1-based, because that is how people count a 12-step scale — and how the
 *  original tool numbered it. Everything user-facing goes through this:
 *  swatch labels, the step table, exported token names, findings. Getting the
 *  two conventions mixed is how a "step 5" in a conversation stops matching a
 *  "step 5" in a token file. */
export const displayStep = (index: number): number => index + 1;
