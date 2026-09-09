import type { ZoneUser } from "../hooks/useSelectedZone";
import {
  isZoneEnabledForDesk,
  isZoneId,
  readLocalCityChosen,
  readLocalZoneId,
} from "./zones";

function metadataHasChosenCity(user: ZoneUser | null | undefined): boolean {
  if (!user) return false;
  const fromPublic = user.publicMetadata?.selectedZoneId;
  if (isZoneId(fromPublic) && isZoneEnabledForDesk(fromPublic)) return true;
  const fromUnsafe = user.unsafeMetadata?.selectedZoneId;
  return isZoneId(fromUnsafe) && isZoneEnabledForDesk(fromUnsafe);
}

/** True when this device/account already picked a city (no network needed). */
export function clientHasChosenCity(user?: ZoneUser | null): boolean {
  if (readLocalCityChosen()) {
    const local = readLocalZoneId();
    if (local && isZoneEnabledForDesk(local)) return true;
  }
  return metadataHasChosenCity(user);
}
