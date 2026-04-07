"use client";

import { ChangeEvent, RefObject } from "react";
import { EditOperation, ImageBlock, TextBlock } from "@/lib/types";
import {
  EditorAction,
  EditorState,
  TextStyle,
  parsePageOrder,
} from "./editor-types";

type Props = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  isOpen: boolean;
  onToggle: () => void;

  selectedTextBlock: TextBlock | null;
  selectedImageBlock: ImageBlock | null;
  currentPageRotation: number;

  textDraft: string;
  setTextDraft: (v: string) => void;
  textStyle: TextStyle;
  setTextStyle: (fn: (prev: TextStyle) => TextStyle) => void;
  moveDraft: { x: number; y: number; width: number; height: number };
  setMoveDraft: (
    fn: (prev: { x: number; y: number; width: number; height: number }) => {
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ) => void;
  overlayDraft: {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  setOverlayDraft: (
    fn: (prev: {
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }) => { text: string; x: number; y: number; width: number; height: number },
  ) => void;
  pageOrderDraft: string;
  setPageOrderDraft: (v: string) => void;

  imageInputRef: RefObject<HTMLInputElement>;
  overlayImageInputRef: RefObject<HTMLInputElement>;
  onReplaceImage: (e: ChangeEvent<HTMLInputElement>) => void;
  onOverlayImage: (e: ChangeEvent<HTMLInputElement>) => void;
  onQueueOperation: (op: EditOperation) => void;
};

function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      {/* Below lg: chevron-up (collapse vertically) */}
      <button
        className="lg:hidden rounded-full bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
        onClick={onClick}
        title="Collapse Inspector Panel"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      {/* lg+: chevrons-right (collapse horizontally) */}
      <button
        className="hidden lg:block rounded-full bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
        onClick={onClick}
        title="Collapse Inspector Panel"
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
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </button>
    </>
  );
}

function TextFormatToolbar({
  textStyle,
  setTextStyle,
}: {
  textStyle: TextStyle;
  setTextStyle: Props["setTextStyle"];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      <input
        type="number"
        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700"
        value={textStyle.fontSize}
        onChange={(e) =>
          setTextStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))
        }
        title="Font size"
        min={6}
        max={144}
      />
      <input
        type="color"
        className="w-8 h-8 rounded border border-slate-200 p-0 cursor-pointer"
        value={textStyle.color}
        onChange={(e) => setTextStyle((s) => ({ ...s, color: e.target.value }))}
        title="Text color"
      />
      {(["bold", "italic", "underline"] as const).map((key) => (
        <button
          key={key}
          className={`w-8 h-8 rounded-lg border text-sm text-slate-700 transition-colors ${
            textStyle[key]
              ? "bg-slate-200 border-slate-400"
              : "border-slate-200 hover:bg-slate-100"
          } ${key === "bold" ? "font-bold" : key === "italic" ? "italic" : "underline"}`}
          onClick={() => setTextStyle((s) => ({ ...s, [key]: !s[key] }))}
          title={key.charAt(0).toUpperCase() + key.slice(1)}
          type="button"
        >
          {key === "bold" ? "B" : key === "italic" ? "I" : "U"}
        </button>
      ))}
    </div>
  );
}

function BoundsInputs({
  value,
  onChange,
}: {
  value: { x: number; y: number; width: number; height: number };
  onChange: (field: "x" | "y" | "width" | "height", v: number) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {(["x", "y", "width", "height"] as const).map((field) => (
        <input
          key={field}
          className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
          placeholder={field}
          type="number"
          value={value[field]}
          onChange={(e) => onChange(field, Number(e.target.value))}
        />
      ))}
    </div>
  );
}

export function InspectorPanel({
  state,
  dispatch,
  isOpen,
  onToggle,
  selectedTextBlock,
  selectedImageBlock,
  currentPageRotation,
  textDraft,
  setTextDraft,
  textStyle,
  setTextStyle,
  moveDraft,
  setMoveDraft,
  overlayDraft,
  setOverlayDraft,
  pageOrderDraft,
  setPageOrderDraft,
  imageInputRef,
  overlayImageInputRef,
  onReplaceImage,
  onOverlayImage,
  onQueueOperation,
}: Props) {
  return (
    <aside className="glass-panel rounded-[24px] p-4 shadow-panel flex flex-col lg:h-full lg:min-h-0 transition-all duration-300">
      {!isOpen ? (
        /* Collapsed state */
        <>
          {/* Below lg: horizontal bar (vertical collapse) */}
          <div className="flex lg:hidden items-center justify-between px-1 py-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Inspector
            </span>
            <button
              className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
              onClick={onToggle}
              title="Expand Inspector Panel"
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
              title="Expand Inspector Panel"
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
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
            <div
              className="mt-8 flex-1"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                Inspector
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col lg:h-full lg:min-h-0">
          {/* Header */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-teal-700">
                Inspector
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Selection &amp; queue
              </h2>
            </div>
            <CollapseButton onClick={onToggle} />
          </div>

          {/* Active page / selection info */}
          <div className="shrink-0 mt-4 rounded-3xl bg-white/85 p-4 text-sm">
            <p className="font-semibold text-slate-800">Active page</p>
            <p className="mt-1 text-slate-600">Page {state.selectedPage}</p>
            {selectedTextBlock && (
              <div className="mt-3 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-teal-900">
                <p className="font-semibold">Selected text block</p>
                <p className="mt-1 text-xs leading-5 line-clamp-3">
                  {selectedTextBlock.text}
                </p>
              </div>
            )}
            {selectedImageBlock && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-900">
                <p className="font-semibold">Selected image block</p>
                <p className="mt-1 text-xs leading-5">
                  {Math.round(selectedImageBlock.bounds.width)} ×{" "}
                  {Math.round(selectedImageBlock.bounds.height)}
                </p>
              </div>
            )}
          </div>

          {/* Scrollable tools */}
          <div className="flex-1 mt-4 lg:min-h-0 lg:overflow-y-auto space-y-4 pr-1 pb-4">
            {/* Text tools */}
            {selectedTextBlock && (
              <div className="rounded-3xl bg-white/85 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Text tools
                </p>
                <textarea
                  className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm resize-y"
                  onChange={(e) => setTextDraft(e.target.value)}
                  value={textDraft}
                />
                <TextFormatToolbar
                  textStyle={textStyle}
                  setTextStyle={setTextStyle}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white"
                    onClick={() =>
                      onQueueOperation({
                        type: "replace_text",
                        page_number: state.selectedPage,
                        block_id: selectedTextBlock.id,
                        text: textDraft,
                        font_size: textStyle.fontSize,
                        bold: textStyle.bold,
                        italic: textStyle.italic,
                        underline: textStyle.underline,
                        color: textStyle.color,
                      })
                    }
                    type="button"
                  >
                    Queue replace
                  </button>
                  <button
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    onClick={() =>
                      onQueueOperation({
                        type: "move_text",
                        page_number: state.selectedPage,
                        block_id: selectedTextBlock.id,
                        text: textDraft,
                        font_size: textStyle.fontSize,
                        bold: textStyle.bold,
                        italic: textStyle.italic,
                        underline: textStyle.underline,
                        color: textStyle.color,
                        ...moveDraft,
                      })
                    }
                    type="button"
                  >
                    Queue move
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Position &amp; size (x, y, w, h)
                </p>
                <BoundsInputs
                  value={moveDraft}
                  onChange={(field, v) =>
                    setMoveDraft((d) => ({ ...d, [field]: v }))
                  }
                />
              </div>
            )}

            {/* Image tools */}
            {selectedImageBlock && (
              <div className="rounded-3xl bg-white/85 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Image tools
                </p>
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
                      onQueueOperation({
                        type: "move_image",
                        page_number: state.selectedPage,
                        block_id: selectedImageBlock.id,
                        x: overlayDraft.x,
                        y: overlayDraft.y,
                        width: overlayDraft.width,
                        height: overlayDraft.height,
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
                  onChange={onReplaceImage}
                  ref={imageInputRef}
                  type="file"
                />
              </div>
            )}

            {/* Overlay tools */}
            <div className="rounded-3xl bg-white/85 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Overlay tools
              </p>
              <textarea
                className="mt-3 min-h-20 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm resize-y"
                onChange={(e) =>
                  setOverlayDraft((d) => ({ ...d, text: e.target.value }))
                }
                value={overlayDraft.text}
              />
              <p className="mt-3 text-xs text-slate-500">
                Position &amp; size (x, y, w, h)
              </p>
              <BoundsInputs
                value={overlayDraft}
                onChange={(field, v) =>
                  setOverlayDraft((d) => ({ ...d, [field]: v }))
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  onClick={() =>
                    onQueueOperation({
                      type: "add_overlay_text",
                      page_number: state.selectedPage,
                      font_size: textStyle.fontSize,
                      bold: textStyle.bold,
                      italic: textStyle.italic,
                      underline: textStyle.underline,
                      color: textStyle.color,
                      ...overlayDraft,
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
                onChange={onOverlayImage}
                ref={overlayImageInputRef}
                type="file"
              />
            </div>

            {/* Page tools */}
            <div className="rounded-3xl bg-white/85 p-4">
              <p className="text-sm font-semibold text-slate-800">Page tools</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                  onClick={() =>
                    onQueueOperation({
                      type: "rotate_page",
                      page_number: state.selectedPage,
                      rotation: (currentPageRotation + 90) % 360,
                    })
                  }
                  type="button"
                >
                  Rotate 90°
                </button>
                <button
                  className="rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-700"
                  onClick={() =>
                    onQueueOperation({
                      type: "delete_page",
                      page_number: state.selectedPage,
                    })
                  }
                  type="button"
                >
                  Delete page
                </button>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => setPageOrderDraft(e.target.value)}
                placeholder="e.g. 1, 3, 2"
                value={pageOrderDraft}
              />
              <button
                className="mt-3 rounded-full bg-slate-700 px-4 py-2 text-sm font-medium text-white"
                onClick={() =>
                  onQueueOperation({
                    type: "reorder_pages",
                    page_order: parsePageOrder(pageOrderDraft),
                  })
                }
                type="button"
              >
                Queue page reorder
              </button>
            </div>

            {/* Operation queue */}
            <div className="rounded-3xl bg-slate-950 px-4 py-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Operation queue</p>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
                  {state.operations.length} queued
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {state.operations.length > 0 ? (
                  state.operations.map((op, i) => (
                    <div
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs"
                      key={`${op.type}-${i}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold uppercase tracking-[0.24em] text-teal-200">
                            {op.type.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 break-all text-slate-300">
                            {JSON.stringify(op)}
                          </p>
                        </div>
                        <button
                          className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                          onClick={() =>
                            dispatch({ type: "remove_operation", payload: i })
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">
                    Queue edits here, click Apply Changes to update the live
                    preview, then export when ready.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
