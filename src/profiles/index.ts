import { diamondProfile } from "./diamond";
import { genericProfile } from "./generic";
import type { Profile } from "./types";

export const PROFILES: Profile[] = [genericProfile, diamondProfile];

export const DEFAULT_PROFILE_ID = genericProfile.id;

export const findProfile = (id: string): Profile =>
  PROFILES.find((p) => p.id === id) ?? genericProfile;

export * from "./types";
export { diamondProfile, genericProfile };
