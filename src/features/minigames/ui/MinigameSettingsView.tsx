"use client";

import { useRouter } from "next/navigation";
import { useState, type ComponentType, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, Card, EditionTag, FormDialog, Icon, InlineAlert, SelectField, TextField, Toggle } from "@/shared/ui";
import { CODE_LANGUAGES, DIFFICULTIES, MINIGAME_IDS, MINIGAMES, type CodeLanguage, type Difficulty, type MinigameId } from "../domain/catalog";
import { parseMinigameSettings, type MinigameSettings } from "../domain/settings";
import type { GameProps } from "./games/shared";
import { MinigamePreview } from "./MinigamePreview";
import type { SaveMinigameSettingsAction, SaveMinigameSettingsActionResult } from "./settings-actions";

export interface MinigameSettingsViewProps {
  settings: MinigameSettings;
  isDefault: boolean;
  /** The edition these settings belong to. */
  eventId: string;
  save: SaveMinigameSettingsAction;
  /** The games the preview plays, replaceable in tests. */
  games?: Partial<Record<MinigameId, ComponentType<GameProps>>>;
}

const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: copy.minigames.difficulty[value] }));

/** Lower case without accents, so "codigo" finds "Ordena el código". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * The Mini-juegos screen: which games this edition offers as a mission bonus, how hard each one is, and the
 * languages of "Ordena el código". Checked like the server does before sending; games already started keep
 * the difficulty they started with.
 */
export function MinigameSettingsView({ settings, isDefault, eventId, save, games: playable }: MinigameSettingsViewProps) {
  const m = copy.admin.minigames;
  const router = useRouter();
  const [games, setGames] = useState<Record<MinigameId, { enabled: boolean; difficulty: Difficulty }>>({ ...settings.games });
  const [languages, setLanguages] = useState<readonly CodeLanguage[]>(settings.codeLanguages);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<MinigameId | null>(null);
  const shown = MINIGAME_IDS.filter((id) => fold(`${copy.minigames.names[id]} ${copy.minigames.howTo[id]}`).includes(fold(query.trim())));

  const change = (id: MinigameId, patch: Partial<{ enabled: boolean; difficulty: Difficulty }>) =>
    setGames((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const toggleLanguage = (language: CodeLanguage, on: boolean) =>
    // The use case keeps them in catalog order.
    setLanguages((current) => (on ? [...current, language] : current.filter((candidate) => candidate !== language)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next = parseMinigameSettings({ games, codeLanguages: languages });
    if (!next) {
      setNotice({ kind: "error", text: m.errors["invalid-settings"] });
      return;
    }
    setPending(true);
    setNotice(null);
    let result: SaveMinigameSettingsActionResult;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setPending(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: m.errors[result.code] });
      return;
    }
    setNotice({ kind: "success", text: m.saved });
    router.refresh();
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{m.title}</h1>
        <p className="type-body text-muted-foreground">{m.subtitle}</p>
        <EditionTag eventId={eventId} />
        {isDefault ? <p className="type-body-sm text-foreground">{m.defaultNote}</p> : null}
      </header>

      <TextField type="search" label={m.search} hint={m.searchHint} value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
        {shown.length === 0 ? <p className="type-body-sm text-muted-foreground">{interpolate(m.noMatch, { q: query.trim() })}</p> : null}
        <ul aria-label={m.gamesLabel} className="gap-space-4 flex flex-col">
          {shown.map((id) => {
            const game = games[id];
            const name = copy.minigames.names[id];
            return (
              <li key={id}>
                <Card role="group" aria-labelledby={`minigame-${id}`} className="gap-space-4 flex flex-col">
                  <div className="gap-space-1 flex flex-col">
                    <div className="gap-space-3 flex flex-wrap items-baseline justify-between">
                      <h2 id={`minigame-${id}`} className="type-heading text-foreground">{name}</h2>
                      <span className="type-caption text-text-subtle">{interpolate(m.duration, { s: String(MINIGAMES[id].maxSeconds[game.difficulty]) })}</span>
                    </div>
                    <p className="type-body-sm text-muted-foreground">{copy.minigames.howTo[id]}</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="gap-space-2 self-start" aria-label={interpolate(m.preview.openLabel, { name })} onClick={() => setPreviewing(id)}>
                    <Icon name="play" size={16} />
                    {m.preview.open}
                  </Button>
                  <Toggle
                    label={m.enabled}
                    help={m.enabledHelp}
                    checked={game.enabled}
                    disabled={pending}
                    onChange={(enabled) => change(id, { enabled })}
                  />
                  <SelectField
                    label={m.difficulty}
                    hint={m.difficultyHelp}
                    options={DIFFICULTY_OPTIONS}
                    value={game.difficulty}
                    disabled={pending || !game.enabled}
                    onChange={(event) => change(id, { difficulty: event.target.value as Difficulty })}
                  />
                  {id === "code-order" ? (
                    <fieldset className="gap-space-1 flex flex-col" disabled={pending || !game.enabled}>
                      <legend className="type-label text-foreground mb-space-1">{m.languages}</legend>
                      <p className="type-caption text-text-subtle">{m.languagesHelp}</p>
                      {CODE_LANGUAGES.map((language) => (
                        <Toggle
                          key={language}
                          label={m.languageNames[language]}
                          checked={languages.includes(language)}
                          disabled={pending || !game.enabled}
                          onChange={(on) => toggleLanguage(language, on)}
                        />
                      ))}
                    </fieldset>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
        <FormDialog
          open={previewing !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPreviewing(null);
          }}
          title={previewing ? interpolate(m.preview.title, { name: copy.minigames.names[previewing] }) : ""}
          description={previewing ? copy.minigames.difficulty[games[previewing].difficulty] : undefined}
        >
          {previewing ? <MinigamePreview gameId={previewing} difficulty={games[previewing].difficulty} codeLanguages={languages} games={playable} /> : null}
        </FormDialog>

        <Button type="submit" size="lg" block loading={pending}>
          {pending ? m.saving : m.save}
        </Button>
      </form>
    </div>
  );
}
