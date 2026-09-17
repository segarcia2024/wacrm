/**
 * First-response SLA: customer first message → first human agent reply.
 * Bot / automation messages do NOT count as response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TARGET_MINUTES = 5;

export interface SlaProcessResult {
  scanned: number;
  upserted: number;
  notified5: number;
  notified10: number;
  notified15: number;
  resolved: number;
  errors: string[];
}

export async function processConversationSla(
  admin: SupabaseClient,
  now = new Date(),
): Promise<SlaProcessResult> {
  const result: SlaProcessResult = {
    scanned: 0,
    upserted: 0,
    notified5: 0,
    notified10: 0,
    notified15: 0,
    resolved: 0,
    errors: [],
  };

  // Open conversations without resolved SLA (or never tracked)
  const { data: convs, error } = await admin
    .from("conversations")
    .select("id, account_id, assigned_agent_id, status, created_at")
    .in("status", ["open", "pending"])
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const conv of convs ?? []) {
    result.scanned++;
    const conversationId = conv.id as string;
    const accountId = conv.account_id as string | null;
    if (!accountId) continue;

    // Skip if account flag off
    const { data: acc } = await admin
      .from("accounts")
      .select("feature_flags")
      .eq("id", accountId)
      .maybeSingle();
    const flags = (acc?.feature_flags ?? {}) as Record<string, boolean>;
    if (flags.crm11_sla !== true) continue;

    const { data: messages, error: msgErr } = await admin
      .from("messages")
      .select("sender_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (msgErr) {
      result.errors.push(`${conversationId}: ${msgErr.message}`);
      continue;
    }

    let firstCustomerAt: string | null = null;
    let firstAgentAt: string | null = null;
    for (const m of messages ?? []) {
      if (m.sender_type === "customer" && !firstCustomerAt) {
        firstCustomerAt = m.created_at as string;
      }
      if (
        m.sender_type === "agent" &&
        firstCustomerAt &&
        !firstAgentAt &&
        (m.created_at as string) >= firstCustomerAt
      ) {
        firstAgentAt = m.created_at as string;
        break;
      }
    }

    if (!firstCustomerAt) continue;

    let responseMinutes: number | null = null;
    let breached = false;
    if (firstAgentAt) {
      responseMinutes =
        (new Date(firstAgentAt).getTime() - new Date(firstCustomerAt).getTime()) /
        60_000;
      breached = responseMinutes > TARGET_MINUTES;
      result.resolved++;
    } else {
      const waitingMin =
        (now.getTime() - new Date(firstCustomerAt).getTime()) / 60_000;
      breached = waitingMin > TARGET_MINUTES;
    }

    const { data: existing } = await admin
      .from("conversation_sla")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    const payload = {
      conversation_id: conversationId,
      account_id: accountId,
      first_customer_at: firstCustomerAt,
      first_agent_at: firstAgentAt,
      response_minutes: responseMinutes,
      target_minutes: TARGET_MINUTES,
      breached,
      assigned_agent_id: conv.assigned_agent_id,
      channel: "whatsapp",
      updated_at: now.toISOString(),
    };

    if (existing) {
      await admin
        .from("conversation_sla")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await admin.from("conversation_sla").insert(payload);
      result.upserted++;
    }

    if (firstAgentAt) continue; // no escalation once answered

    const waitingMin =
      (now.getTime() - new Date(firstCustomerAt).getTime()) / 60_000;
    const slaRow = existing ?? payload;

    // 5 min → assignee
    if (waitingMin >= 5 && !(existing?.notified_5_at)) {
      await notifySla(admin, {
        accountId,
        conversationId,
        type: "sla_breach_5",
        title: "SLA: sin respuesta (5 min)",
        body: "Un lead lleva más de 5 minutos sin respuesta humana.",
        userId: (conv.assigned_agent_id as string | null) ?? null,
      });
      await admin
        .from("conversation_sla")
        .update({ notified_5_at: now.toISOString(), breached: true })
        .eq("conversation_id", conversationId);
      result.notified5++;
      void slaRow;
    }

    // 10 min → coordinators (owner/admin)
    if (waitingMin >= 10 && !(existing?.notified_10_at)) {
      const coords = await listCoordinators(admin, accountId);
      for (const uid of coords) {
        await notifySla(admin, {
          accountId,
          conversationId,
          type: "sla_breach_10",
          title: "SLA: escalado (10 min)",
          body: "Un lead lleva más de 10 minutos sin respuesta humana.",
          userId: uid,
        });
      }
      await admin
        .from("conversation_sla")
        .update({ notified_10_at: now.toISOString(), breached: true })
        .eq("conversation_id", conversationId);
      result.notified10++;
    }

    // 15 min → mark critical + notify coordinators
    if (waitingMin >= 15 && !(existing?.notified_15_at)) {
      const coords = await listCoordinators(admin, accountId);
      for (const uid of coords) {
        await notifySla(admin, {
          accountId,
          conversationId,
          type: "sla_breach_15",
          title: "SLA crítico (15 min)",
          body: "Lead marcado como crítico: más de 15 minutos sin respuesta.",
          userId: uid,
        });
      }
      await admin
        .from("conversation_sla")
        .update({
          notified_15_at: now.toISOString(),
          is_critical: true,
          breached: true,
        })
        .eq("conversation_id", conversationId);
      result.notified15++;
    }
  }

  return result;
}

async function listCoordinators(
  admin: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .eq("account_id", accountId)
    .in("account_role", ["owner", "admin"]);
  return (data ?? []).map((p) => p.user_id as string).filter(Boolean);
}

async function notifySla(
  admin: SupabaseClient,
  args: {
    accountId: string;
    conversationId: string;
    type: "sla_breach_5" | "sla_breach_10" | "sla_breach_15";
    title: string;
    body: string;
    userId: string | null;
  },
) {
  if (!args.userId) return;
  const { error } = await admin.from("notifications").insert({
    account_id: args.accountId,
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    conversation_id: args.conversationId,
  });
  if (error) {
    console.error("[sla-notify]", error.message);
  }
}

/**
 * On inbound customer message: set waiting_team and reopen if resolved.
 * On outbound agent message: set waiting_customer.
 */
export async function syncOperationalStatusOnMessage(
  admin: SupabaseClient,
  conversationId: string,
  senderType: "customer" | "agent" | "bot",
) {
  if (senderType === "bot") return;

  if (senderType === "customer") {
    await admin
      .from("conversations")
      .update({
        operational_status: "waiting_team",
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .in("operational_status", ["resolved", "archived", "waiting_customer"])
      .select("id");

    // Also set for null / open / new
    await admin
      .from("conversations")
      .update({
        operational_status: "waiting_team",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    return;
  }

  if (senderType === "agent") {
    await admin
      .from("conversations")
      .update({
        operational_status: "waiting_customer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }
}
