// Public API (client-safe). Server code (Storage, sharp, the SVG cleaner) lives in "@/features/media/server".
export { IMAGE_PURPOSES, IMAGE_RULES, RULE_OF, chooseImage, dropReplacedImage, isImagePathOf, type ImageChoice, type ImagePurpose, type ImageRef, type MediaErrorCode, type RecordImages, type StoredImage } from "./domain/image";
export { ImageField, type ImageFieldProps } from "./ui/ImageField";
export type { UploadImageAction, UploadImageActionResult } from "./ui/upload-action";
