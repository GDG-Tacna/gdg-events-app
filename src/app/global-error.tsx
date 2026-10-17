"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";
import { copy } from "@/shared/copy/es";

/**
 * Last-resort boundary, for errors in the root layout itself (the route boundary cannot catch those). It replaces the
 * whole document, so it brings its own html and body, and reports the error to Sentry.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="bg-background text-foreground">
        <main className="px-space-4 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
          <div role="alert" className="gap-space-4 bg-card border-border p-space-5 flex flex-col rounded-lg border">
            <h1 className="type-title">{copy.system.errorTitle}</h1>
            <p className="type-body text-muted-foreground">{copy.system.errorDescription}</p>
            <button type="button" onClick={reset} className="type-label bg-primary text-primary-foreground focus-visible:ring-ring h-12 rounded-md focus-visible:ring-[3px] focus-visible:outline-none">
              {copy.system.retry}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
