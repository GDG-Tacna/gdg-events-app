import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Screens and actions ask `moduleOn` whether a module is on. In tests it follows the code's flags (which each test
// may mock); the edition's own switches are tested in modules.server.test.ts, which unmocks it.
vi.mock("@/app-shell/modules.server", async () => {
  const { FEATURES } = await import("@/shared/config/features");
  const { EDITION_MODULES } = await import("@/features/event/domain/modules");
  return {
    moduleOn: async (name: keyof typeof FEATURES) => FEATURES[name],
    moduleSwitches: async () => Object.fromEntries(EDITION_MODULES.map((module) => [module, FEATURES[module]])),
  };
});

// Control center permissions: in tests an admin edits every section and staff operate every station; the edition's
// own permissions are tested in permissions.server.test.ts, which unmocks it.
vi.mock("@/app-shell/permissions.server", async () => {
  const { ADMIN_SECTIONS, STAFF_STATIONS } = await import("@/features/event/domain/permissions");
  const level = (session: { role: string | null }) => (session.role === "admin" ? "edit" : "none");
  return {
    accessTo: async (session: { role: string | null }) => level(session),
    mayEdit: async (session: { role: string | null }) => session.role === "admin",
    requireSection: async () => undefined,
    sectionLevels: async (session: { role: string | null }) => Object.fromEntries(ADMIN_SECTIONS.map((section) => [section, level(session)])),
    staffStations: async () => STAFF_STATIONS,
  };
});
