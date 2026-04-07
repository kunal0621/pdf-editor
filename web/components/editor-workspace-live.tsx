"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  applyDocument,
  deleteDocument,
  exportDocument,
  getManifest,
  listDocuments,
  toApiUrl,
  uploadDocument,
} from "@/lib/api";
import {
  DocumentManifest,
  EditOperation,
  ImageBlock,
  PageManifest,
  TextBlock,
} from "@/lib/types";

import { DocumentPanel } from "./document-panel";
import { WorkspaceSection } from "./workspace-section";
import { InspectorPanel } from "./inspector-panel";
import {
  EditorState,
  EditorAction,
  editorReducer,
  initialEditorState,
  combineWarnings,
  fileToDataUrl,
  TextStyle,
} from "./editor-types";

export function EditorWorkspaceLive() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [isPending, startTransition] = useTransition();
  const [zoom, setZoom] = useState(0.95);
  const [textDraft, setTextDraft] = useState("");
  const [textStyle, setTextStyle] = useState<TextStyle>({
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    color: "#000000",
  });
  const [moveDraft, setMoveDraft] = useState({
    x: 40,
    y: 40,
    width: 220,
    height: 56,
  });
  const [overlayDraft, setOverlayDraft] = useState({
    text: "New overlay",
    x: 48,
    y: 48,
    width: 260,
    height: 64,
  });
  const [pageOrderDraft, setPageOrderDraft] = useState("");
  const [existingDocs, setExistingDocs] = useState<DocumentManifest[]>([]);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);

  // ─── Derived selections ──────────────────────────────────────────────────────
  const currentPage = useMemo<PageManifest | null>(
    () =>
      state.manifest?.pages.find((p) => p.page_number === state.selectedPage) ??
      null,
    [state.manifest, state.selectedPage],
  );
  const selectedTextBlock = useMemo<TextBlock | null>(
    () =>
      currentPage?.text_blocks.find(
        (b) => b.id === state.selectedTextBlockId,
      ) ?? null,
    [currentPage, state.selectedTextBlockId],
  );
  const selectedImageBlock = useMemo<ImageBlock | null>(
    () =>
      currentPage?.image_blocks.find(
        (b) => b.id === state.selectedImageBlockId,
      ) ?? null,
    [currentPage, state.selectedImageBlockId],
  );

  // ─── Sync drafts when text block is selected ─────────────────────────────────
  useEffect(() => {
    if (!selectedTextBlock) return;
    setTextDraft(selectedTextBlock.text);
    setTextStyle((s) => ({
      ...s,
      fontSize: selectedTextBlock.font_size ?? 12,
    }));
    setMoveDraft({
      x: Math.round(selectedTextBlock.bounds.x),
      y: Math.round(selectedTextBlock.bounds.y),
      width: Math.round(selectedTextBlock.bounds.width),
      height: Math.round(selectedTextBlock.bounds.height),
    });
  }, [selectedTextBlock]);

  // ─── Document listing ─────────────────────────────────────────────────────────
  const fetchExistingDocs = async () => {
    try {
      setExistingDocs(await listDocuments());
    } catch (err) {
      console.error("Failed to fetch existing documents:", err);
    }
  };

  useEffect(() => {
    void fetchExistingDocs();
  }, []);

  // ─── Operations ───────────────────────────────────────────────────────────────
  const queueOperation = (op: EditOperation) =>
    dispatch({ type: "add_operation", payload: op });

  const applyQueuedOperations = async (ops: EditOperation[]) => {
    if (!state.documentId || !ops.length) return;
    const result = await applyDocument(state.documentId, ops);
    setPageOrderDraft(
      result.manifest.pages.map((p) => p.page_number).join(", "),
    );
    dispatch({
      type: "apply_complete",
      payload: {
        manifest: result.manifest,
        warnings: combineWarnings(
          result.warnings,
          result.unsupported_operations,
        ),
        notice: "Preview updated. Keep editing or export the revised PDF.",
      },
    });
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          const uploadResult = await uploadDocument(file);
          const manifest = await getManifest(uploadResult.document_id);
          setPageOrderDraft(
            manifest.pages.map((p) => p.page_number).join(", "),
          );
          dispatch({
            type: "set_document",
            payload: { documentId: uploadResult.document_id, manifest },
          });
          await fetchExistingDocs();
        } catch (error) {
          dispatch({
            type: "set_error",
            payload: error instanceof Error ? error.message : "Upload failed.",
          });
        }
      })();
    });
  };

  const handleApply = () => {
    if (!state.operations.length) return;
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          await applyQueuedOperations(state.operations);
        } catch (error) {
          dispatch({
            type: "set_error",
            payload:
              error instanceof Error
                ? error.message
                : "Failed to apply changes.",
          });
        }
      })();
    });
  };

  const handleExport = () => {
    const documentId = state.documentId;
    if (!documentId) return;
    dispatch({ type: "set_error", payload: null });
    startTransition(() => {
      void (async () => {
        try {
          if (state.operations.length)
            await applyQueuedOperations(state.operations);
          const result = await exportDocument(documentId);
          dispatch({
            type: "set_export",
            payload: {
              downloadPath: toApiUrl(result.download_url),
              warnings: combineWarnings(
                result.warnings,
                result.unsupported_operations,
              ),
              notice:
                "Download ready. The file name keeps the original name with revised appended.",
            },
          });
        } catch (error) {
          dispatch({
            type: "set_error",
            payload: error instanceof Error ? error.message : "Export failed.",
          });
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
        await fetchExistingDocs();
      } catch {
        /* best-effort */
      }
    }
  };

  const handleReplaceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedImageBlock) return;
    queueOperation({
      type: "replace_image",
      page_number: state.selectedPage,
      block_id: selectedImageBlock.id,
      image_data_url: await fileToDataUrl(file),
    });
    event.target.value = "";
  };

  const handleOverlayImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    queueOperation({
      type: "add_overlay_image",
      page_number: state.selectedPage,
      image_data_url: await fileToDataUrl(file),
      ...overlayDraft,
    });
    event.target.value = "";
  };

  const loadExistingDocument = async (manifest: DocumentManifest) => {
    const match = manifest.source_url.match(/\/documents\/([^/]+)\/source/);
    if (!match) return;
    const documentId = match[1];
    dispatch({ type: "reset" });
    setPageOrderDraft(manifest.pages.map((p) => p.page_number).join(", "));
    dispatch({ type: "set_document", payload: { documentId, manifest } });
  };

  const handleExistingDocDelete = async (manifest: DocumentManifest) => {
    const match = manifest.source_url.match(/\/documents\/([^/]+)\/source/);
    if (!match) return;
    const documentId = match[1];
    try {
      await deleteDocument(documentId);
      if (state.documentId === documentId) dispatch({ type: "reset" });
      await fetchExistingDocs();
    } catch {
      dispatch({ type: "set_error", payload: "Failed to delete document." });
    }
  };

  // ─── Layout ───────────────────────────────────────────────────────────────────
  const layoutClass = useMemo(() => {
    if (isLeftPanelOpen && isRightPanelOpen)
      return "lg:grid-cols-[280px_minmax(0,1fr)_360px]";
    if (!isLeftPanelOpen && isRightPanelOpen)
      return "lg:grid-cols-[64px_minmax(0,1fr)_360px]";
    if (isLeftPanelOpen && !isRightPanelOpen)
      return "lg:grid-cols-[280px_minmax(0,1fr)_64px]";
    return "lg:grid-cols-[64px_minmax(0,1fr)_64px]";
  }, [isLeftPanelOpen, isRightPanelOpen]);

  return (
    <div
      className={`grid gap-4 p-4 transition-all duration-300 lg:h-full lg:min-h-0 ${layoutClass}`}
    >
      <DocumentPanel
        state={state}
        dispatch={dispatch}
        isPending={isPending}
        isOpen={isLeftPanelOpen}
        existingDocs={existingDocs}
        onToggle={() => setIsLeftPanelOpen((v) => !v)}
        onUpload={upload}
        onReset={handleReset}
        onLoadDoc={loadExistingDocument}
        onDeleteDoc={handleExistingDocDelete}
      />

      <WorkspaceSection
        state={state}
        dispatch={dispatch}
        currentPage={currentPage}
        isPending={isPending}
        zoom={zoom}
        onZoomIn={() =>
          setZoom((v) => Math.min(2.5, Number((v + 0.1).toFixed(2))))
        }
        onZoomOut={() =>
          setZoom((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))
        }
        onApply={handleApply}
        onExport={handleExport}
      />

      <InspectorPanel
        state={state}
        dispatch={dispatch}
        isOpen={isRightPanelOpen}
        onToggle={() => setIsRightPanelOpen((v) => !v)}
        selectedTextBlock={selectedTextBlock}
        selectedImageBlock={selectedImageBlock}
        currentPageRotation={currentPage?.rotation ?? 0}
        textDraft={textDraft}
        setTextDraft={setTextDraft}
        textStyle={textStyle}
        setTextStyle={setTextStyle}
        moveDraft={moveDraft}
        setMoveDraft={setMoveDraft}
        overlayDraft={overlayDraft}
        setOverlayDraft={setOverlayDraft}
        pageOrderDraft={pageOrderDraft}
        setPageOrderDraft={setPageOrderDraft}
        imageInputRef={imageInputRef}
        overlayImageInputRef={overlayImageInputRef}
        onReplaceImage={handleReplaceImage}
        onOverlayImage={handleOverlayImage}
        onQueueOperation={queueOperation}
      />
    </div>
  );
}
