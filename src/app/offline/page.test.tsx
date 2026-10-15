// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import OfflinePage, { metadata } from "./page";
import * as pageModule from "./page";

describe("offline page", () => {
  it("tells the attendee the connection was lost, in the Design System voice", () => {
    render(<OfflinePage />);

    expect(screen.getByRole("heading", { level: 1, name: copy.pwa.offlinePage.title })).toBeInTheDocument();
    expect(screen.getByText(copy.pwa.offlinePage.body)).toBeInTheDocument();
  });

  it("offers a retry that is a real link to the home page, so it works without any script", () => {
    render(<OfflinePage />);

    expect(screen.getByRole("link", { name: copy.pwa.offlinePage.retry })).toHaveAttribute("href", "/");
  });

  it("marks itself so the no-connection strip steps aside (the worker serves it under any URL)", () => {
    const { container } = render(<OfflinePage />);

    expect(container.querySelector("[data-offline-page]")).not.toBeNull();
  });

  it("is not indexed and has its own title", () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(String(metadata.title)).toContain(copy.pwa.offlinePage.title);
  });

  it("stays static: it forces nothing dynamic, so it can be cached when the worker installs", () => {
    expect(pageModule).not.toHaveProperty("dynamic");
    expect(pageModule).not.toHaveProperty("revalidate");
    expect(pageModule).not.toHaveProperty("generateMetadata");
    // A static page is a plain synchronous component: it reads no cookies, headers or session.
    expect(OfflinePage.constructor.name).not.toBe("AsyncFunction");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<OfflinePage />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
