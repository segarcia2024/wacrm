import { describe, expect, it } from "vitest";
import {
  addDays,
  buildAgentReminderBody,
  buildAgentReminderTitle,
  buildClientReminderText,
  isAppointmentReminderDue,
  startOfWeekMonday,
} from "@/lib/appointments/helpers";

describe("isAppointmentReminderDue", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("is due when starts within the next 24h", () => {
    expect(
      isAppointmentReminderDue("2026-07-31T10:00:00.000Z", now),
    ).toBe(true);
  });

  it("is not due when more than 24h away", () => {
    expect(
      isAppointmentReminderDue("2026-08-02T12:00:00.000Z", now),
    ).toBe(false);
  });

  it("is not due when already in the past", () => {
    expect(
      isAppointmentReminderDue("2026-07-30T11:00:00.000Z", now),
    ).toBe(false);
  });
});

describe("reminder copy", () => {
  it("builds client WhatsApp text", () => {
    const text = buildClientReminderText({
      contactName: "Fabio",
      typeLabel: "Prueba de manejo",
      whenLabel: "31 jul 2026, 2:00 p. m.",
      location: "Calle 100",
    });
    expect(text).toContain("Hola Fabio");
    expect(text).toContain("Prueba de manejo");
    expect(text).toContain("Calle 100");
  });

  it("builds agent notification bits", () => {
    expect(buildAgentReminderTitle("Llamada")).toContain("Llamada");
    expect(
      buildAgentReminderBody({
        contactLabel: "Fabio",
        whenLabel: "mañana 2pm",
        location: "Sala",
      }),
    ).toContain("Sala");
  });
});

describe("week helpers", () => {
  it("starts week on Monday", () => {
    // Thursday 2026-07-30
    const start = startOfWeekMonday(new Date("2026-07-30T15:00:00"));
    expect(start.getDay()).toBe(1);
    expect(addDays(start, 6).getDay()).toBe(0);
  });
});
