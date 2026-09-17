import type { SupabaseClient } from "@supabase/supabase-js";

import type { InteractiveMessagePayload } from "@/lib/whatsapp/interactive";
import type { WhatsAppRecipient } from "@/lib/whatsapp/wa-identity";

export interface PersistOutboundMessageArgs {
  db: SupabaseClient;
  conversationId: string;
  contactId?: string | null;
  recipient: WhatsAppRecipient;
  senderType: "agent" | "bot";
  contentType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  interactivePayload?: InteractiveMessagePayload | null;
  messageId: string;
  replyToMessageId?: string | null;
  aiGenerated?: boolean;
}

/**
 * Single insert shape for outbound WhatsApp messages (agent, flow, automation).
 * Always writes migration-050 identity columns so bot and agent rows match.
 */
export async function persistOutboundMessage(
  args: PersistOutboundMessageArgs,
): Promise<{ id: string }> {
  const { data, error } = await args.db
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      contact_id: args.contactId ?? null,
      sender_type: args.senderType,
      content_type: args.contentType,
      content_text: args.contentText ?? null,
      media_url: args.mediaUrl ?? null,
      template_name: args.templateName ?? null,
      interactive_payload: args.interactivePayload ?? null,
      message_id: args.messageId,
      status: "sent",
      reply_to_message_id: args.replyToMessageId ?? null,
      sender_identifier: args.recipient.value,
      sender_identifier_type: args.recipient.type,
      ai_generated: args.aiGenerated ?? false,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `sent to Meta but DB insert failed: ${error?.message ?? "missing id"}`,
    );
  }

  return { id: data.id };
}

export async function touchConversationPreview(
  db: SupabaseClient,
  conversationId: string,
  lastMessageText: string,
  opts?: { senderType?: "agent" | "bot" },
): Promise<void> {
  const update: Record<string, unknown> = {
    last_message_text: lastMessageText,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Human agent reply → waiting on customer (CRM 1.1 operational status)
  if (opts?.senderType === "agent") {
    update.operational_status = "waiting_customer";
  }
  await db.from("conversations").update(update).eq("id", conversationId);
}
