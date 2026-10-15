// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { BadgeStanding } from "../domain/achievements";
import type { Badge } from "../domain/badge";
import { AchievementsView } from "./AchievementsView";
import { ruleText } from "./rule-text";

const t = copy.achievements;
const badge = (id: string, name: string, rule: Badge["rule"]): Badge => ({ id, name, description: `Descripción de ${name}.`, tone: "gold", rule, order: 0, active: true, image: null });
const FIRST: BadgeStanding = { badge: badge("first", "Primer salto", { type: "missions-completed", count: 1 }), earnedAt: new Date("2026-10-24T15:00:00Z"), current: 1, target: 1 };
const FIVE: BadgeStanding = { badge: badge("five", "Explorador", { type: "missions-completed", count: 5 }), earnedAt: null, current: 2, target: 5 };
const TALKS: BadgeStanding = { badge: badge("talks", "Oyente", { type: "talks-attended", count: 3 }), earnedAt: null, current: 0, target: 3 };

describe("AchievementsView", () => {
  it("says how many badges the attendee has, lists the earned ones with the day and the others with their progress", async () => {
    const { container } = render(<AchievementsView badges={[FIRST, FIVE, TALKS]} />);

    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeInTheDocument();
    expect(screen.getByText("1 de 3 insignias")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: t.summaryLabel })).toHaveAttribute("aria-valuetext", "1 de 3 insignias");

    const earned = within(screen.getByRole("region", { name: t.earnedTitle }));
    expect(earned.getByRole("heading", { level: 3, name: "Primer salto" })).toBeInTheDocument();
    expect(earned.getByText("Ganada el 24 de octubre")).toBeInTheDocument();
    expect(earned.queryByText("Explorador")).not.toBeInTheDocument();

    const pending = within(screen.getByRole("region", { name: t.pendingTitle }));
    expect(pending.getAllByRole("listitem")).toHaveLength(2);
    expect(pending.getByText("Descripción de Explorador.")).toBeInTheDocument();
    expect(pending.getByRole("progressbar", { name: "Progreso de «Explorador»" })).toHaveAttribute("aria-valuetext", "2 de 5");
    expect(pending.getByText("0 de 3")).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("encourages a first badge, and celebrates having them all", () => {
    const first = render(<AchievementsView badges={[FIVE]} />);
    expect(screen.getByText(t.noneEarned)).toBeInTheDocument();
    first.unmount();

    render(<AchievementsView badges={[FIRST]} />);
    expect(screen.getByText(t.allEarned)).toBeInTheDocument();
  });

  it("says when the edition has no badges", () => {
    render(<AchievementsView badges={[]} />);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("ruleText", () => {
  const names = { quadrants: { ai: "IA" }, missions: { "ai-quiz": "Quiz de IA" } };

  it.each<[Badge["rule"], string]>([
    [{ type: "missions-completed", count: 1 }, "Completa 1 misión"],
    [{ type: "missions-completed", count: 5 }, "Completa 5 misiones"],
    [{ type: "talks-attended", count: 1 }, "Asiste a 1 charla"],
    [{ type: "talks-attended", count: 3 }, "Asiste a 3 charlas"],
    [{ type: "stands-visited", count: 2 }, "Visita 2 stands"],
    [{ type: "credits-earned", count: 1500 }, "Gana 1,500 G-Credits en este evento"],
    [{ type: "contacts-made", count: 1 }, "Conecta con 1 cadete"],
    [{ type: "contacts-made", count: 5 }, "Conecta con 5 cadetes"],
    [{ type: "level-reached", level: 3 }, "Alcanza el nivel 3"],
    [{ type: "quadrant-complete", quadrantId: "ai" }, "Completa todas las misiones de IA"],
    [{ type: "quadrant-complete", quadrantId: "mars" }, "Completa todas las misiones de mars"],
    [{ type: "mission-completed", missionId: "ai-quiz" }, "Completa la misión «Quiz de IA»"],
  ])("puts %j into words", (rule, text) => {
    expect(ruleText(rule, names).replace(/ | /g, " ")).toBe(text);
  });
});
