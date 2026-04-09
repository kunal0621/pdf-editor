import { DocumentManifest, EditOperation } from "@/lib/types";

// ─── State & Actions ──────────────────────────────────────────────────────────

export type EditorState = {
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
  interactionMode: "text" | "image";
};

export type EditorAction =
  | { type: "set_document"; payload: { documentId: string; manifest: DocumentManifest } }
  | { type: "select_page"; payload: number }
  | { type: "select_text"; payload: string | null }
  | { type: "select_image"; payload: string | null }
  | { type: "add_operation"; payload: EditOperation }
  | { type: "remove_operation"; payload: number }
  | { type: "apply_complete"; payload: { manifest: DocumentManifest; warnings: string[]; notice: string } }
  | { type: "set_export"; payload: { downloadPath: string; warnings: string[]; notice: string } }
  | { type: "set_error"; payload: string | null }
  | { type: "set_interaction_mode"; payload: "text" | "image" }
  | { type: "reset" };

export const initialEditorState: EditorState = {
  documentId: null,
  manifest: null,
  selectedPage: 1,
  selectedTextBlockId: null,
  selectedImageBlockId: null,
  operations: [],
  downloadPath: null,
  warnings: [],
  notice: null,
  error: null,
  interactionMode: "text",
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function nextPageNumber(manifest: DocumentManifest, currentPage: number) {
  const pages = manifest.pages.map((p) => p.page_number);
  return pages.includes(currentPage) ? currentPage : (pages[0] ?? 1);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "set_document":
      return {
        ...initialEditorState,
        documentId: action.payload.documentId,
        manifest: action.payload.manifest,
        notice: "Queue edits, click Apply Changes, then export when the preview looks right.",
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
        error: null,
      };
    case "remove_operation":
      return {
        ...state,
        operations: state.operations.filter((_, i) => i !== action.payload),
        downloadPath: null,
        warnings: [],
        notice: state.operations.length > 1 ? "Changes queued. Click Apply Changes to refresh the preview." : null,
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
        error: null,
      };
    case "set_export":
      return { ...state, ...action.payload, error: null };
    case "set_error":
      return { ...state, error: action.payload };
    case "set_interaction_mode":
      return { ...state, interactionMode: action.payload, selectedTextBlockId: null, selectedImageBlockId: null };
    case "reset":
      return initialEditorState;
    default:
      return state;
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function parsePageOrder(input: string) {
  return input
    .split(",")
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export function combineWarnings(warnings: string[], unsupported: string[]) {
  return unsupported.length ? [...warnings, `Unsupported operations: ${unsupported.join(", ")}`] : warnings;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export type TextStyle = {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
};
