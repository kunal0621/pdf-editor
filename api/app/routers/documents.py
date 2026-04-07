from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import fitz

from app.config import settings
from app.engines.open_source import OpenSourceEditorEngine
from app.models.schemas import ApplyResponse, DocumentManifest, ExportResponse, OperationsPayload, UploadResponse
from app.services.extractor import build_manifest
from app.services.storage import storage_service
from app.dependencies import get_current_user


router = APIRouter()
engine = OpenSourceEditorEngine()

class RegisterDocumentRequest(BaseModel):
    document_id: str
    filename: str

def _document_or_404(user_id: str, document_id: str) -> bool:
    if not storage_service.exists(user_id, document_id, "manifest.json"):
        raise HTTPException(status_code=404, detail="Document not found.")
    return True

def _load_manifest(user_id: str, document_id: str) -> DocumentManifest:
    payload = storage_service.read_json(user_id, document_id, "manifest.json")
    return DocumentManifest.model_validate(payload)

def _revised_filename(filename: str) -> str:
    import pathlib
    original_path = pathlib.Path(filename)
    suffix = original_path.suffix or ".pdf"
    return f"{original_path.stem} revised{suffix}"

def _apply_operations_to_working_document(
    user_id: str,
    document_id: str,
    payload: OperationsPayload,
) -> tuple[DocumentManifest, list[str], list[str]]:
    manifest = _load_manifest(user_id, document_id)
    working_bytes = storage_service.read_bytes(user_id, document_id, "working.pdf")
    
    result_bytes, warnings, unsupported = engine.apply_operations(
        source_bytes=working_bytes,
        manifest=manifest,
        operations=payload.operations,
        user_id=user_id,
        document_id=document_id,
    )
    
    storage_service.write_bytes(user_id, document_id, "working.pdf", result_bytes)
    
    updated_manifest = build_manifest(
        user_id=user_id,
        document_id=document_id,
        filename=manifest.filename,
        source_bytes=result_bytes,
        storage=storage_service,
    )
    
    storage_service.write_json(user_id, document_id, "manifest.json", updated_manifest.model_dump(mode="json"))
    storage_service.write_json(user_id, document_id, "operations.json", {"operations": []})
    return updated_manifest, warnings, unsupported

@router.get("/", response_model=list[DocumentManifest])
def list_documents(user_id: str = Depends(get_current_user)) -> list[DocumentManifest]:
    document_ids = storage_service.list_documents(user_id)
    manifests: list[DocumentManifest] = []
    for doc_id in document_ids:
        try:
            manifests.append(_load_manifest(user_id, doc_id))
        except Exception:
            pass
    return manifests

@router.post("/register", response_model=UploadResponse)
def register_document(payload: RegisterDocumentRequest, user_id: str = Depends(get_current_user)) -> UploadResponse:
    # User has uploaded 'source.pdf' to Supabase S3 under user_id/document_id/source.pdf.
    doc_id = payload.document_id
    filename = payload.filename
    source_bytes = storage_service.read_bytes(user_id, doc_id, "source.pdf")
    if not source_bytes:
        raise HTTPException(status_code=404, detail="Source PDF missing from S3 bucket.")
    
    storage_service.write_bytes(user_id, doc_id, "working.pdf", source_bytes)
    
    manifest = build_manifest(user_id, doc_id, filename, source_bytes, storage_service)
    storage_service.write_json(user_id, doc_id, "manifest.json", manifest.model_dump(mode="json"))
    storage_service.write_json(user_id, doc_id, "operations.json", {"operations": []})

    return UploadResponse(
        document_id=doc_id,
        filename=filename,
        source_url=manifest.source_url,
        original_source_url=manifest.original_source_url,
        manifest_url=f"/documents/{doc_id}/manifest",
        download_url=manifest.download_url,
    )

@router.get("/{document_id}/manifest", response_model=DocumentManifest)
def get_manifest(document_id: str, user_id: str = Depends(get_current_user)) -> DocumentManifest:
    _document_or_404(user_id, document_id)
    return _load_manifest(user_id, document_id)


@router.post("/{document_id}/operations", response_model=OperationsPayload)
def save_operations(document_id: str, payload: OperationsPayload, user_id: str = Depends(get_current_user)) -> OperationsPayload:
    _document_or_404(user_id, document_id)
    storage_service.write_json(user_id, document_id, "operations.json", payload.model_dump(mode="json"))
    return payload


@router.post("/{document_id}/apply", response_model=ApplyResponse)
def apply_operations(document_id: str, payload: OperationsPayload, user_id: str = Depends(get_current_user)) -> ApplyResponse:
    _document_or_404(user_id, document_id)
    manifest, warnings, unsupported = _apply_operations_to_working_document(user_id, document_id, payload)
    return ApplyResponse(
        document_id=document_id,
        manifest=manifest,
        warnings=warnings,
        unsupported_operations=unsupported,
    )


@router.post("/{document_id}/export", response_model=ExportResponse)
def export_document(document_id: str, payload: OperationsPayload | None = None, user_id: str = Depends(get_current_user)) -> ExportResponse:
    _document_or_404(user_id, document_id)
    warnings: list[str] = []
    unsupported: list[str] = []
    if payload and payload.operations:
        _, warnings, unsupported = _apply_operations_to_working_document(user_id, document_id, payload)
    
    working_bytes = storage_service.read_bytes(user_id, document_id, "working.pdf")
    storage_service.write_bytes(user_id, document_id, "export.pdf", working_bytes)
    
    return ExportResponse(
        document_id=document_id,
        download_url=f"/documents/{document_id}/download",
        warnings=warnings,
        unsupported_operations=unsupported,
    )


@router.get("/{document_id}/source")
def get_source(document_id: str, user_id: str = Depends(get_current_user)):
    _document_or_404(user_id, document_id)
    url = storage_service.generate_presigned_url(user_id, document_id, "working.pdf")
    return RedirectResponse(url)


@router.get("/{document_id}/source/original")
def get_original_source(document_id: str, user_id: str = Depends(get_current_user)):
    _document_or_404(user_id, document_id)
    url = storage_service.generate_presigned_url(user_id, document_id, "source.pdf")
    return RedirectResponse(url)


@router.get("/{document_id}/download")
def get_export(document_id: str, user_id: str = Depends(get_current_user)):
    _document_or_404(user_id, document_id)
    if not storage_service.exists(user_id, document_id, "export.pdf"):
         raise HTTPException(status_code=404, detail="Export has not been generated yet.")
    url = storage_service.generate_presigned_url(user_id, document_id, "export.pdf")
    return RedirectResponse(url)


@router.get("/{document_id}/pages/{page_number}/preview")
def get_page_preview(document_id: str, page_number: int, scale: float = 0.2, user_id: str = Depends(get_current_user)) -> Response:
    _document_or_404(user_id, document_id)
    source_bytes = storage_service.read_bytes(user_id, document_id, "working.pdf")
    document = fitz.open("pdf", source_bytes)
    if page_number < 1 or page_number > document.page_count:
        document.close()
        raise HTTPException(status_code=404, detail="Page not found.")
    page = document.load_page(page_number - 1)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    png_bytes = pixmap.tobytes("png")
    document.close()
    return Response(content=png_bytes, media_type="image/png")


@router.delete("/{document_id}")
def delete_document(document_id: str, user_id: str = Depends(get_current_user)) -> dict[str, bool]:
    _document_or_404(user_id, document_id)
    storage_service.cleanup_document(user_id, document_id)
    return {"deleted": True}
