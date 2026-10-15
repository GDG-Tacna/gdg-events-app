"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, Card, EditionTag, InlineAlert, TextField, Toggle } from "@/shared/ui";
import { CONTACT_CAP_MAX, CONTACT_XP_MAX, CREDIT_MISSION_TYPES, CREDITS_MAX, parseEconomySettings, type EconomyErrorCode, type EconomySettings } from "../domain/settings";

export type SaveEconomyActionResult = { ok: true } | { ok: false; code: EconomyErrorCode };
export type SaveEconomyAction = (settings: EconomySettings) => Promise<SaveEconomyActionResult>;

export interface EconomySettingsViewProps {
  settings: EconomySettings;
  isDefault: boolean;
  /** The edition these settings belong to. */
  eventId: string;
  save: SaveEconomyAction;
}

const TYPE_LABELS = { talk: copy.missions.types.talk, stand: copy.missions.types.stand, quiz: copy.missions.types.quiz, keyword: copy.missions.types.keyword };

const digits = (value: string) => value.replace(/[^0-9]/g, "");
/** An empty field is not zero: it is refused, like the server does. */
const whole = (value: string) => (value === "" ? Number.NaN : Number(value));

/**
 * The Economía screen: whether G-Credits and squad credits are given in this edition, and how many each
 * thing gives. Values are checked like the server does before sending; changes apply to what is earned
 * from then on.
 */
export function EconomySettingsView({ settings, isDefault, eventId, save }: EconomySettingsViewProps) {
  const e = copy.admin.economy;
  const router = useRouter();
  const [creditsEnabled, setCreditsEnabled] = useState(settings.creditsEnabled);
  const [missionCredits, setMissionCredits] = useState<Record<string, string>>(
    Object.fromEntries(CREDIT_MISSION_TYPES.map((type) => [type, String(settings.missionCredits[type])])),
  );
  const [talkCredits, setTalkCredits] = useState(String(settings.talkCredits));
  const [squadEnabled, setSquadEnabled] = useState(settings.squadCreditsEnabled);
  const [squadRatio, setSquadRatio] = useState(String(settings.squadRatio));
  const [contactXp, setContactXp] = useState(String(settings.contactXp));
  const [contactCredits, setContactCredits] = useState(String(settings.contactCredits));
  const [contactCap, setContactCap] = useState(String(settings.contactCap));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = parseEconomySettings({
      creditsEnabled,
      missionCredits: Object.fromEntries(CREDIT_MISSION_TYPES.map((type) => [type, missionCredits[type] === "" ? Number.NaN : Number(missionCredits[type])])),
      talkCredits: talkCredits === "" ? Number.NaN : Number(talkCredits),
      squadCreditsEnabled: squadEnabled,
      squadRatio: squadRatio.trim() === "" ? Number.NaN : Number(squadRatio.replace(",", ".")),
      contactXp: whole(contactXp),
      contactCredits: whole(contactCredits),
      contactCap: whole(contactCap),
    });
    if (!next) {
      setNotice({ kind: "error", text: e.errors["invalid-settings"] });
      return;
    }
    setPending(true);
    setNotice(null);
    let result: SaveEconomyActionResult;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setPending(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: e.errors[result.code] });
      return;
    }
    setNotice({ kind: "success", text: e.saved });
    router.refresh();
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{e.title}</h1>
        <p className="type-body text-muted-foreground">{e.subtitle}</p>
        <EditionTag eventId={eventId} />
        {isDefault ? <p className="type-body-sm text-foreground">{e.defaultNote}</p> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
        <Card className="gap-space-4 flex flex-col">
          <h2 className="type-heading text-foreground">{e.creditsTitle}</h2>
          <Toggle label={e.creditsEnabled} help={e.creditsHelp} checked={creditsEnabled} disabled={pending} onChange={setCreditsEnabled} />
          <fieldset className="gap-space-3 flex flex-col" disabled={pending || !creditsEnabled}>
            <legend className="type-label text-foreground mb-space-1">{e.missionCredits}</legend>
            <p className="type-caption text-text-subtle">{e.missionCreditsHelp}</p>
            <div className="gap-space-3 grid grid-cols-2">
              {CREDIT_MISSION_TYPES.map((type) => (
                <TextField
                  key={type}
                  label={TYPE_LABELS[type]}
                  value={missionCredits[type]}
                  inputMode="numeric"
                  maxLength={String(CREDITS_MAX).length}
                  autoComplete="off"
                  onChange={(event) => setMissionCredits((current) => ({ ...current, [type]: digits(event.target.value) }))}
                />
              ))}
            </div>
          </fieldset>
          <TextField
            label={e.talkCredits}
            hint={e.creditsHint}
            value={talkCredits}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            disabled={pending || !creditsEnabled}
            onChange={(event) => setTalkCredits(digits(event.target.value))}
          />
        </Card>

        <Card className="gap-space-4 flex flex-col">
          <h2 className="type-heading text-foreground">{e.squadTitle}</h2>
          <Toggle label={e.squadEnabled} checked={squadEnabled} disabled={pending} onChange={setSquadEnabled} />
          <TextField
            label={e.squadRatio}
            hint={e.squadRatioHint}
            value={squadRatio}
            inputMode="decimal"
            maxLength={5}
            autoComplete="off"
            disabled={pending || !squadEnabled}
            onChange={(event) => setSquadRatio(event.target.value.replace(/[^0-9.,]/g, ""))}
          />
        </Card>

        <Card className="gap-space-4 flex flex-col">
          <h2 className="type-heading text-foreground">{e.contactsTitle}</h2>
          <p className="type-body-sm text-muted-foreground">{e.contactsHelp}</p>
          <div className="gap-space-3 grid grid-cols-2 items-end">
            <TextField
              label={e.contactXp}
              value={contactXp}
              inputMode="numeric"
              maxLength={String(CONTACT_XP_MAX).length}
              autoComplete="off"
              disabled={pending}
              onChange={(event) => setContactXp(digits(event.target.value))}
            />
            <TextField
              label={e.contactCredits}
              value={contactCredits}
              inputMode="numeric"
              maxLength={String(CREDITS_MAX).length}
              autoComplete="off"
              disabled={pending || !creditsEnabled}
              onChange={(event) => setContactCredits(digits(event.target.value))}
            />
          </div>
          <TextField
            label={e.contactCap}
            hint={e.contactCapHint}
            value={contactCap}
            inputMode="numeric"
            maxLength={String(CONTACT_CAP_MAX).length}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => setContactCap(digits(event.target.value))}
          />
        </Card>

        <Button type="submit" size="lg" block loading={pending}>
          {pending ? e.saving : e.save}
        </Button>
      </form>
    </div>
  );
}
