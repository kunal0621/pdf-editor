from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

# Try loading from app directory first, then fallback to current directory
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()


@dataclass(slots=True)
class Settings:
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    s3_endpoint_url: str = os.getenv("S3_ENDPOINT_URL", "")
    s3_access_key_id: str = os.getenv("S3_ACCESS_KEY_ID", "")
    s3_secret_access_key: str = os.getenv("S3_SECRET_ACCESS_KEY", "")
    s3_bucket_name: str = os.getenv("S3_BUCKET_NAME", "pdf-bucket")
    s3_region: str = os.getenv("S3_REGION", "us-east-1")
    
    max_upload_mb: int = int(os.getenv("PDF_EDITOR_MAX_UPLOAD_MB", "25"))
    cors_origins_raw: str = os.getenv("PDF_EDITOR_CORS_ORIGINS", "http://localhost:3000")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


settings = Settings()

