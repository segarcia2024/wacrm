import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeByPhone,
  findExistingContact,
  findExistingContactByIdentity,
  findExistingContactByWaId,
  isExactMatch,
  isUniqueViolation,
  normalizeKey,
  upsertWhatsAppContact,
  type ExistingContact,
} from "./dedupe";
import type { InboundIdentity } from "@/lib/whatsapp/wa-identity";

describe("normalizeKey", () => {
  it("strips every non-digit", () => {
    expect(normalizeKey("+1 (555) 123-4567")).toBe("15551234567");
    expect(normalizeKey("15551234567")).toBe("15551234567");
  });

  it("collapses different formats of the same number to one key", () => {
    expect(normalizeKey("+44 7911 123456")).toBe(normalizeKey("447911123456"));
  });
});

describe("isExactMatch", () => {
  it("treats different formatting of the same digits as exact", () => {
    expect(isExactMatch({ id: "1", phone: "+1 555-123-4567" }, "15551234567")).toBe(
      true,
    );
  });

  it("is false for a trunk-variant (fuzzy) match", () => {
    // last-8 match but not the same full number
    expect(isExactMatch({ id: "1", phone: "37063949836" }, "370063949836")).toBe(
      false,
    );
  });
});

describe("isUniqueViolation", () => {
  it("detects Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("is false for other errors / non-objects", () => {
    expect(isUniqueViolation({ code: "23502" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
  });
});

describe("dedupeByPhone", () => {
  it("keeps the first occurrence and counts in-file duplicates", () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: "+1 555-1111", name: "A" },
      { phone: "15551111", name: "B" }, // same digits as #1
      { phone: "+1 555-2222", name: "C" },
    ]);
    expect(unique.map((r) => r.name)).toEqual(["A", "C"]);
    expect(duplicates).toBe(1);
  });

  it("drops rows with no digits", () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: "   " },
      { phone: "+1 555-3333" },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toBe(1);
  });
});

describe("findExistingContact", () => {
  // Minimal SupabaseClient stub: resolves the .from().select().eq().like()
  // chain to a fixed candidate set.
  function stubDb(rows: Array<{ id: string; phone: string }>): SupabaseClient {
    const builder = {
      select: () => builder,
      eq: () => builder,
      like: () => Promise.resolve({ data: rows, error: null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("returns a trunk-variant match via phonesMatch", async () => {
    const db = stubDb([{ id: "c1", phone: "37063949836" }]);
    const hit = await findExistingContact(db, "acct", "+370 063 949 836");
    expect(hit?.id).toBe("c1");
  });

  it("returns null when no candidate matches", async () => {
    const db = stubDb([{ id: "c1", phone: "15559999999" }]);
    const hit = await findExistingContact(db, "acct", "+1 555-123-4567");
    expect(hit).toBeNull();
  });

  it("returns null for an empty phone without querying", async () => {
    const db = stubDb([{ id: "c1", phone: "15551234567" }]);
    expect(await findExistingContact(db, "acct", "   ")).toBeNull();
  });
});

describe("findExistingContactByWaId", () => {
  function stubWaDb(
    row: { id: string; phone: string; wa_id: string } | null,
  ): SupabaseClient {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("matches a LID contact", async () => {
    const db = stubWaDb({
      id: "c1",
      phone: "",
      wa_id: "CO.2717513161983753",
    });
    const hit = await findExistingContactByWaId(
      db,
      "acct",
      "CO.2717513161983753",
    );
    expect(hit?.id).toBe("c1");
  });

  it("returns null when missing", async () => {
    const db = stubWaDb(null);
    expect(
      await findExistingContactByWaId(db, "acct", "CO.999"),
    ).toBeNull();
  });
});

describe("findExistingContactByIdentity", () => {
  it("falls back to wa_id when phone is empty", async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      like: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: { id: "lid-1", phone: "", wa_id: "CO.2717513161983753" },
          error: null,
        }),
    };
    const db = { from: () => builder } as unknown as SupabaseClient;
    const hit = await findExistingContactByIdentity(
      db,
      "acct",
      "",
      "CO.2717513161983753",
    );
    expect(hit?.id).toBe("lid-1");
  });
});

function memoryContacts(initial: ExistingContact[] = []) {
  const rows = initial.map((r) => ({ ...r }));
  let seq = 1;
  const from = () => {
    const eqs: { col: string; val: string }[] = [];
    const builder: {
      select: () => unknown;
      eq: (col: string, val: string) => unknown;
      like: (col: string, val: string) => Promise<{ data: ExistingContact[]; error: null }>;
      maybeSingle: () => Promise<{ data: ExistingContact | null; error: null }>;
      insert: (data: Record<string, unknown>) => {
        select: () => {
          single: () => Promise<{ data: ExistingContact; error: null }>;
        };
      };
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, id: string) => Promise<{ error: null }>;
      };
    } = {
      select: () => builder,
      eq: (col, val) => {
        eqs.push({ col, val });
        return builder;
      },
      like: (_col, val) => {
        const suffix = val.replace(/%/g, "");
        return Promise.resolve({
          data: rows.filter((r) => (r.phone ?? "").includes(suffix)),
          error: null,
        });
      },
      maybeSingle: () => {
        const bsuid = eqs.find((e) => e.col === "bsuid")?.val;
        const wa = eqs.find((e) => e.col === "wa_id")?.val;
        const hit = rows.find((r) =>
          bsuid ? r.bsuid === bsuid : wa ? r.wa_id === wa : false,
        );
        return Promise.resolve({ data: hit ?? null, error: null });
      },
      insert: (data) => {
        const row = { id: `c${seq++}`, ...data } as ExistingContact;
        rows.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: row, error: null }),
          }),
        };
      },
      update: (patch) => ({
        eq: (_col, id) => {
          const row = rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return Promise.resolve({ error: null });
        },
      }),
    };
    return builder;
  };
  return { db: { from } as unknown as SupabaseClient, rows };
}

const owner = "user-1";
const account = "acct";

function identity(partial: Partial<InboundIdentity>): InboundIdentity {
  return {
    phone: "",
    waId: null,
    bsuid: null,
    username: null,
    identifierType: "unknown",
    ...partial,
  };
}

describe("upsertWhatsAppContact", () => {
  it("caso 1 — crea contacto tradicional solo con teléfono", async () => {
    const { db, rows } = memoryContacts();
    const result = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Juan",
      identity: identity({
        phone: "573001234567",
        waId: "573001234567",
        identifierType: "phone",
      }),
    });
    expect(result?.wasCreated).toBe(true);
    expect(result?.contact.phone).toBe("573001234567");
    expect(result?.contact.bsuid).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("caso 2 — crea contacto sin teléfono con username + bsuid", async () => {
    const { db, rows } = memoryContacts();
    const result = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Sergio",
      identity: identity({
        bsuid: "CO.ABC123DEF456",
        waId: "CO.ABC123DEF456",
        username: "sergio",
        identifierType: "bsuid",
      }),
    });
    expect(result?.wasCreated).toBe(true);
    expect(result?.contact.phone).toBeNull();
    expect(result?.contact.bsuid).toBe("CO.ABC123DEF456");
    expect(result?.contact.username).toBe("sergio");
    expect(rows).toHaveLength(1);
  });

  it("caso 3 — híbrido guarda phone, username y bsuid", async () => {
    const { db } = memoryContacts();
    const result = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Maria",
      identity: identity({
        phone: "573001234567",
        waId: "573001234567",
        bsuid: "CO.ABC123DEF456",
        username: "maria88",
        identifierType: "bsuid",
      }),
    });
    expect(result?.contact.phone).toBe("573001234567");
    expect(result?.contact.bsuid).toBe("CO.ABC123DEF456");
    expect(result?.contact.username).toBe("maria88");
  });

  it("caso 4 — el teléfono posterior actualiza el mismo contacto BSUID", async () => {
    const { db, rows } = memoryContacts();
    const first = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Sergio",
      identity: identity({
        bsuid: "CO.ABC123DEF456",
        waId: "CO.ABC123DEF456",
        username: "sergio",
        identifierType: "bsuid",
      }),
    });
    const second = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Sergio",
      identity: identity({
        phone: "573001234567",
        waId: "573001234567",
        bsuid: "CO.ABC123DEF456",
        username: "sergio",
        identifierType: "bsuid",
      }),
    });
    expect(second?.wasCreated).toBe(false);
    expect(second?.contact.id).toBe(first?.contact.id);
    expect(second?.contact.phone).toBe("573001234567");
    expect(rows).toHaveLength(1);
  });

  it("caso 5 — dos webhooks del mismo usuario no duplican", async () => {
    const { db, rows } = memoryContacts();
    const payload = identity({
      phone: "573001234567",
      waId: "573001234567",
      identifierType: "phone",
    });
    const a = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Juan",
      identity: payload,
    });
    const b = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Juan",
      identity: payload,
    });
    expect(a?.contact.id).toBe(b?.contact.id);
    expect(rows).toHaveLength(1);
  });

  it("caso 6 — contacto sin teléfono tiene id interno usable para conversación", async () => {
    const { db } = memoryContacts();
    const result = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Maria",
      identity: identity({
        bsuid: "CO.YYYYYYYYYYYY",
        waId: "CO.YYYYYYYYYYYY",
        identifierType: "bsuid",
      }),
    });
    expect(result?.contact.id).toBeTruthy();
    expect(result?.contact.phone).toBeNull();
  });

  it("caso 7 — contacto antiguo con teléfono sigue resolviéndose por phone", async () => {
    const { db } = memoryContacts([
      {
        id: "legacy-1",
        phone: "573001234567",
        wa_id: "573001234567",
        name: "Legacy",
      },
    ]);
    const result = await upsertWhatsAppContact(db, {
      accountId: account,
      ownerUserId: owner,
      name: "Legacy",
      identity: identity({
        phone: "573001234567",
        waId: "573001234567",
        identifierType: "phone",
      }),
    });
    expect(result?.wasCreated).toBe(false);
    expect(result?.contact.id).toBe("legacy-1");
  });
});

