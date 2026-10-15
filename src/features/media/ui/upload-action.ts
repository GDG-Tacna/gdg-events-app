import type { MediaErrorCode, StoredImage } from "../domain/image";

export type UploadImageActionResult = { ok: true; image: StoredImage } | { ok: false; code: MediaErrorCode | "disabled" | "unauthenticated" };
/** Takes a form with `purpose` and `file`; the server checks everything again. */
export type UploadImageAction = (form: FormData) => Promise<UploadImageActionResult>;
