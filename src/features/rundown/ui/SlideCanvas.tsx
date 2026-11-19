"use client";

import { useEffect, useRef, useState } from "react";
import { loadPdf, type PdfDocument } from "./pdf-loader";

export interface SlideCanvasProps {
  /** The PDF, from the connected folder; `null` while it is being read. */
  file: File | null;
  /** The page to show, from 1. */
  page: number;
  /** Called once with how many pages the deck has. */
  onLoaded?: (pages: number) => void;
  /** Called when the file cannot be opened as a PDF. */
  onFailed?: () => void;
  /** The accessible name of the slide. */
  label: string;
  className?: string;
}

/** One page of a PDF, as large as the box it is in, on a plain canvas. A new file or page redraws it. */
export function SlideCanvas({ file, page, onLoaded, onFailed, label, className }: SlideCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The latest callbacks, without making the effects below run again when the parent re-renders.
  const callbacks = useRef({ onLoaded, onFailed });
  useEffect(() => {
    callbacks.current = { onLoaded, onFailed };
  });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let opened: PdfDocument | null = null;
    loadPdf(file)
      .then((loaded) => {
        if (cancelled) return loaded.destroy();
        opened = loaded;
        setDocument(loaded);
        callbacks.current.onLoaded?.(loaded.pages);
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onFailed?.();
      });
    return () => {
      cancelled = true;
      opened?.destroy();
      setDocument(null);
    };
  }, [file]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current || size.width === 0 || size.height === 0) return;
    let cancelled = false;
    document.render(page, canvas.current, size).catch(() => {
      if (!cancelled) callbacks.current.onFailed?.();
    });
    return () => {
      cancelled = true;
    };
  }, [document, page, size]);

  return (
    <div ref={box} className={className ?? "size-full"} style={{ display: "grid", placeItems: "center" }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
