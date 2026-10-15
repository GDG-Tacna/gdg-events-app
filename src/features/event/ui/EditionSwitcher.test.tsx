// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { EditionChoice } from "../domain/editions";
import type { ChooseEditionAction } from "./actions";
import { EditionSwitcher, WorkingEditionNotice } from "./EditionSwitcher";
import { MyEditionsView } from "./MyEditionsView";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.editions;
const LIVE: EditionChoice = { id: "devfest-2026", name: "DevFest Tacna 2026", isPublic: true, stage: "live" };
const DRAFT: EditionChoice = { id: "meetup-nov", name: "Meetup noviembre", isPublic: false, stage: "draft" };

describe("EditionSwitcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the editions with their stage, and picking one saves it and reloads the screen", async () => {
    const choose = vi.fn<ChooseEditionAction>(async () => ({ ok: true }));
    render(<EditionSwitcher choices={[LIVE, DRAFT]} current={LIVE} choose={choose} />);

    expect(screen.getByRole("option", { name: "Meetup noviembre · Borrador" })).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText(t.switchLabel), "meetup-nov");

    expect(choose).toHaveBeenCalledWith({ id: "meetup-nov" });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the reason when the change is refused", async () => {
    render(<EditionSwitcher choices={[LIVE, DRAFT]} current={LIVE} choose={async () => ({ ok: false, code: "forbidden" })} />);

    await userEvent.setup().selectOptions(screen.getByLabelText(t.switchLabel), "meetup-nov");

    expect(await screen.findByText(t.errors.forbidden)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("only names the edition when there is a single one", () => {
    render(<EditionSwitcher choices={[DRAFT]} current={DRAFT} choose={vi.fn()} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Meetup noviembre")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<EditionSwitcher choices={[LIVE, DRAFT]} current={LIVE} choose={vi.fn()} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("WorkingEditionNotice", () => {
  it("says which edition is being prepared and which one cadets use, with a way back", async () => {
    const choose = vi.fn<ChooseEditionAction>(async () => ({ ok: true }));
    render(<WorkingEditionNotice current={DRAFT} live={LIVE} choose={choose} />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Estás preparando «Meetup noviembre» (borrador). Los cadetes, el staff y el escenario siguen en «DevFest Tacna 2026».",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: t.backToPublic }));
    expect(choose).toHaveBeenCalledWith({ id: "devfest-2026" });
  });

  it("is not shown while working in the public edition", () => {
    const { container } = render(<WorkingEditionNotice current={LIVE} live={LIVE} choose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MyEditionsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets an organizer open its edition and tells staff to wait for it", async () => {
    const choose = vi.fn<ChooseEditionAction>(async () => ({ ok: true }));
    const staffEdition: EditionChoice = { ...DRAFT, id: "taller-dic", name: "Taller" };
    render(
      <MyEditionsView
        entries={[
          { edition: DRAFT, role: "organizer" },
          { edition: staffEdition, role: "staff" },
        ]}
        choose={choose}
        adminHref="/admin"
      />,
    );

    expect(screen.getByText(t.mine.staffWaiting)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: t.mine.work }));

    expect(choose).toHaveBeenCalledWith({ id: "meetup-nov" });
    expect(router.push).toHaveBeenCalledWith("/admin");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<MyEditionsView entries={[{ edition: DRAFT, role: "organizer" }]} choose={vi.fn()} adminHref="/admin" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
