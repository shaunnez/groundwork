import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { quoteRegions } from "../../shared/source-geometry";
import type { Unit } from "./data";
import { Button, Notice } from "../ui";
export function PdfEvidence({
  sourceId,
  unit,
  quote,
  total,
}: {
  sourceId: string;
  unit?: Unit;
  quote?: string;
  total: number | null;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(unit?.geometry?.page ?? unit?.ordinal ?? 1),
    [zoom, setZoom] = useState(1),
    [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    let dispose: (() => Promise<void>) | undefined;
    void import("pdfjs-dist")
      .then((pdf) => {
        if (!live) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdf.getDocument({
          url: `/api/sources/${sourceId}/download`,
          withCredentials: true,
        });
        dispose = () => task.destroy();
        return task.promise.then((value) => {
          if (live) setDoc(value);
        });
      })
      .catch(() => {
        if (live)
          setError(
            "The PDF preview could not be loaded. You can still download the original.",
          );
      });
    return () => {
      live = false;
      void dispose?.();
    };
  }, [sourceId]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let live = true;
    let cancel: (() => void) | undefined;
    setReady(false);
    setError("");
    void doc
      .getPage(page)
      .then((pdfPage) => {
        if (!live || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: Math.min(2, 1600 / natural.width),
        });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        const task = pdfPage.render({ canvas: c, viewport });
        cancel = () => task.cancel();
        return task.promise.then(() => {
          if (live) setReady(true);
        });
      })
      .catch((e) => {
        if (live && e.name !== "RenderingCancelledException")
          setError(
            "This page could not be rendered. Download the original to inspect it.",
          );
      });
    return () => {
      live = false;
      cancel?.();
    };
  }, [doc, page]);
  const onCitedPage = page === (unit?.geometry?.page ?? unit?.ordinal);
  const regions =
    onCitedPage && unit && quote
      ? quoteRegions(unit.text, quote, unit.geometry)
      : [];
  const pageCount = doc?.numPages ?? total ?? 1;
  const firstRegion = regions[0];
  useEffect(() => {
    if (!ready || !scroller.current || !canvas.current) return;
    scroller.current.scrollTo({
      top: firstRegion
        ? Math.max(
            0,
            firstRegion.y * canvas.current.clientHeight -
              scroller.current.clientHeight / 3,
          )
        : 0,
      left: 0,
      behavior: "instant",
    });
  }, [ready, page, firstRegion?.y, zoom]);
  return (
    <section className="pdf-evidence" aria-label="Original PDF evidence">
      <div className="pdf-toolbar">
        <Button
          kind="secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous PDF page"
        >
          Previous
        </Button>
        <label>
          Page{" "}
          <select
            aria-label="PDF page"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>{" "}
          of {pageCount}
        </label>
        <Button
          kind="secondary"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
          aria-label="Next PDF page"
        >
          Next
        </Button>
        <label>
          Zoom{" "}
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={1}>Fit width</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </label>
      </div>
      {error && <Notice title="PDF preview unavailable">{error}</Notice>}
      {!ready && !error && <p role="status">Loading page {page}…</p>}
      <div
        ref={scroller}
        className="pdf-scroll"
        tabIndex={0}
        aria-label="PDF page, scroll to explore when zoomed"
      >
        <div
          className="pdf-sheet"
          style={{
            width: `${zoom * 100}%`,
            visibility: ready ? "visible" : "hidden",
          }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Original PDF page ${page}. Extracted text is available below.`}
          />
          {ready &&
            regions.map((r, i) => (
              <span
                aria-hidden="true"
                data-evidence-highlight
                key={i}
                className="pdf-highlight"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                }}
              />
            ))}
        </div>
      </div>
      {quote && (
        <p className="small muted">
          {regions.length
            ? "Highlighted regions locate the cited wording."
            : onCitedPage
              ? "No unique quotation location is available on this page; no highlight has been inferred."
              : "Viewing another page. Return to the cited page to see its evidence."}
        </p>
      )}
      {onCitedPage && unit?.geometry?.method === "ocr" && (
        <Notice title="Read using OCR">
          Check the highlighted wording against the original scan. Quote
          matching checks the extracted text, not OCR accuracy.
        </Notice>
      )}
    </section>
  );
}
