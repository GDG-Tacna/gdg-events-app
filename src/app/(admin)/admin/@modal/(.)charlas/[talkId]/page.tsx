import { copy } from "@/shared/copy/es";
import { RouteModal } from "@/shared/ui";
import Page from "../../../charlas/[talkId]/page";

/** /admin/charlas/[talkId] opened from its list: the same screen in a modal over the list (a direct visit gets the full page). */
export default async function Modal({ params }: { params: Promise<{ talkId: string }> }) {
  return <RouteModal title={copy.admin.talks.form.editTitle}>{await Page({ params } as Parameters<typeof Page>[0])}</RouteModal>;
}
