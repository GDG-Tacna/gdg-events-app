import { describe, expect, it } from "vitest";
import { defaultCertificateFields } from "../domain/template";
import { moveFieldBy, moveFieldTo, resizeFieldWidthBy, updateField } from "./field-editing";

describe("field-editing helpers", () => {
  it("moves fields within canvas bounds and clamps width to remaining space", () => {
    const fields = defaultCertificateFields();
    const moved = moveFieldTo(fields, "recipientName", 50, 60);
    const target = moved.find((f) => f.id === "recipientName")!;
    // width is 80, so x clamps to 20 (100 - 80)
    expect(target.x).toBe(20);
    expect(target.y).toBe(60);

    const nudged = moveFieldBy(moved, "recipientName", -5, -10);
    expect(nudged.find((f) => f.id === "recipientName")).toMatchObject({ x: 15, y: 50 });

    const resized = resizeFieldWidthBy(nudged, "recipientName", 20);
    expect(resized.find((f) => f.id === "recipientName")?.width).toBe(85);

    const updated = updateField(resized, "recipientName", { fontSize: 99 });
    expect(updated.find((f) => f.id === "recipientName")?.fontSize).toBe(15);
  });
});
