import EditorWrapper from "@/components/editor-wrapper";

export default function HomePage() {
  return (
    <main className="min-h-screen w-full px-4 py-4 md:px-6 flex flex-col lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 flex-1 min-h-0">
        <section className="glass-panel flex flex-col rounded-[28px] shadow-panel overflow-hidden flex-1 min-h-0">
          <div className="shrink-0 border-b border-slate-200/80 px-6 py-4">
            <p className="text-xs uppercase tracking-[0.35em] text-teal-700">
              Browser-First PDF Editing
            </p>
            <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  Upload, inspect, and export PDFs with an open-source editing
                  engine.
                </h1>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600 md:text-sm">
                  This MVP separates the editor UI from the mutation engine so
                  you can start open source now and swap to a higher-fidelity
                  SDK later without rebuilding the product.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-100">
                <p>Frontend: Next.js + TypeScript</p>
                <p>Backend: FastAPI + PyMuPDF</p>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <EditorWrapper />
          </div>
        </section>
      </div>
    </main>
  );
}
