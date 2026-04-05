from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from app.config import settings


class StorageService:
    def __init__(self) -> None:
        self.root = settings.data_dir / "documents"
        self.root.mkdir(parents=True, exist_ok=True)

    def create_document_id(self) -> str:
        return uuid.uuid4().hex

    def document_dir(self, document_id: str) -> Path:
        return self.root / document_id

    def ensure_document_dirs(self, document_id: str) -> Path:
        document_dir = self.document_dir(document_id)
        (document_dir / "assets").mkdir(parents=True, exist_ok=True)
        return document_dir

    def source_path(self, document_id: str) -> Path:
        return self.document_dir(document_id) / "source.pdf"

    def export_path(self, document_id: str) -> Path:
        return self.document_dir(document_id) / "export.pdf"

    def manifest_path(self, document_id: str) -> Path:
        return self.document_dir(document_id) / "manifest.json"

    def operations_path(self, document_id: str) -> Path:
        return self.document_dir(document_id) / "operations.json"

    def asset_dir(self, document_id: str) -> Path:
        return self.document_dir(document_id) / "assets"

    def write_bytes(self, path: Path, content: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def write_json(self, path: Path, payload: dict | list) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def read_json(self, path: Path) -> dict | list:
        return json.loads(path.read_text(encoding="utf-8"))

    def cleanup_document(self, document_id: str) -> None:
        shutil.rmtree(self.document_dir(document_id), ignore_errors=True)


storage_service = StorageService()

