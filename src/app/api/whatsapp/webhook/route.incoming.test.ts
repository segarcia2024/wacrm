import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildInboundTextWebhookPayload } from "../../../../../__tests__/helpers/whatsapp-webhook-payload";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: vi.fn() };
});

import { after as afterMock } from "next/server";
import { POST } from "./route";

const META_SECRET = process.env.META_APP_SECRET ?? "test-meta-app-secret";

function signBody(rawBody: string, secret: string = META_SECRET): string {
  const hex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}

function postWebhook(rawBody: string, signature: string) {
  return POST(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body: rawBody,
    }),
  );
}

describe("POST /api/whatsapp/webhook — inbound text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acepta un payload firmado y responde 200 received", async () => {
    const payload = buildInboundTextWebhookPayload({
      from: "573001112233",
      contactName: "Ana Cliente",
      textBody: "Hola, ¿tienen el Mazda CX-5 en stock?",
    });
    const rawBody = JSON.stringify(payload);

    const res = await postWebhook(rawBody, signBody(rawBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "received" });
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza firma HMAC inválida (401)", async () => {
    const rawBody = JSON.stringify(buildInboundTextWebhookPayload());
    const res = await postWebhook(rawBody, signBody(rawBody, "wrong-secret"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Invalid signature" });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("rechaza JSON malformado con firma válida (400)", async () => {
    const rawBody = '{"entry":';
    const res = await postWebhook(rawBody, signBody(rawBody));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Invalid JSON" });
  });
});
