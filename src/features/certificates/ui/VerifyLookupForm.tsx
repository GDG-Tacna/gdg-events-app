"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, Card, TextField } from "@/shared/ui";
import { normalizeCertificateCode } from "../domain/code";

const t = copy.verify;

/** Public search form (`/verificar`) where anyone can paste or type a verification code. */
export function VerifyLookupForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [raw, setRaw] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeCertificateCode(raw);
    if (!normalized) {
      setError(t.invalidCode);
      return;
    }
    setError(null);
    router.push(`/verificar/${encodeURIComponent(normalized)}`);
  }

  return (
    <Card className="gap-space-4 flex flex-col">
      <form onSubmit={submit} noValidate className="gap-space-3 flex flex-col sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            label={t.codeLabel}
            placeholder={t.codePlaceholder}
            value={raw}
            error={error}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setRaw(event.target.value);
              setError(null);
            }}
          />
        </div>
        <Button type="submit" size="md" icon="search">
          {t.submit}
        </Button>
      </form>
    </Card>
  );
}
