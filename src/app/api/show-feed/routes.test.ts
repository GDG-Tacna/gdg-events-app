import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const SECRET = "k".repeat(40);
const feed = {
  secret: vi.fn((): string | undefined => SECRET),
  talks: vi.fn(),
  issue: vi.fn(),
};
vi.mock("@/app-shell/composition/show-feed.server", () => ({
  showFeedSecret: () => feed.secret(),
  talkQrDeps: { talks: () => feed.talks(), issue: (id: string) => feed.issue(id) },
}));

const modules = vi.fn<(name: string) => Promise<boolean>>(async () => true);
vi.mock("@/app-shell/modules.server", () => ({ moduleOn: (name: string) => modules(name) }));

const getFleetBoard = vi.fn();
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ leaderboardDeps: {} }));
vi.mock("@/features/leaderboard/server", () => ({ getFleetBoard: () => getFleetBoard() }));

const logServerError = vi.fn();
vi.mock("@/shared/lib/log", () => ({ logServerError: (...args: unknown[]) => logServerError(...args) }));

const board = await import("./board/route");
const talks = await import("./talks/route");
const qr = await import("./qr/route");

const request = (path: string, token: string | null = SECRET) =>
  new Request(`https://app.test/api/show-feed/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const TALK = {
  id: "talk-genkit",
  title: "Genkit",
  startsAt: new Date("2026-11-21T14:15:00Z"),
  endsAt: new Date("2026-11-21T15:00:00Z"),
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  feed.secret.mockReturnValue(SECRET);
  feed.talks.mockResolvedValue(ok([TALK]));
  feed.issue.mockResolvedValue(ok({ checkpointId: "talk-genkit", name: "Genkit", cells: ["10", "01"], issuedAt: 1, expiresAt: 2 }));
  modules.mockResolvedValue(true);
  getFleetBoard.mockResolvedValue(
    ok({
      cadets: [{ position: 1, alias: "NovaDev", squad: "Firebase", xp: 640 }],
      squads: [{ position: 1, id: "gemini", name: "Gemini", xp: 5210, members: 92 }],
    }),
  );
});

describe("show feed access", () => {
  it.each([
    ["board", board.GET],
    ["talks", talks.GET],
    ["qr?talk=talk-genkit", qr.GET],
  ])("%s is switched off without a secret long enough", async (path, GET) => {
    feed.secret.mockReturnValue("short");
    const response = await GET(request(path));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "disabled" });
  });

  it.each([
    ["board", board.GET],
    ["talks", talks.GET],
    ["qr?talk=talk-genkit", qr.GET],
  ])("%s refuses a missing or wrong token, reading nothing", async (path, GET) => {
    expect((await GET(request(path, null))).status).toBe(401);
    expect((await GET(request(path, "w".repeat(40)))).status).toBe(401);
    expect(getFleetBoard).not.toHaveBeenCalled();
    expect(feed.talks).not.toHaveBeenCalled();
  });

  it("lets any origin read, caches nothing and answers the preflight", async () => {
    const response = await board.GET(request("board"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const preflight = board.OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe("Authorization");
  });
});

describe("GET /api/show-feed/board", () => {
  it("answers the top cadets and the squads, without squad ids, and the server's clock", async () => {
    const body = await (await board.GET(request("board"))).json();

    expect(body).toEqual({
      serverNow: expect.any(Number),
      cadets: [{ position: 1, alias: "NovaDev", squad: "Firebase", xp: 640 }],
      squads: [{ position: 1, name: "Gemini", xp: 5210, members: 92 }],
      squadsOn: true,
    });
  });

  it("leaves the squads out when the edition has them off", async () => {
    modules.mockImplementation(async (name) => name !== "squads");

    expect(await (await board.GET(request("board"))).json()).toMatchObject({ squads: [], squadsOn: false });
  });

  it("answers off when the edition has the ranking off", async () => {
    modules.mockImplementation(async (name) => name !== "leaderboard");
    const response = await board.GET(request("board"));

    expect(response.status).toBe(404);
    expect(getFleetBoard).not.toHaveBeenCalled();
  });

  it("logs and answers 500 when the board cannot be read", async () => {
    getFleetBoard.mockResolvedValue(err({ code: "unknown" }));

    expect((await board.GET(request("board"))).status).toBe(500);
    expect(logServerError).toHaveBeenCalledWith("show-feed.board", expect.anything());
  });
});

describe("GET /api/show-feed/talks", () => {
  it("lists the talks with their schedule and whether their code can be handed out", async () => {
    const body = await (await talks.GET(request("talks"))).json();

    expect(body.talks).toEqual([
      { id: "talk-genkit", name: "Genkit", startsAt: TALK.startsAt.getTime(), endsAt: TALK.endsAt.getTime(), active: true, qrNow: true },
    ]);
  });
});

describe("GET /api/show-feed/qr", () => {
  it("hands out the code of a talk, whatever the time", async () => {
    const response = await qr.GET(request("qr?talk=talk-genkit"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ serverNow: expect.any(Number), talkId: "talk-genkit", name: "Genkit", cells: ["10", "01"], issuedAt: 1, expiresAt: 2 });
  });

  it.each([
    ["qr", 400, "bad-request"],
    ["qr?talk=entrance", 404, "not-found"],
  ])("%s answers %i %s", async (path, status, code) => {
    const response = await qr.GET(request(path));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code });
  });

  it("does not hand out the code of an inactive talk", async () => {
    feed.talks.mockResolvedValue(ok([{ ...TALK, active: false }]));
    const response = await qr.GET(request("qr?talk=talk-genkit"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "inactive" });
    expect(feed.issue).not.toHaveBeenCalled();
  });
});
