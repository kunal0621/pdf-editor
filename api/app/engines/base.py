from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from app.models.schemas import DocumentManifest, EditOperation


class EditorEngine(ABC):
    @abstractmethod
    def apply_operations(
        self,
        source_bytes: bytes,
        manifest: DocumentManifest,
        operations: list[EditOperation],
        user_id: str,
        document_id: str,
    ) -> tuple[bytes, list[str], list[str]]:
        raise NotImplementedError

