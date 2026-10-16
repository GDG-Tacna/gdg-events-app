import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../zonas/nueva/page";

/** /admin/zonas/nueva opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal() {
  return <RouteModal title={copy.admin.map.quadrantForm.createTitle}>{await Page()}</RouteModal>;
}
