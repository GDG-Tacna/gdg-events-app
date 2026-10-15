import type { MetadataRoute } from "next";
import { copy } from "@/shared/copy/es";

/** Colors of the Design System (`bg` and `bg-deep`): the splash and the status bar match the app. */
const BACKGROUND = "#0a0f24";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: copy.brand.name,
    short_name: copy.brand.shortName,
    description: copy.brand.description,
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ["entertainment", "events"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
