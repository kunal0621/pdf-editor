import {
  ApplyResponse,
  DocumentManifest,
  EditOperation,
  ExportResponse,
  UploadResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

import { supabase } from "@/lib/supabase";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
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

import { v4 as uuidv4 } from "uuid";

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    throw new Error("You must be logged in to upload documents.");
  }

  const documentId = uuidv4().replace(/-/g, "");
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-bucket";

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(`${user.id}/${documentId}/source.pdf`, file);

  if (uploadError) {
    throw new Error(uploadError.message || "Failed to upload to Supabase storage.");
  }

  // Register with Backend
  return apiFetch<UploadResponse>("/documents/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      document_id: documentId,
      filename: file.name
    })
  });
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
