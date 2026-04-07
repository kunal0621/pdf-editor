from __future__ import annotations

import base64
from collections import defaultdict
from pathlib import Path

import fitz

from app.engines.base import EditorEngine
from app.models.schemas import Bounds, DocumentManifest, EditOperation, ImageBlock, TextBlock


def _decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("Invalid data URL payload")
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


class OpenSourceEditorEngine(EditorEngine):
    def apply_operations(
        self,
        source_bytes: bytes,
        manifest: DocumentManifest,
        operations: list[EditOperation],
        user_id: str,
        document_id: str,
    ) -> tuple[bytes, list[str], list[str]]:
        from app.services.storage import storage_service
        warnings: list[str] = []
        unsupported_operations: list[str] = []
        document = fitz.open("pdf", source_bytes)
        text_lookup: dict[str, TextBlock] = {}
        image_lookup: dict[str, ImageBlock] = {}

        for page in manifest.pages:
            for block in page.text_blocks:
                text_lookup[block.id] = block
            for block in page.image_blocks:
                image_lookup[block.id] = block

        operations_by_page: dict[int, list[EditOperation]] = defaultdict(list)
        deleted_pages: set[int] = set()
        rotations: dict[int, int] = {}
        reorder_plan: list[int] | None = None

        for operation in operations:
            if operation.type == "delete_page" and operation.page_number:
                deleted_pages.add(operation.page_number)
                continue
            if operation.type == "rotate_page" and operation.page_number:
                rotations[operation.page_number] = operation.rotation or 0
                continue
            if operation.type == "reorder_pages" and operation.page_order:
                reorder_plan = operation.page_order
                continue
            if operation.page_number is None:
                unsupported_operations.append(operation.type)
                continue
            operations_by_page[operation.page_number].append(operation)

        for page_number, page_operations in operations_by_page.items():
            if page_number < 1 or page_number > document.page_count:
                warnings.append(f"Skipped operations for missing page {page_number}.")
                continue

            page = document.load_page(page_number - 1)
            for operation in page_operations:
                match operation.type:
                    case "replace_text":
                        block = text_lookup.get(operation.block_id or "")
                        if not block:
                            warnings.append("Skipped replace_text because the target block was not found.")
                            continue
                        self._cover_rect(page, block.bounds)
                        self._insert_text(page, block.bounds, operation.text or "", operation.font_size or block.font_size or 12, operation.bold or False, operation.italic or False, operation.underline or False, operation.color)
                    case "move_text":
                        block = text_lookup.get(operation.block_id or "")
                        if not block:
                            warnings.append("Skipped move_text because the target block was not found.")
                            continue
                        self._cover_rect(page, block.bounds)
                        target_bounds = self._operation_bounds(operation, fallback=block.bounds)
                        self._insert_text(page, target_bounds, operation.text or block.text, operation.font_size or block.font_size or 12, operation.bold or False, operation.italic or False, operation.underline or False, operation.color)
                    case "add_overlay_text":
                        target_bounds = self._operation_bounds(operation)
                        self._insert_text(page, target_bounds, operation.text or "", operation.font_size or 12, operation.bold or False, operation.italic or False, operation.underline or False, operation.color)
                    case "replace_image":
                        block = image_lookup.get(operation.block_id or "")
                        if not block:
                            warnings.append("Skipped replace_image because the target block was not found.")
                            continue
                        if not operation.image_data_url:
                            warnings.append("Skipped replace_image because no replacement image was supplied.")
                            continue
                        self._cover_rect(page, block.bounds)
                        page.insert_image(self._rect_from_bounds(block.bounds), stream=_decode_data_url(operation.image_data_url))
                    case "move_image":
                        block = image_lookup.get(operation.block_id or "")
                        if not block:
                            warnings.append("Skipped move_image because the target block was not found.")
                            continue
                        if not block.asset_key:
                            warnings.append("Skipped move_image because the original image bytes were unavailable.")
                            continue
                        
                        asset_bytes = storage_service.read_bytes(user_id, document_id, f"assets/{block.asset_key}")
                        if not asset_bytes:
                            warnings.append("Skipped move_image because the original image bytes could not be retrieved from S3.")
                            continue

                        self._cover_rect(page, block.bounds)
                        target_bounds = self._operation_bounds(operation, fallback=block.bounds)
                        page.insert_image(self._rect_from_bounds(target_bounds), stream=asset_bytes)
                    case "add_overlay_image":
                        if not operation.image_data_url:
                            warnings.append("Skipped add_overlay_image because no image was supplied.")
                            continue
                        target_bounds = self._operation_bounds(operation)
                        page.insert_image(self._rect_from_bounds(target_bounds), stream=_decode_data_url(operation.image_data_url))
                    case _:
                        unsupported_operations.append(operation.type)

        for page_number, rotation in rotations.items():
            if page_number < 1 or page_number > document.page_count:
                warnings.append(f"Skipped rotate_page for missing page {page_number}.")
                continue
            document.load_page(page_number - 1).set_rotation(rotation)

        final_order = self._build_final_order(document.page_count, deleted_pages, reorder_plan, warnings)
        if final_order != list(range(document.page_count)):
            document.select(final_order)

        result_bytes = document.tobytes()
        document.close()

        return result_bytes, warnings, sorted(set(unsupported_operations))

    @staticmethod
    def _cover_rect(page: fitz.Page, bounds: Bounds) -> None:
        rect = fitz.Rect(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)
        page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    @staticmethod
    def _insert_text(page: fitz.Page, bounds: Bounds, text: str, font_size: float, bold: bool = False, italic: bool = False, underline: bool = False, color_hex: str | None = None) -> None:
        rect = fitz.Rect(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)

        # Use correct PostScript Base14 names — PyMuPDF's shorthand aliases
        # ("helvbo", "helvo", "hebo") are NOT built-in and require a font file.
        if bold and italic:
            ps_name = "Helvetica-BoldOblique"
        elif bold:
            ps_name = "Helvetica-Bold"
        elif italic:
            ps_name = "Helvetica-Oblique"
        else:
            ps_name = "Helvetica"

        font = fitz.Font(ps_name)
        fontbuffer = font.buffer

        color = (0, 0, 0)
        if color_hex and len(color_hex) == 7 and color_hex.startswith("#"):
            try:
                r = int(color_hex[1:3], 16) / 255.0
                g = int(color_hex[3:5], 16) / 255.0
                b = int(color_hex[5:7], 16) / 255.0
                color = (r, g, b)
            except ValueError:
                pass

        overflow = page.insert_textbox(
            rect,
            text,
            fontsize=font_size,
            color=color,
            fontname=ps_name,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        if overflow < 0:
            page.insert_text(
                (bounds.x, bounds.y + font_size),
                text,
                fontsize=font_size,
                fontname=ps_name,
                color=color,
            )

        if underline:
            p1 = fitz.Point(bounds.x, bounds.y + bounds.height - 2)
            p2 = fitz.Point(bounds.x + bounds.width, bounds.y + bounds.height - 2)
            page.draw_line(p1, p2, color=color, width=max(1, font_size / 15.0))

    @staticmethod
    def _operation_bounds(operation: EditOperation, fallback: Bounds | None = None) -> Bounds:
        if operation.x is None or operation.y is None:
            if fallback is not None:
                return fallback
            raise ValueError("Operation is missing x/y coordinates.")
        width = operation.width if operation.width is not None else (fallback.width if fallback else 160)
        height = operation.height if operation.height is not None else (fallback.height if fallback else 48)
        return Bounds(x=operation.x, y=operation.y, width=width, height=height)

    @staticmethod
    def _rect_from_bounds(bounds: Bounds) -> fitz.Rect:
        return fitz.Rect(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)

    @staticmethod
    def _build_final_order(
        page_count: int,
        deleted_pages: set[int],
        reorder_plan: list[int] | None,
        warnings: list[str],
    ) -> list[int]:
        remaining_pages = [page_index for page_index in range(page_count) if (page_index + 1) not in deleted_pages]
        if not remaining_pages:
            warnings.append("Ignored delete_page operations because exporting an empty PDF is not supported.")
            return list(range(page_count))
        if not reorder_plan:
            return remaining_pages

        normalized_order: list[int] = []
        seen: set[int] = set()
        for page_number in reorder_plan:
            zero_index = page_number - 1
            if zero_index < 0 or zero_index >= page_count:
                warnings.append(f"Ignored reorder entry for missing page {page_number}.")
                continue
            if page_number in deleted_pages:
                continue
            if zero_index not in seen:
                normalized_order.append(zero_index)
                seen.add(zero_index)

        for page_index in remaining_pages:
            if page_index not in seen:
                normalized_order.append(page_index)
        return normalized_order
