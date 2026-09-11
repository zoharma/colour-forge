import { carbonProfile } from "./carbon";
import { diamondProfile } from "./diamond";
import { genericProfile } from "./generic";
import { material3Profile } from "./material3";
import { muiProfile } from "./mui";
import type { Profile } from "./types";

export const PROFILES: Profile[] = [
  genericProfile,
  muiProfile,
  material3Profile,
  carbonProfile,
  diamondProfile,
];

export const DEFAULT_PROFILE_ID = genericProfile.id;

export const findProfile = (id: string): Profile =>
  PROFILES.find((p) => p.id === id) ?? genericProfile;

export * from "./types";
export { carbonProfile, diamondProfile, genericProfile, material3Profile, muiProfile };
