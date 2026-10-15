"use client";

import { copy } from "@/shared/copy/es";
import { ActionMenu, type IconName } from "@/shared/ui";

export interface AccountMenuProps {
  /** The cadet's personal QR (absent with check-ins off). */
  qrHref?: string;
  /** The Red, where the cadet edits their card (absent with the network off). */
  networkHref?: string;
}

/**
 * The gear on the dashboard's header: a menu with the cadet's own things (their QR, their card in the Red). Signing
 * out has its own button next to it, never inside the content.
 */
export function AccountMenu({ qrHref, networkHref }: AccountMenuProps) {
  const t = copy.dashboard.account;
  const items: Array<{ href: string; label: string; icon: IconName }> = [
    ...(qrHref ? [{ href: qrHref, label: t.qr, icon: "qr" as const }] : []),
    ...(networkHref ? [{ href: networkHref, label: t.network, icon: "users" as const }] : []),
  ];
  if (items.length === 0) return null;
  return <ActionMenu label={t.open} icon="settings" title={t.title} items={items} />;
}
