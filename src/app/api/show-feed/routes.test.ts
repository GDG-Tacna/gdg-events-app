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
const getStage = vi.fn();
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ leaderboardDeps: {}, stageDeps: { squads: { list: () => squadsList() } } }));
vi.mock("@/features/leaderboard/server", () => ({ getFleetBoard: () => getFleetBoard(), getStage: () => getStage() }));

const LOGO = { rows: ["ab", "ba"], palette: { a: "#fff", b: "#000" } };
const catalogList = vi.fn();
vi.mock("@/app-shell/composition/squads.server", () => ({ squadCatalog: { list: () => catalogList() } }));
const squadsList = vi.fn();

const polls = { list: vi.fn(), tally: vi.fn() };
vi.mock("@/app-shell/composition/polls.server", () => ({ pollStore: { list: () => polls.list(), tally: (id: string) => polls.tally(id) } }));

const raffle = { draws: vi.fn(), prizes: vi.fn() };
vi.mock("@/app-shell/composition/raffle.server", () => ({ raffleDeps: { store: { draws: () => raffle.draws(), prizes: () => raffle.prizes() } } }));

const logServerError = vi.fn();
vi.mock("@/shared/lib/log", () => ({ logServerError: (...args: unknown[]) => logServerError(...args) }));

const board = await import("./board/route");
const talks = await import("./talks/route");
const qr = await import("./qr/route");
const pollsRoute = await import("./polls/route");
const raffleRoute = await import("./raffle/route");

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
  catalogList.mockResolvedValue(ok([{ id: "gemini", name: "Gemini", sprite: LOGO, logo: { url: "/media/x.png" }, active: true }]));
  squadsList.mockResolvedValue(ok([{ id: "gemini", name: "Gemini", active: true }]));
  polls.list.mockResolvedValue(ok([POLL, { ...POLL, id: "poll-draft-0001", status: "draft" }]));
  polls.tally.mockResolvedValue(ok({ counts: { o1: 3, o2: 1 }, total: 4 }));
  raffle.draws.mockResolvedValue(ok([DRAW, { ...DRAW, id: "mug-2", voided: true }]));
  raffle.prizes.mockResolvedValue(ok([{ id: "mug", image: { url: "/media/mug.png" } }]));
  getStage.mockResolvedValue(ok({ raffle: { drawId: "mug-1", reel: ["Ana", "NovaDev"] } }));
});

const POLL = {
  id: "poll-mascota-01",
  question: "¿Cómo se llama la mascota?",
  status: "open",
  options: [
    { id: "o1", text: "Pixel", image: null },
    { id: "o2", text: "Tacnito", image: { url: "/media/t.png" } },
  ],
  createdAt: new Date("2026-11-21T13:00:00Z"),
};
const DRAW = {
  id: "mug-1",
  prizeId: "mug",
  prizeName: "Taza",
  winnerUid: "uid-secret",
  winnerAlias: "NovaDev",
  winnerSquadId: "gemini",
  tickets: 5,
  totalTickets: 80,
  entrants: 20,
  rule: { kind: "credits" as const },
  at: new Date("2026-11-21T16:30:00Z"),
  voided: false,
};

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
    ["polls", pollsRoute.GET],
    ["raffle", raffleRoute.GET],
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
  it("answers the top cadets and the squads with their pixel logo, without squad ids, and the server's clock", async () => {
    const body = await (await board.GET(request("board"))).json();

    expect(body).toEqual({
      serverNow: expect.any(Number),
      cadets: [{ position: 1, alias: "NovaDev", squad: "Firebase", xp: 640 }],
      squads: [{ position: 1, name: "Gemini", xp: 5210, members: 92, sprite: LOGO }],
      squadsOn: true,
    });
  });

  it("still ranks the squads without their logos when the catalog fails", async () => {
    catalogList.mockResolvedValue(err({ code: "unknown" }));

    expect((await (await board.GET(request("board"))).json()).squads).toEqual([{ position: 1, name: "Gemini", xp: 5210, members: 92, sprite: null }]);
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

describe("GET /api/show-feed/polls", () => {
  it("lists the polls the show may project, without drafts", async () => {
    const body = await (await pollsRoute.GET(request("polls"))).json();

    expect(body.polls).toEqual([{ id: "poll-mascota-01", question: "¿Cómo se llama la mascota?", status: "open" }]);
    expect(polls.tally).not.toHaveBeenCalled();
  });

  it("answers one poll's votes per option", async () => {
    const body = await (await pollsRoute.GET(request("polls?id=poll-mascota-01"))).json();

    expect(body.poll).toEqual({
      id: "poll-mascota-01",
      question: "¿Cómo se llama la mascota?",
      status: "open",
      options: [
        { id: "o1", text: "Pixel", imageUrl: null, votes: 3 },
        { id: "o2", text: "Tacnito", imageUrl: "/media/t.png", votes: 1 },
      ],
      total: 4,
    });
  });

  it.each(["poll-draft-0001", "poll-missing-01", "NOT AN ID"])("answers 404 for %s", async (id) => {
    expect((await pollsRoute.GET(request(`polls?id=${encodeURIComponent(id)}`))).status).toBe(404);
    expect(polls.tally).not.toHaveBeenCalled();
  });

  it("answers off when the edition has the polls off", async () => {
    modules.mockImplementation(async (name) => name !== "polls");

    expect((await pollsRoute.GET(request("polls"))).status).toBe(404);
    expect(polls.list).not.toHaveBeenCalled();
  });
});

describe("GET /api/show-feed/raffle", () => {
  it("lists the winners newest first without voided draws or uids, with the prize photo, squad and reel", async () => {
    const body = await (await raffleRoute.GET(request("raffle"))).json();

    expect(body.draws).toEqual([
      {
        id: "mug-1",
        prizeName: "Taza",
        prizeImageUrl: "/media/mug.png",
        winner: { alias: "NovaDev", squad: "Gemini" },
        tickets: 5,
        totalTickets: 80,
        rule: { kind: "credits" },
        at: DRAW.at.getTime(),
        reel: ["Ana", "NovaDev"],
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("uid-secret");
  });

  it("still lists the winners when the decoration cannot be read", async () => {
    raffle.prizes.mockResolvedValue(err({ code: "unknown" }));
    squadsList.mockResolvedValue(err({ code: "unknown" }));
    getStage.mockResolvedValue(err({ code: "unknown" }));

    expect((await (await raffleRoute.GET(request("raffle"))).json()).draws[0]).toMatchObject({ prizeImageUrl: null, winner: { alias: "NovaDev", squad: null }, reel: [] });
  });

  it("logs and answers 500 when the draws cannot be read", async () => {
    raffle.draws.mockResolvedValue(err({ code: "unknown" }));

    expect((await raffleRoute.GET(request("raffle"))).status).toBe(500);
    expect(logServerError).toHaveBeenCalledWith("show-feed.raffle", expect.anything());
  });
});
