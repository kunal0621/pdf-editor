"use client";

import { ChangeEvent, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";

import {
  deleteDocument,
  exportDocument,
  getManifest,
  saveOperations,
  toApiUrl,
  uploadDocument
} from "@/lib/api";
import { DocumentManifest, EditOperation, ImageBlock, PageManifest, TextBlock } from "@/lib/types";
import { PdfCanvas } from "@/components/pdf-canvas";

type State = {
  documentId: string | null;
  manifest: DocumentManifest | null;
  selectedPage: number;
  selectedTextBlockId: string | null;
  selectedImageBlockId: string | null;
  operations: EditOperation[];
  exportPath: string | null;
  warnings: string[];
  error: string | null;
};

type Action =
  | { type: "set_document"; payload: { documentId: string; manifest: DocumentManifest } }
  | { type: "select_page"; payload: number }
  | { type: "select_text"; payload: string | null }
  | { type: "select_image"; payload: string | null }
  | { type: "add_operation"; payload: EditOperation }
  | { type: "remove_operation"; payload: number }
  | { type: "set_export"; payload: { exportPath: string; warnings: string[] } }
  | { type: "set_error"; payload: string | null }
  | { type: "reset" };

const initialState: State = {
  documentId: null,
  manifest: null,
  selectedPage: 1,
  selectedTextBlockId: null,
  selectedImageBlockId: null,
  operations: [],
  exportPath: null,
  warnings: [],
  error: null
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_document":
      return {
        ...initialState,
        documentId: action.payload.documentId,
        manifest: action.payload.manifest
      };
    case "select_page":
      return {
        ...state,
        selectedPage: action.payload,
        selectedTextBlockId: null,
        selectedImageBlockId: null
      };
    case "select_text":
      return {
        ...state,
        selectedTextBlockId: action.payload,
        selectedImageBlockId: null
      };
    case "select_image":
      return {
        ...state,
        selectedImageBlockId: action.payload,
        selectedTextBlockId: null
      };
    case "add_operation":
      return {
        ...state,
        operations: [...state.operations, action.payload],
        exportPath: null,
        warnings: [],
        error: null
      };
    case "remove_operation":
      return {
        ...state,
        operations: state.operations.filter((_, index) => index !== action.payload),
        exportPath: null,
        warnings: []
      };
    case "set_export":
      return {
        ...state,
        exportPath: action.payload.exportPath,
        warnings: action.payload.warnings
      };
    case "set_error":
      return {
        ...state,
        error: action.payload
      };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function parsePageOrder(input: string): number[] {
  return input
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function EditorWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const [zoom, setZoom] = useState(1.15);
  const [textDraft, setTextDraft] = useState("");
  const [moveDraft, setMoveDraft] = useState({ x: 40, y: 40, width: 220, height: 56 });
  const [overlayDraft, setOverlayDraft] = useState({
    text: "New overlay",
    x: 48,
    y: 48,
    width: 260,
    height: 64
  });
  const [pageOrderDraft, setPageOrderDraft] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const overlayImageInputRef = useRef<HTMLInputElement | null>(null);

  const currentPage = useMemo<PageManifest | null>(() => {
    return state.manifest?.pages.find((page) => page.page_number === state.selectedPage) ?? null;
  }, [state.manifest, state.selectedPage]);

  const selectedTextBlock = useMemo<TextBlock | null>(() => {
    return currentPage?.text_blocks.find((block) => block.id === state.selectedTextBlockId) ?? null;
  }, [currentPage, state.selectedTextBlockId]);

  const selectedImageBlock = useMemo<ImageBlock | null>(() => {
    return currentPage?.image_blocks.find((block) => block.id === state.selectedImageBlockId) ?? null;
  }, [currentPage, state.selectedImageBlockId]);

  useEffect(() => {
    if (selectedTextBlock) {
      setTextDraft(selectedTextBlock.text);
      setMoveDraft({
        x: Math.round(selectedTextBlock.bounds.x),
        y: Math.round(selectedTextBlock.bounds.y),
        width: Math.round(selectedTextBlock.bounds.width),
        height: Math.round(selectedTextBlock.bounds.height)
      });
    }
  }, [selectedTextBlock]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          const uploadResult = await uploadDocument(file);
          const manifest = await getManifest(uploadResult.document_id);
          dispatch({
            type: "set_document",
            payload: {
              documentId: uploadResult.document_id,
              manifest
            }
          });
          setPageOrderDraft(manifest.pages.map((page) => page.page_number).join(", "));
        } catch (error) {
          dispatch({
            type: "set_error",
            payload: error instanceof Error ? error.message : "Upload failed."
          });
        }
      })();
    });
  };

  const addOperation = (operation: EditOperation) => {
    dispatch({ type: "add_operation", payload: operation });
  };

  const syncOperations = async () => {
    if (!state.documentId) {
      return;
    }
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          await saveOperations(state.documentId!, state.operations);
        } catch (error) {
          dispatch({
            type: "set_error",
            payload: error instanceof Error ? error.message : "Failed to sync operations."
          });
        }
      })();
    });
  };

  const runExport = async () => {
    if (!state.documentId) {
      return;
    }
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          const result = await exportDocument(state.documentId!, state.operations);
          dispatch({
            type: "set_export",
            payload: {
              exportPath: toApiUrl(result.download_url),
              warnings: result.warnings.concat(
                result.unsupported_operations.length
                  ? [`Unsupported operations: ${result.unsupported_operations.join(", ")}`]
                  : []
              )
            }
          });
        } catch (error) {
          dispatch({
            type: "set_error",
            payload: error instanceof Error ? error.message : "Export failed."
          });
        }
      })();
    });
  };

  const resetWorkspace = async () => {
    const documentId = state.documentId;
    dispatch({ type: "reset" });
    if (documentId) {
      try {
        await deleteDocument(documentId);
      } catch {
        // Best-effort cleanup.
      }
    }
  };

  const handleReplaceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedImageBlock) {
      return;
    }
    const imageDataUrl = await fileToDataUrl(file);
    addOperation({
      type: "replace_image",
      page_number: state.selectedPage,
      block_id: selectedImageBlock.id,
      image_data_url: imageDataUrl
    });
    event.target.value = "";
  };

  const handleOverlayImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const imageDataUrl = await fileToDataUrl(file);
    addOperation({
      type: "add_overlay_image",
      page_number: state.selectedPage,
      image_data_url: imageDataUrl,
      x: overlayDraft.x,
      y: overlayDraft.y,
      width: overlayDraft.width,
      height: overlayDraft.height
    });
    event.target.value = "";
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Document</p>
            <h2 className="mt-1 text-lg font-semibold">Upload & pages</h2>
          </div>
          {state.documentId ? (
            <button
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              onClick={resetWorkspace}
              type="button"
            >
              Reset
            </button>
          ) : null}
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center transition hover:border-teal-500 hover:bg-teal-50/70">
          <span className="text-sm font-semibold text-slate-800">
            {isPending ? "Processing PDF..." : "Choose a PDF to start"}
          </span>
          <span className="mt-2 text-xs leading-5 text-slate-500">
            Upload a digital PDF to extract text and image blocks for editing.
          </span>
          <input accept="application/pdf" className="hidden" onChange={upload} type="file" />
        </label>

        {state.manifest ? (
          <>
            <div className="mt-5 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
              <p className="font-medium">{state.manifest.filename}</p>
              <p className="mt-1 text-slate-300">
                {state.manifest.page_count} pages · {state.manifest.detected_fonts.length} fonts detected
              </p>
            </div>

            <div className="mt-5 space-y-3 overflow-y-auto pr-1 lg:max-h-[780px]">
              {state.manifest.pages.map((page) => {
                const isActive = page.page_number === state.selectedPage;
                return (
                  <button
                    key={page.page_number}
                    className={`w-full overflow-hidden rounded-2xl border text-left transition ${
                      isActive
                        ? "border-teal-600 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white"
                    }`}
                    onClick={() => dispatch({ type: "select_page", payload: page.page_number })}
                    type="button"
                  >
                    <img
                      alt={`Preview of page ${page.page_number}`}
                      className="h-28 w-full object-cover object-top"
                      src={toApiUrl(page.preview_url)}
                    />
                    <div className="px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">Page {page.page_number}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {page.text_blocks.length} text blocks · {page.image_blocks.length} image blocks
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-4 text-sm leading-6 text-slate-600">
            The workspace will show page thumbnails, detected text blocks, and image blocks after upload.
          </div>
        )}
      </aside>

      <section className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Editor</p>
            <h2 className="mt-1 text-lg font-semibold">Viewer & selection canvas</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:border-slate-400"
              onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))}
              type="button"
            >
              Zoom -
            </button>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">
              {(zoom * 100).toFixed(0)}%
            </div>
            <button
              className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:border-slate-400"
              onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))}
              type="button"
            >
              Zoom +
            </button>
            <button
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              onClick={syncOperations}
              type="button"
            >
              Sync changes
            </button>
            <button
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800"
              onClick={runExport}
              type="button"
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="mt-4">
          {currentPage && state.manifest ? (
            <PdfCanvas
              page={currentPage}
              scale={zoom}
              selectedImageBlockId={state.selectedImageBlockId}
              selectedTextBlockId={state.selectedTextBlockId}
              sourceUrl={toApiUrl(state.manifest.source_url)}
              onSelectImageBlock={(blockId) => dispatch({ type: "select_image", payload: blockId })}
              onSelectTextBlock={(blockId) => dispatch({ type: "select_text", payload: blockId })}
            />
          ) : (
            <div className="flex min-h-[720px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">
              Upload a PDF to load the canvas. Text blocks are outlined in teal and image blocks in rose.
            </div>
          )}
        </div>

        {state.error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </div>
        ) : null}

        {state.warnings.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">Export warnings</p>
            <ul className="mt-2 space-y-1">
              {state.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.exportPath ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            <span className="font-semibold">Export ready.</span>
            <a
              className="rounded-full bg-teal-700 px-4 py-2 font-medium text-white transition hover:bg-teal-800"
              href={state.exportPath}
              rel="noreferrer"
              target="_blank"
            >
              Download edited PDF
            </a>
          </div>
        ) : null}
      </section>

      <aside className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Inspector</p>
          <h2 className="mt-1 text-lg font-semibold">Selection & operation queue</h2>
        </div>

        <div className="mt-4 rounded-3xl bg-white/85 p-4">
          <p className="text-sm font-semibold text-slate-800">Active page</p>
          <p className="mt-1 text-sm text-slate-600">Page {state.selectedPage}</p>
          {selectedTextBlock ? (
            <div className="mt-3 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm text-teal-900">
              <p className="font-semibold">Selected text block</p>
              <p className="mt-1 line-clamp-4 text-xs leading-5">{selectedTextBlock.text}</p>
            </div>
          ) : null}
          {selectedImageBlock ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
              <p className="font-semibold">Selected image block</p>
              <p className="mt-1 text-xs leading-5">
                {Math.round(selectedImageBlock.bounds.width)} × {Math.round(selectedImageBlock.bounds.height)}
              </p>
            </div>
          ) : null}
        </div>

        {selectedTextBlock ? (
          <div className="mt-4 rounded-3xl bg-white/85 p-4">
            <p className="text-sm font-semibold text-slate-800">Text tools</p>
            <textarea
              className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-teal-500"
              onChange={(event) => setTextDraft(event.target.value)}
              value={textDraft}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white"
                onClick={() =>
                  addOperation({
                    type: "replace_text",
                    page_number: state.selectedPage,
                    block_id: selectedTextBlock.id,
                    text: textDraft
                  })
                }
                type="button"
              >
                Queue replace
              </button>
              <button
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                onClick={() =>
                  addOperation({
                    type: "move_text",
                    page_number: state.selectedPage,
                    block_id: selectedTextBlock.id,
                    text: textDraft,
                    ...moveDraft
                  })
                }
                type="button"
              >
                Queue move
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                onChange={(event) => setMoveDraft((draft) => ({ ...draft, x: Number(event.target.value) }))}
                type="number"
                value={moveDraft.x}
              />
              <input
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                onChange={(event) => setMoveDraft((draft) => ({ ...draft, y: Number(event.target.value) }))}
                type="number"
                value={moveDraft.y}
              />
              <input
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                onChange={(event) => setMoveDraft((draft) => ({ ...draft, width: Number(event.target.value) }))}
                type="number"
                value={moveDraft.width}
              />
              <input
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                onChange={(event) => setMoveDraft((draft) => ({ ...draft, height: Number(event.target.value) }))}
                type="number"
                value={moveDraft.height}
              />
            </div>
          </div>
        ) : null}

        {selectedImageBlock ? (
          <div className="mt-4 rounded-3xl bg-white/85 p-4">
            <p className="text-sm font-semibold text-slate-800">Image tools</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white"
                onClick={() => imageInputRef.current?.click()}
                type="button"
              >
                Replace image
              </button>
              <button
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                onClick={() =>
                  addOperation({
                    type: "move_image",
                    page_number: state.selectedPage,
                    block_id: selectedImageBlock.id,
                    x: overlayDraft.x,
                    y: overlayDraft.y,
                    width: overlayDraft.width,
                    height: overlayDraft.height
                  })
                }
                type="button"
              >
                Queue move
              </button>
            </div>
            <input
              accept="image/*"
              className="hidden"
              onChange={handleReplaceImage}
              ref={imageInputRef}
              type="file"
            />
          </div>
        ) : null}

        <div className="mt-4 rounded-3xl bg-white/85 p-4">
          <p className="text-sm font-semibold text-slate-800">Overlay tools</p>
          <textarea
            className="mt-3 min-h-20 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm"
            onChange={(event) => setOverlayDraft((draft) => ({ ...draft, text: event.target.value }))}
            value={overlayDraft.text}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setOverlayDraft((draft) => ({ ...draft, x: Number(event.target.value) }))}
              type="number"
              value={overlayDraft.x}
            />
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setOverlayDraft((draft) => ({ ...draft, y: Number(event.target.value) }))}
              type="number"
              value={overlayDraft.y}
            />
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setOverlayDraft((draft) => ({ ...draft, width: Number(event.target.value) }))}
              type="number"
              value={overlayDraft.width}
            />
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setOverlayDraft((draft) => ({ ...draft, height: Number(event.target.value) }))}
              type="number"
              value={overlayDraft.height}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() =>
                addOperation({
                  type: "add_overlay_text",
                  page_number: state.selectedPage,
                  text: overlayDraft.text,
                  x: overlayDraft.x,
                  y: overlayDraft.y,
                  width: overlayDraft.width,
                  height: overlayDraft.height
                })
              }
              type="button"
            >
              Add text overlay
            </button>
            <button
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
              onClick={() => overlayImageInputRef.current?.click()}
              type="button"
            >
              Add image overlay
            </button>
          </div>
          <input
            accept="image/*"
            className="hidden"
            onChange={handleOverlayImage}
            ref={overlayImageInputRef}
            type="file"
          />
        </div>

        <div className="mt-4 rounded-3xl bg-white/85 p-4">
          <p className="text-sm font-semibold text-slate-800">Page tools</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
              onClick={() =>
                addOperation({
                  type: "rotate_page",
                  page_number: state.selectedPage,
                  rotation: ((currentPage?.rotation ?? 0) + 90) % 360
                })
              }
              type="button"
            >
              Rotate 90°
            </button>
            <button
              className="rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-700"
              onClick={() =>
                addOperation({
                  type: "delete_page",
                  page_number: state.selectedPage
                })
              }
              type="button"
            >
              Delete page
            </button>
          </div>
          <input
            className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            onChange={(event) => setPageOrderDraft(event.target.value)}
            placeholder="1, 2, 3"
            value={pageOrderDraft}
          />
          <button
            className="mt-3 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white"
            onClick={() =>
              addOperation({
                type: "reorder_pages",
                page_order: parsePageOrder(pageOrderDraft)
              })
            }
            type="button"
          >
            Queue page reorder
          </button>
        </div>

        <div className="mt-4 rounded-3xl bg-slate-950 px-4 py-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Operation queue</p>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
              {state.operations.length} queued
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {state.operations.length ? (
              state.operations.map((operation, index) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs"
                  key={`${operation.type}-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold uppercase tracking-[0.24em] text-teal-200">
                        {operation.type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 break-all text-slate-300">{JSON.stringify(operation)}</p>
                    </div>
                    <button
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                      onClick={() => dispatch({ type: "remove_operation", payload: index })}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-300">
                Select text or image blocks, then queue operations before syncing or exporting.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
