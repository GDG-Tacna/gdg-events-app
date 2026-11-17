// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { getInsights, type StatsSource } from "./domain/stats";
import { InsightsPanel, share } from "./ui/InsightsPanel";

const ADMIN = { uid: "a1", role: "admin" as const };

function source(overrides: Partial<StatsSource> = {}): StatsSource {
  const byEdition: Record<string, { registered: number; attended: number }> = {
    "devfest-2024": { registered: 120, attended: 90 },
    "devfest-2025": { registered: 180, attended: 140 },
    "devfest-2026": { registered: 200, attended: 150 },
  };
  return {
    editions: vi.fn(async () => ok(Object.keys(byEdition))),
    registered: vi.fn(async (id: string) => ok(byEdition[id].registered)),
    attended: vi.fn(async (id: string) => ok(byEdition[id].attended)),
    checkInsOfKind: vi.fn(async (_id: string, kind: "talk" | "stand") => ok(kind === "talk" ? 320 : 90)),
    missionsCompleted: vi.fn(async () => ok(410)),
    contacts: vi.fn(async () => ok(75)),
    squadMembers: vi.fn(async (_id: string, squadId: string) => ok(squadId === "firebase" ? 90 : 60)),
    rations: vi.fn(async () => ok([{ checkpointId: "coffee", name: "Coffee break", count: 140 }, { checkpointId: "lunch", name: "Almuerzo", count: 120 }])),
    ...overrides,
  };
}

const SQUADS = { list: async () => ok([{ id: "firebase", name: "Firebase" }, { id: "angular", name: "Angular" }]) };

describe("getInsights", () => {
  it("gives the current edition in detail and the earlier ones in short, newest first", async () => {
    const stats = source();

    const overview = await getInsights({ stats, currentEventId: async () => "devfest-2026", squads: SQUADS }, ADMIN);

    expect(overview).toEqual(
      ok({
        current: {
          eventId: "devfest-2026",
          registered: 200,
          attended: 150,
          talkCheckIns: 320,
          standVisits: 90,
          missionsCompleted: 410,
          contacts: 75,
          // In the squads' own order; the rest of the registered cadets have none.
          squads: [
            { squadId: "firebase", name: "Firebase", count: 90 },
            { squadId: "angular", name: "Angular", count: 60 },
          ],
          withoutSquad: 50,
          // By name.
          rations: [
            { checkpointId: "lunch", name: "Almuerzo", count: 120 },
            { checkpointId: "coffee", name: "Coffee break", count: 140 },
          ],
        },
        past: [
          { eventId: "devfest-2025", registered: 180, attended: 140 },
          { eventId: "devfest-2024", registered: 120, attended: 90 },
        ],
      }),
    );
    expect(stats.checkInsOfKind).toHaveBeenCalledWith("devfest-2026", "talk");
    expect(stats.checkInsOfKind).toHaveBeenCalledWith("devfest-2026", "stand");
  });

  it("is for admins only, and reads nothing for anyone else", async () => {
    const stats = source();
    for (const role of ["staff", "attendee", null] as const) {
      expect(await getInsights({ stats, currentEventId: async () => "devfest-2026", squads: SQUADS }, { uid: "x", role })).toEqual(err({ code: "forbidden" }));
    }
    expect(stats.registered).not.toHaveBeenCalled();
  });

  it("fails as a whole when any count cannot be read, never showing a wrong number", async () => {
    const deps = (overrides: Partial<StatsSource>) => ({ stats: source(overrides), currentEventId: async () => "devfest-2026", squads: SQUADS });

    expect(await getInsights(deps({ contacts: async () => err({ code: "x" }) }), ADMIN)).toEqual(err({ code: "unknown" }));
    expect(await getInsights(deps({ editions: async () => err({ code: "x" }) }), ADMIN)).toEqual(err({ code: "unknown" }));
    expect(await getInsights(deps({ attended: async (id: string) => (id === "devfest-2024" ? err({ code: "x" }) : ok(1)) }), ADMIN)).toEqual(err({ code: "unknown" }));
  });

  it("counts each squad's cadets for the current edition only, and never goes below zero without a squad", async () => {
    const stats = source({ registered: async (id: string) => ok(id === "devfest-2026" ? 100 : 5), squadMembers: async () => ok(70) });

    const overview = await getInsights({ stats, currentEventId: async () => "devfest-2026", squads: SQUADS }, ADMIN);

    expect(overview.ok && overview.value.current.squads.map((squad) => squad.count)).toEqual([70, 70]);
    expect(overview.ok && overview.value.current.withoutSquad).toBe(0);
  });

  it("fails as a whole when the squads or a squad's count cannot be read", async () => {
    expect(await getInsights({ stats: source(), currentEventId: async () => "devfest-2026", squads: { list: async () => err({ code: "x" }) } }, ADMIN)).toEqual(err({ code: "unknown" }));
    expect(await getInsights({ stats: source({ squadMembers: async () => err({ code: "x" }) }), currentEventId: async () => "devfest-2026", squads: SQUADS }, ADMIN)).toEqual(err({ code: "unknown" }));
  });

  it("has no earlier editions on the first one", async () => {
    const overview = await getInsights({ stats: source({ editions: async () => ok(["devfest-2026"]) }), currentEventId: async () => "devfest-2026", squads: SQUADS }, ADMIN);

    expect(overview.ok && overview.value.past).toEqual([]);
  });
});

describe("share", () => {
  it("is a rounded percentage, or null of nothing", () => {
    expect(share(150, 200)).toBe("75 %");
    expect(share(1, 3)).toBe("33 %");
    expect(share(5, 0)).toBeNull();
  });
});

describe("InsightsPanel", () => {
  const OVERVIEW = {
    current: { eventId: "devfest-2026", registered: 200, attended: 150, talkCheckIns: 320, standVisits: 90, missionsCompleted: 410, contacts: 75, squads: [{ squadId: "firebase", name: "Firebase", count: 120 }, { squadId: "angular", name: "Angular", count: 50 }], withoutSquad: 30, rations: [{ checkpointId: "lunch", name: "Almuerzo", count: 120 }] },
    past: [{ eventId: "devfest-2025", registered: 180, attended: 140 }],
  };

  it("shows each count with its label, and the share of registered cadets who came in", () => {
    render(<InsightsPanel overview={OVERVIEW} />);

    const stats = within(screen.getByRole("list", { name: copy.admin.home.stats.label }));
    expect(stats.getAllByRole("listitem")).toHaveLength(6);
    expect(stats.getByText(copy.admin.home.stats.attended).parentElement).toHaveTextContent("150");
    expect(stats.getByText("75 % de los registrados")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Edición en curso: devfest-2026" })).toBeInTheDocument();
  });

  it("lists the rations per meal, with the share of those who came in, and the earlier editions", () => {
    render(<InsightsPanel overview={OVERVIEW} />);

    expect(screen.getByText("Almuerzo").parentElement).toHaveTextContent("12080 %");
    expect(screen.getByText("devfest-2025").parentElement).toHaveTextContent("180 registrados · 140 ingresaron");
  });

  it("shows how many cadets each squad has, with their share and those without a squad", () => {
    render(<InsightsPanel overview={OVERVIEW} />);

    const squads = within(screen.getByRole("list", { name: copy.admin.home.squadsTitle })).getAllByRole("listitem");
    expect(squads).toHaveLength(3);
    expect(squads[0]).toHaveTextContent("Firebase");
    expect(squads[0]).toHaveTextContent("12060 %");
    expect(squads[1]).toHaveTextContent("Angular");
    expect(squads[1]).toHaveTextContent("5025 %");
    expect(squads[2]).toHaveTextContent(copy.admin.home.withoutSquad);
    expect(squads[2]).toHaveTextContent("30");
  });

  it("hides the row without a squad when everyone has one, and says so when there are no squads", () => {
    const { rerender } = render(<InsightsPanel overview={{ ...OVERVIEW, current: { ...OVERVIEW.current, withoutSquad: 0 } }} />);
    expect(within(screen.getByRole("list", { name: copy.admin.home.squadsTitle })).getAllByRole("listitem")).toHaveLength(2);

    rerender(<InsightsPanel overview={{ ...OVERVIEW, current: { ...OVERVIEW.current, squads: [], withoutSquad: 0 } }} />);
    expect(screen.getByText(copy.admin.home.noSquads)).toBeInTheDocument();
  });

  it("says when there are no meals and no earlier editions yet", () => {
    render(<InsightsPanel overview={{ current: { ...OVERVIEW.current, rations: [], registered: 0, attended: 0 }, past: [] }} />);

    expect(screen.getByText(copy.admin.home.noRations)).toBeInTheDocument();
    expect(screen.getByText(copy.admin.home.noPast)).toBeInTheDocument();
    expect(screen.queryByText(/de los registrados/)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<InsightsPanel overview={OVERVIEW} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
