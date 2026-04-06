import {
  ApplyResponse,
  DocumentManifest,
  EditOperation,
  ExportResponse,
  UploadResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function toApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path}`;
}

export function listDocuments(): Promise<DocumentManifest[]> {
  return apiFetch<DocumentManifest[]>(`/documents/`);
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Upload failed.");
  }

  return response.json() as Promise<UploadResponse>;
}

export function getManifest(documentId: string): Promise<DocumentManifest> {
  return apiFetch<DocumentManifest>(`/documents/${documentId}/manifest`);
}

export function saveOperations(documentId: string, operations: EditOperation[]) {
  return apiFetch<{ operations: EditOperation[] }>(`/documents/${documentId}/operations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ operations })
  });
}

export function applyDocument(documentId: string, operations: EditOperation[]) {
  return apiFetch<ApplyResponse>(`/documents/${documentId}/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ operations })
  });
}

export function exportDocument(documentId: string) {
  return apiFetch<ExportResponse>(`/documents/${documentId}/export`, {
    method: "POST"
  });
}

export function deleteDocument(documentId: string) {
  return apiFetch<{ deleted: boolean }>(`/documents/${documentId}`, {
    method: "DELETE"
  });
}
