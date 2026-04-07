"use client";

import { PdfCanvas } from "@/components/pdf-canvas";
import { toApiUrl } from "@/lib/api";
import { PageManifest } from "@/lib/types";
import { EditorAction, EditorState } from "./editor-types";

type Props = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  currentPage: PageManifest | null;
  isPending: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onApply: () => void;
  onExport: () => void;
};

export function WorkspaceSection({ state, dispatch, currentPage, isPending, zoom, onZoomIn, onZoomOut, onApply, onExport }: Props) {
  return (
    <section className="glass-panel flex flex-col lg:h-full lg:min-h-0 rounded-[24px] p-4 shadow-panel">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-teal-700">Workspace</p>
          <h2 className="mt-1 text-lg font-semibold">Editor and live preview</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700" onClick={onZoomOut} type="button">
            Zoom −
          </button>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">{(zoom * 100).toFixed(0)}%</div>
          <button className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700" onClick={onZoomIn} type="button">
            Zoom +
          </button>
          <button
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!state.operations.length || isPending}
            onClick={onApply}
            type="button"
          >
            Apply Changes
          </button>
          <button
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!state.manifest || isPending}
            onClick={onExport}
            type="button"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Notice */}
      {state.notice && (
        <div className="shrink-0 mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{state.notice}</div>
      )}

      {/* Canvas area */}
      <div className="mt-4 flex-1 lg:min-h-0 lg:overflow-y-auto pr-2 grid gap-4 xl:grid-cols-2">
        {currentPage && state.manifest ? (
          <>
            <PdfCanvas
              page={currentPage}
              scale={zoom}
              selectedImageBlockId={state.selectedImageBlockId}
              selectedTextBlockId={state.selectedTextBlockId}
              sourceUrl={toApiUrl(state.manifest.source_url)}
              title="Editor canvas"
              subtitle="Select blocks here, queue edits in the inspector, then click Apply Changes."
              onSelectImageBlock={(id) => dispatch({ type: "select_image", payload: id })}
              onSelectTextBlock={(id) => dispatch({ type: "select_text", payload: id })}
            />
            <PdfCanvas
              page={currentPage}
              scale={zoom}
              selectedImageBlockId={null}
              selectedTextBlockId={null}
              showOverlays={false}
              sourceUrl={toApiUrl(state.manifest.source_url)}
              title="Live preview"
              subtitle="This clean preview refreshes only when Apply Changes runs."
              onSelectImageBlock={() => undefined}
              onSelectTextBlock={() => undefined}
            />
          </>
        ) : (
          <>
            <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">
              Upload a PDF to load the editable canvas.
            </div>
            <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500">
              The side-by-side preview will appear here after upload.
            </div>
          </>
        )}
      </div>

      {/* Feedback banners */}
      {state.error && (
        <div className="shrink-0 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      )}
      {state.warnings.length > 0 && (
        <div className="shrink-0 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Apply or export warnings</p>
          <ul className="mt-2 space-y-1">
            {state.warnings.map((w) => (
              <li key={w}>— {w}</li>
            ))}
          </ul>
        </div>
      )}
      {state.downloadPath && (
        <div className="shrink-0 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <span className="font-semibold">Download ready.</span>
          <a className="rounded-full bg-teal-700 px-4 py-2 font-medium text-white" href={state.downloadPath} rel="noreferrer" target="_blank">
            Download revised PDF
          </a>
        </div>
      )}
    </section>
  );
}
