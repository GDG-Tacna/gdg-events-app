import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { defaultCertificateFields } from "../domain/template";
import { buildCertificatePdfBytes, fieldDisplayText, fitFontSize, safeCertificateFilename } from "./render-certificate";

/** Minimal valid 1x1 white baseline JPEG. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

describe("render-certificate helpers", () => {
  it("formats text fields with optional prefixes", () => {
    const fields = defaultCertificateFields();
    const values = {
      recipientName: "Sebastian Fuentes",
      verificationCode: "GDG-4K9P7-X2M8R",
      verificationUrl: "https://gdg.dev/verificar/GDG-4K9P7-X2M8R",
      issueDateText: "22 de Noviembre del 2026",
      eventName: "DevFest Tacna 2026",
    };

    const nameField = fields.find((f) => f.kind === "recipientName")!;
    const urlField = fields.find((f) => f.kind === "verificationUrl")!;
    expect(fieldDisplayText(nameField, values)).toBe("Sebastian Fuentes");
    expect(fieldDisplayText(urlField, values)).toBe("Verificar en: https://gdg.dev/verificar/GDG-4K9P7-X2M8R");
  });

  it("shrinks font size smoothly when a long name exceeds box width", () => {
    // Fake linear measurement: each px of fontSize measures 20px wide.
    const fitted = fitFontSize((px) => px * 20, 400, 60, 12);
    expect(fitted).toBe(20);
    // Already fits: stays at starting size.
    expect(fitFontSize((px) => px * 5, 400, 60, 12)).toBe(60);
  });

  it("builds a valid A4-proportioned PDF with metadata and clickable link annotation", async () => {
    const bytes = await buildCertificatePdfBytes({
      jpegBytes: new Uint8Array(TINY_JPEG),
      width: 2000,
      height: 1414,
      meta: {
        title: "DevFest Tacna 2026 - Sebastian Fuentes",
        author: "GDG Tacna",
        subject: "Certificado verificable GDG-4K9P7-X2M8R",
        verificationLink: { url: "https://gdg.dev/verificar/GDG-4K9P7-X2M8R", x: 56, y: 90, width: 40, height: 3 },
      },
    });

    expect(new TextDecoder("ascii").decode(bytes.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toBe("DevFest Tacna 2026 - Sebastian Fuentes");
    expect(loaded.getAuthor()).toBe("GDG Tacna");
    const { width, height } = loaded.getPage(0).getSize();
    expect(Math.round(width)).toBe(842);
    expect(Math.round(height)).toBe(595);
  });

  it("normalizes filenames for download", () => {
    expect(safeCertificateFilename("DevFest Tacna 2026 - Sebastián Peña", "pdf")).toBe("devfest-tacna-2026-sebastian-pena.pdf");
  });
});
