// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { ChangeCadetTicketAction, LookupTicketAction, SearchTicketCadetsAction } from "./actions";
import { ChangeTicketScreen } from "./ChangeTicketScreen";

const t = copy.staff.tickets;

const HIT = { uid: "cadet-0002", alias: "Luna_3", name: "Ana Quispe", email: "an•••••@gmail.com", ticket: "pro" } as const;

function setup(overrides: { lookup?: LookupTicketAction; change?: ChangeCadetTicketAction; search?: SearchTicketCadetsAction } = {}) {
  const fake = fakeQrCamera();
  const lookup = overrides.lookup ?? vi.fn<LookupTicketAction>(async () => ({ ok: true, uid: "cadet-0001", alias: "Nova_7", ticket: "general" }));
  const change = overrides.change ?? vi.fn<ChangeCadetTicketAction>(async () => ({ ok: true }));
  const search = overrides.search ?? vi.fn<SearchTicketCadetsAction>(async () => ({ ok: true, cadets: [HIT] }));
  const view = render(<ChangeTicketScreen camera={fake.camera} lookup={lookup} search={search} change={change} backHref="/staff" />);
  return { ...view, ...fake, lookup, change, search, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangeTicketScreen", () => {
  it("asks for the cadet's QR and offers the way back", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeInTheDocument();
    expect(screen.getByText(t.hint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.back })).toHaveAttribute("href", "/staff");
  });

  it("sends the scanned pass, and shows the cadet with their current ticket", async () => {
    const s = setup();

    await s.see("devfest:at:pass");

    expect(s.lookup).toHaveBeenCalledWith({ payload: "devfest:at:pass" });
    expect(await screen.findByText("Nova_7")).toBeInTheDocument();
    expect(screen.getAllByText("Entrada General").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^General/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Premium/ })).toBeInTheDocument();
  });

  it("changes the ticket after the staff picks one and confirms, and says so", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    expect(screen.getByRole("button", { name: t.pickLegend })).toBeDisabled();
    await s.user.click(screen.getByRole("button", { name: /^Premium/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Premium" }));

    expect(s.change).toHaveBeenCalledWith({ uid: "cadet-0001", type: "premium" });
    expect(await screen.findByText("Nova_7 ahora tiene entrada Premium.")).toBeInTheDocument();
    expect(screen.getAllByText("Entrada Premium").length).toBeGreaterThan(0);
  });

  it("says when the cadet already had that ticket", async () => {
    const s = setup({ lookup: vi.fn<LookupTicketAction>(async () => ({ ok: true, uid: "cadet-0001", alias: "Nova_7", ticket: "pro" })) });
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await s.user.click(screen.getByRole("button", { name: /^Pro/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Pro" }));

    expect(await screen.findByText("Nova_7 ya tenía entrada Pro.")).toBeInTheDocument();
  });

  it("shows why a change failed and lets the staff try again", async () => {
    const change = vi.fn<ChangeCadetTicketAction>(async () => ({ ok: false, code: "forbidden" }));
    const s = setup({ change });
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await s.user.click(screen.getByRole("button", { name: /^Pro/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Pro" }));

    expect(await screen.findByText(copy.tickets.errors.forbidden)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner entrada Pro" })).toBeEnabled();
  });

  it("says why a scan was refused, and goes back to the camera for the next cadet", async () => {
    const lookup = vi.fn<LookupTicketAction>(async () => ({ ok: false, code: "expired-code" }));
    const s = setup({ lookup });

    await s.see("devfest:at:pass");

    expect(await screen.findByText(copy.tickets.errors["expired-code"])).toBeInTheDocument();
    await s.user.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.queryByText(copy.tickets.errors["expired-code"])).not.toBeInTheDocument();
    expect(s.paused()).toBe(false);
  });

  it("scans the next cadet after one", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await act(async () => {
      await s.user.click(screen.getByRole("button", { name: t.cancel }));
    });

    expect(screen.queryByText("Nova_7")).not.toBeInTheDocument();
    expect(s.paused()).toBe(false);
  });

  it("has no detectable accessibility violations", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    expect((await axe(s.container)).violations).toEqual([]);
  });
});

describe("ChangeTicketScreen search", () => {
  const box = () => screen.getByRole("searchbox", { name: t.search.label });
  /** Types the text and waits for the search the pause after it starts (no button: it searches as the staff type). */
  const searchFor = async (s: ReturnType<typeof setup>, text: string) => {
    await s.user.type(box(), text);
    await waitFor(() => expect(s.search).toHaveBeenCalled());
  };

  it("offers the search next to the camera, without a search button", () => {
    setup();

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(box()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar/i })).not.toBeInTheDocument();
  });

  it("asks once, after the staff pause, and not for every key", async () => {
    const s = setup();

    await s.user.type(box(), "ana");
    expect(s.search).not.toHaveBeenCalled();

    await waitFor(() => expect(s.search).toHaveBeenCalledTimes(1));
    expect(s.search).toHaveBeenCalledWith({ query: "ana" });
    expect(await screen.findByRole("list", { name: t.search.resultsLabel })).toBeInTheDocument();
  });

  it("asks again when the text changes after the first answer", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await screen.findByRole("list", { name: t.search.resultsLabel });

    await s.user.type(box(), "s");

    await waitFor(() => expect(s.search).toHaveBeenCalledTimes(2));
    expect(s.search).toHaveBeenLastCalledWith({ query: "anas" });
  });

  it("asks at once on Enter, and does not ask again when the pause ends", async () => {
    const s = setup();

    await s.user.type(box(), "ana{Enter}");
    expect(s.search).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  it("shows only the answer to the latest text when an older one arrives late", async () => {
    const answers: Array<(value: Awaited<ReturnType<SearchTicketCadetsAction>>) => void> = [];
    const search = vi.fn<SearchTicketCadetsAction>(() => new Promise((resolve) => answers.push(resolve)));
    const s = setup({ search });

    await s.user.type(box(), "ana{Enter}");
    await s.user.type(box(), "s{Enter}");
    expect(search).toHaveBeenCalledTimes(2);

    await act(async () => answers[1]({ ok: true, cadets: [{ ...HIT, uid: "cadet-0003", alias: "Anas_9" }] }));
    await act(async () => answers[0]({ ok: true, cadets: [HIT] }));

    const list = await screen.findByRole("list", { name: t.search.resultsLabel });
    expect(within(list).getByText("Anas_9")).toBeInTheDocument();
    expect(within(list).queryByText("Luna_3")).not.toBeInTheDocument();
  });

  it("clears the results, without asking, when the text gets shorter than three letters", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await screen.findByRole("list", { name: t.search.resultsLabel });

    await s.user.type(box(), "{Backspace}");

    await waitFor(() => expect(screen.queryByRole("list", { name: t.search.resultsLabel })).not.toBeInTheDocument());
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  it("searches by the text, lists the cadets with their name, masked email and ticket, and picks one", async () => {
    const s = setup();

    await searchFor(s, "  ana ");

    expect(s.search).toHaveBeenCalledWith({ query: "ana" });
    const list = await screen.findByRole("list", { name: t.search.resultsLabel });
    expect(within(list).getByText("Luna_3")).toBeInTheDocument();
    expect(within(list).getByText("Ana Quispe")).toBeInTheDocument();
    expect(within(list).getByText("an•••••@gmail.com")).toBeInTheDocument();

    await s.user.click(within(list).getByRole("button", { name: /Luna_3/ }));

    expect(screen.getByText("Luna_3")).toBeInTheDocument();
    expect(screen.getAllByText("Entrada Pro").length).toBeGreaterThan(0);
    expect(screen.queryByRole("list", { name: t.search.resultsLabel })).not.toBeInTheDocument();
  });

  it("changes the ticket of the cadet picked from the results", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await s.user.click(await screen.findByRole("button", { name: /Luna_3/ }));

    await s.user.click(screen.getByRole("button", { name: /^Premium/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Premium" }));

    expect(s.change).toHaveBeenCalledWith({ uid: "cadet-0002", type: "premium" });
    expect(await screen.findByText("Luna_3 ahora tiene entrada Premium.")).toBeInTheDocument();
  });

  it("keeps the camera from reading a pass while a cadet picked from the results is open, and reads again after", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await s.user.click(await screen.findByRole("button", { name: /Luna_3/ }));

    expect(s.paused()).toBe(true);

    await s.user.click(screen.getByRole("button", { name: t.cancel }));
    expect(s.paused()).toBe(false);
  });

  it("does not ask the server for a text shorter than three letters, not even on Enter, and says so quietly", async () => {
    const s = setup();

    await s.user.type(box(), "an{Enter}");
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(s.search).not.toHaveBeenCalled();
    expect(screen.getByText(t.search.tooShort)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks again after a failure when the staff press Enter with the same text", async () => {
    const search = vi.fn<SearchTicketCadetsAction>().mockResolvedValueOnce({ ok: false, code: "rate-limited" }).mockResolvedValue({ ok: true, cadets: [HIT] });
    const s = setup({ search });
    await searchFor(s, "ana");
    expect(await screen.findByText(copy.tickets.errors["rate-limited"])).toBeInTheDocument();

    await s.user.type(box(), "{Enter}");

    expect(await screen.findByRole("list", { name: t.search.resultsLabel })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("says when nobody matches", async () => {
    const s = setup({ search: vi.fn<SearchTicketCadetsAction>(async () => ({ ok: true, cadets: [] })) });

    await searchFor(s, "zzz");

    expect(await screen.findByText(t.search.empty)).toBeInTheDocument();
  });

  it("says why the search failed", async () => {
    const s = setup({ search: vi.fn<SearchTicketCadetsAction>(async () => ({ ok: false, code: "rate-limited" })) });

    await searchFor(s, "ana");

    expect(await screen.findByText(copy.tickets.errors["rate-limited"])).toBeInTheDocument();
  });

  it("shows a failure of the call itself as an unknown error", async () => {
    const s = setup({ search: vi.fn<SearchTicketCadetsAction>(async () => Promise.reject(new Error("boom"))) });

    await searchFor(s, "ana");

    expect(await screen.findByText(copy.tickets.errors.unknown)).toBeInTheDocument();
  });

  it("still reads a pass after a search, and the next cadet clears the search", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await screen.findByRole("list", { name: t.search.resultsLabel });

    await s.see("devfest:at:pass");
    expect(await screen.findByText("Nova_7")).toBeInTheDocument();

    await act(async () => {
      await s.user.click(screen.getByRole("button", { name: t.cancel }));
    });
    expect(screen.queryByRole("list", { name: t.search.resultsLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: t.search.label })).toHaveValue("");
  });

  it("has no detectable accessibility violations with results on screen", async () => {
    const s = setup();
    await searchFor(s, "ana");
    await screen.findByRole("list", { name: t.search.resultsLabel });

    expect((await axe(s.container)).violations).toEqual([]);
  });
});
