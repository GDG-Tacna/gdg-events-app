"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, InlineAlert, TextAreaField } from "@/shared/ui";
import { HOLDERS_MAX_ROWS, parseHolderRows } from "../domain/holders";
import { TICKET_TYPES, type TicketType } from "../domain/ticket";
import type { ImportTicketHoldersAction, ImportTicketsActionResult } from "./actions";
import { ticketName } from "./TicketChip";

export interface ImportTicketsViewProps {
  /** How many lines of the edition's list hold each ticket now, or `null` when it could not be read. */
  summary: Record<TicketType, number> | null;
  importHolders: ImportTicketHoldersAction;
  /** Whether the session may change cadets (edit level in the section); without it the page only shows. */
  canEdit: boolean;
  /** Where "Volver a cadetes" goes. */
  backHref: string;
}

type Notice = { kind: "success" | "error"; text: string[] } | null;

/** How many problem lines the preview lists before saying there are more. */
const LISTED = 20;

const total = (counts: Record<TicketType, number>) => TICKET_TYPES.reduce((sum, type) => sum + counts[type], 0);

function CountsLine({ counts }: { counts: Record<TicketType, number> }) {
  return (
    <ul className="gap-space-2 flex flex-wrap">
      {TICKET_TYPES.map((type) => (
        <li key={type} className="type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1">
          {ticketName(type)}: {formatNumber(counts[type])}
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin › Cadetes › Entradas: load the edition's list of ticket holders. The text is read here, in the browser (pasted
 * from Excel, or a .csv file) and shown as a preview with its counts, the lines that cannot be read and the repeated
 * emails; the server reads it again before it stores anything.
 */
export function ImportTicketsView({ summary, importHolders, canEdit, backHref }: ImportTicketsViewProps) {
  const t = copy.admin.cadets.tickets;
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const parsed = useMemo(() => parseHolderRows(text), [text]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setText(await file.text());
      setNotice(null);
    } catch {
      setNotice({ kind: "error", text: [t.fileError] });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || parsed.rows.length === 0) return;
    setBusy(true);
    setNotice(null);
    let result: ImportTicketsActionResult;
    try {
      result = await importHolders({ rows: parsed.rows });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(false);
    if (!result.ok) return setNotice({ kind: "error", text: [copy.tickets.errors[result.code]] });

    const lines = [interpolate(t.done, { total: formatNumber(result.total), applied: formatNumber(result.applied) })];
    if (result.keptManual > 0) lines.push(interpolate(t.doneKept, { kept: formatNumber(result.keptManual) }));
    if (result.failed > 0) lines.push(interpolate(t.doneFailed, { n: formatNumber(result.failed) }));
    setNotice({ kind: "success", text: lines });
    setText("");
    router.refresh();
  }

  const nothing = parsed.rows.length === 0;
  const empty = text.trim() === "";

  return (
    <div className="gap-space-5 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>

      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.summaryTitle}</h2>
        {summary && total(summary) > 0 ? (
          <>
            <p className="type-body-sm text-muted-foreground">{interpolate(t.summaryTotal, { n: formatNumber(total(summary)) })}</p>
            <CountsLine counts={summary} />
          </>
        ) : (
          <p className="type-body-sm text-muted-foreground">{t.summaryEmpty}</p>
        )}
      </Card>

      {notice?.kind === "success" ? (
        <div role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 gap-space-1 flex flex-col rounded-md border">
          {notice.text.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text.join(" ")}</InlineAlert> : null}

      {canEdit ? (
        <Card>
          <form onSubmit={(event) => void submit(event)} noValidate className="gap-space-4 flex flex-col">
            <TextAreaField
              label={t.pasteLabel}
              hint={t.pasteHint}
              placeholder={t.pastePlaceholder}
              value={text}
              rows={8}
              spellCheck={false}
              readOnly={busy}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="gap-space-2 flex flex-col">
              <label htmlFor="ticket-file" className="type-label text-foreground">
                {t.fileLabel}
              </label>
              <input
                id="ticket-file"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                disabled={busy}
                onChange={(event) => void onFile(event)}
                className="type-body-sm text-foreground file:border-line-strong file:text-foreground file:px-space-4 file:mr-space-3 file:rounded-full file:border file:bg-transparent file:py-2"
              />
            </div>

            {!empty ? (
              <section aria-label={t.previewTitle} className="gap-space-3 flex flex-col">
                <h2 className="type-heading text-foreground">{t.previewTitle}</h2>
                {nothing ? (
                  <p className="type-body-sm text-muted-foreground">{t.previewNothing}</p>
                ) : (
                  <>
                    <p className="type-body-sm text-muted-foreground">{interpolate(t.previewRows, { n: formatNumber(parsed.rows.length) })}</p>
                    <CountsLine counts={parsed.counts} />
                    {parsed.rows.length > HOLDERS_MAX_ROWS ? <InlineAlert>{copy.tickets.errors["too-many-rows"]}</InlineAlert> : null}
                  </>
                )}

                {parsed.invalid.length > 0 ? (
                  <div className="gap-space-2 flex flex-col">
                    <h3 className="type-label text-danger">{t.invalidTitle}</h3>
                    <ul className="type-body-sm text-muted-foreground gap-space-1 flex flex-col">
                      {parsed.invalid.slice(0, LISTED).map((row) => (
                        <li key={`${row.line}-${row.reason}`}>{interpolate(row.reason === "email" ? t.invalidEmail : t.invalidType, { line: String(row.line), value: row.value })}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {parsed.duplicates.length > 0 ? (
                  <div className="gap-space-2 flex flex-col">
                    <h3 className="type-label text-foreground">{t.duplicatesTitle}</h3>
                    <ul className="type-body-sm text-muted-foreground gap-space-1 flex flex-col">
                      {parsed.duplicates.slice(0, LISTED).map((duplicate) => (
                        <li key={duplicate.email}>
                          {interpolate(duplicate.conflict ? t.duplicateConflict : t.duplicateSame, { email: duplicate.email, lines: duplicate.lines.join(", "), name: ticketName(duplicate.kept) })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <Button type="submit" loading={busy} disabled={busy || nothing || parsed.rows.length > HOLDERS_MAX_ROWS}>
              {busy ? t.importing : t.import}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
