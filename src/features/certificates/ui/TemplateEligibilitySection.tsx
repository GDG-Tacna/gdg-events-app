"use client";

import { TICKET_TYPES, type TicketType } from "@/features/tickets";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Card, TextAreaField } from "@/shared/ui";
import {
  CERTIFICATE_ELIGIBILITY_MODES,
  parseAllowedEmails,
  type CertificateEligibility,
  type CertificateEligibilityMode,
  type CertificateTeamRole,
} from "../domain/template";

export interface TemplateEligibilitySectionProps {
  eligibility: CertificateEligibility;
  emailsText: string;
  disabled?: boolean;
  onChangeEligibility: (next: CertificateEligibility) => void;
  onChangeEmailsText: (raw: string) => void;
}

const t = copy.adminCertificates.editor.eligibility;

/** Eligibility rules editor: mode (tickets / all / manual), ticket checkboxes, speaker/team toggles, allowlist and check-in toggle. */
export function TemplateEligibilitySection({
  eligibility,
  emailsText,
  disabled = false,
  onChangeEligibility,
  onChangeEmailsText,
}: TemplateEligibilitySectionProps) {
  const parsedEmails = parseAllowedEmails(emailsText);

  function setMode(mode: CertificateEligibilityMode) {
    onChangeEligibility({ ...eligibility, mode });
  }

  function toggleTicket(ticket: TicketType, checked: boolean) {
    const next = new Set(eligibility.allowedTickets);
    if (checked) next.add(ticket);
    else next.delete(ticket);
    onChangeEligibility({ ...eligibility, allowedTickets: TICKET_TYPES.filter((item) => next.has(item)) });
  }

  function toggleTeamRole(role: CertificateTeamRole, checked: boolean) {
    const next = new Set(eligibility.includeTeamRoles);
    if (checked) next.add(role);
    else next.delete(role);
    onChangeEligibility({ ...eligibility, includeTeamRoles: (["staff", "organizer"] as const).filter((item) => next.has(item)) });
  }

  return (
    <Card className="gap-space-5 flex flex-col">
      <h2 className="type-heading text-foreground">{copy.adminCertificates.editor.sections.eligibility}</h2>

      <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
        <legend className="type-label text-foreground mb-space-2">{t.modeLegend}</legend>
        <div className="gap-space-2 grid grid-cols-1 sm:grid-cols-3">
          {CERTIFICATE_ELIGIBILITY_MODES.map((mode) => {
            const active = eligibility.mode === mode;
            return (
              <label
                key={mode}
                className={cn(
                  "p-space-3 type-body-sm flex min-h-12 cursor-pointer items-center gap-2 rounded-md border-2 transition-colors",
                  active ? "border-primary bg-primary/10 text-foreground font-semibold" : "border-line-strong bg-bg-deep text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="eligibility-mode"
                  value={mode}
                  checked={active}
                  onChange={() => setMode(mode)}
                  className="accent-primary size-4 shrink-0"
                />
                <span>{t.modes[mode]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {eligibility.mode === "tickets" ? (
        <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
          <legend className="type-label text-foreground mb-space-1">{t.ticketsLegend}</legend>
          <div className="gap-space-2 flex flex-wrap">
            {TICKET_TYPES.map((type) => (
              <label key={type} className="border-line-strong bg-bg-deep px-space-3 py-space-2 type-label text-foreground flex cursor-pointer items-center gap-2 rounded-md border">
                <input
                  type="checkbox"
                  checked={eligibility.allowedTickets.includes(type)}
                  onChange={(event) => toggleTicket(type, event.target.checked)}
                  className="accent-primary size-4"
                />
                <span>{copy.tickets.names[type]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
        <legend className="type-label text-foreground mb-space-1">{t.rolesLegend}</legend>
        <div className="gap-space-2 flex flex-col sm:flex-row sm:flex-wrap">
          <label className="border-line-strong bg-bg-deep px-space-3 py-space-2 type-body-sm text-foreground flex cursor-pointer items-center gap-2 rounded-md border">
            <input
              type="checkbox"
              checked={eligibility.includeSpeakers}
              onChange={(event) => onChangeEligibility({ ...eligibility, includeSpeakers: event.target.checked })}
              className="accent-primary size-4"
            />
            <span>{t.includeSpeakers}</span>
          </label>
          <label className="border-line-strong bg-bg-deep px-space-3 py-space-2 type-body-sm text-foreground flex cursor-pointer items-center gap-2 rounded-md border">
            <input
              type="checkbox"
              checked={eligibility.includeTeamRoles.includes("staff")}
              onChange={(event) => toggleTeamRole("staff", event.target.checked)}
              className="accent-primary size-4"
            />
            <span>{t.includeStaff}</span>
          </label>
          <label className="border-line-strong bg-bg-deep px-space-3 py-space-2 type-body-sm text-foreground flex cursor-pointer items-center gap-2 rounded-md border">
            <input
              type="checkbox"
              checked={eligibility.includeTeamRoles.includes("organizer")}
              onChange={(event) => toggleTeamRole("organizer", event.target.checked)}
              className="accent-primary size-4"
            />
            <span>{t.includeOrganizers}</span>
          </label>
        </div>
      </fieldset>

      <div className="gap-space-2 flex flex-col">
        <TextAreaField
          label={t.allowedEmails}
          hint={t.allowedEmailsHint}
          rows={4}
          value={emailsText}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value;
            onChangeEmailsText(raw);
            onChangeEligibility({ ...eligibility, allowedEmails: parseAllowedEmails(raw).valid });
          }}
        />
        {parsedEmails.valid.length > 0 || parsedEmails.invalid.length > 0 ? (
          <p className="type-caption text-text-subtle">
            {`${parsedEmails.valid.length} correos válidos`}
            {parsedEmails.invalid.length > 0 ? ` · ${parsedEmails.invalid.length} ignorados por formato inválido (${parsedEmails.invalid.slice(0, 3).join(", ")})` : ""}
          </p>
        ) : null}
      </div>

      {eligibility.mode !== "manual" ? (
        <label className="border-line-strong bg-bg-deep p-space-3 flex cursor-pointer items-start gap-3 rounded-md border">
          <input
            type="checkbox"
            role="switch"
            checked={eligibility.requireAttendance}
            disabled={disabled}
            onChange={(event) => onChangeEligibility({ ...eligibility, requireAttendance: event.target.checked })}
            className="accent-primary mt-0.5 size-5 shrink-0"
          />
          <span className="gap-space-1 flex flex-col">
            <span className="type-label text-foreground">{t.requireAttendance}</span>
            <span className="type-caption text-text-subtle">{t.requireAttendanceHelp}</span>
          </span>
        </label>
      ) : null}
    </Card>
  );
}
