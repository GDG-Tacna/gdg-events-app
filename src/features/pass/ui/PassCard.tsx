import { copy } from "@/shared/copy/es";
import { TerminalCard } from "@/shared/ui";

/** The dashboard's entry to the cadet's QR. It is only a link: the QR itself is on its own screen. */
export function PassCard({ href }: { href: string }) {
  return <TerminalCard icon="qr" title={copy.pass.card.title} badge={copy.pass.card.badge} body={copy.pass.card.body} action={{ href, label: copy.pass.card.open, kind: "chevron" }} />;
}
