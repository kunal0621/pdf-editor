"use client";

import dynamic from "next/dynamic";

const EditorWorkspaceLive = dynamic(
  () =>
    import("@/components/editor-workspace-live").then(
      (mod) => mod.EditorWorkspaceLive
    ),
  { ssr: false }
);

export default function EditorWrapper() {
  return <EditorWorkspaceLive />;
}
