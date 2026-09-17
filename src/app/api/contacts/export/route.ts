// ============================================================
// GET /api/contacts/export
//
// Admin+ only dump of the account's contacts, with the vehicle
// assigned by the commercial. Agents/viewers receive 403 even if
// they hit the URL directly — hiding the button is not enough.
//
// Optional filters (same as the Clients list):
//   ?search=   name / phone / email / username / wa identity
//   ?tag_ids=  comma-separated tag UUIDs (OR)
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  DEAL_ASSIGNMENT_SELECT,
  DEAL_ASSIGNMENT_SELECT_LEGACY,
  groupAssignmentsByContact,
  type ContactDealAssignment,
} from "@/lib/contacts/assigned-vehicle";
import {
  buildContactsWorkbook,
  type ContactExportInput,
} from "@/lib/contacts/export-spreadsheet";
import type { Contact } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const DEAL_ID_CHUNK = 80;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, "").trim();
}

function parseTagIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id));
}

async function fetchAllContacts(
  supabase: SupabaseClient,
  accountId: string,
  search: string,
  tagIds: string[],
): Promise<Contact[]> {
  const out: Contact[] = [];
  let offset = 0;

  while (true) {
    if (tagIds.length > 0) {
      const { data, error } = await supabase.rpc("filter_contacts_by_tags", {
        p_tag_ids: tagIds,
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (error) {
        console.error("[GET /api/contacts/export] tag filter error:", error);
        throw new Error("Failed to load contacts");
      }
      const rows = (data ?? []) as { contact: Contact }[];
      const page = rows.map((r) => r.contact);
      out.push(...page);
      if (page.length < PAGE_SIZE) break;
    } else {
      let query = supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (search) {
        const like = `%${search}%`;
        const unameLike = `%${search.replace(/^@+/, "")}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},email.ilike.${like},username.ilike.${unameLike},bsuid.ilike.${like},wa_id.ilike.${like}`,
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error("[GET /api/contacts/export] contacts error:", error);
        throw new Error("Failed to load contacts");
      }
      const page = (data ?? []) as Contact[];
      out.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    offset += PAGE_SIZE;
  }

  return out;
}

async function fetchContactTagRows(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<{ contact_id: string; tag_id: string }[]> {
  const out: { contact_id: string; tag_id: string }[] = [];
  for (let i = 0; i < contactIds.length; i += DEAL_ID_CHUNK) {
    const slice = contactIds.slice(i, i + DEAL_ID_CHUNK);
    const { data, error } = await supabase
      .from("contact_tags")
      .select("contact_id, tag_id")
      .in("contact_id", slice);
    if (error) {
      console.error("[GET /api/contacts/export] contact_tags error:", error);
      continue;
    }
    out.push(...((data ?? []) as { contact_id: string; tag_id: string }[]));
  }
  return out;
}

async function fetchDealsForContacts(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<ContactDealAssignment[]> {
  const out: ContactDealAssignment[] = [];

  for (let i = 0; i < contactIds.length; i += DEAL_ID_CHUNK) {
    const slice = contactIds.slice(i, i + DEAL_ID_CHUNK);
    let offset = 0;
    let useLegacy = false;

    while (true) {
      const select = useLegacy
        ? DEAL_ASSIGNMENT_SELECT_LEGACY
        : DEAL_ASSIGNMENT_SELECT;
      const { data, error } = await supabase
        .from("deals")
        .select(select)
        .in("contact_id", slice)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error && !useLegacy) {
        useLegacy = true;
        offset = 0;
        continue;
      }
      if (error) {
        console.error("[GET /api/contacts/export] deals error:", error);
        break;
      }
      const page = (data ?? []) as unknown as ContactDealAssignment[];
      out.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return out;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = await checkRateLimit(
      `admin:contacts-export:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const url = new URL(request.url);
    const search = sanitizeSearch(url.searchParams.get("search") ?? "");
    const tagIds = parseTagIds(url.searchParams.get("tag_ids"));

    const contacts = await fetchAllContacts(
      ctx.supabase,
      ctx.accountId,
      search,
      tagIds,
    );

    const contactIds = contacts.map((c) => c.id);
    const [deals, tagJoinRows, allTags] = await Promise.all([
      fetchDealsForContacts(ctx.supabase, contactIds),
      fetchContactTagRows(ctx.supabase, contactIds),
      ctx.supabase.from("tags").select("id, name"),
    ]);

    const tagNameById = new Map<string, string>();
    for (const tag of allTags.data ?? []) {
      tagNameById.set(tag.id, tag.name);
    }
    const tagsByContact = new Map<string, string[]>();
    for (const row of tagJoinRows) {
      const name = tagNameById.get(row.tag_id);
      if (!name) continue;
      const list = tagsByContact.get(row.contact_id) ?? [];
      list.push(name);
      tagsByContact.set(row.contact_id, list);
    }

    const assignedByContact = groupAssignmentsByContact(deals);

    const rows: ContactExportInput[] = contacts.map((c) => ({
      name: c.name,
      phone: c.phone,
      username: c.username,
      email: c.email,
      company: c.company,
      tags: tagsByContact.get(c.id) ?? [],
      created_at: c.created_at,
      assigned: assignedByContact.get(c.id) ?? null,
    }));

    const csv = buildContactsWorkbook(rows);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `clientes-${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
