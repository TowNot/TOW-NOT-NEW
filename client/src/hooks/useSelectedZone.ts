import { useCallback, useState } from "react";
import {
  DEFAULT_ZONE_ID,
  getZone,
  isZoneId,
  readLocalZoneId,
  writeLocalZoneId,
  type CoverageZone,
  type ZoneId,
} from "../lib/zones";

export interface ZoneUser {
  publicMetadata?: Record<string, unknown> | null;
  unsafeMetadata?: Record<string, unknown> | null;
  update?: (payload: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown>;
}

function metadataZoneId(user: ZoneUser | null | undefined): ZoneId | null {
  if (!user) return null;
  const fromPublic = user.publicMetadata?.selectedZoneId;
  if (isZoneId(fromPublic)) return fromPublic;
  const fromUnsafe = user.unsafeMetadata?.selectedZoneId;
  if (isZoneId(fromUnsafe)) return fromUnsafe;
  return null;
}

export function resolveSelectedZoneId(user?: ZoneUser | null): ZoneId | null {
  return metadataZoneId(user) ?? readLocalZoneId();
}

async function persistZoneToClerk(user: ZoneUser, zoneId: ZoneId): Promise<void> {
  if (user.update) {
    await user.update({
      unsafeMetadata: {
        ...(user.unsafeMetadata ?? {}),
        selectedZoneId: zoneId,
      },
    });
  }

  await fetch("/api/me/zone", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedZoneId: zoneId }),
  }).catch(() => undefined);
}

export function useSelectedZone(user?: ZoneUser | null) {
  /** Local React state so guests (no Clerk) can switch zones without a remount. */
  const [localZoneId, setLocalZoneId] = useState<ZoneId | null>(() => readLocalZoneId());

  const metadataId = metadataZoneId(user);
  const selectedZoneId: ZoneId = metadataId ?? localZoneId ?? DEFAULT_ZONE_ID;
  const zone: CoverageZone = getZone(selectedZoneId) ?? getZone(DEFAULT_ZONE_ID)!;
  const hasPreference = Boolean(metadataId ?? localZoneId);

  const saveZone = useCallback(
    async (zoneId: ZoneId) => {
      writeLocalZoneId(zoneId);
      setLocalZoneId(zoneId);
      if (user) {
        try {
          await persistZoneToClerk(user, zoneId);
        } catch {
          // localStorage + local state already updated.
        }
      }
    },
    [user],
  );

  return {
    selectedZoneId,
    zone,
    hasPreference,
    saveZone,
    fallbackZone: getZone(DEFAULT_ZONE_ID)!,
  };
}
