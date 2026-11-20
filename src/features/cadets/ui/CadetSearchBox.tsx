"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";
import { CADETS_SEARCH_MAX, CADETS_SEARCH_MIN } from "../domain/manage";

export interface CadetSearchBoxProps {
  /** The list's own path: a search opens it with `?q=`, and a text too short for one opens it plain. */
  list: string;
  /** The search the page was opened with. */
  search: string;
}

/** The search the list answers for a text: the text without outer spaces, or none while it is too short. */
const asked = (text: string) => (text.trim().length >= CADETS_SEARCH_MIN ? text.trim() : "");

/**
 * The search box of Admin › Cadetes. It filters as the person types: a moment after they pause it replaces the
 * address with `?q=` (the server page filters; no history entry is added and the page does not jump), and Enter asks
 * at once. It stays a plain GET form, so without scripts Enter still searches. The page it sits in stays a server
 * component: only this box carries state.
 */
export function CadetSearchBox({ list, search }: CadetSearchBoxProps) {
  const t = copy.admin.cadets;
  const router = useRouter();
  const [text, setText] = useState(search);
  const [pending, startTransition] = useTransition();
  const debounced = useDebouncedValue(text);
  // What the address already holds: what the page opened with, then what this box last asked for. It keeps the first
  // render, and a text that asks for the same search, from navigating again.
  const shown = useRef(asked(search));
  const latest = useRef({ text, debounced, pending });

  useEffect(() => {
    latest.current = { text, debounced, pending };
  });

  const go = useCallback(
    (value: string) => {
      const next = asked(value);
      if (next === shown.current) return;
      shown.current = next;
      startTransition(() => router.replace(next ? `${list}?${new URLSearchParams({ q: next })}` : list, { scroll: false }));
    },
    [list, router],
  );

  useEffect(() => {
    go(debounced);
  }, [debounced, go]);

  // The address changed by something other than this box (the «Ver todos» link): the box follows it, unless the person
  // is in the middle of typing, when the answer to an earlier pause must not overwrite their text.
  useEffect(() => {
    const incoming = asked(search);
    const now = latest.current;
    if (incoming === shown.current || now.pending || now.text !== now.debounced) return;
    shown.current = incoming;
    setText(incoming);
  }, [search]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(text);
  }

  return (
    <form action={list} method="get" role="search" onSubmit={submit} aria-busy={pending} className="gap-space-2 flex flex-col">
      <label htmlFor="cadet-search" className="type-label text-foreground">
        {t.searchLabel}
      </label>
      <input
        id="cadet-search"
        name="q"
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={CADETS_SEARCH_MAX}
        autoComplete="off"
        placeholder={t.searchPlaceholder}
        aria-describedby="cadet-search-hint"
        className="type-body bg-bg-deep text-foreground border-line-strong focus-visible:ring-ring h-12 w-full min-w-0 rounded-md border px-4 text-base focus-visible:ring-[3px] focus-visible:outline-none"
      />
      <p id="cadet-search-hint" className="type-caption text-muted-foreground">
        {t.searchHint}
      </p>
      <p role="status" className="sr-only">
        {pending ? t.searching : ""}
      </p>
    </form>
  );
}
