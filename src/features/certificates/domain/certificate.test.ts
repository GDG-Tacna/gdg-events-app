import { describe, expect, it } from "vitest";
import { buildLinkedInAddCertUrl, buildVerificationUrl, toPublicCertificate, type IssuedCertificate } from "./certificate";

describe("certificate helpers", () => {
  it("builds a canonical verification URL without double slashes", () => {
    expect(buildVerificationUrl("https://devfest.gdgtacna.com/", "GDG-4K9P7-X2M8R")).toBe(
      "https://devfest.gdgtacna.com/verificar/GDG-4K9P7-X2M8R",
    );
  });

  it("builds a LinkedIn Add-to-Profile URL with organizationId when configured, or organizationName otherwise", () => {
    const withId = new URL(
      buildLinkedInAddCertUrl({
        name: "DevFest Tacna 2026 - Participación",
        organizationName: "GDG Tacna",
        organizationId: "987654",
        issueDate: new Date("2026-11-22T12:00:00Z"),
        certId: "GDG-4K9P7-X2M8R",
        certUrl: "https://devfest.gdgtacna.com/verificar/GDG-4K9P7-X2M8R",
      }),
    );
    expect(withId.origin + withId.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(withId.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(withId.searchParams.get("organizationId")).toBe("987654");
    expect(withId.searchParams.get("organizationName")).toBeNull();
    expect(withId.searchParams.get("issueYear")).toBe("2026");
    expect(withId.searchParams.get("issueMonth")).toBe("11");
    expect(withId.searchParams.get("certId")).toBe("GDG-4K9P7-X2M8R");

    const withName = new URL(
      buildLinkedInAddCertUrl({
        name: "DevFest Tacna 2026",
        organizationName: "GDG Tacna",
        organizationId: null,
        issueDate: new Date("2026-11-22T12:00:00Z"),
        certId: "GDG-4K9P7-X2M8R",
        certUrl: "https://devfest.gdgtacna.com/verificar/GDG-4K9P7-X2M8R",
      }),
    );
    expect(withName.searchParams.get("organizationName")).toBe("GDG Tacna");
    expect(withName.searchParams.get("organizationId")).toBeNull();
  });

  it("strips private uid, recipientEmail and revokedReason when converting to PublicCertificate", () => {
    const issued: IssuedCertificate = {
      code: "GDG-4K9P7-X2M8R",
      eventId: "devfest-2026",
      eventName: "DevFest Tacna 2026",
      templateId: "asistente",
      templateName: "Constancia",
      credentialTitle: "DevFest Tacna 2026 - Participación",
      organizationName: "GDG Tacna",
      linkedinOrganizationId: null,
      uid: "secret-uid",
      recipientName: "Sebastian Fuentes",
      recipientEmail: "private@example.com",
      issuedAt: new Date("2026-11-23T00:00:00Z"),
      issueDate: new Date("2026-11-22T12:00:00Z"),
      issueDateText: "22 de Noviembre del 2026",
      revokedAt: null,
      revokedReason: "internal note",
      nameEditedByAdminAt: null,
      updatedAt: new Date("2026-11-23T00:00:00Z"),
    };

    const pub = toPublicCertificate(issued, null);
    expect(pub.status).toBe("valid");
    expect("uid" in pub).toBe(false);
    expect("recipientEmail" in pub).toBe(false);
    expect("revokedReason" in pub).toBe(false);
  });
});
