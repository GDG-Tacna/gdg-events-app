import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/polls.server", () => ({ pollAdminDeps: { marker: "polls" } }));
vi.mock("@/app-shell/polls/manage.actions", () => ({ savePollAction: vi.fn(), changePollAction: vi.fn(), pollResultsAction: vi.fn() }));
vi.mock("@/app-shell/media/upload.action", () => ({ uploadImageAction: vi.fn() }));
const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ requireSection: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = vi.hoisted(() => ({ listPolls: vi.fn(), pollResults: vi.fn() }));
vi.mock("@/features/polls/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { polls: true } }));
vi.mock("@/shared/config/features", () => features);

const { PollForm, PollResultsView, PollsAdminView } = await import("@/features/polls");
const actions = await import("@/app-shell/polls/manage.actions");
const { default: AdminPollsPage } = await import("./page");
const { default: AdminNewPollPage } = await import("./nueva/page");
const { default: AdminPollPage } = await import("./[pollId]/page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as unknown as { props: Record<string, unknown> };
  return findElement((node.props as { children?: ReactNode }).children, type);
}

const ADMIN = { uid: "a1", role: "admin", displayName: null, photoUrl: null };
const poll = (status: string) => ({ id: "poll-1", question: "¿Qué?", options: [], changeable: false, reward: { kind: "none" }, status, createdAt: new Date(0), openedAt: null, closedAt: null });
const TALLY = { counts: { o1: 2 }, total: 2 };
const open = (pollId = "poll-1") => AdminPollPage({ params: Promise.resolve({ pollId }) });

describe("admin Encuestas pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.polls = true;
    guards.requireRole.mockResolvedValue(ADMIN);
    server.listPolls.mockResolvedValue({ ok: true, value: [poll("draft")] });
    server.pollResults.mockResolvedValue({ ok: true, value: { poll: poll("open"), tally: TALLY } });
  });

  it("lists the polls for admins with the polls section, with the change action and the links", async () => {
    const view = findElement(await AdminPollsPage(), PollsAdminView);

    expect(permissions.requireSection).toHaveBeenCalledWith(ADMIN, "polls");
    expect(view?.props).toEqual({ polls: [poll("draft")], change: actions.changePollAction, hrefs: { create: "/admin/encuestas/nueva", base: "/admin/encuestas" } });
  });

  it("offers the form to create a poll", async () => {
    const form = findElement(await AdminNewPollPage(), PollForm);

    expect(form?.props).toMatchObject({ save: actions.savePollAction, listHref: "/admin/encuestas" });
    expect(form?.props.poll).toBeUndefined();
  });

  it("edits a draft, and shows the results of a poll that was opened", async () => {
    const results = findElement(await open(), PollResultsView);
    expect(results?.props).toMatchObject({ poll: poll("open"), tally: TALLY, refresh: actions.pollResultsAction });

    server.pollResults.mockResolvedValue({ ok: true, value: { poll: poll("draft"), tally: { counts: {}, total: 0 } } });
    const form = findElement(await open(), PollForm);
    expect(form?.props).toMatchObject({ poll: poll("draft"), save: actions.savePollAction });
  });

  it("is not found for an unknown poll or with polls switched off, and surfaces a failed read", async () => {
    server.pollResults.mockResolvedValueOnce({ ok: false, error: { code: "not-found" } });
    await expect(open("ghost")).rejects.toBeInstanceOf(NotFound);
    server.pollResults.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(open()).rejects.toThrow("Could not read the poll");
    server.listPolls.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(AdminPollsPage()).rejects.toThrow("Could not read the polls");

    features.FEATURES.polls = false;
    await expect(AdminPollsPage()).rejects.toBeInstanceOf(NotFound);
    await expect(AdminNewPollPage()).rejects.toBeInstanceOf(NotFound);
  });
});
