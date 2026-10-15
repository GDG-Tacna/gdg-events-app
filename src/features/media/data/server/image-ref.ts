import "server-only";
import { isImagePathOf, type ImagePurpose, type ImageRef } from "../../domain/image";
import { publicImageUrl } from "./firestore-image-store";

/**
 * The reference a record saves for an image path sent by a form, or null when the path is not an app image of that
 * purpose. The address is always rebuilt here, never taken from the browser.
 */
export function imageRefOf(path: string, purpose: ImagePurpose): ImageRef | null {
  return isImagePathOf(path, purpose) ? { path, url: publicImageUrl(path) } : null;
}
