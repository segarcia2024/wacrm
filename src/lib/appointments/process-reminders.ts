/**
 * Process due appointment reminders (client WhatsApp + agent in-app).
 * Invoked by `/api/appointments/cron` with the service-role client.
 *
 * CRM 1.1:
 *  - 24h reminder for scheduled/confirmed
 *  - 2h reminder only if still scheduled/confirmed
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessageToConversation } from "@/lib/whatsapp/send-message";
import {
  buildAgentReminderBody,
  buildAgentReminderTitle,
  buildClientReminderText,
  isAppointment2hReminderDue,
  isAppointmentReminderDue,
} from "@/lib/appointments/helpers";
import type { AppointmentType } from "@/types";

const TYPE_LABEL_ES: Record<AppointmentType, string> = {
  showroom: "Ver vehículo en sala",
  test_drive: "Prueba de manejo",
  call: "Llamada",
  delivery: "Entrega",
  other: "Cita",
};

function formatWhenEs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export interface ReminderProcessResult {
  scanned: number;
  clientSent: number;
  agentSent: number;
  client2hSent: number;
  agent2hSent: number;
  errors: string[];
}

export async function processAppointmentReminders(
  admin: SupabaseClient,
  now = new Date(),
): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = {
    scanned: 0,
    clientSent: 0,
    agentSent: 0,
    client2hSent: 0,
    agent2hSent: 0,
    errors: [],
  };

  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("appointments")
    .select(
      "*, contact:contacts(id, name, phone), assignee:profiles!appointments_assigned_to_fkey(id, user_id, full_name, email)",
    )
    .in("status", ["scheduled", "confirmed"])
    .eq("reminder_enabled", true)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", windowEnd)
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of rows ?? []) {
    result.scanned++;
    const due24 = isAppointmentReminderDue(row.starts_at as string, now);
    const due2h = isAppointment2hReminderDue(row.starts_at as string, now);
    if (!due24 && !due2h) continue;

    const type = row.type as AppointmentType;
    const typeLabel = TYPE_LABEL_ES[type] ?? TYPE_LABEL_ES.other;
    const whenLabel = formatWhenEs(row.starts_at as string);
    const contact = row.contact as
      | { id: string; name?: string | null; phone?: string | null }
      | null;
    const assignee = row.assignee as
      | { id: string; user_id: string; full_name?: string; email?: string }
      | null;

    const updates: Record<string, string> = {};

    const resolveConversationId = async (): Promise<string | null> => {
      let conversationId = (row.conversation_id as string | null) ?? null;
      if (!conversationId && row.contact_id) {
        const { data: conv } = await admin
          .from("conversations")
          .select("id")
          .eq("contact_id", row.contact_id as string)
          .eq("account_id", row.account_id as string)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = conv?.id ?? null;
      }
      return conversationId;
    };

    // —— 24h client WhatsApp ——
    if (due24 && !row.client_reminder_sent_at) {
      try {
        const conversationId = await resolveConversationId();
        if (conversationId) {
          const text = buildClientReminderText({
            contactName: contact?.name,
            typeLabel,
            whenLabel,
            location: row.location as string | null,
          });
          await sendMessageToConversation(admin, row.account_id as string, {
            conversationId,
            messageType: "text",
            contentText: text,
          });
          updates.client_reminder_sent_at = now.toISOString();
          result.clientSent++;
        } else {
          result.errors.push(
            `appointment ${row.id}: no conversation for client reminder`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`appointment ${row.id} client: ${msg}`);
      }
    }

    // —— 24h agent in-app ——
    if (due24 && !row.agent_reminder_sent_at && assignee?.user_id) {
      try {
        const contactLabel =
          contact?.name?.trim() || contact?.phone || "Cliente";
        const { error: notifErr } = await admin.from("notifications").insert({
          account_id: row.account_id,
          user_id: assignee.user_id,
          type: "appointment_reminder",
          conversation_id: row.conversation_id ?? null,
          contact_id: row.contact_id,
          actor_user_id: null,
          title: buildAgentReminderTitle(typeLabel),
          body: buildAgentReminderBody({
            contactLabel,
            whenLabel,
            location: row.location as string | null,
          }),
        });
        if (notifErr) throw new Error(notifErr.message);
        updates.agent_reminder_sent_at = now.toISOString();
        result.agentSent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`appointment ${row.id} agent: ${msg}`);
      }
    } else if (due24 && !row.agent_reminder_sent_at && !assignee?.user_id) {
      updates.agent_reminder_sent_at = now.toISOString();
    }

    // —— 2h reminders (only while still scheduled/confirmed) ——
    if (due2h && !row.client_reminder_2h_sent_at) {
      try {
        const conversationId = await resolveConversationId();
        if (conversationId) {
          const text =
            `Recordatorio: tu cita (${typeLabel}) es en menos de 2 horas ` +
            `(${whenLabel}). Te esperamos.`;
          await sendMessageToConversation(admin, row.account_id as string, {
            conversationId,
            messageType: "text",
            contentText: text,
          });
          updates.client_reminder_2h_sent_at = now.toISOString();
          result.client2hSent++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`appointment ${row.id} client2h: ${msg}`);
      }
    }

    if (due2h && !row.agent_reminder_2h_sent_at && assignee?.user_id) {
      try {
        const contactLabel =
          contact?.name?.trim() || contact?.phone || "Cliente";
        await admin.from("notifications").insert({
          account_id: row.account_id,
          user_id: assignee.user_id,
          type: "appointment_reminder",
          conversation_id: row.conversation_id ?? null,
          contact_id: row.contact_id,
          title: `Cita en 2h: ${typeLabel}`,
          body: `${contactLabel} · ${whenLabel}`,
        });
        updates.agent_reminder_2h_sent_at = now.toISOString();
        result.agent2hSent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`appointment ${row.id} agent2h: ${msg}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await admin
        .from("appointments")
        .update({ ...updates, updated_at: now.toISOString() })
        .eq("id", row.id);
    }
  }

  return result;
}
