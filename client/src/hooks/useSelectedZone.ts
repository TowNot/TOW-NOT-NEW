import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PUSH_ZONE_MODE,
  DEFAULT_ZONE_ID,
  getZone,
  isPushZoneMode,
  isZoneId,
  readLocalPushZoneMode,
  readLocalZoneId,
  syncProgressierPushTags,
  writeLocalPushZoneMode,
  writeLocalZoneId,
  type CoverageZone,
  type PushZoneMode,
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

function metadataPushZoneMode(user: ZoneUser | null | undefined): PushZoneMode | null {
  if (!user) return null;
  const fromPublic = user.publicMetadata?.pushZoneMode;
  if (isPushZoneMode(fromPublic)) return fromPublic;
  const fromUnsafe = user.unsafeMetadata?.pushZoneMode;
  if (isPushZoneMode(fromUnsafe)) return fromUnsafe;
  return null;
}

export function resolveSelectedZoneId(user?: ZoneUser | null): ZoneId | null {
  return metadataZoneId(user) ?? readLocalZoneId();
}

async function persistPrefsToClerk(
  user: ZoneUser,
  prefs: { selectedZoneId?: ZoneId; pushZoneMode?: PushZoneMode },
): Promise<void> {
  if (user.update) {
    await user.update({
      unsafeMetadata: {
        ...(user.unsafeMetadata ?? {}),
        ...prefs,
      },
    });
  }

  await fetch("/api/me/zone", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  }).catch(() => undefined);
}

export function useSelectedZone(user?: ZoneUser | null) {
  /** Local React state so guests (no Clerk) can switch zones without a remount. */
  const [localZoneId, setLocalZoneId] = useState<ZoneId | null>(() => readLocalZoneId());
  const [localPushMode, setLocalPushMode] = useState<PushZoneMode | null>(() =>
    readLocalPushZoneMode(),
  );

  const metadataId = metadataZoneId(user);
  const selectedZoneId: ZoneId = metadataId ?? localZoneId ?? DEFAULT_ZONE_ID;
  const pushZoneMode: PushZoneMode =
    metadataPushZoneMode(user) ?? localPushMode ?? DEFAULT_PUSH_ZONE_MODE;
  const zone: CoverageZone = getZone(selectedZoneId) ?? getZone(DEFAULT_ZONE_ID)!;
  const hasPreference = Boolean(metadataId ?? localZoneId);

  useEffect(() => {
    syncProgressierPushTags(selectedZoneId, pushZoneMode);
  }, [selectedZoneId, pushZoneMode]);

  const saveZone = useCallback(
    async (zoneId: ZoneId) => {
      writeLocalZoneId(zoneId);
      setLocalZoneId(zoneId);
      syncProgressierPushTags(zoneId, pushZoneMode);
      if (user) {
        try {
          await persistPrefsToClerk(user, { selectedZoneId: zoneId });
        } catch {
          // localStorage + local state already updated.
        }
      }
    },
    [user, pushZoneMode],
  );

  const savePushZoneMode = useCallback(
    async (mode: PushZoneMode) => {
      writeLocalPushZoneMode(mode);
      setLocalPushMode(mode);
      syncProgressierPushTags(selectedZoneId, mode);
      if (user) {
        try {
          await persistPrefsToClerk(user, { pushZoneMode: mode });
        } catch {
          // localStorage + local state already updated.
        }
      }
    },
    [user, selectedZoneId],
  );

  return {
    selectedZoneId,
    zone,
    hasPreference,
    pushZoneMode,
    saveZone,
    savePushZoneMode,
    fallbackZone: getZone(DEFAULT_ZONE_ID)!,
  };
}
