import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../escuadrones/[squadId]/page";

/** /admin/escuadrones/[squadId] opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal({ params }: { params: Promise<{ squadId: string }> }) {
  return <RouteModal title={copy.admin.squads.form.editTitle}>{await Page({ params } as Parameters<typeof Page>[0])}</RouteModal>;
}
