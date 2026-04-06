import EditorWrapper from "@/components/editor-wrapper";

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <section className="glass-panel overflow-hidden rounded-[28px] shadow-panel">
          <div className="border-b border-slate-200/80 px-6 py-6">
            <p className="text-xs uppercase tracking-[0.35em] text-teal-700">
              Browser-First PDF Editing
            </p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                  Upload, inspect, and export PDFs with an open-source editing
                  engine.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
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
          <EditorWrapper />
        </section>
      </div>
    </main>
  );
}
