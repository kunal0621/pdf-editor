from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from app.models.schemas import DocumentManifest, EditOperation


class EditorEngine(ABC):
    @abstractmethod
    def apply_operations(
        self,
        source_path: Path,
        export_path: Path,
        manifest: DocumentManifest,
        operations: list[EditOperation],
        asset_dir: Path,
    ) -> tuple[list[str], list[str]]:
        raise NotImplementedError

