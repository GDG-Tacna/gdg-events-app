"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, Icon, InlineAlert, Thumbnail, useConfirm } from "@/shared/ui";
import type { CertificateEligibility, CertificateTemplateSummary } from "../domain/template";
import type { DeleteCertificateTemplateAction, ToggleCertificatePublishedAction } from "./actions";

export interface CertificatesAdminViewProps {
  templates: readonly CertificateTemplateSummary[];
  canDelete: boolean;
  togglePublished: ToggleCertificatePublishedAction;
  remove: DeleteCertificateTemplateAction;
  hrefs: {
    create: string;
    editBase: string;
    issued: string;
  };
}

const t = copy.adminCertificates;

function eligibilityBadges(eligibility: CertificateEligibility): string[] {
  const tags: string[] = [];
  if (eligibility.mode === "all") {
    tags.push(t.eligibilitySummary.all);
  } else if (eligibility.mode === "tickets") {
    const names = eligibility.allowedTickets.map((ticket) => copy.tickets.names[ticket]).join(" · ");
    if (names) tags.push(interpolate(t.eligibilitySummary.tickets, { tickets: names }));
  } else {
    tags.push(t.eligibilitySummary.manual);
  }
  if (eligibility.includeSpeakers) tags.push(t.eligibilitySummary.speakers);
  if (eligibility.includeTeamRoles.includes("staff")) tags.push(t.eligibilitySummary.staff);
  if (eligibility.includeTeamRoles.includes("organizer")) tags.push(t.eligibilitySummary.organizer);
  if (eligibility.allowedEmails.length > 0) tags.push(interpolate(t.eligibilitySummary.emails, { n: String(eligibility.allowedEmails.length) }));
  if (eligibility.requireAttendance && eligibility.mode !== "manual") tags.push(t.eligibilitySummary.attendance);
  return tags;
}

/** Admin overview of the edition's certificate templates, with quick publish toggles and link to issued certificates. */
export function CertificatesAdminView({ templates, canDelete, togglePublished, remove, hrefs }: CertificatesAdminViewProps) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function onTogglePublish(template: CertificateTemplateSummary) {
    if (busyId) return;
    setBusyId(template.id);
    setNotice(null);
    const result = await togglePublished({ id: template.id, published: !template.published }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setBusyId(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: t.errors[result.code] });
      return;
    }
    setNotice({
      kind: "success",
      text: interpolate(result.value.published ? t.publishedDone : t.unpublishedDone, { name: template.name }),
    });
    router.refresh();
  }

  async function onDelete(template: CertificateTemplateSummary) {
    if (busyId) return;
    const ok = await confirm({
      title: interpolate(t.confirmDeleteTitle, { name: template.name }),
      description: t.confirmDeleteBody,
      confirmLabel: t.delete,
    });
    if (!ok) return;
    setBusyId(template.id);
    setNotice(null);
    const result = await remove({ id: template.id }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setBusyId(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: t.errors[result.code] });
      return;
    }
    setNotice({ kind: "success", text: interpolate(t.deletedDone, { name: result.value.name }) });
    router.refresh();
  }

  return (
    <div className="gap-space-6 flex flex-col">
      {dialog}
      <header className="gap-space-3 flex flex-wrap items-start justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="gap-space-2 flex flex-wrap">
          <ButtonLink href={hrefs.issued} variant="secondary">
            {t.viewIssued}
          </ButtonLink>
          <ButtonLink href={hrefs.create} variant="primary" className="gap-space-2">
            <Icon name="plus" size={18} />
            {t.create}
          </ButtonLink>
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

      {templates.length === 0 ? (
        <Card className="gap-space-3 flex flex-col items-start">
          <p className="type-body text-muted-foreground">{t.empty}</p>
          <ButtonLink href={hrefs.create} variant="primary" className="gap-space-2">
            <Icon name="plus" size={18} />
            {t.create}
          </ButtonLink>
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-4 flex flex-col">
          {templates.map((template) => {
            const busy = busyId === template.id;
            const tags = eligibilityBadges(template.eligibility);
            return (
              <li key={template.id}>
                <Card className="gap-space-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="gap-space-4 flex min-w-0 items-start">
                    {template.background ? (
                      <Thumbnail url={template.background.url} size={64} />
                    ) : (
                      <div className="bg-bg-deep border-line-strong text-text-subtle grid size-16 shrink-0 place-items-center rounded-md border">
                        <Icon name="image" size={24} />
                      </div>
                    )}
                    <div className="gap-space-2 flex min-w-0 flex-col">
                      <div className="gap-space-2 flex flex-wrap items-center">
                        <h2 className="type-title text-foreground">{template.name}</h2>
                        <span
                          className={
                            template.published
                              ? "bg-lime text-on-accent type-caption rounded-pill px-space-2 py-0.5 font-semibold"
                              : "bg-secondary text-muted-foreground type-caption rounded-pill px-space-2 py-0.5"
                          }
                        >
                          {template.published ? t.published : t.draft}
                        </span>
                        <span className="type-caption text-cyan-ink font-semibold">
                          {template.issuedCount === 1 ? t.issuedOne : interpolate(t.issuedCount, { n: String(template.issuedCount) })}
                        </span>
                      </div>
                      <p className="type-body-sm text-muted-foreground">{template.credentialTitle}</p>
                      <div className="gap-space-1 flex flex-wrap">
                        {!template.background ? (
                          <span className="border-danger text-danger-ink type-caption rounded-pill border px-space-2 py-0.5">{t.noBackground}</span>
                        ) : null}
                        {tags.map((tag) => (
                          <span key={tag} className="bg-bg-deep border-line-strong text-foreground type-caption rounded-pill border px-space-2 py-0.5">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="gap-space-2 flex shrink-0 flex-wrap">
                    <ButtonLink href={`${hrefs.editBase}/${template.id}`} variant="secondary" size="sm" className="gap-space-2">
                      <Icon name="edit" size={16} />
                      {t.edit}
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      disabled={busy || (!template.published && !template.background)}
                      onClick={() => void onTogglePublish(template)}
                    >
                      {template.published ? t.unpublish : t.publish}
                    </Button>
                    {canDelete && template.issuedCount === 0 ? (
                      <Button type="button" variant="ghost" size="sm" icon="trash" disabled={busy} onClick={() => void onDelete(template)}>
                        {t.delete}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
