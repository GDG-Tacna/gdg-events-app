// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { AgendaItem } from "../domain/agenda";
import { AgendaView, agendaTime, groupByDay } from "./AgendaView";

const a = copy.agenda;
const ROOMS = [{ id: "auditorio", name: "Auditorio" }];
const item = (id: string, overrides: Partial<AgendaItem> = {}): AgendaItem => ({
  id,
  title: `Charla ${id}`,
  speaker: "Ana Torres",
  startsAt: "2026-10-24T14:00:00.000Z",
  endsAt: "2026-10-24T14:45:00.000Z",
  roomId: "auditorio",
  description: "",
  status: "later",
  attended: false,
  ...overrides,
});

describe("agendaTime and groupByDay", () => {
  it("shows the time span in the venue's time (Tacna, UTC-5)", () => {
    expect(agendaTime(item("a"))).toBe("09:00–09:45");
    expect(agendaTime(item("a", { startsAt: null, endsAt: null }))).toBeNull();
  });

  it("groups by the venue's day, keeping the order, undated talks in a last group", () => {
    const groups = groupByDay([item("a"), item("b"), item("c", { startsAt: "2026-10-25T14:00:00.000Z", endsAt: "2026-10-25T15:00:00.000Z" }), item("d", { startsAt: null, endsAt: null })]);

    expect(groups.map((group) => [group.day, group.items.map((i) => i.id)])).toEqual([
      ["sábado, 24 de octubre", ["a", "b"]],
      ["domingo, 25 de octubre", ["c"]],
      [null, ["d"]],
    ]);
    // 23:30 in Tacna is still the 24th, though it is the 25th in UTC.
    expect(groupByDay([item("late", { startsAt: "2026-10-25T04:30:00.000Z" })])[0].day).toBe("sábado, 24 de octubre");
  });
});

describe("AgendaView", () => {
  it("shows each talk with its time, speaker and room, the live and next ones marked, and the attended ones ticked", () => {
    render(
      <AgendaView
        items={[item("pasada", { status: "past", attended: true }), item("ahora", { status: "live" }), item("siguiente", { status: "next" }), item("luego")]}
        rooms={ROOMS}
      />,
    );

    const card = (title: string) => screen.getByRole("heading", { level: 3, name: title }).parentElement!;
    expect(card("Charla pasada")).toHaveTextContent(a.attended);
    expect(card("Charla pasada").className).toContain("opacity-70");
    expect(card("Charla ahora")).toHaveTextContent(a.live);
    expect(card("Charla ahora").className).toContain("border-cyan");
    expect(card("Charla siguiente")).toHaveTextContent(a.next);
    expect(card("Charla luego")).not.toHaveTextContent(a.live);
    expect(card("Charla luego")).not.toHaveTextContent(a.attended);
    expect(card("Charla luego")).toHaveTextContent("09:00–09:45");
    expect(card("Charla luego")).toHaveTextContent("Ana Torres · Auditorio");
  });

  it("puts the talks under their day", () => {
    render(<AgendaView items={[item("a")]} rooms={ROOMS} />);

    const day = screen.getByRole("region", { name: "sábado, 24 de octubre" });
    expect(within(day).getByRole("heading", { level: 3, name: "Charla a" })).toBeInTheDocument();
  });

  it("leaves out a missing speaker or a room no longer on the plan, and says when the schedule is missing", () => {
    render(<AgendaView items={[item("sin", { speaker: null, roomId: "borrada", startsAt: null, endsAt: null })]} rooms={ROOMS} />);

    const card = screen.getByRole("heading", { level: 3, name: "Charla sin" }).parentElement!;
    expect(card).toHaveTextContent(a.noSchedule);
    expect(card).not.toHaveTextContent("·");
  });

  it("says when the agenda is not published yet", () => {
    render(<AgendaView items={[]} rooms={ROOMS} />);

    expect(screen.getByText(a.empty)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<AgendaView items={[item("a", { status: "live", attended: true }), item("b", { description: "Resumen" })]} rooms={ROOMS} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
