# PDF Editor

Browser-first PDF editor scaffold with a Next.js frontend and FastAPI backend. The current MVP focuses on:

- Uploading a PDF
- Extracting page/text/image manifests
- Previewing pages and thumbnails
- Queueing edit operations in the browser
- Applying queued changes into a live working PDF for side-by-side preview
- Exporting a downloadable revised PDF only when requested

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

## Run and Debug (VS Code)

This project includes a `.vscode/launch.json` configuration for running and debugging the application directly inside VS Code.

1. Install the **Python** extension (by Microsoft) in VS Code.
2. Ensure you have activated your Python virtual environment in the `api` folder and installed dependencies.
3. Open the **Run and Debug** view (`Ctrl+Shift+D` or `Cmd+Shift+D`).
4. You can select individual configurations:
   - **Next.js: debug server-side**: Runs the frontend.
   - **FastAPI: debug backend**: Runs the backend server.
5. Or run them together by selecting **Debug Full Stack** and hitting `F5`.


## Notes

- This MVP is optimized for common digital PDFs, not every PDF edge case.
- Text replacement uses a safe overlay/redaction strategy for many documents.
- The UI keeps a mutable working PDF. `Apply Changes` updates the preview in place; `Export` generates the download using the original filename plus `revised`.
- Complex layouts, flattened text, unusual encodings, or scanned PDFs may produce warnings during export.
- The backend is structured around an engine interface so you can swap in Apryse or Nutrient later.
