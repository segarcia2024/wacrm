import { describe, expect, it } from "vitest";
import {
  extractWaIdFromWamid,
  normalizeBsuid,
  normalizeUsername,
  normalizeWaId,
  resolveInboundIdentity,
  resolveOutboundRecipient,
  resolveWhatsAppRecipient,
  isPhoneRecipient,
  isBsuidToken,
} from "./wa-identity";
import { toMetaMessageAddress } from "./recipient-resolver";

describe("normalizeWaId", () => {
  it("keeps E.164 digit phones", () => {
    expect(normalizeWaId("+57 300 111 2233")).toBe("573001112233");
  });

  it("preserves CO.* LID tokens", () => {
    expect(normalizeWaId("CO.2717513161983753")).toBe("CO.2717513161983753");
  });

  it("strips @lid suffix", () => {
    expect(normalizeWaId("218876465954956@lid")).toBe("218876465954956");
  });

  it("returns empty for blank input", () => {
    expect(normalizeWaId("")).toBe("");
    expect(normalizeWaId(null)).toBe("");
  });
});

describe("normalizeBsuid / username", () => {
  it("accepts official CC.alphanumeric BSUID", () => {
    expect(normalizeBsuid("US.13491208655302741918")).toBe(
      "US.13491208655302741918",
    );
    expect(isBsuidToken("CO.2717513161983753")).toBe(true);
  });

  it("rejects phones and usernames as BSUID", () => {
    expect(normalizeBsuid("573001112233")).toBe("");
    expect(normalizeBsuid("@sergio")).toBe("");
  });

  it("strips @ from username", () => {
    expect(normalizeUsername("@sergio")).toBe("sergio");
    expect(normalizeUsername("sergio")).toBe("sergio");
    expect(normalizeUsername("")).toBe("");
  });
});

describe("extractWaIdFromWamid", () => {
  it("extracts CO.* from a real Mercado Libre-style wamid", () => {
    const wamid =
      "wamid.HBgTQ08uMjcxNzUxMzE2MTk4Mzc1MxUUABIYIEFDQzJGRTVERjFENkQ2QzFGODAwRTBDN0YxMkM2OUY1AA==";
    expect(extractWaIdFromWamid(wamid)).toBe("CO.2717513161983753");
  });

  it("returns null for non-wamid strings", () => {
    expect(extractWaIdFromWamid("not-a-wamid")).toBeNull();
    expect(extractWaIdFromWamid(null)).toBeNull();
  });
});

describe("resolveInboundIdentity", () => {
  it("caso 1 — usuario tradicional: phone, sin username ni bsuid", () => {
    expect(
      resolveInboundIdentity({
        from: "573001234567",
        waId: "573001234567",
        messageId: "wamid.MOCK",
      }),
    ).toEqual({
      phone: "573001234567",
      waId: "573001234567",
      bsuid: null,
      username: null,
      identifierType: "phone",
    });
  });

  it("caso 2 — usuario nuevo: phone ausente, username + bsuid", () => {
    const id = resolveInboundIdentity({
      from: undefined,
      waId: undefined,
      userId: "CO.ABC123DEF456",
      fromUserId: "CO.ABC123DEF456",
      username: "@sergio",
    });
    expect(id.phone).toBe("");
    expect(id.bsuid).toBe("CO.ABC123DEF456");
    expect(id.username).toBe("sergio");
    expect(id.identifierType).toBe("bsuid");
  });

  it("caso 3 — híbrido: phone + username + bsuid", () => {
    const id = resolveInboundIdentity({
      from: "573001234567",
      waId: "573001234567",
      userId: "CO.ABC123DEF456",
      username: "sergio",
    });
    expect(id.phone).toBe("573001234567");
    expect(id.bsuid).toBe("CO.ABC123DEF456");
    expect(id.username).toBe("sergio");
    expect(id.identifierType).toBe("bsuid");
  });

  it("falls back to CO.* from wamid when from is empty", () => {
    const wamid =
      "wamid.HBgTQ08uNDQ4MzA3MTIxODYwNzIyNhUUABIYFDNBREY0RUYxOUY0REYxRUU1OTVEAA==";
    const id = resolveInboundIdentity({
      from: "",
      waId: "",
      messageId: wamid,
    });
    expect(id.phone).toBe("");
    expect(id.waId).toBe("CO.4483071218607226");
    expect(id.bsuid).toBe("CO.4483071218607226");
    expect(id.identifierType).toBe("bsuid");
  });

  it("uses contact.wa_id when from is missing", () => {
    const id = resolveInboundIdentity({
      from: undefined,
      waId: "CO.2717513161983753",
      messageId: null,
    });
    expect(id.phone).toBe("");
    expect(id.waId).toBe("CO.2717513161983753");
    expect(id.bsuid).toBe("CO.2717513161983753");
  });

  it("does not treat missing phone as an error — all fields optional", () => {
    const id = resolveInboundIdentity({
      from: null,
      waId: null,
      userId: null,
      username: null,
    });
    expect(id.phone).toBe("");
    expect(id.bsuid).toBeNull();
    expect(id.username).toBeNull();
    expect(id.identifierType).toBe("unknown");
  });
});

describe("resolveOutboundRecipient / resolveWhatsAppRecipient", () => {
  it("prefers valid phone over wa_id", () => {
    expect(
      resolveOutboundRecipient({
        phone: "+57 300 111 2233",
        wa_id: "CO.999",
      }),
    ).toBe("573001112233");
    expect(
      resolveWhatsAppRecipient({
        phone: "+57 300 111 2233",
        wa_id: "CO.999",
      }),
    ).toEqual({ type: "phone", value: "573001112233" });
  });

  it("falls back to bsuid then wa_id when phone is empty", () => {
    expect(
      resolveWhatsAppRecipient({
        phone: "",
        wa_id: "CO.2717513161983753",
        bsuid: "CO.2717513161983753",
      }),
    ).toEqual({ type: "bsuid", value: "CO.2717513161983753" });
  });

  it("never uses username as a destination", () => {
    expect(
      resolveWhatsAppRecipient({
        phone: "",
        wa_id: "",
        bsuid: null,
      }),
    ).toBeNull();
  });

  it("returns null when nothing usable", () => {
    expect(resolveOutboundRecipient({ phone: "", wa_id: "" })).toBeNull();
  });

  it("maps phone → to and bsuid → recipient", () => {
    expect(
      toMetaMessageAddress({ type: "phone", value: "573001234567" }),
    ).toEqual({ to: "573001234567" });
    expect(
      toMetaMessageAddress({ type: "bsuid", value: "CO.ABC123DEF456" }),
    ).toEqual({ recipient: "CO.ABC123DEF456" });
  });
});

describe("isPhoneRecipient", () => {
  it("is true for E.164 digits", () => {
    expect(isPhoneRecipient("573001112233")).toBe(true);
  });

  it("is false for LID / BSUID tokens", () => {
    expect(isPhoneRecipient("CO.2717513161983753")).toBe(false);
  });
});
