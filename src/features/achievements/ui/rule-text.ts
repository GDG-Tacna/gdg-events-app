import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import type { BadgeRule } from "../domain/badge";

/** Names of the quadrants and missions a rule may point at, as plain data (it crosses to the client). */
export interface RuleNames {
  quadrants: Readonly<Record<string, string>>;
  missions: Readonly<Record<string, string>>;
}

/** A badge's rule in words: "Completa 5 misiones", "Completa todas las misiones de IA", "Alcanza el nivel 3". */
export function ruleText(rule: BadgeRule, names: RuleNames): string {
  const t = copy.achievements.rules;
  switch (rule.type) {
    case "missions-completed":
    case "talks-attended":
    case "stands-visited":
    case "credits-earned":
    case "contacts-made": {
      const forms = t[rule.type];
      return rule.count === 1 ? forms.one : interpolate(forms.many, { n: formatNumber(rule.count) });
    }
    case "level-reached":
      return interpolate(t["level-reached"], { n: String(rule.level) });
    case "quadrant-complete":
      return interpolate(t["quadrant-complete"], { name: names.quadrants[rule.quadrantId] ?? rule.quadrantId });
    case "mission-completed":
      return interpolate(t["mission-completed"], { name: names.missions[rule.missionId] ?? rule.missionId });
  }
}
