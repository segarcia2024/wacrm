import type {
  Conversation,
  ConversationLinkedDeal,
  ConversationVehicleHit,
  Contact,
  DealStatus,
  Tag,
  Vehicle,
} from "@/types";

/**
 * Conversation select that embeds the contact plus its tags, so the Inbox
 * can filter conversations by contact tag without a second round-trip.
 * Also embeds contact deals → vehicles for plate/make/model search and
 * lost-deal visibility filtering for agents.
 * `contact_tags(tags(*))` returns the join rows; {@link normalizeConversation}
 * flattens them onto `contact.tags`, `linkedVehicles`, and `linkedDeals`.
 */
/** List columns only — do not `select *` (avoids dumping unused tenant fields). */
const CONVERSATION_LIST_COLUMNS =
  "id, user_id, contact_id, status, operational_status, assigned_agent_id, last_message_text, last_message_at, unread_count, created_at, updated_at, ai_autoreply_disabled, ai_reply_count, ai_handoff_summary";

const CONTACT_LIST_COLUMNS =
  "id, user_id, account_id, name, phone, wa_id, username, avatar_url, company";

export const CONVERSATION_SELECT =
  `${CONVERSATION_LIST_COLUMNS}, contact:contacts(${CONTACT_LIST_COLUMNS}, contact_tags(tags(*)), deals(id, status, conversation_id, next_action, next_action_at, stage:pipeline_stages(name), assignee:profiles!deals_assigned_to_fkey(full_name), vehicle:vehicles(plate, make, model)))`;

/** Fallback when inventory join is unavailable (pre-046 schema). */
export const CONVERSATION_SELECT_LEGACY =
  `${CONVERSATION_LIST_COLUMNS}, contact:contacts(${CONTACT_LIST_COLUMNS}, contact_tags(tags(*)))`;

/** Fallback if operational_status column missing (pre-054). */
export const CONVERSATION_SELECT_PRE_OPS =
  "id, user_id, contact_id, status, assigned_agent_id, last_message_text, last_message_at, unread_count, created_at, updated_at, ai_autoreply_disabled, ai_reply_count, ai_handoff_summary, contact:contacts(id, user_id, account_id, name, phone, wa_id, username, avatar_url, company, contact_tags(tags(*)))";

/** Cap for the inbox list so a tenant cannot dump every thread at once. */
export const CONVERSATION_LIST_LIMIT = 250;

type RawDealVehicle = Pick<Vehicle, "plate" | "make" | "model"> | null;
type RawContactDeal = {
  id: string;
  status?: string | null;
  conversation_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  stage?: { name?: string | null } | { name?: string | null }[] | null;
  assignee?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  vehicle?: RawDealVehicle | RawDealVehicle[];
};

/** Raw shape returned by {@link CONVERSATION_SELECT} before flattening. */
type RawContact = Contact & {
  contact_tags?: { tags: Tag | null }[];
  deals?: RawContactDeal[] | null;
};
type RawConversation = Omit<
  Conversation,
  "contact" | "linkedVehicles" | "linkedDeals"
> & {
  contact?: RawContact | null;
};

const DEAL_STATUSES: readonly DealStatus[] = ["open", "won", "lost"];

function asDealStatus(value: string | null | undefined): DealStatus {
  if (value && (DEAL_STATUSES as readonly string[]).includes(value)) {
    return value as DealStatus;
  }
  return "open";
}

function linkedVehiclesFromContactDeals(
  deals: RawContactDeal[] | null | undefined,
): ConversationVehicleHit[] {
  const seen = new Set<string>();
  const out: ConversationVehicleHit[] = [];
  for (const d of deals ?? []) {
    if (d.status && d.status !== "open") continue;
    const v = unwrapOne(d.vehicle);
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

function linkedDealsFromContactDeals(
  deals: RawContactDeal[] | null | undefined,
): ConversationLinkedDeal[] {
  return (deals ?? []).map((d) => ({
    id: d.id,
    status: asDealStatus(d.status),
    conversation_id: d.conversation_id ?? null,
  }));
}

/**
 * Flatten the embedded `contact_tags(tags(*))` join into `contact.tags`.
 * Safe to call on rows fetched with {@link CONVERSATION_SELECT}; a row with
 * no contact (e.g. a freshly-inserted conversation) passes through untouched.
 */
function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function asRawConversation(row: unknown): RawConversation {
  const raw = row as RawConversation & { contact?: RawContact | RawContact[] | null };
  return {
    ...raw,
    contact: unwrapOne(raw.contact),
  };
}

export function asRawConversations(rows: unknown): RawConversation[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(asRawConversation);
}

export function normalizeConversation(input: unknown): Conversation {
  const raw = asRawConversation(input);
  const rawContact = raw.contact;
  if (!rawContact) return raw as Conversation;

  const { contact_tags, deals, ...contact } = rawContact;
  const openDeal = (deals ?? []).find((d) => !d.status || d.status === "open");
  const stage = unwrapOne(openDeal?.stage);
  const assignee = unwrapOne(openDeal?.assignee);

  return {
    ...raw,
    linkedVehicles: linkedVehiclesFromContactDeals(deals),
    linkedDeals: linkedDealsFromContactDeals(deals),
    openDealSummary: openDeal
      ? {
          id: openDeal.id,
          stageName: stage?.name ?? null,
          nextAction: openDeal.next_action ?? null,
          nextActionAt: openDeal.next_action_at ?? null,
          assigneeName: assignee?.full_name ?? null,
        }
      : null,
    contact: {
      ...contact,
      tags: (contact_tags ?? [])
        .map((ct) => ct.tags)
        .filter((t): t is Tag => t != null),
    },
  };
}

/**
 * True when this thread has a deal marked lost that is linked to it
 * (or, if the deal has no conversation_id, any lost deal on the contact).
 * Agents should not see these in the inbox; admins keep full visibility.
 */
export function isLostDealConversation(conversation: Conversation): boolean {
  const deals = conversation.linkedDeals ?? [];
  if (deals.length === 0) return false;

  const linkedToThread = deals.filter(
    (d) => d.conversation_id === conversation.id,
  );
  if (linkedToThread.length > 0) {
    return linkedToThread.some((d) => d.status === "lost");
  }

  // Legacy deals created without conversation_id: hide only when every
  // contact deal is lost (no open/won opportunity left for agents).
  return deals.every((d) => d.status === "lost");
}

export function normalizeConversations(rows: unknown): Conversation[] {
  return asRawConversations(rows).map(normalizeConversation);
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
