import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../misiones/nueva/page";

/** /admin/misiones/nueva opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal() {
  return <RouteModal title={copy.admin.missions.form.createTitle}>{await Page()}</RouteModal>;
}
