import type {
  Conversation,
  ConversationVehicleHit,
  Contact,
  Tag,
  Vehicle,
} from "@/types";

/**
 * Conversation select that embeds the contact plus its tags, so the Inbox
 * can filter conversations by contact tag without a second round-trip.
 * Also embeds contact deals → vehicles for plate/make/model search.
 * `contact_tags(tags(*))` returns the join rows; {@link normalizeConversation}
 * flattens them onto `contact.tags` and `linkedVehicles`.
 */
export const CONVERSATION_SELECT =
  "*, contact:contacts(*, contact_tags(tags(*)), deals(id, status, vehicle:vehicles(plate, make, model)))";

/** Fallback when inventory join is unavailable (pre-046 schema). */
export const CONVERSATION_SELECT_LEGACY =
  "*, contact:contacts(*, contact_tags(tags(*)))";

type RawDealVehicle = Pick<Vehicle, "plate" | "make" | "model"> | null;
type RawContactDeal = {
  id: string;
  status?: string | null;
  vehicle?: RawDealVehicle;
};

/** Raw shape returned by {@link CONVERSATION_SELECT} before flattening. */
type RawContact = Contact & {
  contact_tags?: { tags: Tag | null }[];
  deals?: RawContactDeal[] | null;
};
type RawConversation = Omit<Conversation, "contact" | "linkedVehicles"> & {
  contact?: RawContact | null;
};

function linkedVehiclesFromContactDeals(
  deals: RawContactDeal[] | null | undefined,
): ConversationVehicleHit[] {
  const seen = new Set<string>();
  const out: ConversationVehicleHit[] = [];
  for (const d of deals ?? []) {
    if (d.status && d.status !== "open") continue;
    const v = d.vehicle;
    if (!v?.plate && !v?.make && !v?.model) continue;
    const key = `${v.plate ?? ""}|${v.make ?? ""}|${v.model ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      plate: v.plate ?? "",
      make: v.make ?? "",
      model: v.model ?? "",
    });
  }
  return out;
}

/**
 * Flatten the embedded `contact_tags(tags(*))` join into `contact.tags`.
 * Safe to call on rows fetched with {@link CONVERSATION_SELECT}; a row with
 * no contact (e.g. a freshly-inserted conversation) passes through untouched.
 */
export function normalizeConversation(raw: RawConversation): Conversation {
  const rawContact = raw.contact;
  if (!rawContact) return raw as Conversation;

  const { contact_tags, deals, ...contact } = rawContact;
  return {
    ...raw,
    linkedVehicles: linkedVehiclesFromContactDeals(deals),
    contact: {
      ...contact,
      tags: (contact_tags ?? [])
        .map((ct) => ct.tags)
        .filter((t): t is Tag => t != null),
    },
  };
}

export function normalizeConversations(
  rows: RawConversation[],
): Conversation[] {
  return rows.map(normalizeConversation);
}

/**
 * Whether an agent/viewer may keep a conversation in local inbox state
 * (mirrors SQL `can_view_conversation` for non-admin roles).
 * Admins should not use this gate — they see the full account inbox.
 */
export function isConversationInAgentScope(
  conversation: Pick<Conversation, "assigned_agent_id">,
  userId: string,
): boolean {
  const assignee = conversation.assigned_agent_id ?? null;
  return assignee === null || assignee === userId;
}

export interface ContactFilters {
  /** Tag ids; a conversation matches if its contact has ANY of them (OR). */
  tagIds: string[];
  /** Exact company match, or null for no company filter. */
  company: string | null;
}

/**
 * Whether a conversation passes the contact-based Inbox filters (issue #272).
 * Empty `tagIds` and null `company` are no-ops, so the default (no filters)
 * always matches. Tags use OR logic, consistent with Broadcast audiences.
 */
export function matchesContactFilters(
  conversation: Conversation,
  { tagIds, company }: ContactFilters,
): boolean {
  if (tagIds.length > 0) {
    const contactTagIds = conversation.contact?.tags ?? [];
    if (!contactTagIds.some((t) => tagIds.includes(t.id))) return false;
  }

  if (company !== null && conversation.contact?.company?.trim() !== company) {
    return false;
  }

  return true;
}
