#!/usr/bin/env node
// Copies the QR decoder (ZXing compiled to WebAssembly) from the installed package to `public/zxing/`, so the app
// serves it itself instead of a CDN (see `src/features/scanner/data/yudiel-qr-camera.tsx`). Run it after upgrading
// `@yudiel/react-qr-scanner`: a unit test fails while the copy and the installed file differ.
//
//   npm run zxing:copy
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// The decoder version barcode-detector (the library's engine) depends on.
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const target = join("public", "zxing", "zxing_reader.wasm");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Copiado ${source} → ${target}`);
