// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { MediaCue, StoredCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, mp4, pdf, png } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: ({ page, label }: { page: number; label: string }) => <div data-testid="slide" data-page={page} data-label={label} /> }));

const t = copy.stageConsole;
const CLIP: MediaCue = { id: "clip-1", kind: "video", name: "Video de apertura", path: "apertura/video.mp4" };
const DECK: MediaCue = { id: "deck-1", kind: "slides", name: "Diapositivas del keynote", path: "apertura/keynote.pdf" };
const PHOTO: MediaCue = { id: "photo-1", kind: "image", name: "Portada", path: "apertura/portada.png" };
const AGENDA = [{ id: "keynote", time: "09:00", title: "Keynote de apertura", who: "Equipo GDG Tacna" }];

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup(cues: readonly StoredCue[]) {
  const lines = channelPair();
  const fake = fakeLibrary({ "apertura/video.mp4": mp4(), "apertura/keynote.pdf": pdf(), "apertura/portada.png": png() });
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={AGENDA}
      qrItems={["keynote"]}
      stored={{ keynote: cues }}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={vi.fn<SaveCuesAction>(async ({ cues: saved }) => ({ ok: true, cues: saved }))}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
}

const monitor = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
  let count = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:file-${(count += 1)}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("the monitors of the console", () => {
  it("shows a small live copy of the screen in «En pantalla» instead of a black box, with nothing on the air too", async () => {
    setup([CLIP, PHOTO]);
    await settle();

    const frame = within(monitor(t.program.label)).getByTitle(t.program.mirror);
    expect(frame).toHaveAttribute("src", "/escenario?vista=previa");
    expect(frame).toHaveAttribute("tabindex", "-1");
  });

  it("keeps the real picture for a slide or an image on the air, and uses the copy of the screen for a video", async () => {
    setup([PHOTO, CLIP]);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();

    expect(within(monitor(t.program.label)).getByAltText("Portada")).toBeInTheDocument();
    expect(within(monitor(t.program.label)).queryByTitle(t.program.mirror)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(within(monitor(t.program.label)).getByTitle(t.program.mirror)).toBeInTheDocument();
  });

  it("previews what comes next: the first frame of a video, the first page of a deck and a picture", async () => {
    setup([CLIP, DECK, PHOTO]);
    await settle();

    const video = monitor(t.program.next).querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toMatch(/^blob:file-\d+#t=0\.1$/);
    expect(video?.muted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(within(monitor(t.program.next)).getByTestId("slide")).toHaveAttribute("data-page", "1");

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(within(monitor(t.program.next)).getByAltText("Portada")).toBeInTheDocument();
  });

  it("falls back to the icon with the name when the next piece has no picture, and when there is none", async () => {
    setup([{ id: "gs-1", kind: "gslides", name: "Keynote en Google Slides", deckId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", published: false }]);
    await settle();

    expect(within(monitor(t.program.next)).getAllByText("Keynote en Google Slides").length).toBeGreaterThan(0);
    expect(monitor(t.program.next).querySelector("video, img, canvas")).toBeNull();
  });
});
