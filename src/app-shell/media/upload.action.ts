"use server";

import { mediaDeps } from "@/app-shell/composition/media.server";
import { getSession } from "@/app-shell/guards";
import type { UploadImageActionResult } from "@/features/media";
import { IMAGE_PURPOSES, storeImage, type ImagePurpose } from "@/features/media/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

/** Images belong to records of these sections: editing any of them is enough to upload one. */
const UPLOAD_SECTIONS = ["achievements", "raffle", "squadCredits", "squads", "ranks", "missions", "map"] as const;

/**
 * Uploads one image for an admin screen and answers where it is stored. A public endpoint: the flag, the session,
 * the purpose and the file are checked here, and the use case checks the role, the size and the real format again.
 * The screen then saves the returned path with its record.
 */
export async function uploadImageAction(form: FormData): Promise<UploadImageActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, UPLOAD_SECTIONS))) return { ok: false, code: "forbidden" };

  const purpose = form.get("purpose");
  const file = form.get("file");
  if (typeof purpose !== "string" || !(IMAGE_PURPOSES as readonly string[]).includes(purpose)) return { ok: false, code: "unsupported-format" };
  if (!(file instanceof Blob)) return { ok: false, code: "empty" };

  const stored = await storeImage(mediaDeps, { uid: session.uid, role: session.role }, { purpose: purpose as ImagePurpose, bytes: new Uint8Array(await file.arrayBuffer()) });
  return stored.ok ? { ok: true, image: stored.value } : { ok: false, code: stored.error.code };
}
