import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { TerminalCard } from "@/shared/ui";

/** The dashboard's entry to the Red, with how many contacts the cadet has made. */
export function NetworkCard({ href, contacts }: { href: string; contacts: number }) {
  const t = copy.network.dashboard;
  const body = contacts === 0 ? t.empty : contacts === 1 ? t.one : interpolate(t.many, { n: formatNumber(contacts) });
  return <TerminalCard icon="users" title={t.title} body={body} action={{ href, label: t.open, kind: "button" }} />;
}
