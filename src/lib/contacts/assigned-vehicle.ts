/**
 * Resolve the vehicle a commercial assigned to a contact via deals.
 *
 * A contact can have several deals; the Clients table shows one primary
 * assignment (open deal with a vehicle first, then most recent).
 */

import { buildVehicleLabel } from "@/lib/vehicles/helpers";

export const DEAL_ASSIGNMENT_SELECT =
  "id, contact_id, status, created_at, title, vehicle:vehicles(plate, make, model, year), assignee:profiles!deals_assigned_to_fkey(full_name)";

/** Fallback when the inventory join is unavailable (pre-046 schema). */
export const DEAL_ASSIGNMENT_SELECT_LEGACY =
  "id, contact_id, status, created_at, title, assignee:profiles!deals_assigned_to_fkey(full_name)";

export interface AssignedVehicleFields {
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
}

export interface DealAssignee {
  full_name?: string | null;
}

export interface ContactDealAssignment {
  id: string;
  contact_id: string | null;
  status?: string | null;
  created_at: string;
  title?: string | null;
  vehicle?: AssignedVehicleFields | AssignedVehicleFields[] | null;
  assignee?: DealAssignee | DealAssignee[] | null;
}

export interface AssignedVehicleSummary {
  label: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  agentName: string;
  dealStatus: string;
  extraCount: number;
}

export function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isOpenDeal(status: string | null | undefined): boolean {
  return !status || status === "open";
}

/** Label from inventory fields, falling back to the deal title. */
export function vehicleLabelFromDeal(deal: ContactDealAssignment): string {
  const v = asOne(deal.vehicle);
  if (v?.make && v?.model && v?.year != null && String(v.year).trim()) {
    const label = buildVehicleLabel({
      plate: v.plate,
      make: v.make,
      model: v.model,
      year: v.year,
    });
    if (label) return label;
  }
  return String(deal.title ?? "").trim();
}

/**
 * Pick the commercial-assigned vehicle for a contact's deals.
 * Prefers an open deal that has a vehicle, then the most recent deal.
 */
export function pickAssignedVehicle(
  deals: ContactDealAssignment[],
): AssignedVehicleSummary | null {
  if (deals.length === 0) return null;

  const scored = [...deals].sort((a, b) => {
    const aHas = Boolean(asOne(a.vehicle)?.make || vehicleLabelFromDeal(a));
    const bHas = Boolean(asOne(b.vehicle)?.make || vehicleLabelFromDeal(b));
    if (aHas !== bHas) return aHas ? -1 : 1;
    const aVeh = Boolean(asOne(a.vehicle)?.make);
    const bVeh = Boolean(asOne(b.vehicle)?.make);
    if (aVeh !== bVeh) return aVeh ? -1 : 1;
    const aOpen = isOpenDeal(a.status);
    const bOpen = isOpenDeal(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const primary = scored[0];
  const label = vehicleLabelFromDeal(primary);
  if (!label) return null;

  const v = asOne(primary.vehicle);
  const assignee = asOne(primary.assignee);
  const uniqueLabels = new Set(
    scored.map(vehicleLabelFromDeal).filter(Boolean),
  );

  return {
    label,
    plate: v?.plate
      ? String(v.plate).trim().toUpperCase().replace(/[\s-]/g, "")
      : "",
    make: v?.make ? String(v.make).trim().toUpperCase() : "",
    model: v?.model ? String(v.model).trim().toUpperCase() : "",
    year: v?.year != null ? String(v.year).trim() : "",
    agentName: assignee?.full_name?.trim() ?? "",
    dealStatus: primary.status ? String(primary.status) : "open",
    extraCount: Math.max(0, uniqueLabels.size - 1),
  };
}

export function groupAssignmentsByContact(
  deals: ContactDealAssignment[],
): Map<string, AssignedVehicleSummary> {
  const byContact = new Map<string, ContactDealAssignment[]>();
  for (const deal of deals) {
    if (!deal.contact_id) continue;
    const list = byContact.get(deal.contact_id) ?? [];
    list.push(deal);
    byContact.set(deal.contact_id, list);
  }
  const out = new Map<string, AssignedVehicleSummary>();
  for (const [id, list] of byContact) {
    const summary = pickAssignedVehicle(list);
    if (summary) out.set(id, summary);
  }
  return out;
}
