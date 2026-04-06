"use client";

import { ChangeEvent, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";

import { PdfCanvas } from "@/components/pdf-canvas";
import { applyDocument, deleteDocument, exportDocument, getManifest, toApiUrl, uploadDocument } from "@/lib/api";
import { DocumentManifest, EditOperation, ImageBlock, PageManifest, TextBlock } from "@/lib/types";

type State = {
  documentId: string | null;
  manifest: DocumentManifest | null;
  selectedPage: number;
  selectedTextBlockId: string | null;
  selectedImageBlockId: string | null;
  operations: EditOperation[];
  downloadPath: string | null;
  warnings: string[];
  notice: string | null;
  error: string | null;
};

type Action =
  | { type: "set_document"; payload: { documentId: string; manifest: DocumentManifest } }
  | { type: "select_page"; payload: number }
  | { type: "select_text"; payload: string | null }
  | { type: "select_image"; payload: string | null }
  | { type: "add_operation"; payload: EditOperation }
  | { type: "remove_operation"; payload: number }
  | { type: "apply_complete"; payload: { manifest: DocumentManifest; warnings: string[]; notice: string } }
  | { type: "set_export"; payload: { downloadPath: string; warnings: string[]; notice: string } }
  | { type: "set_error"; payload: string | null }
  | { type: "reset" };

const initialState: State = {
  documentId: null,
  manifest: null,
  selectedPage: 1,
  selectedTextBlockId: null,
  selectedImageBlockId: null,
  operations: [],
  downloadPath: null,
  warnings: [],
  notice: null,
  error: null
};

function nextPageNumber(manifest: DocumentManifest, currentPage: number) {
  const pages = manifest.pages.map((page) => page.page_number);
  return pages.includes(currentPage) ? currentPage : (pages[0] ?? 1);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_document":
      return {
        ...initialState,
        documentId: action.payload.documentId,
        manifest: action.payload.manifest,
        notice: "Queue edits, click Apply Changes, then export when the preview looks right."
      };
    case "select_page":
      return { ...state, selectedPage: action.payload, selectedTextBlockId: null, selectedImageBlockId: null };
    case "select_text":
      return { ...state, selectedTextBlockId: action.payload, selectedImageBlockId: null };
    case "select_image":
      return { ...state, selectedImageBlockId: action.payload, selectedTextBlockId: null };
    case "add_operation":
      return {
        ...state,
        operations: [...state.operations, action.payload],
        downloadPath: null,
        warnings: [],
        notice: "Changes queued. Click Apply Changes to refresh the preview.",
        error: null
      };
    case "remove_operation":
      return {
        ...state,
        operations: state.operations.filter((_, index) => index !== action.payload),
        downloadPath: null,
        warnings: [],
        notice: state.operations.length > 1 ? "Changes queued. Click Apply Changes to refresh the preview." : null
      };
    case "apply_complete":
      return {
        ...state,
        manifest: action.payload.manifest,
        selectedPage: nextPageNumber(action.payload.manifest, state.selectedPage),
        selectedTextBlockId: null,
        selectedImageBlockId: null,
        operations: [],
        downloadPath: null,
        warnings: action.payload.warnings,
        notice: action.payload.notice,
        error: null
      };
    case "set_export":
      return { ...state, ...action.payload, error: null };
    case "set_error":
      return { ...state, error: action.payload };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

function parsePageOrder(input: string) {
  return input.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter((value) => Number.isFinite(value) && value > 0);
}

function combineWarnings(warnings: string[], unsupported: string[]) {
  return unsupported.length ? [...warnings, `Unsupported operations: ${unsupported.join(", ")}`] : warnings;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export function EditorWorkspaceLive() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const [zoom, setZoom] = useState(1.15);
  const [textDraft, setTextDraft] = useState("");
  const [moveDraft, setMoveDraft] = useState({ x: 40, y: 40, width: 220, height: 56 });
  const [overlayDraft, setOverlayDraft] = useState({ text: "New overlay", x: 48, y: 48, width: 260, height: 64 });
  const [pageOrderDraft, setPageOrderDraft] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const overlayImageInputRef = useRef<HTMLInputElement | null>(null);

  const currentPage = useMemo<PageManifest | null>(() => state.manifest?.pages.find((page) => page.page_number === state.selectedPage) ?? null, [state.manifest, state.selectedPage]);
  const selectedTextBlock = useMemo<TextBlock | null>(() => currentPage?.text_blocks.find((block) => block.id === state.selectedTextBlockId) ?? null, [currentPage, state.selectedTextBlockId]);
  const selectedImageBlock = useMemo<ImageBlock | null>(() => currentPage?.image_blocks.find((block) => block.id === state.selectedImageBlockId) ?? null, [currentPage, state.selectedImageBlockId]);

  useEffect(() => {
    if (!selectedTextBlock) {
      return;
    }
    setTextDraft(selectedTextBlock.text);
    setMoveDraft({
      x: Math.round(selectedTextBlock.bounds.x),
      y: Math.round(selectedTextBlock.bounds.y),
      width: Math.round(selectedTextBlock.bounds.width),
      height: Math.round(selectedTextBlock.bounds.height)
    });
  }, [selectedTextBlock]);

  const queueOperation = (operation: EditOperation) => dispatch({ type: "add_operation", payload: operation });

  const applyQueuedOperations = async (operations: EditOperation[]) => {
    if (!state.documentId || !operations.length) {
      return;
    }
    const result = await applyDocument(state.documentId, operations);
    setPageOrderDraft(result.manifest.pages.map((page) => page.page_number).join(", "));
    dispatch({
      type: "apply_complete",
      payload: {
        manifest: result.manifest,
        warnings: combineWarnings(result.warnings, result.unsupported_operations),
        notice: "Preview updated. Keep editing or export the revised PDF."
      }
    });
  };

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
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
          setPageOrderDraft(manifest.pages.map((page) => page.page_number).join(", "));
          dispatch({ type: "set_document", payload: { documentId: uploadResult.document_id, manifest } });
        } catch (error) {
          dispatch({ type: "set_error", payload: error instanceof Error ? error.message : "Upload failed." });
        }
      })();
    });
  };

  const handleApply = () => {
    if (!state.operations.length) {
      return;
    }
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          await applyQueuedOperations(state.operations);
        } catch (error) {
          dispatch({ type: "set_error", payload: error instanceof Error ? error.message : "Failed to apply changes." });
        }
      })();
    });
  };

  const handleExport = () => {
    const documentId = state.documentId;
    if (!documentId) {
      return;
    }
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          if (state.operations.length) {
            await applyQueuedOperations(state.operations);
          }
          const result = await exportDocument(documentId);
          dispatch({
            type: "set_export",
            payload: {
              downloadPath: toApiUrl(result.download_url),
              warnings: combineWarnings(result.warnings, result.unsupported_operations),
              notice: "Download ready. The file name keeps the original name with revised appended."
            }
          });
        } catch (error) {
          dispatch({ type: "set_error", payload: error instanceof Error ? error.message : "Export failed." });
        }
      })();
    });
  };

  const handleReset = async () => {
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
    queueOperation({ type: "replace_image", page_number: state.selectedPage, block_id: selectedImageBlock.id, image_data_url: await fileToDataUrl(file) });
    event.target.value = "";
  };

  const handleOverlayImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    queueOperation({ type: "add_overlay_image", page_number: state.selectedPage, image_data_url: await fileToDataUrl(file), ...overlayDraft });
    event.target.value = "";
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Document</p>
            <h2 className="mt-1 text-lg font-semibold">Upload and pages</h2>
          </div>
          {state.documentId ? <button className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700" onClick={handleReset} type="button">Reset</button> : null}
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center">
          <span className="text-sm font-semibold text-slate-800">{isPending ? "Processing PDF..." : "Choose a PDF to start"}</span>
          <span className="mt-2 text-xs leading-5 text-slate-500">Upload, queue edits, apply them, and export only when the preview is right.</span>
          <input accept="application/pdf" className="hidden" onChange={upload} type="file" />
        </label>
        {state.manifest ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
              <p className="font-medium">{state.manifest.filename}</p>
              <p className="mt-1 text-slate-300">{state.manifest.page_count} pages - {state.manifest.detected_fonts.length} fonts detected</p>
            </div>
            <div className="space-y-3 overflow-y-auto pr-1 lg:max-h-[780px]">
              {state.manifest.pages.map((page) => (
                <button key={page.page_number} className={`w-full overflow-hidden rounded-2xl border text-left ${page.page_number === state.selectedPage ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white/80"}`} onClick={() => dispatch({ type: "select_page", payload: page.page_number })} type="button">
                  <img alt={`Preview of page ${page.page_number}`} className="h-28 w-full object-cover object-top" src={toApiUrl(page.preview_url)} />
                  <div className="px-3 py-2 text-xs text-slate-500">Page {page.page_number} - {page.text_blocks.length} text blocks - {page.image_blocks.length} image blocks</div>
                </button>
              ))}
            </div>
          </div>
        ) : <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">The current working PDF and its pages will appear here after upload.</div>}
      </aside>

      <section className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Workspace</p>
            <h2 className="mt-1 text-lg font-semibold">Editor and live preview</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} type="button">Zoom -</button>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">{(zoom * 100).toFixed(0)}%</div>
            <button className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700" onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))} type="button">Zoom +</button>
            <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!state.operations.length || isPending} onClick={handleApply} type="button">Apply Changes</button>
            <button className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!state.manifest || isPending} onClick={handleExport} type="button">Export PDF</button>
          </div>
        </div>
        {state.notice ? <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{state.notice}</div> : null}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {currentPage && state.manifest ? (
            <>
              <PdfCanvas page={currentPage} scale={zoom} selectedImageBlockId={state.selectedImageBlockId} selectedTextBlockId={state.selectedTextBlockId} sourceUrl={toApiUrl(state.manifest.source_url)} title="Editor canvas" subtitle="Select blocks here, queue edits in the inspector, then click Apply Changes." onSelectImageBlock={(blockId) => dispatch({ type: "select_image", payload: blockId })} onSelectTextBlock={(blockId) => dispatch({ type: "select_text", payload: blockId })} />
              <PdfCanvas page={currentPage} scale={zoom} selectedImageBlockId={null} selectedTextBlockId={null} showOverlays={false} sourceUrl={toApiUrl(state.manifest.source_url)} title="Live preview" subtitle="This clean preview refreshes only when Apply Changes runs." onSelectImageBlock={() => undefined} onSelectTextBlock={() => undefined} />
            </>
          ) : (
            <>
              <div className="flex min-h-[720px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">Upload a PDF to load the editable canvas.</div>
              <div className="flex min-h-[720px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">The side-by-side preview will appear here after upload.</div>
            </>
          )}
        </div>
        {state.error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div> : null}
        {state.warnings.length ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><p className="font-semibold">Apply or export warnings</p><ul className="mt-2 space-y-1">{state.warnings.map((warning) => <li key={warning}>- {warning}</li>)}</ul></div> : null}
        {state.downloadPath ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"><span className="font-semibold">Download ready.</span><a className="rounded-full bg-teal-700 px-4 py-2 font-medium text-white" href={state.downloadPath} rel="noreferrer" target="_blank">Download revised PDF</a></div> : null}
      </section>

      <aside className="glass-panel rounded-[24px] p-4 shadow-panel">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Inspector</p>
          <h2 className="mt-1 text-lg font-semibold">Selection and operation queue</h2>
        </div>
        <div className="mt-4 rounded-3xl bg-white/85 p-4 text-sm">
          <p className="font-semibold text-slate-800">Active page</p>
          <p className="mt-1 text-slate-600">Page {state.selectedPage}</p>
          {selectedTextBlock ? <div className="mt-3 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-teal-900"><p className="font-semibold">Selected text block</p><p className="mt-1 text-xs leading-5">{selectedTextBlock.text}</p></div> : null}
          {selectedImageBlock ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-900"><p className="font-semibold">Selected image block</p><p className="mt-1 text-xs leading-5">{Math.round(selectedImageBlock.bounds.width)} x {Math.round(selectedImageBlock.bounds.height)}</p></div> : null}
        </div>
        {selectedTextBlock ? <div className="mt-4 rounded-3xl bg-white/85 p-4"><p className="text-sm font-semibold text-slate-800">Text tools</p><textarea className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm" onChange={(event) => setTextDraft(event.target.value)} value={textDraft} /><div className="mt-3 grid grid-cols-2 gap-2"><button className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white" onClick={() => queueOperation({ type: "replace_text", page_number: state.selectedPage, block_id: selectedTextBlock.id, text: textDraft })} type="button">Queue replace</button><button className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700" onClick={() => queueOperation({ type: "move_text", page_number: state.selectedPage, block_id: selectedTextBlock.id, text: textDraft, ...moveDraft })} type="button">Queue move</button></div><div className="mt-3 grid grid-cols-2 gap-2"><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setMoveDraft((draft) => ({ ...draft, x: Number(event.target.value) }))} type="number" value={moveDraft.x} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setMoveDraft((draft) => ({ ...draft, y: Number(event.target.value) }))} type="number" value={moveDraft.y} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setMoveDraft((draft) => ({ ...draft, width: Number(event.target.value) }))} type="number" value={moveDraft.width} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setMoveDraft((draft) => ({ ...draft, height: Number(event.target.value) }))} type="number" value={moveDraft.height} /></div></div> : null}
        {selectedImageBlock ? <div className="mt-4 rounded-3xl bg-white/85 p-4"><p className="text-sm font-semibold text-slate-800">Image tools</p><div className="mt-3 flex flex-wrap gap-2"><button className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white" onClick={() => imageInputRef.current?.click()} type="button">Replace image</button><button className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700" onClick={() => queueOperation({ type: "move_image", page_number: state.selectedPage, block_id: selectedImageBlock.id, x: overlayDraft.x, y: overlayDraft.y, width: overlayDraft.width, height: overlayDraft.height })} type="button">Queue move</button></div><input accept="image/*" className="hidden" onChange={handleReplaceImage} ref={imageInputRef} type="file" /></div> : null}
        <div className="mt-4 rounded-3xl bg-white/85 p-4"><p className="text-sm font-semibold text-slate-800">Overlay tools</p><textarea className="mt-3 min-h-20 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm" onChange={(event) => setOverlayDraft((draft) => ({ ...draft, text: event.target.value }))} value={overlayDraft.text} /><div className="mt-3 grid grid-cols-2 gap-2"><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setOverlayDraft((draft) => ({ ...draft, x: Number(event.target.value) }))} type="number" value={overlayDraft.x} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setOverlayDraft((draft) => ({ ...draft, y: Number(event.target.value) }))} type="number" value={overlayDraft.y} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setOverlayDraft((draft) => ({ ...draft, width: Number(event.target.value) }))} type="number" value={overlayDraft.width} /><input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setOverlayDraft((draft) => ({ ...draft, height: Number(event.target.value) }))} type="number" value={overlayDraft.height} /></div><div className="mt-3 flex flex-wrap gap-2"><button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => queueOperation({ type: "add_overlay_text", page_number: state.selectedPage, ...overlayDraft })} type="button">Add text overlay</button><button className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700" onClick={() => overlayImageInputRef.current?.click()} type="button">Add image overlay</button></div><input accept="image/*" className="hidden" onChange={handleOverlayImage} ref={overlayImageInputRef} type="file" /></div>
        <div className="mt-4 rounded-3xl bg-white/85 p-4"><p className="text-sm font-semibold text-slate-800">Page tools</p><div className="mt-3 flex flex-wrap gap-2"><button className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700" onClick={() => queueOperation({ type: "rotate_page", page_number: state.selectedPage, rotation: ((currentPage?.rotation ?? 0) + 90) % 360 })} type="button">Rotate 90 deg</button><button className="rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-700" onClick={() => queueOperation({ type: "delete_page", page_number: state.selectedPage })} type="button">Delete page</button></div><input className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setPageOrderDraft(event.target.value)} placeholder="1, 2, 3" value={pageOrderDraft} /><button className="mt-3 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white" onClick={() => queueOperation({ type: "reorder_pages", page_order: parsePageOrder(pageOrderDraft) })} type="button">Queue page reorder</button></div>
        <div className="mt-4 rounded-3xl bg-slate-950 px-4 py-4 text-white"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Operation queue</p><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{state.operations.length} queued</span></div><div className="mt-3 space-y-2">{state.operations.length ? state.operations.map((operation, index) => <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs" key={`${operation.type}-${index}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold uppercase tracking-[0.24em] text-teal-200">{operation.type.replaceAll("_", " ")}</p><p className="mt-1 break-all text-slate-300">{JSON.stringify(operation)}</p></div><button className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200" onClick={() => dispatch({ type: "remove_operation", payload: index })} type="button">Remove</button></div></div>) : <p className="text-sm text-slate-300">Queue edits here, click Apply Changes to update the live preview, then export when ready.</p>}</div></div>
      </aside>
    </div>
  );
}
