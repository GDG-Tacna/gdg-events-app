// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { TicketBadge, TicketChip, ticketIncludes } from "./TicketChip";

describe("TicketChip", () => {
  it.each([
    ["general", "Entrada General"],
    ["pro", "Entrada Pro"],
    ["premium", "Entrada Premium"],
  ] as const)("says %s as a chip", (type, text) => {
    render(<TicketChip type={type} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("colors premium gold and pro violet, and keeps general neutral", () => {
    const { rerender } = render(<TicketChip type="premium" />);
    expect(screen.getByText("Entrada Premium").className).toContain("border-gold");

    rerender(<TicketChip type="pro" />);
    expect(screen.getByText("Entrada Pro").className).toContain("border-violet");

    rerender(<TicketChip type="general" />);
    expect(screen.getByText("Entrada General").className).toContain("border-line-strong");
  });
});

describe("TicketBadge", () => {
  it("adds what the ticket includes, and nothing for general", () => {
    const { rerender } = render(<TicketBadge type="premium" />);
    expect(screen.getByText("Incluye certificado y almuerzo")).toBeInTheDocument();

    rerender(<TicketBadge type="pro" />);
    expect(screen.getByText("Incluye certificado")).toBeInTheDocument();

    rerender(<TicketBadge type="general" />);
    expect(screen.queryByText(/Incluye/)).not.toBeInTheDocument();
    expect(ticketIncludes("general")).toBeNull();
    expect(copy.tickets.includes.general).toBeNull();
  });
});
