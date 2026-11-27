"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, FormDialog, InlineAlert, SelectField, TextField } from "@/shared/ui";
import { buildVerificationUrl, type IssuedCertificate } from "../domain/certificate";
import type { CertificateTemplate } from "../domain/template";
import type {
  IssueManualCertificateAction,
  ReinstateCertificateAction,
  RenameCertificateAction,
  RevokeCertificateAction,
} from "./actions";

export interface IssuedCertificatesViewProps {
  certificates: readonly IssuedCertificate[];
  templates: readonly CertificateTemplate[];
  baseUrl: string;
  backHref: string;
  rename: RenameCertificateAction;
  revoke: RevokeCertificateAction;
  reinstate: ReinstateCertificateAction;
  issueManual: IssueManualCertificateAction;
}

const t = copy.adminCertificates.issued;
const errors = copy.adminCertificates.errors;

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Admin view of issued certificates for the working edition: search, rename, revoke/reinstate, manual issue & CSV export. */
export function IssuedCertificatesView({
  certificates,
  templates,
  baseUrl,
  backHref,
  rename,
  revoke,
  reinstate,
  issueManual,
}: IssuedCertificatesViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<IssuedCertificate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<IssuedCertificate | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const usableTemplates = templates.filter((tpl) => tpl.background !== null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTemplateId, setManualTemplateId] = useState(usableTemplates[0]?.id ?? "");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const origin = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    if (!q) return certificates;
    return certificates.filter((cert) =>
      [cert.recipientName, cert.recipientEmail ?? "", cert.code, cert.templateName].some((field) => fold(field).includes(q)),
    );
  }, [certificates, search]);

  async function copyVerifyLink(code: string) {
    const url = buildVerificationUrl(origin, code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2000);
    } catch {
      // Clipboard unavailable.
    }
  }

  function exportCsv() {
    const header = ["Codigo", "Nombre", "Correo", "Plantilla", "Estado", "Emitido", "URL de verificacion"];
    const rows = filtered.map((cert) => [
      cert.code,
      cert.recipientName,
      cert.recipientEmail ?? "",
      cert.templateName,
      cert.revokedAt ? t.statusRevoked : t.statusValid,
      cert.issuedAt.toISOString(),
      buildVerificationUrl(origin, cert.code),
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "certificados-emitidos.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget || pending) return;
    setPending(true);
    setDialogError(null);
    const result = await rename({ code: renameTarget.code, recipientName: renameValue }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setDialogError(errors[result.code]);
      return;
    }
    setRenameTarget(null);
    setNotice({ kind: "success", text: interpolate(t.renamedDone, { name: result.value.recipientName }) });
    router.refresh();
  }

  async function submitRevoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokeTarget || pending) return;
    setPending(true);
    setDialogError(null);
    const result = await revoke({ code: revokeTarget.code, reason: revokeReason }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setDialogError(errors[result.code]);
      return;
    }
    const code = revokeTarget.code;
    setRevokeTarget(null);
    setRevokeReason("");
    setNotice({ kind: "success", text: interpolate(t.revokedDone, { code }) });
    router.refresh();
  }

  async function handleReinstate(code: string) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const result = await reinstate({ code }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: errors[result.code] });
      return;
    }
    setNotice({ kind: "success", text: interpolate(t.reinstatedDone, { code }) });
    router.refresh();
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setDialogError(null);
    const result = await issueManual({
      templateId: manualTemplateId,
      recipientName: manualName,
      recipientEmail: manualEmail.trim() || null,
    }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setDialogError(errors[result.code]);
      return;
    }
    setManualOpen(false);
    setManualName("");
    setManualEmail("");
    setNotice({ kind: "success", text: interpolate(t.manualDone, { code: result.value.code, name: result.value.recipientName }) });
    router.refresh();
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>

      <header className="gap-space-3 flex flex-wrap items-start justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="gap-space-2 flex flex-wrap">
          {certificates.length > 0 ? (
            <Button type="button" variant="secondary" icon="download" onClick={exportCsv}>
              {t.exportCsv}
            </Button>
          ) : null}
          <Button
            type="button"
            icon="plus"
            disabled={usableTemplates.length === 0}
            onClick={() => {
              setDialogError(null);
              setManualTemplateId(usableTemplates[0]?.id ?? "");
              setManualOpen(true);
            }}
          >
            {t.issueManual}
          </Button>
        </div>
      </header>

      {notice ? (
        notice.kind === "success" ? (
          <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
            {notice.text}
          </p>
        ) : (
          <InlineAlert>{notice.text}</InlineAlert>
        )
      ) : null}

      {certificates.length > 0 ? (
        <TextField
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {certificates.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.noMatch}</p>
        </Card>
      ) : (
        <ul className="gap-space-3 flex flex-col">
          {filtered.map((cert) => (
            <li key={cert.code}>
              <Card className="gap-space-3 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="gap-space-1 flex min-w-0 flex-col">
                  <div className="gap-space-2 flex flex-wrap items-center">
                    <span className="type-title text-foreground">{cert.recipientName}</span>
                    <span
                      className={
                        cert.revokedAt
                          ? "bg-danger/20 text-danger-ink type-caption rounded-pill px-space-2 py-0.5 font-semibold"
                          : "bg-lime text-on-accent type-caption rounded-pill px-space-2 py-0.5 font-semibold"
                      }
                    >
                      {cert.revokedAt ? t.statusRevoked : t.statusValid}
                    </span>
                  </div>
                  <p className="type-caption text-cyan-ink font-mono">{cert.code}</p>
                  <p className="type-body-sm text-muted-foreground">
                    {cert.templateName}
                    {cert.recipientEmail ? ` · ${cert.recipientEmail}` : ""}
                  </p>
                </div>

                <div className="gap-space-2 flex shrink-0 flex-wrap">
                  <Button type="button" variant="secondary" size="sm" icon="copy" onClick={() => void copyVerifyLink(cert.code)}>
                    {copiedCode === cert.code ? t.copied : t.copyVerify}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon="edit"
                    onClick={() => {
                      setDialogError(null);
                      setRenameValue(cert.recipientName);
                      setRenameTarget(cert);
                    }}
                  >
                    {t.rename}
                  </Button>
                  {cert.revokedAt ? (
                    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => void handleReinstate(cert.code)}>
                      {t.reinstate}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="revoke"
                      onClick={() => {
                        setDialogError(null);
                        setRevokeReason("");
                        setRevokeTarget(cert);
                      }}
                    >
                      {t.revoke}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <FormDialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)} title={t.renameTitle} description={t.renameHint}>
        <form onSubmit={submitRename} noValidate className="gap-space-4 flex flex-col">
          {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
          <TextField label={t.manualName} value={renameValue} maxLength={90} disabled={pending} onChange={(event) => setRenameValue(event.target.value)} />
          <Button type="submit" block loading={pending}>
            {t.renameSave}
          </Button>
        </form>
      </FormDialog>

      <FormDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={revokeTarget ? interpolate(t.revokeTitle, { name: revokeTarget.recipientName }) : ""}
      >
        <form onSubmit={submitRevoke} noValidate className="gap-space-4 flex flex-col">
          {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
          <TextField
            label={t.revokeReason}
            placeholder={t.revokeReasonPlaceholder}
            value={revokeReason}
            maxLength={200}
            disabled={pending}
            onChange={(event) => setRevokeReason(event.target.value)}
          />
          <Button type="submit" variant="danger" block loading={pending}>
            {t.revokeConfirm}
          </Button>
        </form>
      </FormDialog>

      <FormDialog open={manualOpen} onOpenChange={setManualOpen} title={t.manualTitle} description={t.manualIntro}>
        <form onSubmit={submitManual} noValidate className="gap-space-4 flex flex-col">
          {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
          <SelectField
            label={t.manualTemplate}
            value={manualTemplateId}
            disabled={pending}
            options={usableTemplates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            onChange={(event) => setManualTemplateId(event.target.value)}
          />
          <TextField label={t.manualName} value={manualName} maxLength={90} disabled={pending} onChange={(event) => setManualName(event.target.value)} />
          <TextField
            label={t.manualEmail}
            type="email"
            value={manualEmail}
            maxLength={120}
            disabled={pending}
            onChange={(event) => setManualEmail(event.target.value)}
          />
          <Button type="submit" block loading={pending}>
            {t.manualSubmit}
          </Button>
        </form>
      </FormDialog>
    </div>
  );
}
