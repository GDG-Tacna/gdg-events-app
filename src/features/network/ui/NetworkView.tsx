"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import type { QrCamera } from "@/features/scanner";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card } from "@/shared/ui";
import type { CadetCard, ContactReward } from "../domain/network";
import type { ConnectContactAction, IssueContactCodeAction, SaveContactLinksAction } from "./actions";
import { CadetCardView } from "./CadetCardView";
import { ContactCode } from "./ContactCode";
import { ContactScanner } from "./ContactScanner";
import { LinksForm } from "./LinksForm";

export interface NetworkViewProps {
  me: CadetCard;
  /** Newest first. */
  contacts: ReadonlyArray<CadetCard & { id: string }>;
  reward: ContactReward;
  issue: IssueContactCodeAction;
  connect: ConnectContactAction;
  saveLinks: SaveContactLinksAction;
  camera: QrCamera;
  /** The Logros tab, linked from a badge a contact unlocked (absent when achievements are off). */
  achievementsHref?: string;
}

const TABS = ["code", "scan", "contacts"] as const;
type Tab = (typeof TABS)[number];

/**
 * The Red: the cadet's own contact code and card (with the links they choose to show), a scanner for other
 * cadets' codes, and their contacts. The camera only runs on the "Escanear" tab.
 */
export function NetworkView({ me, contacts, reward, issue, connect, saveLinks, camera, achievementsHref }: NetworkViewProps) {
  const t = copy.network;
  const router = useRouter();
  const id = useId();
  const [tab, setTab] = useState<Tab>("code");
  const [card, setCard] = useState(me);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ code: null, scan: null, contacts: null });

  const refresh = useCallback(() => router.refresh(), [router]);
  const showContacts = useCallback(() => setTab("contacts"), []);

  const parts = [
    ...(reward.xp > 0 ? [interpolate(t.xp, { n: formatNumber(reward.xp) })] : []),
    ...(reward.credits > 0 ? [interpolate(t.credits, { n: formatNumber(reward.credits) })] : []),
  ];

  // Arrow keys move between tabs, as screen reader users expect of a tab list.
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const label = (value: Tab) => (value === "contacts" ? `${t.tabs.contacts} (${formatNumber(contacts.length)})` : t.tabs[value]);

  return (
    <div className="gap-space-5 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
        {parts.length > 0 && reward.cap > 0 ? (
          <div className="gap-space-1 flex flex-col">
            <p className="type-label text-accent">{interpolate(t.reward, { parts: parts.join(" · ") })}</p>
            <p className="type-caption text-text-subtle">{interpolate(t.cap, { n: formatNumber(Math.min(contacts.length, reward.cap)), cap: formatNumber(reward.cap) })}</p>
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label={t.tabsLabel} className="bg-bg-deep border-border gap-space-1 p-space-1 grid grid-cols-3 rounded-md border">
        {TABS.map((value) => (
          <button
            key={value}
            ref={(element) => {
              tabRefs.current[value] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${id}-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={onTabKey}
            className={cn(
              "type-label focus-visible:ring-ring min-h-12 rounded-sm px-1 focus-visible:ring-[3px] focus-visible:outline-none",
              tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label(value)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} className="gap-space-5 flex flex-col">
        {tab === "code" ? (
          <>
            <Card className="gap-space-4 flex flex-col">
              <ContactCode issue={issue} />
            </Card>
            <Card className="gap-space-4 flex flex-col">
              <div className="gap-space-1 flex flex-col">
                <h2 className="type-heading text-foreground">{t.card.title}</h2>
                <p className="type-body-sm text-muted-foreground">{t.card.help}</p>
              </div>
              <CadetCardView card={card} className="bg-surface-raised border-border p-space-4 rounded-md border" />
              {saved && !editing ? (
                <p role="status" className="type-body-sm text-foreground">
                  {t.links.saved}
                </p>
              ) : null}
              {editing ? (
                <LinksForm
                  links={card.links}
                  save={saveLinks}
                  onSaved={(links) => {
                    setCard((current) => ({ ...current, links }));
                    setEditing(false);
                    setSaved(true);
                  }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSaved(false);
                    setEditing(true);
                  }}
                >
                  {t.links.edit}
                </Button>
              )}
            </Card>
          </>
        ) : null}

        {tab === "scan" ? <ContactScanner camera={camera} connect={connect} onConnected={refresh} onShowContacts={showContacts} achievementsHref={achievementsHref} /> : null}

        {tab === "contacts" ? (
          contacts.length > 0 ? (
            <ul aria-label={t.contacts.label} className="gap-space-3 flex flex-col">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <Card>
                    <CadetCardView card={contact} as="h2" />
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <p className="type-body text-muted-foreground">{t.contacts.empty}</p>
            </Card>
          )
        ) : null}
      </div>
    </div>
  );
}
