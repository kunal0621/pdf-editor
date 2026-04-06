from __future__ import annotations

import shutil
from pathlib import Path

import fitz
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from app.config import settings
from app.engines.open_source import OpenSourceEditorEngine
from app.models.schemas import ApplyResponse, DocumentManifest, ExportResponse, OperationsPayload, UploadResponse
from app.services.extractor import build_manifest
from app.services.storage import storage_service


router = APIRouter()
engine = OpenSourceEditorEngine()


def _document_or_404(document_id: str) -> Path:
    document_dir = storage_service.document_dir(document_id)
    if not document_dir.exists():
        raise HTTPException(status_code=404, detail="Document not found.")
    return document_dir


def _load_manifest(document_id: str) -> DocumentManifest:
    payload = storage_service.read_json(storage_service.manifest_path(document_id))
    return DocumentManifest.model_validate(payload)


def _revised_filename(filename: str) -> str:
    original_path = Path(filename)
    suffix = original_path.suffix or ".pdf"
    return f"{original_path.stem} revised{suffix}"


def _apply_operations_to_working_document(
    document_id: str,
    payload: OperationsPayload,
) -> tuple[DocumentManifest, list[str], list[str]]:
    manifest = _load_manifest(document_id)
    working_path = storage_service.working_path(document_id)
    temp_working_path = storage_service.working_temp_path(document_id)
    warnings, unsupported = engine.apply_operations(
        source_path=working_path,
        export_path=temp_working_path,
        manifest=manifest,
        operations=payload.operations,
        asset_dir=storage_service.asset_dir(document_id),
    )
    shutil.copyfile(temp_working_path, working_path)
    try:
        temp_working_path.unlink(missing_ok=True)
    except PermissionError:
        pass
    updated_manifest = build_manifest(
        document_id=document_id,
        filename=manifest.filename,
        source_path=working_path,
        storage=storage_service,
    )
    storage_service.write_json(
        storage_service.manifest_path(document_id),
        updated_manifest.model_dump(mode="json"),
    )
    storage_service.write_json(storage_service.operations_path(document_id), {"operations": []})
    return updated_manifest, warnings, unsupported


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb}MB limit.")

    document_id = storage_service.create_document_id()
    storage_service.ensure_document_dirs(document_id)
    source_path = storage_service.source_path(document_id)
    working_path = storage_service.working_path(document_id)
    storage_service.write_bytes(source_path, content)
    shutil.copyfile(source_path, working_path)

    manifest = build_manifest(document_id, file.filename, working_path, storage_service)
    storage_service.write_json(storage_service.manifest_path(document_id), manifest.model_dump(mode="json"))
    storage_service.write_json(storage_service.operations_path(document_id), {"operations": []})

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        source_url=manifest.source_url,
        original_source_url=manifest.original_source_url,
        manifest_url=f"/documents/{document_id}/manifest",
        download_url=manifest.download_url,
    )


@router.get("/{document_id}/manifest", response_model=DocumentManifest)
def get_manifest(document_id: str) -> DocumentManifest:
    _document_or_404(document_id)
    return _load_manifest(document_id)


@router.post("/{document_id}/operations", response_model=OperationsPayload)
def save_operations(document_id: str, payload: OperationsPayload) -> OperationsPayload:
    _document_or_404(document_id)
    storage_service.write_json(storage_service.operations_path(document_id), payload.model_dump(mode="json"))
    return payload


@router.post("/{document_id}/apply", response_model=ApplyResponse)
def apply_operations(document_id: str, payload: OperationsPayload) -> ApplyResponse:
    _document_or_404(document_id)
    manifest, warnings, unsupported = _apply_operations_to_working_document(document_id, payload)
    return ApplyResponse(
        document_id=document_id,
        manifest=manifest,
        warnings=warnings,
        unsupported_operations=unsupported,
    )


@router.post("/{document_id}/export", response_model=ExportResponse)
def export_document(document_id: str, payload: OperationsPayload | None = None) -> ExportResponse:
    _document_or_404(document_id)
    warnings: list[str] = []
    unsupported: list[str] = []
    if payload and payload.operations:
        _, warnings, unsupported = _apply_operations_to_working_document(document_id, payload)
    shutil.copyfile(storage_service.working_path(document_id), storage_service.export_path(document_id))
    return ExportResponse(
        document_id=document_id,
        download_url=f"/documents/{document_id}/download",
        warnings=warnings,
        unsupported_operations=unsupported,
    )


@router.get("/{document_id}/source")
def get_source(document_id: str) -> FileResponse:
    _document_or_404(document_id)
    return FileResponse(
        storage_service.working_path(document_id),
        media_type="application/pdf",
        filename="working.pdf",
    )


@router.get("/{document_id}/source/original")
def get_original_source(document_id: str) -> FileResponse:
    _document_or_404(document_id)
    return FileResponse(
        storage_service.source_path(document_id),
        media_type="application/pdf",
        filename="source.pdf",
    )


@router.get("/{document_id}/download")
def get_export(document_id: str) -> FileResponse:
    _document_or_404(document_id)
    export_path = storage_service.export_path(document_id)
    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Export has not been generated yet.")
    manifest = _load_manifest(document_id)
    return FileResponse(
        export_path,
        media_type="application/pdf",
        filename=_revised_filename(manifest.filename),
    )


@router.get("/{document_id}/pages/{page_number}/preview")
def get_page_preview(document_id: str, page_number: int, scale: float = 0.2) -> Response:
    _document_or_404(document_id)
    source_path = storage_service.working_path(document_id)
    document = fitz.open(source_path)
    if page_number < 1 or page_number > document.page_count:
        document.close()
        raise HTTPException(status_code=404, detail="Page not found.")
    page = document.load_page(page_number - 1)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    png_bytes = pixmap.tobytes("png")
    document.close()
    return Response(content=png_bytes, media_type="image/png")


@router.delete("/{document_id}")
def delete_document(document_id: str) -> dict[str, bool]:
    _document_or_404(document_id)
    storage_service.cleanup_document(document_id)
    return {"deleted": True}
