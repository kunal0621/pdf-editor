from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.documents import router as documents_router


app = FastAPI(
    title="PDF Editor API",
    version="0.1.0",
    description="Ephemeral PDF upload, extraction, editing, and export API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(documents_router, prefix="/documents", tags=["documents"])

