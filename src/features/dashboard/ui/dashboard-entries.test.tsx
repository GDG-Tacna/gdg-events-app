// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { AccountMenu } from "./AccountMenu";
import { MissionsCard } from "./MissionsCard";

describe("MissionsCard", () => {
  it("is the gold entry: the XP on offer as a game tag and the quadrants where the missions are", () => {
    render(<MissionsCard href="/missions" xp={1500} quadrants={["Google Cloud", "Firebase", "AI"]} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/missions");
    expect(link.className).toContain("border-gold");
    expect(link).toHaveTextContent(copy.dashboard.missionsCard.title);
    expect(link).toHaveTextContent("+1,500 XP");
    expect(link).toHaveTextContent("Misiones en Google Cloud, Firebase y AI.");
  });

  it("joins one or two quadrants naturally, and says when there are none yet, without a tag", () => {
    const { rerender } = render(<MissionsCard href="/missions" xp={50} quadrants={["Firebase"]} />);
    expect(screen.getByRole("link")).toHaveTextContent("Misiones en Firebase.");

    rerender(<MissionsCard href="/missions" xp={50} quadrants={["Firebase", "AI"]} />);
    expect(screen.getByRole("link")).toHaveTextContent("Misiones en Firebase y AI.");

    rerender(<MissionsCard href="/missions" xp={0} quadrants={[]} />);
    expect(screen.getByRole("link")).toHaveTextContent(copy.dashboard.missionsCard.empty);
    expect(screen.getByRole("link")).not.toHaveTextContent("XP");
  });
});

describe("AccountMenu", () => {
  const t = copy.dashboard.account;

  it("opens from the gear with the cadet's QR and their card in the Red", async () => {
    const user = userEvent.setup();
    render(<AccountMenu qrHref="/pass" networkHref="/red" />);

    await user.click(screen.getByRole("button", { name: t.open }));

    expect(await screen.findByRole("menuitem", { name: t.qr })).toHaveAttribute("href", "/pass");
    expect(screen.getByRole("menuitem", { name: t.network })).toHaveAttribute("href", "/red");
  });

  it("opens from the keyboard too", async () => {
    const user = userEvent.setup();
    render(<AccountMenu qrHref="/pass" />);

    await user.tab();
    expect(screen.getByRole("button", { name: t.open })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("menuitem", { name: t.qr })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t.network })).not.toBeInTheDocument();
  });

  it("is not there when it would have nothing to offer", () => {
    render(<AccountMenu />);

    expect(screen.queryByRole("button", { name: t.open })).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations, closed and open", async () => {
    const user = userEvent.setup();
    const { container } = render(<AccountMenu qrHref="/pass" networkHref="/red" />);
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: t.open }));
    // The open menu lives in a portal on <body> (Radix), so it is checked on its own.
    expect((await axe(await screen.findByRole("menu"))).violations).toEqual([]);
  });
});
