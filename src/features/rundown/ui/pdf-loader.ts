/**
 * A PDF opened from a file on this computer, drawn one page at a time. `pdfjs-dist` is loaded only when a deck is shown
 * (it needs the browser, and it is big), and its worker runs from the app's own files: nothing is fetched from elsewhere.
 */
export interface PdfDocument {
  pages: number;
  /** Draws a page (clamped to the document) into a canvas, as large as fits the box. */
  render(page: number, canvas: HTMLCanvasElement, box: { width: number; height: number }): Promise<void>;
  destroy(): void;
}

export async function loadPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  return {
    pages: doc.numPages,
    async render(page, canvas, box) {
      const proxy = await doc.getPage(Math.min(Math.max(1, Math.round(page)), doc.numPages));
      const base = proxy.getViewport({ scale: 1 });
      const fit = Math.min(box.width / base.width, box.height / base.height);
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = proxy.getViewport({ scale: fit * density });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / density)}px`;
      canvas.style.height = `${Math.floor(viewport.height / density)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      await proxy.render({ canvasContext: context, viewport, canvas }).promise;
    },
    destroy() {
      void task.destroy();
    },
  };
}
