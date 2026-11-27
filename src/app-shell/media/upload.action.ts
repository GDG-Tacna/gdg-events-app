"use server";

import { globalMediaDeps, mediaDeps } from "@/app-shell/composition/media.server";
import { getSession } from "@/app-shell/guards";
import type { UploadImageActionResult } from "@/features/media";
import { IMAGE_PURPOSES, storeImage, type ImagePurpose } from "@/features/media/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

/** Images belong to records of these sections: editing any of them is enough to upload one. */
const UPLOAD_SECTIONS = ["achievements", "raffle", "squadCredits", "squads", "ranks", "missions", "zones", "map", "stage", "talks", "polls", "checkpoints", "certificates"] as const;

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
  const scope = form.get("scope");
  if (typeof purpose !== "string" || !(IMAGE_PURPOSES as readonly string[]).includes(purpose)) return { ok: false, code: "unsupported-format" };
  if (!(file instanceof Blob)) return { ok: false, code: "empty" };
  if (scope === "global" && session.adminScope !== "global") return { ok: false, code: "forbidden" };

  const deps = scope === "global" ? globalMediaDeps : mediaDeps;
  const stored = await storeImage(deps, { uid: session.uid, role: session.role }, { purpose: purpose as ImagePurpose, bytes: new Uint8Array(await file.arrayBuffer()) });
  return stored.ok ? { ok: true, image: stored.value } : { ok: false, code: stored.error.code };
}

/** Uploads an image for global community records (global admins only, stored under `public/global/...`). */
export async function uploadGlobalImageAction(form: FormData): Promise<UploadImageActionResult> {
  form.set("scope", "global");
  return uploadImageAction(form);
}
