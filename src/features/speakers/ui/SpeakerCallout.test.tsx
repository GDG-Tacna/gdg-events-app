// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { SpeakerCallout } from "./SpeakerCallout";

describe("SpeakerCallout", () => {
  it("names the speaker and links to their code, accessibly", async () => {
    const { container } = render(<SpeakerCallout name="Ana Torres" href="/speaker" />);

    expect(screen.getByRole("region", { name: copy.speakerHome.callout.label })).toHaveTextContent("Eres speaker: Ana Torres");
    expect(screen.getByRole("link", { name: copy.speakerHome.callout.open })).toHaveAttribute("href", "/speaker");
    expect((await axe(container)).violations).toEqual([]);
  });
});
