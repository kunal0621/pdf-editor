export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextBlock = {
  id: string;
  text: string;
  page_number: number;
  bounds: Bounds;
  font_name?: string | null;
  font_size?: number | null;
};

export type ImageBlock = {
  id: string;
  page_number: number;
  bounds: Bounds;
  width?: number | null;
  height?: number | null;
  extension?: string | null;
  asset_key?: string | null;
};

export type PageManifest = {
  page_number: number;
  width: number;
  height: number;
  rotation: number;
  preview_url: string;
  text_blocks: TextBlock[];
  image_blocks: ImageBlock[];
};

export type DocumentManifest = {
  document_id: string;
  filename: string;
  page_count: number;
  source_url: string;
  original_source_url: string;
  download_url: string;
  pages: PageManifest[];
  detected_fonts: string[];
};

export type UploadResponse = {
  document_id: string;
  filename: string;
  source_url: string;
  original_source_url: string;
  manifest_url: string;
  download_url: string;
};

export type EditOperationType =
  | "replace_text"
  | "move_text"
  | "replace_image"
  | "move_image"
  | "add_overlay_text"
  | "add_overlay_image"
  | "rotate_page"
  | "delete_page"
  | "reorder_pages";

export type EditOperation = {
  type: EditOperationType;
  page_number?: number;
  block_id?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  page_order?: number[];
  image_data_url?: string;
};

export type ExportResponse = {
  document_id: string;
  download_url: string;
  warnings: string[];
  unsupported_operations: string[];
};

export type ApplyResponse = {
  document_id: string;
  manifest: DocumentManifest;
  warnings: string[];
  unsupported_operations: string[];
};
