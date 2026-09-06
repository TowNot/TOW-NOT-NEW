const EARTH_RADIUS_KM = 6371;

export interface BoundingBox {
  bottomLeft: { lat: number; lng: number };
  topRight: { lat: number; lng: number };
}

/** Compute a bounding box of `radiusKm` around a center point. */
export function boundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): BoundingBox {
  const latDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const lngDelta =
    ((radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI)) /
    Math.cos((lat * Math.PI) / 180);
  return {
    bottomLeft: { lat: lat - latDelta, lng: lng - lngDelta },
    topRight: { lat: lat + latDelta, lng: lng + lngDelta },
  };
}

/** Split a bounding box into an `n`×`n` grid of smaller boxes (4 tiles when n=2). */
export function splitBoundingBox(box: BoundingBox, divisions: number): BoundingBox[] {
  const n = Math.max(1, Math.floor(divisions));
  return splitBoundingBoxGrid(box, n, n);
}

/** Split a bounding box into a `rows`×`cols` grid (e.g. 2×4 → 8 tiles). */
export function splitBoundingBoxGrid(
  box: BoundingBox,
  rows: number,
  cols: number,
): BoundingBox[] {
  const rowCount = Math.max(1, Math.floor(rows));
  const colCount = Math.max(1, Math.floor(cols));
  const latStep = (box.topRight.lat - box.bottomLeft.lat) / rowCount;
  const lngStep = (box.topRight.lng - box.bottomLeft.lng) / colCount;
  const tiles: BoundingBox[] = [];
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      tiles.push({
        bottomLeft: {
          lat: box.bottomLeft.lat + row * latStep,
          lng: box.bottomLeft.lng + col * lngStep,
        },
        topRight: {
          lat: box.bottomLeft.lat + (row + 1) * latStep,
          lng: box.bottomLeft.lng + (col + 1) * lngStep,
        },
      });
    }
  }
  return tiles;
}

/** Haversine distance in km. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
