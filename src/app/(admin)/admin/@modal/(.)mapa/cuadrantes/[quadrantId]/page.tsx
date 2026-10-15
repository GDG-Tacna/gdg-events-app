import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../../mapa/cuadrantes/[quadrantId]/page";

/** /admin/mapa/cuadrantes/[quadrantId] opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal({ params }: { params: Promise<{ quadrantId: string }> }) {
  return <RouteModal title={copy.admin.map.quadrantForm.editTitle}>{await Page({ params } as Parameters<typeof Page>[0])}</RouteModal>;
}
