from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Settings:
    data_dir: Path = Path(os.getenv("PDF_EDITOR_DATA_DIR", "api/data")).resolve()
    max_upload_mb: int = int(os.getenv("PDF_EDITOR_MAX_UPLOAD_MB", "25"))
    cors_origins_raw: str = os.getenv("PDF_EDITOR_CORS_ORIGINS", "http://localhost:3000")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


settings = Settings()

