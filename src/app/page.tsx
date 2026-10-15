import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

/** The root has no content: signed-out visitors are sent to login by the proxy, signed-in ones land on the dashboard. */
export default function RootPage() {
  redirect(ROUTES.dashboard);
}
