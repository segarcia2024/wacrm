import { describe, expect, it } from "vitest";
import {
  buildContactsWorkbook,
  CONTACT_EXPORT_HEADERS,
  contactToExportRow,
  dealStatusLabel,
  toCsv,
} from "@/lib/contacts/export-spreadsheet";

describe("dealStatusLabel", () => {
  it("maps known statuses to Spanish labels", () => {
    expect(dealStatusLabel("open")).toBe("Abierto");
    expect(dealStatusLabel("won")).toBe("Ganado");
    expect(dealStatusLabel("lost")).toBe("Perdido");
    expect(dealStatusLabel("")).toBe("");
  });
});

describe("contactToExportRow", () => {
  it("flattens contact + assigned vehicle into spreadsheet columns", () => {
    const row = contactToExportRow({
      name: "Ana",
      phone: "+573001112233",
      username: "ana.wa",
      email: "ana@example.com",
      company: "Revio",
      tags: ["VIP", "Hot"],
      created_at: "2026-08-19T12:00:00.000Z",
      assigned: {
        label: "ABC123 · MAZDA 3 – 2018",
        plate: "ABC123",
        make: "MAZDA",
        model: "3",
        year: "2018",
        agentName: "Carlos",
        dealStatus: "open",
        extraCount: 1,
      },
    });
    expect(row[0]).toBe("Ana");
    expect(row[1]).toBe("+573001112233");
    expect(row[2]).toBe("@ana.wa");
    expect(row[6]).toBe("ABC123 · MAZDA 3 – 2018 (+1)");
    expect(row[7]).toBe("ABC123");
    expect(row[11]).toBe("Carlos");
    expect(row[12]).toBe("Abierto");
    expect(row[13]).toBe("2026-08-19");
    expect(row).toHaveLength(CONTACT_EXPORT_HEADERS.length);
  });
});

describe("toCsv", () => {
  it("quotes fields, uses semicolons, and prefixes a UTF-8 BOM", () => {
    const csv = toCsv([
      ["Nombre", "Notas"],
      ["Ana & Co", 'dijo "hola"'],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Ana & Co";"dijo ""hola"""');
  });
});

describe("buildContactsWorkbook", () => {
  it("starts with the header row", () => {
    const csv = buildContactsWorkbook([]);
    expect(csv).toContain("Nombre");
    expect(csv).toContain("Vehículo");
    expect(csv).toContain("Comercial");
  });
});
