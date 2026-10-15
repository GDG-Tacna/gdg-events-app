"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { UploadImageAction } from "@/features/media";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, Card, FormDialog, Icon, SelectField, TextField, Thumbnail } from "@/shared/ui";
import type { SquadCreditsErrorCode, SquadCreditsOverview, SquadPrize } from "../domain/squad-credits";
import { PrizeForm, type PrizeInput } from "./PrizeForm";

export type SquadCreditsActionResult<T> = { ok: true; value: T } | { ok: false; code: SquadCreditsErrorCode };
export type AwardSquadBonusAction = (input: { squadId: string; amount: number; reason: string; operationId: string }) => Promise<SquadCreditsActionResult<{ added: boolean; balance: number }>>;
export type RedeemSquadPrizeAction = (input: { squadId: string; prizeId: string; operationId: string }) => Promise<SquadCreditsActionResult<{ redeemed: boolean; balance: number }>>;
export type SaveSquadPrizeAction = (input: PrizeInput) => Promise<SquadCreditsActionResult<SquadPrize>>;
export type SetSquadPrizeActiveAction = (input: { id: string; active: boolean }) => Promise<SquadCreditsActionResult<SquadPrize>>;

export interface SquadCreditsAdminViewProps {
  overview: SquadCreditsOverview;
  /** Whether members' G-Credits feed their squad in this edition (Economía). */
  squadCreditsEnabled: boolean;
  awardBonus: AwardSquadBonusAction;
  redeem: RedeemSquadPrizeAction;
  createPrize: SaveSquadPrizeAction;
  updatePrize: SaveSquadPrizeAction;
  setPrizeActive: SetSquadPrizeActiveAction;
  /** Uploads a prize's photo. */
  uploadImage: UploadImageAction;
  /** A fresh id per bonus or redemption, so a repeated click or a retry never counts twice. */
  newOperationId?: () => string;
}

type Notice = { kind: "success" | "error"; text: string } | null;

const t = copy.admin.squadCredits;
const digits = (value: string) => value.replace(/[^0-9]/g, "");
const number = (value: number) => formatNumber(value);
const formatTime = (at: Date) =>
  new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: EDITION.timeZone }).format(new Date(at));

/** Calls an action and turns a thrown error (a dropped connection) into a refusal. */
async function attempt<T>(run: () => Promise<SquadCreditsActionResult<T>>): Promise<SquadCreditsActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, code: "unknown" };
  }
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === "success" ? (
    <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
      {notice.text}
    </p>
  ) : (
    <p role="alert" className="type-body-sm border-danger/60 bg-danger/10 text-foreground p-space-3 rounded-md border">
      {notice.text}
    </p>
  );
}

/**
 * The admin screen for squad credits: balances, bonuses, redeeming a prize handed out on stage, the
 * prize catalog and the latest redemptions. Every bonus and redemption carries an operation id, kept
 * until it succeeds, so a double click or a retry after a dropped connection is recorded once.
 */
export function SquadCreditsAdminView({
  overview,
  squadCreditsEnabled,
  awardBonus,
  redeem,
  createPrize,
  updatePrize,
  setPrizeActive,
  uploadImage,
  newOperationId = () => crypto.randomUUID(),
}: SquadCreditsAdminViewProps) {
  const router = useRouter();
  const { squads, prizes, redemptions } = overview;
  const squadName = (id: string) => squads.find((squad) => squad.id === id)?.name ?? id;
  const squadOptions = [
    { value: "", label: t.chooseSquad },
    ...squads.map((squad) => ({ value: squad.id, label: squad.active ? squad.name : interpolate(t.retiredOption, { name: squad.name }) })),
  ];
  const redeemable = prizes.filter((prize) => prize.active && prize.stock !== 0);

  // Bonus
  const [bonusSquad, setBonusSquad] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [bonusOperation, setBonusOperation] = useState(newOperationId);
  const [bonusPending, setBonusPending] = useState(false);
  const [bonusNotice, setBonusNotice] = useState<Notice>(null);

  async function submitBonus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = amount === "" ? Number.NaN : Number(amount);
    if (!bonusSquad) return setBonusNotice({ kind: "error", text: t.chooseSquad });
    if (!Number.isInteger(value) || value < 1 || value > 100_000) return setBonusNotice({ kind: "error", text: t.errors["invalid-amount"] });
    if (reason.trim().length < 3 || reason.trim().length > 120) return setBonusNotice({ kind: "error", text: t.errors["invalid-reason"] });
    setBonusPending(true);
    setBonusNotice(null);
    const result = await attempt(() => awardBonus({ squadId: bonusSquad, amount: value, reason: reason.trim(), operationId: bonusOperation }));
    setBonusPending(false);
    if (!result.ok) return setBonusNotice({ kind: "error", text: t.errors[result.code] });
    setBonusOperation(newOperationId());
    setAmount("");
    setReason("");
    setBonusNotice({ kind: "success", text: result.value.added ? interpolate(t.bonusDone, { n: number(value), squad: squadName(bonusSquad) }) : t.alreadyDone });
    router.refresh();
  }

  // Redemption
  const [redeemSquad, setRedeemSquad] = useState("");
  const [redeemPrizeId, setRedeemPrizeId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [redeemOperation, setRedeemOperation] = useState(newOperationId);
  const [redeemPending, setRedeemPending] = useState(false);
  const [redeemNotice, setRedeemNotice] = useState<Notice>(null);
  const chosenSquad = squads.find((squad) => squad.id === redeemSquad) ?? null;
  const chosenPrize = redeemable.find((prize) => prize.id === redeemPrizeId) ?? null;

  function askRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosenSquad || !chosenPrize) return setRedeemNotice({ kind: "error", text: t.chooseBoth });
    if (chosenSquad.wallet.balance < chosenPrize.cost) return setRedeemNotice({ kind: "error", text: t.errors.insufficient });
    setRedeemNotice(null);
    setConfirming(true);
  }

  async function confirmRedeem() {
    if (!chosenSquad || !chosenPrize) return;
    setRedeemPending(true);
    const result = await attempt(() => redeem({ squadId: chosenSquad.id, prizeId: chosenPrize.id, operationId: redeemOperation }));
    setRedeemPending(false);
    setConfirming(false);
    if (!result.ok) return setRedeemNotice({ kind: "error", text: t.errors[result.code] });
    setRedeemOperation(newOperationId());
    setRedeemPrizeId("");
    setRedeemNotice({
      kind: "success",
      text: result.value.redeemed ? interpolate(t.redeemed, { squad: chosenSquad.name, prize: chosenPrize.name }) : t.alreadyDone,
    });
    router.refresh();
  }

  // Prizes
  const [editing, setEditing] = useState<{ prize: SquadPrize | null } | null>(null);
  const [prizeNotice, setPrizeNotice] = useState<Notice>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function savePrize(input: PrizeInput): Promise<SquadCreditsErrorCode | null> {
    const creating = editing?.prize === null;
    const result = await attempt(() => (creating ? createPrize(input) : updatePrize(input)));
    if (!result.ok) return result.code;
    setEditing(null);
    setPrizeNotice({ kind: "success", text: interpolate(creating ? t.prizeForm.created : t.prizeForm.updated, { name: result.value.name }) });
    router.refresh();
    return null;
  }

  async function toggle(prize: SquadPrize) {
    setTogglingId(prize.id);
    const result = await attempt(() => setPrizeActive({ id: prize.id, active: !prize.active }));
    setTogglingId(null);
    if (!result.ok) return setPrizeNotice({ kind: "error", text: t.errors[result.code] });
    setPrizeNotice({ kind: "success", text: interpolate(result.value.active ? t.activatedDone : t.deactivatedDone, { name: result.value.name }) });
    router.refresh();
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
        {squadCreditsEnabled ? null : <p className="type-body-sm text-foreground">{t.disabledNote}</p>}
      </header>

      <Card className="gap-space-4 flex flex-col">
        <h2 className="type-heading text-foreground">{t.balancesTitle}</h2>
        {squads.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t.noSquads}</p>
        ) : (
          <ul aria-label={t.balancesTitle} className="gap-space-3 grid grid-cols-1 min-[760px]:grid-cols-3">
            {squads.map((squad) => (
              <li key={squad.id} className="border-line-strong p-space-3 gap-space-1 flex flex-col rounded-md border">
                <span className="type-label text-foreground">
                  {squad.name}
                  {squad.active ? null : <span className="type-caption text-text-subtle"> · {t.retired}</span>}
                </span>
                <span className="type-stat text-foreground tabular-nums">{interpolate(t.balance, { n: number(squad.wallet.balance) })}</span>
                <span className="type-caption text-text-subtle">{interpolate(t.earnedSpent, { earned: number(squad.wallet.earned), spent: number(squad.wallet.spent) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="gap-space-5 grid min-[760px]:grid-cols-2 min-[760px]:items-start">
        <Card role="region" aria-label={t.redeemTitle} className="gap-space-4 flex flex-col">
          <div className="gap-space-1 flex flex-col">
            <h2 className="type-heading text-foreground">{t.redeemTitle}</h2>
            <p className="type-caption text-text-subtle">{t.redeemHelp}</p>
          </div>
          <NoticeLine notice={redeemNotice} />
          {redeemable.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">{t.noPrizes}</p>
          ) : (
            <form onSubmit={askRedeem} noValidate className="gap-space-4 flex flex-col">
              <SelectField
                label={t.squad}
                options={squadOptions}
                value={redeemSquad}
                disabled={redeemPending || confirming}
                onChange={(event) => setRedeemSquad(event.target.value)}
              />
              <SelectField
                label={t.prize}
                options={[{ value: "", label: t.choosePrize }, ...redeemable.map((prize) => ({ value: prize.id, label: interpolate(t.prizeOption, { name: prize.name, cost: number(prize.cost) }) }))]}
                value={redeemPrizeId}
                disabled={redeemPending || confirming}
                onChange={(event) => setRedeemPrizeId(event.target.value)}
              />
              {confirming && chosenSquad && chosenPrize ? (
                <div role="group" aria-label={t.confirmRedeem} className="border-primary/60 bg-primary/10 p-space-3 gap-space-3 flex flex-col rounded-md border">
                  <p className="type-body-sm text-foreground">
                    {interpolate(t.confirmText, {
                      squad: chosenSquad.name,
                      prize: chosenPrize.name,
                      cost: number(chosenPrize.cost),
                      left: number(chosenSquad.wallet.balance - chosenPrize.cost),
                    })}
                  </p>
                  <div className="gap-space-3 flex flex-wrap">
                    <Button type="button" loading={redeemPending} onClick={confirmRedeem}>
                      {redeemPending ? t.redeeming : t.confirmRedeem}
                    </Button>
                    <Button type="button" variant="ghost" disabled={redeemPending} onClick={() => setConfirming(false)}>
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="submit">{t.redeem}</Button>
              )}
            </form>
          )}
        </Card>

        <Card role="region" aria-label={t.bonusTitle} className="gap-space-4 flex flex-col">
          <div className="gap-space-1 flex flex-col">
            <h2 className="type-heading text-foreground">{t.bonusTitle}</h2>
            <p className="type-caption text-text-subtle">{t.bonusHelp}</p>
          </div>
          <NoticeLine notice={bonusNotice} />
          <form onSubmit={submitBonus} noValidate className="gap-space-4 flex flex-col">
            <SelectField label={t.squad} options={squadOptions} value={bonusSquad} disabled={bonusPending} onChange={(event) => setBonusSquad(event.target.value)} />
            <TextField label={t.amount} hint={t.amountHint} value={amount} inputMode="numeric" maxLength={6} autoComplete="off" disabled={bonusPending} onChange={(event) => setAmount(digits(event.target.value))} />
            <TextField label={t.reason} hint={t.reasonHint} value={reason} maxLength={120} autoComplete="off" disabled={bonusPending} onChange={(event) => setReason(event.target.value)} />
            <Button type="submit" loading={bonusPending}>
              {bonusPending ? t.givingBonus : t.giveBonus}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="gap-space-4 flex flex-col">
        <div className="gap-space-3 flex flex-wrap items-center justify-between">
          <h2 className="type-heading text-foreground">{t.prizesTitle}</h2>
          <Button type="button" variant="secondary" className="gap-space-2" onClick={() => setEditing({ prize: null })}>
            <Icon name="plus" size={18} />
            {t.createPrize}
          </Button>
        </div>
        <NoticeLine notice={prizeNotice} />
        <FormDialog
          open={editing !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(null);
          }}
          title={editing?.prize ? t.prizeForm.editTitle : t.prizeForm.createTitle}
          description={editing?.prize?.name}
        >
          {editing ? <PrizeForm key={editing.prize?.id ?? "new"} prize={editing.prize} onSave={savePrize} onCancel={() => setEditing(null)} upload={uploadImage} /> : null}
        </FormDialog>
        {prizes.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t.prizesEmpty}</p>
        ) : (
          <ul aria-label={t.prizesLabel} className="gap-space-3 flex flex-col">
            {prizes.map((prize) => (
              <li key={prize.id} className="border-line-strong p-space-3 gap-space-3 flex flex-wrap items-center justify-between rounded-md border">
                {prize.image ? <Thumbnail url={prize.image.url} /> : null}
                <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                  <span className="type-label text-foreground">{prize.name}</span>
                  {prize.description ? <span className="type-caption text-muted-foreground">{prize.description}</span> : null}
                  <span className="type-caption text-text-subtle">
                    {interpolate(t.cost, { n: number(prize.cost) })} ·{" "}
                    {prize.stock === null ? t.unlimited : prize.stock === 0 ? t.outOfStock : interpolate(t.stock, { n: number(prize.stock) })} ·{" "}
                    {prize.active ? t.active : t.inactive}
                  </span>
                </div>
                <div className="gap-space-2 flex">
                  <Button type="button" size="sm" variant="secondary" aria-label={`${t.edit} ${prize.name}`} disabled={editing !== null} onClick={() => setEditing({ prize })}>
                    {t.edit}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`${prize.active ? t.deactivate : t.activate} ${prize.name}`}
                    loading={togglingId === prize.id}
                    disabled={togglingId !== null}
                    onClick={() => toggle(prize)}
                  >
                    {prize.active ? t.deactivate : t.activate}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-space-4 flex flex-col">
        <h2 className="type-heading text-foreground">{t.historyTitle}</h2>
        {redemptions.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t.historyEmpty}</p>
        ) : (
          <ul aria-label={t.historyTitle} className="gap-space-2 flex flex-col">
            {redemptions.map((entry) => (
              <li key={entry.id} className="gap-space-1 flex flex-col">
                <span className="type-body-sm text-foreground">{interpolate(t.historyItem, { squad: squadName(entry.squadId), prize: entry.prizeName, cost: number(entry.cost) })}</span>
                <time dateTime={new Date(entry.at).toISOString()} className="type-caption text-text-subtle">
                  {formatTime(entry.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
