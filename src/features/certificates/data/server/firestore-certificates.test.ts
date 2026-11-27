import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));
import {
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  type CertificateTemplate,
} from "../../domain/template";
import { mapCertificateDoc, mapTemplateDoc, toCertificateDoc, toTemplateDoc } from "./certificate.mapper";
import { CachedCertificateTemplateStore } from "./firestore-template-store";

const NOW = new Date("2026-11-23T12:00:00Z");
const BG_PATH = "public/devfest-2026/certificate/abcdef123456.webp";

describe("certificate mappers", () => {
  it("round-trips a template rebuilding the /media URL from backgroundPath", () => {
    const template: CertificateTemplate = {
      id: "asistente",
      name: "Constancia de participación",
      credentialTitle: "DevFest Tacna 2026",
      organizationName: "GDG Tacna",
      linkedinOrganizationId: "12345",
      issueDateText: "22 de Noviembre del 2026",
      issueDate: NOW,
      background: { path: BG_PATH, url: `/media/${BG_PATH}` },
      width: DEFAULT_TEMPLATE_WIDTH,
      height: DEFAULT_TEMPLATE_HEIGHT,
      fields: defaultCertificateFields(),
      eligibility: defaultCertificateEligibility(),
      published: true,
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const doc = toTemplateDoc(template);
    expect(doc.backgroundPath).toBe(BG_PATH);
    expect("background" in doc).toBe(false);

    const mapped = mapTemplateDoc("asistente", doc);
    expect(mapped?.background).toEqual({ path: BG_PATH, url: `/media/${BG_PATH}` });
    expect(mapped?.eligibility.allowedTickets).toEqual(["pro", "premium"]);
  });

  it("round-trips an issued certificate document", () => {
    const doc = toCertificateDoc({
      code: "GDG-23456-789AB",
      eventId: "devfest-2026",
      eventName: "DevFest Tacna 2026",
      templateId: "asistente",
      templateName: "Constancia",
      credentialTitle: "DevFest Tacna 2026",
      organizationName: "GDG Tacna",
      linkedinOrganizationId: null,
      uid: "u1",
      recipientName: "Ana Pérez",
      recipientEmail: "ana@example.com",
      issuedAt: NOW,
      issueDate: NOW,
      issueDateText: "Noviembre 2026",
      revokedAt: null,
      revokedReason: null,
      nameEditedByAdminAt: null,
      updatedAt: NOW,
    });

    const mapped = mapCertificateDoc("GDG-23456-789AB", doc);
    expect(mapped?.recipientName).toBe("Ana Pérez");
    expect(mapped?.code).toBe("GDG-23456-789AB");
  });
});

describe("CachedCertificateTemplateStore", () => {
  it("caches getForEdition and listAllPublished until TTL expires or invalidate is called", async () => {
    let clock = 1_000;
    const inner = {
      list: vi.fn(async () => ok([])),
      get: vi.fn(async () => ok(null)),
      getForEdition: vi.fn(async () => ok(null)),
      listAllPublished: vi.fn(async () => ok([])),
      create: vi.fn(async () => ok(undefined)),
      update: vi.fn(async () => ok(undefined)),
      remove: vi.fn(async () => ok(undefined)),
    };
    const cached = new CachedCertificateTemplateStore(inner, 60_000, () => clock);

    await cached.getForEdition("devfest-2026", "asistente");
    await cached.getForEdition("devfest-2026", "asistente");
    expect(inner.getForEdition).toHaveBeenCalledTimes(1);

    await cached.listAllPublished();
    await cached.listAllPublished();
    expect(inner.listAllPublished).toHaveBeenCalledTimes(1);

    cached.invalidate();
    await cached.getForEdition("devfest-2026", "asistente");
    expect(inner.getForEdition).toHaveBeenCalledTimes(2);

    clock += 61_000;
    await cached.getForEdition("devfest-2026", "asistente");
    expect(inner.getForEdition).toHaveBeenCalledTimes(3);
  });
});
