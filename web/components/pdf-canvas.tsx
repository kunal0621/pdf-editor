"use client";

import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { PageManifest } from "@/lib/types";

type PdfCanvasProps = {
  sourceUrl: string;
  page: PageManifest;
  scale: number;
  title?: string;
  subtitle?: string;
  showOverlays?: boolean;
  selectedTextBlockId: string | null;
  selectedImageBlockId: string | null;
  onSelectTextBlock: (blockId: string | null) => void;
  onSelectImageBlock: (blockId: string | null) => void;
};

export function PdfCanvas({
  sourceUrl,
  page,
  scale,
  title = `Page ${page.page_number}`,
  subtitle = "Click teal blocks for text and rose blocks for images.",
  showOverlays = true,
  selectedTextBlockId,
  selectedImageBlockId,
  onSelectTextBlock,
  onSelectImageBlock
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }, []);

  useEffect(() => {
    let mounted = true;
    let documentProxy: PDFDocumentProxy | null = null;

    const renderPage = async () => {
      setLoading(true);
      setError(null);

      try {
        const loadingTask = getDocument(sourceUrl);
        documentProxy = await loadingTask.promise;
        const pdfPage = await documentProxy.getPage(page.page_number);
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || !mounted) {
          return;
        }
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context not available.");
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({
          canvasContext: context,
          viewport
        }).promise;
      } catch (renderError) {
        if (mounted) {
          setError(renderError instanceof Error ? renderError.message : "Failed to render PDF.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void renderPage();

    return () => {
      mounted = false;
      documentProxy?.destroy();
    };
  }, [page.page_number, scale, sourceUrl]);

  return (
    <div className="rounded-[24px] bg-slate-900/95 p-4">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-200">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        {loading ? <span className="text-xs text-slate-400">Rendering...</span> : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="relative inline-block overflow-hidden rounded-[20px] bg-white shadow-2xl">
        <canvas ref={canvasRef} />

        {showOverlays ? (
          <div className="pointer-events-none absolute inset-0">
            {page.text_blocks.map((block) => (
              <button
                className={`pointer-events-auto absolute rounded-md border-2 transition ${
                  selectedTextBlockId === block.id
                    ? "border-teal-300 bg-teal-400/20"
                    : "border-teal-500/80 bg-teal-500/10 hover:bg-teal-500/20"
                }`}
                key={block.id}
                onClick={() => onSelectTextBlock(block.id)}
                style={{
                  left: block.bounds.x * scale,
                  top: block.bounds.y * scale,
                  width: Math.max(block.bounds.width * scale, 8),
                  height: Math.max(block.bounds.height * scale, 8)
                }}
                type="button"
                title={block.text}
              />
            ))}

            {page.image_blocks.map((block) => (
              <button
                className={`pointer-events-auto absolute rounded-md border-2 transition ${
                  selectedImageBlockId === block.id
                    ? "border-rose-300 bg-rose-400/20"
                    : "border-rose-500/80 bg-rose-500/10 hover:bg-rose-500/20"
                }`}
                key={block.id}
                onClick={() => onSelectImageBlock(block.id)}
                style={{
                  left: block.bounds.x * scale,
                  top: block.bounds.y * scale,
                  width: Math.max(block.bounds.width * scale, 8),
                  height: Math.max(block.bounds.height * scale, 8)
                }}
                type="button"
                title={`Image block ${block.id}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
