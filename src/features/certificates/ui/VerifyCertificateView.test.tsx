// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultCertificateFields } from "../domain/template";
import { VerifyCertificateView } from "./VerifyCertificateView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const VALID_CERT = {
  code: "GDG-4K9P7-X2M8R",
  eventId: "devfest-2026",
  eventName: "DevFest Tacna 2026",
  credentialTitle: "DevFest Tacna 2026 - Participación",
  organizationName: "GDG Tacna",
  linkedinOrganizationId: "12345",
  recipientName: "Sebastian Nicolás Fuentes Avalos",
  issuedAt: new Date("2026-11-23T12:00:00Z"),
  issueDate: new Date("2026-11-22T12:00:00Z"),
  issueDateText: "22 de Noviembre del 2026",
  status: "valid" as const,
  revokedAt: null,
  render: {
    backgroundUrl: "/media/public/devfest-2026/certificate/abcdef123456.webp",
    width: 2000,
    height: 1414,
    fields: defaultCertificateFields(),
  },
};

describe("VerifyCertificateView", () => {
  it("renders valid verified certificate preview and metadata without download, LinkedIn or copy buttons", () => {
    render(<VerifyCertificateView queryCode="GDG-4K9P7-X2M8R" certificate={VALID_CERT} baseUrl="https://devfest.gdgtacna.com" />);
    expect(screen.getByText(/certificado verificado/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sebastian Nicolás Fuentes Avalos" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /DevFest Tacna 2026 - Participación/i })).toBeInTheDocument();
    expect(screen.getByText("GDG-4K9P7-X2M8R")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar png/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /agregar a linkedin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiar enlace/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verificar otro código/i })).toHaveAttribute("href", "/verificar");
  });

  it("renders revoked banner without preview or action buttons", () => {
    render(
      <VerifyCertificateView
        queryCode="GDG-4K9P7-X2M8R"
        certificate={{ ...VALID_CERT, status: "revoked", revokedAt: new Date("2026-11-24T12:00:00Z") }}
        baseUrl="https://devfest.gdgtacna.com"
      />,
    );
    expect(screen.getByRole("heading", { name: /certificado revocado/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /agregar a linkedin/i })).not.toBeInTheDocument();
  });

  it("renders not-found state with lookup form", () => {
    render(<VerifyCertificateView queryCode="GDG-99999-99999" certificate={null} baseUrl="https://devfest.gdgtacna.com" />);
    expect(screen.getByRole("heading", { name: /certificado no encontrado/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/código del certificado/i)).toBeInTheDocument();
  });
});
