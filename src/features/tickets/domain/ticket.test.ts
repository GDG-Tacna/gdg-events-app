import { describe, expect, it } from "vitest";
import { TICKET_PERKS, TICKET_TYPES, includesCertificate, includesLunch, isTicketType, parseTicketType, ticketRank, ticketTypeOf } from "./ticket";

describe("parseTicketType", () => {
  it.each([
    ["premium", "premium"],
    ["Premium", "premium"],
    ["  PRO ", "pro"],
    ["General", "general"],
    ["", "general"],
    ["   ", "general"],
  ] as const)("reads %j as %s", (text, expected) => {
    expect(parseTicketType(text)).toBe(expected);
  });

  it("returns null for something that is not a ticket", () => {
    expect(parseTicketType("vip")).toBeNull();
    expect(parseTicketType("premiun")).toBeNull();
  });
});

describe("ticketTypeOf", () => {
  it("reads a document without a ticket as general", () => {
    expect(ticketTypeOf(undefined)).toBe("general");
    expect(ticketTypeOf(null)).toBe("general");
    expect(ticketTypeOf("vip")).toBe("general");
    expect(ticketTypeOf("premium")).toBe("premium");
  });

  it("knows what is a ticket", () => {
    expect(TICKET_TYPES.every(isTicketType)).toBe(true);
    expect(isTicketType("vip")).toBe(false);
  });
});

describe("ticketRank", () => {
  it("orders general below pro below premium", () => {
    expect(ticketRank("general")).toBeLessThan(ticketRank("pro"));
    expect(ticketRank("pro")).toBeLessThan(ticketRank("premium"));
  });
});

describe("what each ticket includes", () => {
  it("gives general neither the certificate nor the lunch", () => {
    expect(TICKET_PERKS.general).toEqual({ certificate: false, lunch: false });
    expect(includesCertificate("general")).toBe(false);
    expect(includesLunch("general")).toBe(false);
  });

  it("gives pro the certificate and premium the certificate and the lunch", () => {
    expect(includesCertificate("pro")).toBe(true);
    expect(includesLunch("pro")).toBe(false);
    expect(includesCertificate("premium")).toBe(true);
    expect(includesLunch("premium")).toBe(true);
  });
});
