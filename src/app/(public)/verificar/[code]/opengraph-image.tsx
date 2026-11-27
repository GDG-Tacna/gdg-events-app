import { ImageResponse } from "next/og";
import { readPublicCertificate } from "@/app-shell/composition/certificates.server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

/**
 * Dynamic Open Graph card (`1200×630` PNG) generated on the fly by `next/og` for LinkedIn, WhatsApp and X previews.
 * Uses only Flexbox (Satori constraint) and zero stored per-user images.
 */
export default async function CertificateOpenGraphImage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const result = await readPublicCertificate(decoded);
  const cert = result.ok ? result.value : null;

  const isValid = cert !== null && cert.status === "valid";
  const isRevoked = cert !== null && cert.status === "revoked";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f0f0f0",
          padding: 40,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#ffffff",
            border: "4px solid #1e1e1e",
            borderRadius: 28,
            overflow: "hidden",
          }}
        >
          {/* Google / GDG 4-color accent bar */}
          <div style={{ display: "flex", width: "100%", height: 14 }}>
            <div style={{ flex: 1, backgroundColor: "#4285f4" }} />
            <div style={{ flex: 1, backgroundColor: "#ea4335" }} />
            <div style={{ flex: 1, backgroundColor: "#f9ab00" }} />
            <div style={{ flex: 1, backgroundColor: "#34a853" }} />
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "44px 56px",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: "#1e1e1e",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {"<>"}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#1e1e1e" }}>
                  {cert?.organizationName ?? "GDG Tacna"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: "3px solid #1e1e1e",
                  backgroundColor: isValid ? "#5cdb6d" : isRevoked ? "#f28b82" : "#ffe7a5",
                  color: "#1e1e1e",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {isValid ? "✓ Certificado Verificado" : isRevoked ? "✕ Certificado Revocado" : "Verificación de Certificado"}
              </div>
            </div>

            {/* Body */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {cert ? (
                <>
                  <div style={{ fontSize: 22, color: "#555555", textTransform: "uppercase", letterSpacing: 2 }}>
                    {cert.eventName}
                  </div>
                  <div style={{ fontSize: 56, fontWeight: 700, color: "#1e1e1e", lineHeight: 1.1 }}>
                    {cert.recipientName}
                  </div>
                  <div style={{ fontSize: 28, color: "#4285f4", fontWeight: 600 }}>
                    {cert.credentialTitle}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 44, fontWeight: 700, color: "#1e1e1e" }}>Certificado no encontrado</div>
                  <div style={{ fontSize: 24, color: "#555555" }}>{`Código consultado: ${decoded}`}</div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "2px solid #e0e0e0",
                paddingTop: 20,
                fontSize: 20,
                color: "#555555",
              }}
            >
              <div>{cert ? `Código: ${cert.code}` : "GDG Tacna · Verificación Oficial"}</div>
              <div>{cert?.issueDateText ?? ""}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
