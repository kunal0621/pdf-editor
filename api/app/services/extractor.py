from __future__ import annotations

from pathlib import Path

import fitz

from app.models.schemas import Bounds, DocumentManifest, ImageBlock, PageManifest, TextBlock
from app.services.storage import StorageService


def build_manifest(
    document_id: str,
    filename: str,
    source_path: Path,
    storage: StorageService,
) -> DocumentManifest:
    document = fitz.open(source_path)
    revision_token = source_path.stat().st_mtime_ns
    original_revision = storage.source_path(document_id).stat().st_mtime_ns
    detected_fonts: set[str] = set()
    pages: list[PageManifest] = []

    for page_index in range(document.page_count):
        page = document.load_page(page_index)
        page_dict = page.get_text("dict")
        text_blocks: list[TextBlock] = []
        image_blocks: list[ImageBlock] = []

        for block_index, block in enumerate(page_dict.get("blocks", [])):
            if block.get("type") == 0:
                for line_index, line in enumerate(block.get("lines", [])):
                    spans = line.get("spans", [])
                    span_text = "".join(span.get("text", "") for span in spans).strip()
                    if not span_text:
                        continue
                    line_bbox = line.get("bbox") or block.get("bbox", [0, 0, 0, 0])
                    bounds = Bounds(
                        x=float(line_bbox[0]),
                        y=float(line_bbox[1]),
                        width=float(line_bbox[2] - line_bbox[0]),
                        height=float(line_bbox[3] - line_bbox[1]),
                    )
                    first_span = spans[0] if spans else {}
                    font_name = first_span.get("font")
                    font_size = first_span.get("size")
                    if font_name:
                        detected_fonts.add(str(font_name))
                    text_blocks.append(
                        TextBlock(
                            id=f"text-{page_index + 1}-{block_index}-{line_index}",
                            text=span_text,
                            page_number=page_index + 1,
                            bounds=bounds,
                            font_name=str(font_name) if font_name else None,
                            font_size=float(font_size) if font_size else None,
                        )
                    )
            elif block.get("type") == 1:
                bbox = block.get("bbox", [0, 0, 0, 0])
                bounds = Bounds(
                    x=float(bbox[0]),
                    y=float(bbox[1]),
                    width=float(bbox[2] - bbox[0]),
                    height=float(bbox[3] - bbox[1]),
                )
                block_id = f"image-{page_index + 1}-{block_index}"
                image_bytes = block.get("image")
                extension = block.get("ext") or "png"
                asset_key = None
                if image_bytes:
                    asset_key = f"{block_id}.{extension}"
                    storage.write_bytes(storage.asset_dir(document_id) / asset_key, image_bytes)
                image_blocks.append(
                    ImageBlock(
                        id=block_id,
                        page_number=page_index + 1,
                        bounds=bounds,
                        width=int(block.get("width")) if block.get("width") else None,
                        height=int(block.get("height")) if block.get("height") else None,
                        extension=str(extension),
                        asset_key=asset_key,
                    )
                )

        pages.append(
            PageManifest(
                page_number=page_index + 1,
                width=float(page.rect.width),
                height=float(page.rect.height),
                rotation=int(page.rotation),
                preview_url=f"/documents/{document_id}/pages/{page_index + 1}/preview?rev={revision_token}",
                text_blocks=text_blocks,
                image_blocks=image_blocks,
            )
        )

    document.close()

    return DocumentManifest(
        document_id=document_id,
        filename=filename,
        page_count=len(pages),
        source_url=f"/documents/{document_id}/source?rev={revision_token}",
        original_source_url=f"/documents/{document_id}/source/original?rev={original_revision}",
        download_url=f"/documents/{document_id}/download",
        pages=pages,
        detected_fonts=sorted(detected_fonts),
    )
