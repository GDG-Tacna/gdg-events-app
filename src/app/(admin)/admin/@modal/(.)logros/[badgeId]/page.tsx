import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../logros/[badgeId]/page";

/** /admin/logros/[badgeId] opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal({ params }: { params: Promise<{ badgeId: string }> }) {
  return <RouteModal title={copy.admin.achievements.form.editTitle}>{await Page({ params } as Parameters<typeof Page>[0])}</RouteModal>;
}
