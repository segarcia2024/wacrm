import { describe, expect, it } from "vitest";
import {
  abbreviateBsuid,
  contactPrimaryLabel,
  contactSecondaryLabel,
  formatWhatsAppUsername,
  visiblePhone,
} from "./display";

describe("contact display labels", () => {
  it("never renders undefined/null", () => {
    expect(contactPrimaryLabel({ name: null, phone: null })).toBe("Unknown");
    expect(contactSecondaryLabel({ name: "Ada", phone: null })).toBe("");
    expect(visiblePhone(null)).toBe("");
    expect(visiblePhone("undefined")).toBe("");
  });

  it("prefers name then username then phone then bsuid", () => {
    expect(
      contactPrimaryLabel({
        name: "Sergio García",
        username: "sergio",
        phone: "573001234567",
      }),
    ).toBe("Sergio García");
    expect(
      contactPrimaryLabel({
        name: "",
        username: "sergio",
        phone: "573001234567",
      }),
    ).toBe("@sergio");
    expect(
      contactPrimaryLabel({
        name: "",
        username: "",
        phone: "573001234567",
      }),
    ).toBe("573001234567");
    expect(
      contactPrimaryLabel({
        name: "",
        phone: "",
        bsuid: "CO.ABCDEFGHIJKLMNOP",
      }),
    ).toBe(abbreviateBsuid("CO.ABCDEFGHIJKLMNOP"));
  });

  it("secondary line shows username or phone under a name", () => {
    expect(
      contactSecondaryLabel({
        name: "Sergio García",
        username: "sergio",
        phone: "573001234567",
      }),
    ).toBe("@sergio");
    expect(
      contactSecondaryLabel({
        name: "Sergio García",
        phone: "573001234567",
      }),
    ).toBe("573001234567");
  });

  it("formats username with a single @", () => {
    expect(formatWhatsAppUsername("@sergio")).toBe("@sergio");
    expect(formatWhatsAppUsername("sergio")).toBe("@sergio");
  });
});
