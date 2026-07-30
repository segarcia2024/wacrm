/**
 * Process due appointment reminders (client WhatsApp + agent in-app).
 * Invoked by `/api/appointments/cron` with the service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessageToConversation } from "@/lib/whatsapp/send-message";
import {
  buildAgentReminderBody,
  buildAgentReminderTitle,
  buildClientReminderText,
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
    errors: [],
  };

  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("appointments")
    .select(
      "*, contact:contacts(id, name, phone), assignee:profiles!appointments_assigned_to_fkey(id, user_id, full_name, email)",
    )
    .eq("status", "scheduled")
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
    if (!isAppointmentReminderDue(row.starts_at as string, now)) continue;

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

    // —— Client WhatsApp ——
    if (!row.client_reminder_sent_at) {
      try {
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

        if (conversationId) {
          const text = buildClientReminderText({
            contactName: contact?.name,
            typeLabel,
            whenLabel,
            location: row.location as string | null,
          });
          await sendMessageToConversation(
            admin,
            row.account_id as string,
            {
              conversationId,
              messageType: "text",
              contentText: text,
            },
          );
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

    // —— Agent in-app notification (profiles have no WhatsApp phone) ——
    if (!row.agent_reminder_sent_at && assignee?.user_id) {
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
    } else if (!row.agent_reminder_sent_at && !assignee?.user_id) {
      // No agent assigned — mark as handled so we don't retry forever.
      updates.agent_reminder_sent_at = now.toISOString();
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
