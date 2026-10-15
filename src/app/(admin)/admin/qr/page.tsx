import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

/** The talks' QR codes are projected from each talk in Charlas; this old address leads there. */
export default function AdminQrPage() {
  redirect(ROUTES.adminTalks);
}
