"use client";

import { ChangeEvent } from "react";
import { toApiUrl } from "@/lib/api";
import { DocumentManifest, PageManifest } from "@/lib/types";
import { EditorAction, EditorState } from "./editor-types";
import { useAuth } from "@/components/auth-provider";

type Props = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  isPending: boolean;
  isOpen: boolean;
  existingDocs: DocumentManifest[];
  onToggle: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onLoadDoc: (manifest: DocumentManifest) => void;
  onDeleteDoc: (manifest: DocumentManifest) => void;
};

function CollapsedSliver({ onToggle }: { onToggle: () => void }) {
  return (
    <>
      {/* Below lg: horizontal bar (vertical collapse) */}
      <div className="flex lg:hidden items-center justify-between px-1 py-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Document
        </span>
        <button
          className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
          onClick={onToggle}
          title="Expand Document Panel"
        >
          {/* chevron-down */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* lg+: vertical sliver (horizontal collapse) */}
      <div className="hidden lg:flex flex-col items-center justify-start h-full pt-2">
        <button
          className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
          onClick={onToggle}
          title="Expand Document Panel"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
        <div
          className="mt-8 flex-1"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap">
            Document
          </span>
        </div>
      </div>
    </>
  );
}

function PageThumbnail({
  page,
  selected,
  onSelect,
  token,
}: {
  page: PageManifest;
  selected: boolean;
  onSelect: () => void;
  token?: string | null;
}) {
  return (
    <button
      className={`w-full overflow-hidden rounded-2xl border text-left ${selected ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white/80"}`}
      onClick={onSelect}
      type="button"
    >
      <img
        alt={`Preview of page ${page.page_number}`}
        className="h-28 w-full object-cover object-top"
        src={toApiUrl(page.preview_url, token)}
      />
      <div className="px-3 py-2 text-xs text-slate-500">
        Page {page.page_number} — {page.text_blocks.length} text ·{" "}
        {page.image_blocks.length} image blocks
      </div>
    </button>
  );
}

export function DocumentPanel({
  state,
  dispatch,
  isPending,
  isOpen,
  existingDocs,
  onToggle,
  onUpload,
  onReset,
  onLoadDoc,
  onDeleteDoc,
}: Props) {
  const { session } = useAuth();
  const token = session?.access_token;

  return (
    <aside className="glass-panel rounded-[24px] p-4 shadow-panel flex flex-col lg:h-full lg:min-h-0 transition-all duration-300">
      {!isOpen ? (
        <CollapsedSliver onToggle={onToggle} />
      ) : (
        <div className="flex flex-col lg:h-full lg:min-h-0 opacity-100 transition-opacity duration-300">
          {/* Header */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-teal-700">
                Document
              </p>
              <h2 className="mt-1 text-lg font-semibold">Upload &amp; pages</h2>
            </div>
            <div className="flex items-center gap-2">
              {state.documentId ? (
                <button
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                  onClick={onReset}
                  type="button"
                >
                  Reset
                </button>
              ) : null}
              {/* Below lg: chevron-up (collapse vertically) */}
              <button
                className="lg:hidden rounded-full bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                onClick={onToggle}
                title="Collapse Document Panel"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              {/* lg+: chevrons-left (collapse horizontally) */}
              <button
                className="hidden lg:block rounded-full bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                onClick={onToggle}
                title="Collapse Document Panel"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="11 17 6 12 11 7" />
                  <polyline points="18 17 13 12 18 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Upload zone */}
          <label className="mt-4 shrink-0 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center">
            <span className="text-sm font-semibold text-slate-800">
              {isPending ? "Processing PDF..." : "Choose a PDF to start"}
            </span>
            <span className="mt-2 text-xs leading-5 text-slate-500">
              Upload, queue edits, apply, and export only when the preview is
              right.
            </span>
            <input
              accept="application/pdf"
              className="hidden"
              onChange={onUpload}
              type="file"
            />
          </label>

          {/* Existing docs */}
          {existingDocs.length > 0 && (
            <div className="mt-4 shrink-0 flex flex-col max-h-44">
              <p className="text-xs uppercase tracking-[0.28em] text-teal-700">
                Existing Documents
              </p>
              <div className="mt-2 space-y-2 overflow-y-auto pr-1">
                {existingDocs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-xs border border-slate-200"
                  >
                    <button
                      type="button"
                      className="text-left font-medium text-slate-700 hover:text-teal-700 truncate mr-2"
                      onClick={() => onLoadDoc(doc)}
                    >
                      {doc.filename}
                    </button>
                    <button
                      type="button"
                      className="text-rose-600 hover:text-rose-800 px-2 flex-shrink-0"
                      onClick={() => onDeleteDoc(doc)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Page list */}
          {state.manifest ? (
            <div className="mt-4 flex flex-col flex-1 lg:min-h-0">
              <div className="shrink-0 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white mb-3">
                <p className="font-medium">{state.manifest.filename}</p>
                <p className="mt-1 text-slate-300">
                  {state.manifest.page_count} pages &mdash;{" "}
                  {state.manifest.detected_fonts.length} fonts detected
                </p>
              </div>
              <div className="space-y-3 lg:overflow-y-auto flex-1 lg:min-h-0 pr-1">
                {state.manifest.pages.map((page) => (
                  <PageThumbnail
                    key={page.page_number}
                    page={page}
                    selected={page.page_number === state.selectedPage}
                    token={token}
                    onSelect={() =>
                      dispatch({
                        type: "select_page",
                        payload: page.page_number,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              The current working PDF and its pages will appear here after
              upload.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
