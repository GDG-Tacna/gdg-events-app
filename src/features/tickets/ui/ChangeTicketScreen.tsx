"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ScanReticle, useScanSession, type QrCamera } from "@/features/scanner";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { SEARCH_PAUSE_MS } from "@/shared/lib/use-debounced-value";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Icon, InlineAlert } from "@/shared/ui";
import { TICKET_TYPES, type TicketType } from "../domain/ticket";
import type { ChangeCadetTicketAction, LookupTicketAction, LookupTicketActionResult, SearchTicketCadetsAction, TicketSearchHit } from "./actions";
import { TicketBadge, TicketChip, ticketName } from "./TicketChip";

export interface ChangeTicketScreenProps {
  /** The camera that reads the cadets' QR codes (the app shell binds the real one). */
  camera: QrCamera;
  /** Verifies the scanned pass and answers who the cadet is and their ticket. */
  lookup: LookupTicketAction;
  /** Finds registered cadets by name, email or alias, for when the staff do not scan. */
  search: SearchTicketCadetsAction;
  change: ChangeCadetTicketAction;
  /** Where "Volver a los puestos" goes. */
  backHref: string;
}

const FAILED: LookupTicketActionResult = { ok: false, code: "unknown" };

/** Fewest characters the server takes for a search; below it the box waits instead of asking. */
const SEARCH_MIN_LENGTH = 3;

type Outcome = { kind: "done" | "unchanged"; type: TicketType } | { kind: "error"; code: keyof typeof copy.tickets.errors };
type SearchState = { status: "idle" } | { status: "searching" } | { status: "error"; message: string } | { status: "done"; cadets: readonly TicketSearchHit[] };

/**
 * The staff screen «Cambiar entrada»: find a cadet by scanning their pass or by searching their name, email or alias,
 * see their alias and ticket, pick the new ticket with one of three big buttons and confirm. The search runs as the
 * staff type (a moment after they pause, from three letters; Enter asks at once) and only the latest answer is shown.
 * The server verifies the pass, masks the emails and audits every change; this only shows the answers.
 */
export function ChangeTicketScreen({ camera: Camera, lookup, search, change, backHref }: ChangeTicketScreenProps) {
  const t = copy.staff.tickets;
  const [chosen, setChosen] = useState<TicketType | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [saving, setSaving] = useState(false);
  // The ticket the cadet has now, as far as this screen knows: it follows a successful change.
  const [current, setCurrent] = useState<TicketType | null>(null);
  // A cadet picked from the search results (a scanned one comes from the scan session instead).
  const [picked, setPicked] = useState<{ uid: string; alias: string } | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SearchState>({ status: "idle" });
  // Which search the screen is waiting for: an answer that is not the latest one is dropped, so a slow answer to an
  // older text never replaces the results of what is typed now.
  const latestSearch = useRef(0);
  // The text last asked for, so the pause that follows an Enter (the same text) does not ask twice.
  const askedText = useRef<string | null>(null);
  // The pause after the last key: the search starts when it runs out.
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const submit = useCallback(
    async (payload: string): Promise<LookupTicketActionResult> => {
      const result = await lookup({ payload });
      if (result.ok) {
        setPicked(null);
        setChosen(null);
        setOutcome(null);
        setCurrent(result.ticket);
      }
      return result;
    },
    [lookup],
  );
  const { state, camera, cameraKey, start, scanAgain } = useScanSession(submit, FAILED);

  const result = state.status === "done" ? state.result : null;
  const scanned = result?.ok ? result : null;
  const cadet = picked ?? scanned;

  async function confirm() {
    if (!cadet || chosen === null || saving) return;
    setSaving(true);
    let answer: Awaited<ReturnType<ChangeCadetTicketAction>>;
    try {
      answer = await change({ uid: cadet.uid, type: chosen });
    } catch {
      answer = { ok: false, code: "unknown" };
    }
    setSaving(false);
    if (!answer.ok) return setOutcome({ kind: "error", code: answer.code });
    setOutcome({ kind: current === chosen ? "unchanged" : "done", type: chosen });
    setCurrent(chosen);
  }

  const ask = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text.length < SEARCH_MIN_LENGTH) {
        latestSearch.current += 1;
        askedText.current = null;
        setFound((previous) => (previous.status === "idle" ? previous : { status: "idle" }));
        return;
      }
      if (text === askedText.current) return;
      askedText.current = text;
      const id = (latestSearch.current += 1);
      setFound({ status: "searching" });
      let answer: Awaited<ReturnType<SearchTicketCadetsAction>>;
      try {
        answer = await search({ query: text });
      } catch {
        answer = { ok: false, code: "unknown" };
      }
      if (id !== latestSearch.current) return;
      // A failed search can be asked again with the same text (Enter, or one more letter).
      if (!answer.ok) askedText.current = null;
      setFound(answer.ok ? { status: "done", cadets: answer.cadets } : { status: "error", message: copy.tickets.errors[answer.code] });
    },
    [search],
  );

  // The search follows the text a moment after the staff stop typing (every key restarts the wait).
  function typeSearch(text: string) {
    setQuery(text);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => void ask(text), SEARCH_PAUSE_MS);
  }

  useEffect(() => () => clearTimeout(pauseTimer.current), []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearTimeout(pauseTimer.current);
    void ask(query);
  }

  function pick(hit: TicketSearchHit) {
    setPicked({ uid: hit.uid, alias: hit.alias });
    // «Atender a otro cadete» starts over, so the results of this search are not needed behind the picked cadet.
    clearTimeout(pauseTimer.current);
    latestSearch.current += 1;
    askedText.current = null;
    setFound({ status: "idle" });
    setCurrent(hit.ticket);
    setChosen(null);
    setOutcome(null);
  }

  const next = () => {
    setPicked(null);
    setQuery("");
    clearTimeout(pauseTimer.current);
    latestSearch.current += 1;
    askedText.current = null;
    setFound({ status: "idle" });
    setChosen(null);
    setOutcome(null);
    scanAgain();
  };

  const showCamera = cadet === null;
  const statusText = state.status === "sending" ? t.sending : t.hint;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <div hidden={!showCamera} className="gap-space-4 flex flex-col">
        <div className="border-border bg-bg-deep relative aspect-[3/4] w-full overflow-hidden rounded-lg border min-[760px]:aspect-[4/3]">
          {/* Paused behind a cadet picked from the search: a pass held up now must not replace them. */}
          {camera ? <Camera key={cameraKey} {...camera} paused={camera.paused || picked !== null} label={copy.scanner.videoLabel} /> : null}
          {state.status === "camera-error" ? (
            <div className="absolute inset-0 grid place-items-center">
              <Icon name="camera-off" size={48} className="text-text-subtle" />
            </div>
          ) : (
            <ScanReticle active={state.status === "scanning"} />
          )}
          {state.status === "sending" ? (
            <div className="bg-bg-deep/70 absolute inset-0 grid place-items-center">
              <Icon name="loading" size={40} className="text-cyan" />
            </div>
          ) : null}
        </div>

        {state.status === "camera-error" ? (
          <div role="alert" className="gap-space-3 flex flex-col">
            <h2 className="type-title text-foreground">{copy.scanner.cameraErrors[state.code].title}</h2>
            <p className="type-body text-muted-foreground">{copy.scanner.cameraErrors[state.code].body}</p>
            <Button onClick={() => void start()}>{copy.scanner.retry}</Button>
          </div>
        ) : (
          <p aria-live="polite" className="type-body text-muted-foreground text-center">
            {statusText}
          </p>
        )}

        {result && !result.ok ? (
          <div className="gap-space-3 flex flex-col">
            <InlineAlert>{copy.tickets.errors[result.code]}</InlineAlert>
            <Button variant="secondary" onClick={next}>
              {t.cancel}
            </Button>
          </div>
        ) : null}

        <form role="search" onSubmit={submitSearch} className="gap-space-2 flex flex-col">
          <label htmlFor="ticket-search" className="type-label text-foreground">
            {t.search.label}
          </label>
          <input
            id="ticket-search"
            type="search"
            value={query}
            onChange={(event) => typeSearch(event.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder={t.search.placeholder}
            className="type-body bg-bg-deep text-foreground border-line-strong focus-visible:ring-ring h-12 w-full min-w-0 rounded-md border px-4 text-base focus-visible:ring-[3px] focus-visible:outline-none"
          />
          {/* Quiet, not an error: the search starts by itself at three letters. */}
          {query.trim().length > 0 && query.trim().length < SEARCH_MIN_LENGTH ? (
            <p role="status" className="type-caption text-muted-foreground">
              {t.search.tooShort}
            </p>
          ) : null}
        </form>

        {found.status === "error" ? <InlineAlert>{found.message}</InlineAlert> : null}
        {found.status === "searching" ? (
          <p role="status" className="type-body text-muted-foreground text-center">
            {t.search.searching}
          </p>
        ) : null}
        {found.status === "done" && found.cadets.length === 0 ? (
          <p role="status" className="type-body text-muted-foreground">
            {t.search.empty}
          </p>
        ) : null}
        {found.status === "done" && found.cadets.length > 0 ? (
          <ul aria-label={t.search.resultsLabel} className="gap-space-3 flex flex-col">
            {found.cadets.map((hit) => (
              <li key={hit.uid}>
                <button
                  type="button"
                  onClick={() => pick(hit)}
                  className="border-line-strong bg-surface text-foreground focus-visible:ring-ring gap-space-2 p-space-3 flex min-h-14 w-full items-center justify-between rounded-lg border-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="type-label block truncate">{hit.alias}</span>
                    {hit.name ? <span className="type-caption block truncate">{hit.name}</span> : null}
                    {hit.email ? <span className="type-caption text-muted-foreground block truncate">{hit.email}</span> : null}
                  </span>
                  <TicketChip type={hit.ticket} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {cadet ? (
        <section aria-label={t.title} className="border-border bg-surface p-space-4 gap-space-4 flex flex-col rounded-lg border">
          <div className="gap-space-2 flex flex-col">
            <p className="type-title-xl text-foreground break-all">{cadet.alias}</p>
            {current ? <TicketBadge type={current} /> : null}
          </div>

          {outcome?.kind === "error" ? <InlineAlert>{copy.tickets.errors[outcome.code]}</InlineAlert> : null}
          {outcome && outcome.kind !== "error" ? (
            <p role="status" className="type-body border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
              {interpolate(outcome.kind === "done" ? t.done : t.unchanged, { alias: cadet.alias, name: ticketName(outcome.type) })}
            </p>
          ) : null}

          {outcome === null || outcome.kind === "error" ? (
            <>
              <fieldset className="gap-space-3 flex flex-col" disabled={saving}>
                <legend className="type-label text-foreground mb-space-2">{t.pickLegend}</legend>
                <div className="gap-space-3 flex flex-col">
                  {TICKET_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={chosen === type}
                      onClick={() => setChosen(type)}
                      className={cn(
                        "type-title border-line-strong text-foreground focus-visible:ring-ring flex min-h-14 items-center justify-between rounded-full border-2 px-6 py-3 text-left focus-visible:ring-[3px] focus-visible:outline-none",
                        chosen === type && "border-primary bg-primary/10",
                      )}
                    >
                      <span>{ticketName(type)}</span>
                      {current === type ? <TicketChip type={type} /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button loading={saving} disabled={saving || chosen === null} onClick={() => void confirm()}>
                {chosen === null ? t.pickLegend : interpolate(t.confirm, { name: ticketName(chosen) })}
              </Button>
            </>
          ) : null}

          <Button variant="secondary" disabled={saving} onClick={next}>
            {t.cancel}
          </Button>
        </section>
      ) : null}

      <ButtonLink href={backHref} variant="ghost">
        {t.back}
      </ButtonLink>
    </div>
  );
}
