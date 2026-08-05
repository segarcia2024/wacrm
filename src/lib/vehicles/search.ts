/**
 * Shared vehicle text matching for Inbox / Pipeline search.
 */

export interface VehicleSearchFields {
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  title?: string | null;
}

/** Lowercased searchable blob for a vehicle (plate, make, model, title). */
export function vehicleSearchBlob(v: VehicleSearchFields): string {
  return [v.plate, v.make, v.model, v.title]
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function matchesVehicleSearch(
  fields: VehicleSearchFields | VehicleSearchFields[] | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const list = !fields ? [] : Array.isArray(fields) ? fields : [fields];
  return list.some((v) => vehicleSearchBlob(v).includes(q));
}
