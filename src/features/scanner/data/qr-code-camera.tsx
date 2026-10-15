"use client";

import dynamic from "next/dynamic";
import type { QrCamera } from "../ui/qr-camera";

/**
 * The real camera, loaded only in the browser and only when a screen shows it (the camera library is a separate
 * chunk, not part of the first page load, and it touches browser APIs that do not exist on the server).
 */
export const QrCodeCamera: QrCamera = dynamic(() => import("./yudiel-qr-camera"), { ssr: false, loading: () => null });
