// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { ImagePurpose, ImageRef } from "../domain/image";
import { ImageField } from "./ImageField";
import type { UploadImageAction } from "./upload-action";

const t = copy.common.image;
const STORED = { path: "public/devfest-2026/badge/0f8e2c1a-1111.webp", url: "https://cdn.example/badge.webp", width: 64, height: 64, format: "webp" as const };

function Harness({ upload, initial = null, purpose = "badge", onChange }: { upload: UploadImageAction; initial?: ImageRef | null; purpose?: ImagePurpose; onChange?: (value: ImageRef | null) => void }) {
  const [value, setValue] = useState<ImageRef | null>(initial);
  return (
    <ImageField
      label="Imagen del logro"
      purpose={purpose}
      value={value}
      upload={upload}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const file = (bytes: number, type = "image/png", name = "x.png") => new File([new Uint8Array(bytes)], name, { type });
const choose = (purpose: string, chosen: File) => fireEvent.change(screen.getByTestId(`image-input-${purpose}`), { target: { files: [chosen] } });

describe("ImageField", () => {
  it("uploads the chosen file with its purpose, shows it and hands the reference to the form", async () => {
    const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: STORED }));
    const onChange = vi.fn();
    render(<Harness upload={upload} onChange={onChange} />);

    expect(screen.getByText(t.none)).toBeInTheDocument();
    choose("badge", file(1000));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ path: STORED.path, url: STORED.url }));
    const sent = upload.mock.calls[0][0];
    expect(sent.get("purpose")).toBe("badge");
    expect((sent.get("file") as File).name).toBe("x.png");
    expect(screen.getByRole("img", { name: "Vista previa: Imagen del logro" })).toHaveAttribute("src", STORED.url);
    expect(screen.getByRole("button", { name: t.change })).toBeInTheDocument();
    expect(screen.getByText(t.uploaded)).toBeInTheDocument();
  });

  it("removes the image, leaving it to the form to save", () => {
    const onChange = vi.fn();
    render(<Harness upload={vi.fn()} initial={{ path: STORED.path, url: STORED.url }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: t.remove }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByText(t.none)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.upload })).toBeInTheDocument();
  });

  it("answers at once for a file too large or of a type the purpose does not take, without uploading", () => {
    const upload = vi.fn<UploadImageAction>();
    render(<Harness upload={upload} />);

    choose("badge", file(2 * 1024 * 1024 + 1));
    expect(screen.getByRole("alert")).toHaveTextContent(t.errors["too-large"]);

    choose("badge", file(10, "image/svg+xml", "logo.svg"));
    expect(screen.getByRole("alert")).toHaveTextContent(t.errors["unsupported-format"]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("takes an SVG for a squad logo and a 4 MB plan, and says which formats each purpose takes", async () => {
    const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { ...STORED, format: "svg" } }));
    const { unmount } = render(<Harness upload={upload} purpose="squad-logo" />);

    expect(screen.getByText(t.formats.logo)).toBeInTheDocument();
    expect(screen.getByTestId("image-input-squad-logo")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/svg+xml");
    choose("squad-logo", file(10, "image/svg+xml", "logo.svg"));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    unmount();

    render(<Harness upload={upload} purpose="venue-plan" />);
    expect(screen.getByText(t.formats.plan)).toBeInTheDocument();
    choose("venue-plan", file(4 * 1024 * 1024, "image/svg+xml", "plano.svg"));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });

  it("explains the server's refusal and a dropped connection, keeping the image it had", async () => {
    const upload = vi.fn<UploadImageAction>().mockResolvedValueOnce({ ok: false, code: "unsafe-svg" }).mockRejectedValueOnce(new Error("offline"));
    const onChange = vi.fn();
    render(<Harness upload={upload} purpose="squad-logo" initial={{ path: STORED.path, url: STORED.url }} onChange={onChange} />);

    choose("squad-logo", file(10, "image/svg+xml", "a.svg"));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["unsafe-svg"]);
    choose("squad-logo", file(10));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.errors.unknown));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("src", STORED.url);
  });

  it("is a labelled group with its formats hint and no accessibility violations", async () => {
    const { container } = render(<Harness upload={vi.fn()} initial={{ path: STORED.path, url: STORED.url }} />);

    expect(screen.getByRole("group", { name: "Imagen del logro" })).toHaveAccessibleDescription(t.formats.picture);
    expect((await axe(container)).violations).toEqual([]);
  });
});
