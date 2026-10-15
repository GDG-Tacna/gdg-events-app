import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const firebasePattern = {
  group: ["firebase", "firebase/*", "firebase-admin", "firebase-admin/*"],
  message: "Import Firebase only from features/*/data or shared/lib/firebase (provider portability rule).",
};

const primitivesPattern = {
  group: ["@/shared/ui/primitives", "@/shared/ui/primitives/*", "**/primitives/*", "@dnd-kit/*"],
  message: "Import UI from @/shared/ui (adapters). Primitives (and the drag and drop library) are only used inside shared/ui.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Import boundaries (flat config: the last matching block wins, so each file set gets one complete rule).
  // 1) Provider portability: only data adapters and the Firebase setup may import Firebase.
  // 2) Adapter rule: only shared/ui may import the shadcn primitives.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/*/data/**", "src/shared/lib/firebase/**", "src/shared/ui/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [firebasePattern, primitivesPattern] }] },
  },
  {
    files: ["src/features/*/data/**/*.{ts,tsx}", "src/shared/lib/firebase/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [primitivesPattern] }] },
  },
  {
    files: ["src/shared/ui/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [firebasePattern] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Isolated verification builds (NEXT_DIST_DIR), generated code.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
