from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


OperationType = Literal[
    "replace_text",
    "move_text",
    "replace_image",
    "move_image",
    "add_overlay_text",
    "add_overlay_image",
    "rotate_page",
    "delete_page",
    "reorder_pages",
]


class Bounds(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TextBlock(BaseModel):
    id: str
    text: str
    page_number: int
    bounds: Bounds
    font_name: str | None = None
    font_size: float | None = None


class ImageBlock(BaseModel):
    id: str
    page_number: int
    bounds: Bounds
    width: int | None = None
    height: int | None = None
    extension: str | None = None
    asset_key: str | None = None


class PageManifest(BaseModel):
    page_number: int
    width: float
    height: float
    rotation: int = 0
    preview_url: str
    text_blocks: list[TextBlock] = Field(default_factory=list)
    image_blocks: list[ImageBlock] = Field(default_factory=list)


class DocumentManifest(BaseModel):
    document_id: str
    filename: str
    page_count: int
    source_url: str
    download_url: str
    pages: list[PageManifest]
    detected_fonts: list[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    source_url: str
    manifest_url: str
    download_url: str


class EditOperation(BaseModel):
    type: OperationType
    page_number: int | None = None
    block_id: str | None = None
    text: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    rotation: int | None = None
    page_order: list[int] | None = None
    image_data_url: str | None = None


class OperationsPayload(BaseModel):
    operations: list[EditOperation] = Field(default_factory=list)


class ExportResponse(BaseModel):
    document_id: str
    download_url: str
    warnings: list[str] = Field(default_factory=list)
    unsupported_operations: list[str] = Field(default_factory=list)
