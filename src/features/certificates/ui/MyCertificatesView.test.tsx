// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultCertificateFields } from "../domain/template";
import { MyCertificatesView } from "./MyCertificatesView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const SPEC = {
  backgroundUrl: "/media/public/devfest-2026/certificate/abcdef123456.webp",
  width: 2000,
  height: 1414,
  fields: defaultCertificateFields(),
};

describe("MyCertificatesView", () => {
  it("renders empty state when user has no claimable or issued certificates", () => {
    render(<MyCertificatesView claimable={[]} issued={[]} baseUrl="https://devfest.gdgtacna.com" claim={vi.fn()} />);
    expect(screen.getByText(/todavía no tienes certificados disponibles/i)).toBeInTheDocument();
  });

  it("pre-fills suggested full name, validates incomplete names, confirms and claims a certificate", async () => {
    const user = userEvent.setup();
    const claim = vi.fn(async ({ recipientName }) => ({
      ok: true as const,
      value: {
        code: "GDG-4K9P7-X2M8R",
        eventId: "devfest-2026",
        eventName: "DevFest Tacna 2026",
        templateId: "asistente",
        templateName: "Constancia",
        credentialTitle: "DevFest Tacna 2026 - Participación",
        organizationName: "GDG Tacna",
        linkedinOrganizationId: null,
        recipientName,
        issuedAt: new Date("2026-11-23T12:00:00Z"),
        issueDate: new Date("2026-11-22T12:00:00Z"),
        issueDateText: "22 de Noviembre del 2026",
        status: "valid" as const,
        revokedAt: null,
        render: SPEC,
      },
    }));

    render(
      <MyCertificatesView
        claimable={[
          {
            eventId: "devfest-2026",
            eventName: "DevFest Tacna 2026",
            templateId: "asistente",
            templateName: "Constancia",
            credentialTitle: "DevFest Tacna 2026 - Participación",
            organizationName: "GDG Tacna",
            issueDateText: "22 de Noviembre del 2026",
            suggestedName: "Sebastian Fuentes",
            render: SPEC,
          },
        ]}
        issued={[]}
        baseUrl="https://devfest.gdgtacna.com"
        claim={claim}
      />,
    );

    const input = screen.getByLabelText(/nombres y apellidos completos/i);
    expect(input).toHaveValue("Sebastian Fuentes");

    await user.clear(input);
    await user.type(input, "Sebastian");
    await user.click(screen.getByRole("button", { name: /confirmar nombre y emitir certificado/i }));
    expect(screen.getByText(/al menos tu nombre y apellido completos/i)).toBeInTheDocument();
    expect(claim).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "Sebastian Nicolás Fuentes Avalos");
    await user.click(screen.getByRole("button", { name: /confirmar nombre y emitir certificado/i }));

    // Confirmation dialog appears before locking the name
    const confirmBtn = await screen.findByRole("button", { name: /sí, emitir certificado/i });
    await user.click(confirmBtn);

    expect(claim).toHaveBeenCalledWith({
      eventId: "devfest-2026",
      templateId: "asistente",
      recipientName: "Sebastian Nicolás Fuentes Avalos",
    });
    expect(await screen.findByText(/certificado emitido/i)).toBeInTheDocument();
    const pdfBtn = screen.getByRole("button", { name: /descargar pdf/i });
    const pngBtn = screen.getByRole("button", { name: /descargar png/i });
    const linkedInLink = screen.getByRole("link", { name: /agregar a linkedin/i });
    const copyBtn = screen.getByRole("button", { name: /copiar enlace/i });
    const verifyLink = screen.getByRole("link", { name: /ver página pública/i });

    expect(linkedInLink).toHaveAttribute("href", expect.stringContaining("https://www.linkedin.com/profile/add"));
    expect(verifyLink).toHaveAttribute("href", "/verificar/GDG-4K9P7-X2M8R");
    for (const control of [pdfBtn, pngBtn, linkedInLink, copyBtn, verifyLink]) {
      expect(control).toHaveClass("w-full");
    }
  });
});
