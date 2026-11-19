import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/tickets.server", () => ({ ticketDeps: { marker: "tickets" } }));
vi.mock("@/app-shell/tickets/tickets.actions", () => ({ importTicketHoldersAction: async () => ({ ok: true }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ requireSection: vi.fn(), mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true) }));
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = vi.hoisted(() => ({ summarizeTicketHolders: vi.fn() }));
vi.mock("@/features/tickets/server", () => server);

const { ImportTicketsView } = await import("@/features/tickets");
const { importTicketHoldersAction } = await import("@/app-shell/tickets/tickets.actions");
const { default: AdminCadetTicketsPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

const SESSION = { uid: "a1", role: "admin", adminScope: "edition", displayName: null, photoUrl: null };

beforeEach(() => {
  vi.resetAllMocks();
  guards.requireRole.mockResolvedValue(SESSION);
  permissions.mayEdit.mockResolvedValue(true);
  server.summarizeTicketHolders.mockResolvedValue({ ok: true, value: { general: 205, pro: 4, premium: 26 } });
});

describe("admin cadet tickets page", () => {
  it("checks the admin role and the Cadetes section itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new NotFound("not-found"));
    await expect(AdminCadetTicketsPage()).rejects.toBeInstanceOf(NotFound);
    expect(server.summarizeTicketHolders).not.toHaveBeenCalled();

    guards.requireRole.mockResolvedValue(SESSION);
    permissions.requireSection.mockRejectedValue(new NotFound("hidden"));
    await expect(AdminCadetTicketsPage()).rejects.toBeInstanceOf(NotFound);
    expect(permissions.requireSection).toHaveBeenCalledWith(SESSION, "cadets");
  });

  it("hands the view what the loaded list holds, the import action and where back goes", async () => {
    const view = findElement(await AdminCadetTicketsPage(), ImportTicketsView);

    expect(server.summarizeTicketHolders).toHaveBeenCalledWith({ marker: "tickets" }, { uid: "a1", role: "admin" });
    expect(view?.props).toEqual({
      summary: { general: 205, pro: 4, premium: 26 },
      importHolders: importTicketHoldersAction,
      canEdit: true,
      backHref: "/admin/cadetes",
    });
  });

  it("shows the list as not loaded when it cannot be read, and read-only to a session that may not edit", async () => {
    server.summarizeTicketHolders.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    permissions.mayEdit.mockResolvedValue(false);

    const view = findElement(await AdminCadetTicketsPage(), ImportTicketsView);

    expect(view?.props).toMatchObject({ summary: null, canEdit: false });
  });
});
