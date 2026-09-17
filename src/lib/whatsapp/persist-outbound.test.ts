import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistOutboundMessage,
  touchConversationPreview,
} from "./persist-outbound";

function mockInsertDb(result: {
  data?: { id: string } | null;
  error?: { message: string } | null;
}): SupabaseClient {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  };
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
}

describe("persistOutboundMessage", () => {
  it("writes migration-050 identity columns", async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "msg-1" }, error: null }),
    };
    const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    await persistOutboundMessage({
      db,
      conversationId: "cv-1",
      contactId: "ct-1",
      recipient: { type: "phone", value: "573001112233" },
      senderType: "agent",
      contentType: "text",
      contentText: "hola",
      messageId: "wamid.1",
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "cv-1",
        contact_id: "ct-1",
        sender_type: "agent",
        content_type: "text",
        message_id: "wamid.1",
        sender_identifier: "573001112233",
        sender_identifier_type: "phone",
        status: "sent",
      }),
    );
  });

  it("throws when the insert fails after Meta already accepted", async () => {
    const db = mockInsertDb({ error: { message: "rls" } });
    await expect(
      persistOutboundMessage({
        db,
        conversationId: "cv-1",
        recipient: { type: "phone", value: "57300" },
        senderType: "bot",
        contentType: "text",
        messageId: "wamid.2",
      }),
    ).rejects.toThrow(/sent to Meta but DB insert failed/);
  });
});

describe("touchConversationPreview", () => {
  it("updates last_message_text on the conversation", async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    await touchConversationPreview(db, "cv-1", "último");

    expect(db.from).toHaveBeenCalledWith("conversations");
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_message_text: "último" }),
    );
    expect(chain.eq).toHaveBeenCalledWith("id", "cv-1");
  });
});
