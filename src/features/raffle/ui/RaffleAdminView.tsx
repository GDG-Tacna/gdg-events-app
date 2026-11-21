"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, FormDialog, Icon, InlineAlert, TextField, Thumbnail } from "@/shared/ui";
import {
  MIN_CREDITS_MAX,
  MIN_XP_MAX,
  PRIZE_NAME_MAX,
  PRIZE_QUANTITY_MAX,
  TOP_N_MAX,
  type PrizeRule,
  type PrizeRuleKind,
  type RaffleDraw,
  type RaffleErrorCode,
  type RaffleOverview,
  type RafflePrize,
  type RafflePrizeOverview,
} from "../domain/raffle";
import type { RaffleActions } from "./actions";

export interface RaffleAdminViewProps {
  overview: RaffleOverview;
  actions: RaffleActions;
  stageHref: string;
}

const t = copy.admin.raffle;
const digits = (value: string) => value.replace(/[^0-9]/g, "");
const formatTime = (at: Date) => new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EDITION.timeZone }).format(new Date(at));
type Notice = { kind: "success" | "error"; text: string } | null;

/** Runs an action, turning a thrown error into "unknown", and tells the screen what happened. */
async function run<T extends { ok: true } | { ok: false; code: RaffleErrorCode }>(action: () => Promise<T>): Promise<T | { ok: false; code: "unknown" }> {
  try {
    return await action();
  } catch {
    return { ok: false, code: "unknown" };
  }
}

const RULE_KINDS: readonly PrizeRuleKind[] = ["credits", "top", "xp"];
const TOP_QUICK = [5, 10] as const;
const DEFAULT_TOP = 10;
const whole = (value: string) => (value === "" ? Number.NaN : Number(value));

/** A prize's rule as its chip says it: "G-Créditos", "Top 10 por XP", "300+ XP". */
function ruleChip(rule: PrizeRule): string {
  if (rule.kind === "top") return interpolate(t.ruleChip.top, { n: formatNumber(rule.n) });
  if (rule.kind === "xp") return interpolate(t.ruleChip.xp, { min: formatNumber(rule.min) });
  return t.ruleChip.credits;
}

/** Who could win a prize's next draw: with tickets for a G-Credits prize, cadets otherwise (one ticket each). */
function prizeEntrants(prize: RafflePrizeOverview): string {
  if (prize.eligible === 0) return t.prizeEntrantsNone;
  if (prize.rule.kind === "credits") return interpolate(t.prizeEntrantsTickets, { n: formatNumber(prize.eligible), tickets: formatNumber(prize.tickets) });
  return prize.eligible === 1 ? t.prizeEntrantsOne : interpolate(t.prizeEntrants, { n: formatNumber(prize.eligible) });
}

/** The pill that names a rule on a prize or a draw. */
function RuleChip({ rule }: { rule: PrizeRule }) {
  return <span className="type-caption border-ink text-foreground px-space-2 inline-flex items-center rounded-full border-2 font-semibold whitespace-nowrap">{ruleChip(rule)}</span>;
}

function PrizeEditor({
  prize,
  onSave,
  onCancel,
  pending,
  upload,
}: {
  prize?: RafflePrize;
  onSave: (input: { name: string; quantity: number; imagePath?: string | null; rule: PrizeRule }) => void;
  onCancel?: () => void;
  pending: boolean;
  upload: UploadImageAction;
}) {
  const ruleName = useId();
  const [name, setName] = useState(prize?.name ?? "");
  const [quantity, setQuantity] = useState(String(prize?.quantity ?? 1));
  const [image, setImage] = useState<ImageRef | null>(prize?.image ?? null);
  // Only a changed image is sent: an untouched form keeps the stored one.
  const [imageChanged, setImageChanged] = useState(false);
  const [ruleKind, setRuleKind] = useState<PrizeRuleKind>(prize?.rule.kind ?? "credits");
  const [topN, setTopN] = useState(String(prize?.rule.kind === "top" ? prize.rule.n : DEFAULT_TOP));
  const [minXp, setMinXp] = useState(prize?.rule.kind === "xp" ? String(prize.rule.min) : "");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rule: PrizeRule = ruleKind === "top" ? { kind: "top", n: whole(topN) } : ruleKind === "xp" ? { kind: "xp", min: whole(minXp) } : { kind: "credits" };
    onSave({ name, quantity: whole(quantity), ...(imageChanged ? { imagePath: image?.path ?? null } : {}), rule });
  }
  return (
    <form onSubmit={submit} noValidate className="gap-space-3 flex flex-col">
      <TextField label={t.prizeName} hint={t.prizeNameHint} value={name} maxLength={PRIZE_NAME_MAX} autoComplete="off" readOnly={pending} onChange={(event) => setName(event.target.value)} />
      <TextField
        label={t.quantity}
        hint={t.quantityHint}
        value={quantity}
        inputMode="numeric"
        maxLength={String(PRIZE_QUANTITY_MAX).length}
        autoComplete="off"
        readOnly={pending}
        onChange={(event) => setQuantity(digits(event.target.value))}
      />
      <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
        <legend className="type-label text-foreground mb-space-2">{t.ruleLegend}</legend>
        {RULE_KINDS.map((kind) => (
          <label key={kind} className="relative block cursor-pointer">
            <input type="radio" name={ruleName} value={kind} checked={ruleKind === kind} onChange={() => setRuleKind(kind)} className="peer sr-only" />
            <span
              className={cn(
                "gap-space-1 p-space-3 flex min-h-12 flex-col justify-center rounded-md border transition-colors",
                "border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised",
                "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
              )}
            >
              <span className="type-label text-foreground">{t.ruleOptions[kind]}</span>
              <span className="type-caption text-text-subtle">{t.ruleHelp[kind]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {ruleKind === "top" ? (
        <div className="gap-space-2 flex flex-col">
          <TextField
            label={t.topLabel}
            hint={t.topHint}
            value={topN}
            inputMode="numeric"
            maxLength={String(TOP_N_MAX).length}
            autoComplete="off"
            readOnly={pending}
            onChange={(event) => setTopN(digits(event.target.value))}
          />
          <div className="gap-space-2 flex flex-wrap">
            {TOP_QUICK.map((n) => (
              <Button key={n} type="button" variant="secondary" size="sm" disabled={pending} aria-pressed={topN === String(n)}
                className={topN === String(n) ? "bg-primary text-primary-foreground" : undefined}
                onClick={() => setTopN(String(n))}>
                {interpolate(t.topQuick, { n: String(n) })}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {ruleKind === "xp" ? (
        <TextField
          label={t.minXpLabel}
          hint={t.minXpHint}
          value={minXp}
          inputMode="numeric"
          maxLength={String(MIN_XP_MAX).length}
          autoComplete="off"
          readOnly={pending}
          onChange={(event) => setMinXp(digits(event.target.value))}
        />
      ) : null}
      <ImageField
        label={t.image}
        purpose="raffle-prize"
        value={image}
        upload={upload}
        disabled={pending}
        onChange={(next) => {
          setImage(next);
          setImageChanged(true);
        }}
      />
      <div className="gap-space-2 flex flex-wrap">
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? t.saving : prize ? t.save : t.add}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel} className="flex-1">
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The "Sorteo" screen: who takes part in the G-Credits prizes and with how many tickets, their minimum to enter, the
 * prizes with each one's rule (G-Credits, top N by XP or an XP minimum) and who could win it now (each unit drawn on
 * the server behind an in-page confirmation, and shown on the stage), and every draw with its rule, which can be
 * voided when the winner is not in the room.
 */
export function RaffleAdminView({ overview, actions, stageHref }: RaffleAdminViewProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [minCredits, setMinCredits] = useState(String(overview.settings.minCredits));
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** A refusal while the prize dialog is open shows inside it, not behind it. */
  const [dialogError, setDialogError] = useState<string | null>(null);
  const editingPrize = overview.prizes.find((prize) => prize.id === editing) ?? null;
  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
    setDialogError(null);
  };

  async function act<T extends { ok: true } | { ok: false; code: RaffleErrorCode }>(key: string, action: () => Promise<T>, success?: (result: Extract<T, { ok: true }>) => string) {
    if (pending) return false;
    setPending(key);
    setNotice(null);
    setDialogError(null);
    const result = await run(action);
    setPending(null);
    setConfirming(null);
    if (!result.ok) {
      if (editing !== null || creating) setDialogError(t.errors[result.code]);
      else setNotice({ kind: "error", text: t.errors[result.code] });
      return false;
    }
    setNotice({ kind: "success", text: success ? success(result as Extract<T, { ok: true }>) : t.done });
    router.refresh();
    return true;
  }

  const drawable = (prize: RafflePrize) => prize.active && prize.awarded < prize.quantity;

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <Card tone="cyan" className="gap-space-3 flex flex-col">
        <p className="type-title text-foreground">
          {overview.eligible > 0 ? interpolate(t.entrants, { n: formatNumber(overview.eligible), tickets: formatNumber(overview.tickets) }) : t.entrantsNone}
        </p>
        <ButtonLink href={stageHref} variant="secondary">
          {t.toStage}
        </ButtonLink>
      </Card>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.settingsTitle}</h2>
        <form
          noValidate
          className="gap-space-3 flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void act("settings", () => actions.saveSettings({ minCredits: minCredits === "" ? Number.NaN : Number(minCredits) }));
          }}
        >
          <TextField
            label={t.minCredits}
            hint={t.minCreditsHint}
            value={minCredits}
            inputMode="numeric"
            maxLength={String(MIN_CREDITS_MAX).length}
            autoComplete="off"
            readOnly={pending !== null}
            onChange={(event) => setMinCredits(digits(event.target.value))}
          />
          <Button type="submit" variant="secondary" loading={pending === "settings"}>
            {t.saveSettings}
          </Button>
        </form>
      </Card>

      <section aria-labelledby="raffle-prizes" className="gap-space-3 flex flex-col">
        <h2 id="raffle-prizes" className="type-heading text-foreground">
          {t.prizesTitle}
        </h2>
        {overview.prizes.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.noPrizes}</p> : null}
        <ul className="gap-space-3 flex flex-col">
          {overview.prizes.map((prize) => (
            <li key={prize.id}>
              <Card className={cn("gap-space-3 flex flex-col", !prize.active && "opacity-75")}>
                <>
                    <div className="gap-space-3 flex items-start">
                      {prize.image ? (
                        <Thumbnail url={prize.image.url} />
                      ) : null}
                      <div className="gap-space-1 flex min-w-0 flex-col">
                        <h3 className="type-label text-foreground">{prize.name}</h3>
                        <p className="type-caption text-text-subtle">
                          {interpolate(t.awarded, { awarded: String(prize.awarded), quantity: String(prize.quantity) })}
                          {!prize.active ? ` · ${t.inactive}` : ""}
                        </p>
                        <div className="gap-space-2 flex flex-wrap items-center">
                          <RuleChip rule={prize.rule} />
                          <span className="type-caption text-text-subtle">{prizeEntrants(prize)}</span>
                        </div>
                      </div>
                    </div>
                    {confirming === `draw-${prize.id}` ? (
                      <div className="gap-space-3 flex flex-col">
                        <p role="alert" className="type-body-sm text-foreground">
                          {t.drawConfirm}
                        </p>
                        <div className="gap-space-2 flex flex-wrap">
                          <Button
                            loading={pending === `draw-${prize.id}`}
                            className="flex-1"
                            onClick={() =>
                              void act(
                                `draw-${prize.id}`,
                                () => actions.draw({ prizeId: prize.id }),
                                (result) =>
                                  result.rule.kind === "credits"
                                    ? interpolate(t.drawn, { alias: result.winnerAlias, n: formatNumber(result.tickets), total: formatNumber(result.totalTickets) })
                                    : interpolate(t.drawnOneOf, { alias: result.winnerAlias, total: formatNumber(result.totalTickets) }),
                              )
                            }
                          >
                            {pending === `draw-${prize.id}` ? t.drawing : t.drawYes}
                          </Button>
                          <Button variant="ghost" disabled={pending !== null} className="flex-1" onClick={() => setConfirming(null)}>
                            {t.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="gap-space-2 flex flex-wrap">
                        {drawable(prize) ? (
                          <Button className="flex-1" disabled={pending !== null} onClick={() => setConfirming(`draw-${prize.id}`)}>
                            {t.draw}
                          </Button>
                        ) : null}
                        <Button variant="secondary" size="sm" disabled={pending !== null} aria-label={`${t.edit}: ${prize.name}`} onClick={() => setEditing(prize.id)}>
                          {t.edit}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending !== null} onClick={() => void act(`active-${prize.id}`, () => actions.updatePrize({ id: prize.id, active: !prize.active }))}>
                          {prize.active ? t.deactivate : t.activate}
                        </Button>
                      </div>
                    )}
                </>
              </Card>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setCreating(true)} disabled={pending !== null} className="gap-space-2">
          <Icon name="plus" size={18} />
          {t.newPrize}
        </Button>
        <FormDialog
          open={creating || editingPrize !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeDialog();
          }}
          title={editingPrize ? t.edit : t.newPrize}
          description={editingPrize?.name}
        >
          <div className="gap-space-4 flex flex-col">
            {dialogError ? <InlineAlert>{dialogError}</InlineAlert> : null}
            {editingPrize ? (
              <PrizeEditor
                key={editingPrize.id}
                upload={actions.upload}
                prize={editingPrize}
                pending={pending !== null}
                onCancel={closeDialog}
                onSave={(input) => void act(`edit-${editingPrize.id}`, () => actions.updatePrize({ id: editingPrize.id, ...input })).then((done) => done && closeDialog())}
              />
            ) : (
              <PrizeEditor upload={actions.upload} pending={pending !== null} onCancel={closeDialog} onSave={(input) => void act("create", () => actions.createPrize(input)).then((done) => done && closeDialog())} />
            )}
          </div>
        </FormDialog>
      </section>

      <section aria-labelledby="raffle-history" className="gap-space-3 flex flex-col">
        <h2 id="raffle-history" className="type-heading text-foreground">
          {t.historyTitle}
        </h2>
        {overview.draws.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.noDraws}</p> : null}
        <ul className="gap-space-2 flex flex-col">
          {overview.draws.map((draw: RaffleDraw) => (
            <li key={draw.id} className={cn("bg-surface border-border gap-space-2 p-space-3 flex flex-col rounded-md border", draw.voided && "opacity-70")}>
              <div className="gap-space-2 flex flex-wrap items-baseline justify-between">
                <span className={cn("type-label text-foreground", draw.voided && "line-through")}>
                  {draw.prizeName} · {draw.winnerAlias}
                </span>
                <span className="type-caption text-text-subtle tabular-nums">{formatTime(draw.at)}</span>
              </div>
              <div className="gap-space-2 flex flex-wrap items-center">
                <RuleChip rule={draw.rule} />
                <p className="type-caption text-text-subtle">
                  {draw.rule.kind === "credits"
                    ? interpolate(t.tickets, { n: formatNumber(draw.tickets), total: formatNumber(draw.totalTickets) })
                    : interpolate(t.oneOf, { total: formatNumber(draw.totalTickets) })}
                  {draw.voided ? ` · ${t.voided}` : ""}
                </p>
              </div>
              {!draw.voided ? (
                confirming === `void-${draw.id}` ? (
                  <div className="gap-space-2 flex flex-col">
                    <p role="alert" className="type-body-sm text-foreground">
                      {t.voidConfirm}
                    </p>
                    <div className="gap-space-2 flex flex-wrap">
                      <Button size="sm" loading={pending === `void-${draw.id}`} onClick={() => void act(`void-${draw.id}`, () => actions.voidDraw({ drawId: draw.id }))}>
                        {t.voidYes}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => setConfirming(null)}>
                        {t.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="self-start" disabled={pending !== null} onClick={() => setConfirming(`void-${draw.id}`)}>
                    {t.void}
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
