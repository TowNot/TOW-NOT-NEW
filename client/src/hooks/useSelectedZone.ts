import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ZONE_ID,
  getZone,
  isZoneEnabledForDesk,
  isZoneId,
  readLocalZoneId,
  syncProgressierPushTags,
  writeLocalZoneId,
  type CoverageZone,
  type ZoneId,
} from "../lib/zones";

export interface ZoneUser {
  id?: string;
  publicMetadata?: Record<string, unknown> | null;
  unsafeMetadata?: Record<string, unknown> | null;
  update?: (payload: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown>;
}

function metadataZoneId(user: ZoneUser | null | undefined): ZoneId | null {
  if (!user) return null;
  const fromPublic = user.publicMetadata?.selectedZoneId;
  if (isZoneId(fromPublic) && isZoneEnabledForDesk(fromPublic)) return fromPublic;
  const fromUnsafe = user.unsafeMetadata?.selectedZoneId;
  if (isZoneId(fromUnsafe) && isZoneEnabledForDesk(fromUnsafe)) return fromUnsafe;
  return null;
}

export function resolveSelectedZoneId(user?: ZoneUser | null): ZoneId | null {
  const raw = metadataZoneId(user) ?? readLocalZoneId();
  if (raw && isZoneEnabledForDesk(raw)) return raw;
  return DEFAULT_ZONE_ID;
}

async function persistZoneToServer(zoneId: ZoneId): Promise<void> {
  await fetch("/api/user/city", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedCity: zoneId }),
  });
}

export function useSelectedZone(user?: ZoneUser | null) {
  /** Local React state so guests (no Clerk) can switch zones without a remount. */
  const [localZoneId, setLocalZoneId] = useState<ZoneId | null>(() => readLocalZoneId());
  const [savedCityId, setSavedCityId] = useState<ZoneId | null>(null);

  const metadataId = metadataZoneId(user);
  const localEnabled =
    localZoneId && isZoneEnabledForDesk(localZoneId) ? localZoneId : null;
  const selectedZoneId: ZoneId = savedCityId ?? metadataId ?? localEnabled ?? DEFAULT_ZONE_ID;
  const zone: CoverageZone = getZone(selectedZoneId) ?? getZone(DEFAULT_ZONE_ID)!;
  const hasPreference = Boolean(savedCityId ?? metadataId ?? localEnabled);

  useEffect(() => {
    if (!user?.id) {
      setSavedCityId(null);
      return;
    }

    let cancelled = false;
    void fetch("/api/user/city", { credentials: "include" })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const city = data?.selectedCity;
        if (isZoneId(city) && isZoneEnabledForDesk(city)) {
          setSavedCityId(city);
          writeLocalZoneId(city);
          setLocalZoneId(city);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    // Migrate stale localStorage away from paused cities (e.g. Toronto).
    if (localZoneId && !isZoneEnabledForDesk(localZoneId)) {
      writeLocalZoneId(DEFAULT_ZONE_ID);
      setLocalZoneId(DEFAULT_ZONE_ID);
    }
  }, [localZoneId]);

  useEffect(() => {
    syncProgressierPushTags(selectedZoneId);
  }, [selectedZoneId]);

  const saveZone = useCallback(
    async (zoneId: ZoneId) => {
      if (!isZoneEnabledForDesk(zoneId)) return;
      writeLocalZoneId(zoneId);
      setLocalZoneId(zoneId);
      setSavedCityId(zoneId);
      // Overwrite Progressier tags immediately so the previous city stops receiving.
      syncProgressierPushTags(zoneId);
      if (user) {
        try {
          if (user.update) {
            await user.update({
              unsafeMetadata: {
                ...(user.unsafeMetadata ?? {}),
                selectedZoneId: zoneId,
              },
            });
          }
          await persistZoneToServer(zoneId);
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
