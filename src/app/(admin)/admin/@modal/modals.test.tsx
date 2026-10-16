import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Every create and edit screen opened from its list shows in a modal over it: the intercepted page wraps the real
 * page (mocked here as a marker that records its props) in a RouteModal named with that screen's title.
 */
const pages = vi.hoisted(() => {
  const marker = (route: string) => ({ default: async (props: unknown) => ({ route, props }) as unknown as ReactNode });
  return {
    "misiones/nueva": marker("misiones/nueva"),
    "misiones/[missionId]": marker("misiones/[missionId]"),
    "misiones/sugerir": marker("misiones/sugerir"),
    "charlas/nueva": marker("charlas/nueva"),
    "charlas/[talkId]": marker("charlas/[talkId]"),
    "odisea/nueva": marker("odisea/nueva"),
    "odisea/[communicationId]": marker("odisea/[communicationId]"),
    "logros/nueva": marker("logros/nueva"),
    "logros/[badgeId]": marker("logros/[badgeId]"),
    "escuadrones/nuevo": marker("escuadrones/nuevo"),
    "escuadrones/[squadId]": marker("escuadrones/[squadId]"),
    "zonas/nueva": marker("zonas/nueva"),
    "zonas/[quadrantId]": marker("zonas/[quadrantId]"),
  };
});
vi.mock("../misiones/nueva/page", () => pages["misiones/nueva"]);
vi.mock("../misiones/[missionId]/page", () => pages["misiones/[missionId]"]);
vi.mock("../misiones/sugerir/page", () => pages["misiones/sugerir"]);
vi.mock("../charlas/nueva/page", () => pages["charlas/nueva"]);
vi.mock("../charlas/[talkId]/page", () => pages["charlas/[talkId]"]);
vi.mock("../odisea/nueva/page", () => pages["odisea/nueva"]);
vi.mock("../odisea/[communicationId]/page", () => pages["odisea/[communicationId]"]);
vi.mock("../logros/nueva/page", () => pages["logros/nueva"]);
vi.mock("../logros/[badgeId]/page", () => pages["logros/[badgeId]"]);
vi.mock("../escuadrones/nuevo/page", () => pages["escuadrones/nuevo"]);
vi.mock("../escuadrones/[squadId]/page", () => pages["escuadrones/[squadId]"]);
vi.mock("../zonas/nueva/page", () => pages["zonas/nueva"]);
vi.mock("../zonas/[quadrantId]/page", () => pages["zonas/[quadrantId]"]);

const { RouteModal } = await import("@/shared/ui");
const { copy } = await import("@/shared/copy/es");

const CASES = [
  ["misiones/nueva", () => import("./(.)misiones/nueva/page"), copy.admin.missions.form.createTitle, null],
  ["misiones/[missionId]", () => import("./(.)misiones/[missionId]/page"), copy.admin.missions.form.editTitle, { missionId: "ai-quiz" }],
  ["misiones/sugerir", () => import("./(.)misiones/sugerir/page"), copy.admin.missions.suggestions.title, null],
  ["charlas/nueva", () => import("./(.)charlas/nueva/page"), copy.admin.talks.form.createTitle, null],
  ["charlas/[talkId]", () => import("./(.)charlas/[talkId]/page"), copy.admin.talks.form.editTitle, { talkId: "keynote" }],
  ["odisea/nueva", () => import("./(.)odisea/nueva/page"), copy.admin.odyssey.form.createTitle, null],
  ["odisea/[communicationId]", () => import("./(.)odisea/[communicationId]/page"), copy.admin.odyssey.form.editTitle, { communicationId: "senal" }],
  ["logros/nueva", () => import("./(.)logros/nueva/page"), copy.admin.achievements.form.createTitle, null],
  ["logros/[badgeId]", () => import("./(.)logros/[badgeId]/page"), copy.admin.achievements.form.editTitle, { badgeId: "primer-salto" }],
  ["escuadrones/nuevo", () => import("./(.)escuadrones/nuevo/page"), copy.admin.squads.form.newTitle, null],
  ["escuadrones/[squadId]", () => import("./(.)escuadrones/[squadId]/page"), copy.admin.squads.form.editTitle, { squadId: "gemini" }],
  ["zonas/nueva", () => import("./(.)zonas/nueva/page"), copy.admin.map.quadrantForm.createTitle, null],
  ["zonas/[quadrantId]", () => import("./(.)zonas/[quadrantId]/page"), copy.admin.map.quadrantForm.editTitle, { quadrantId: "ai" }],
] as const;

describe("admin modals", () => {
  it.each(CASES)("%s opens the real screen in a modal named with its title", async (route, load, title, params) => {
    const { default: Modal } = await load();
    const props = params ? { params: Promise.resolve(params) } : {};

    const tree = await (Modal as (props: unknown) => Promise<ReactNode>)(props);

    expect(isValidElement(tree)).toBe(true);
    const element = tree as unknown as { type: unknown; props: { title: string; children: { route: string; props: unknown } } };
    expect(element.type).toBe(RouteModal);
    expect(element.props.title).toBe(title);
    expect(element.props.children.route).toBe(route);
    // The edit screens get the route's params, untouched.
    if (params) expect(await (element.props.children.props as { params: Promise<unknown> }).params).toEqual(params);
  });

  it("clears the slot everywhere else: no modal by default, on the home or on any other admin address", async () => {
    for (const load of [() => import("./default"), () => import("./page"), () => import("./[...catchAll]/page")]) {
      const { default: NoModal } = await load();
      expect(NoModal()).toBeNull();
    }
  });
});
