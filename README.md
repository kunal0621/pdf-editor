# PDF Editor

Browser-first PDF editor scaffold with a Next.js frontend and FastAPI backend. The current MVP focuses on:

- Uploading a PDF
- Extracting page/text/image manifests
- Previewing pages and thumbnails
- Queueing edit operations in the browser
- Exporting an edited PDF with an open-source engine

## Workspace Layout

- `web/`: Next.js + TypeScript + Tailwind frontend
- `api/`: FastAPI backend with PyMuPDF-based extraction/export

## Local Setup

### Frontend

```bash
cd web
npm install
npm run dev
```

### Backend

```bash
cd api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Environment

Use `.env.example` as the base for local configuration.

- `NEXT_PUBLIC_API_BASE_URL`: frontend API base URL
- `PDF_EDITOR_DATA_DIR`: backend temp storage root
- `PDF_EDITOR_MAX_UPLOAD_MB`: file size limit
- `PDF_EDITOR_CORS_ORIGINS`: comma-separated allowed origins

## Notes

- This MVP is optimized for common digital PDFs, not every PDF edge case.
- Text replacement uses a safe overlay/redaction strategy for many documents.
- Complex layouts, flattened text, unusual encodings, or scanned PDFs may produce warnings during export.
- The backend is structured around an engine interface so you can swap in Apryse or Nutrient later.

