import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../escuadrones/nuevo/page";

/** /admin/escuadrones/nuevo opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal() {
  return <RouteModal title={copy.admin.squads.form.newTitle}>{await Page()}</RouteModal>;
}
