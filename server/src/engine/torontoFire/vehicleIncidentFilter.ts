/**
 * Keep only Toronto Fire CAD vehicle / collision rows.
 * Drop medical, structure fire, alarm, elevator, etc.
 */

const VEHICLE_COLLISION_PATTERNS: RegExp[] = [
  /\bvehicle\s*[-–]?\s*personal\s+injury\b/i,
  /\bvehicle\s+accident\b/i,
  /\bvehicle\s*[-–]?\s*accident\b/i,
  /\bvehicle\s+collision\b/i,
  /\bvehicle\s*[-–]?\s*collision\b/i,
  /\bmotor\s+vehicle\s+(?:accident|collision|crash)\b/i,
  /\bmvc\b/i,
  /\bmva\b/i,
];

/** True when Incident Type is a vehicle collision / personal-injury call. */
export function isTorontoFireVehicleCollision(eventType: string): boolean {
  const type = eventType.trim();
  if (!type) return false;
  // Must look like a vehicle collision — never medical / alarm / structure fire alone.
  if (!/\bvehicle\b|\bmvc\b|\bmva\b|\bmotor\s+vehicle\b/i.test(type)) return false;
  if (/\bmedical\b|\balarm\b|\belevator\b/i.test(type)) return false;
  return VEHICLE_COLLISION_PATTERNS.some((re) => re.test(type));
}
