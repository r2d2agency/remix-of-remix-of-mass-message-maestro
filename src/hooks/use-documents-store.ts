import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

export interface StoredDocument {
  id: string;
  name: string;
  client_name: string;
  client_phone?: string;
  case_name?: string;
  type: string;
  status: 'draft' | 'in_analysis' | 'awaiting_signature' | 'signed' | 'refused' | 'expired' | 'archived';
  created_at: string;
  updated_at: string;
  responsible_name: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  file_data_url?: string;
  signed_at?: string;
  signer_name?: string;
  deal_id?: string;
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function openDocument(doc: StoredDocument) {
  if (!doc.file_data_url) return false;
  const w = window.open();
  if (!w) return false;
  if ((doc.file_type || "").startsWith("image/")) {
    w.document.write(`<title>${doc.name}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${doc.file_data_url}" style="max-width:100%;max-height:100%"/></body>`);
  } else {
    w.location.href = doc.file_data_url;
  }
  return true;
}

export function downloadDocument(doc: StoredDocument) {
  if (!doc.file_data_url) return false;
  const a = document.createElement("a");
  a.href = doc.file_data_url;
  a.download = doc.file_name || doc.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

let documents: StoredDocument[] = [];
const listeners = new Set<() => void>();

async function loadDocuments() {
  try {
    const data = await api<StoredDocument[]>('/api/documents');
    documents = data;
    emit();
  } catch (err) {
    console.error('Error loading documents:', err);
  }
}

// Initial load
if (typeof window !== "undefined") {
  loadDocuments();
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDocuments(filters?: { client_phone?: string; client_name?: string; deal_id?: string }) {
  const allDocs = useSyncExternalStore(subscribe, () => documents, () => documents);
  
  if (!filters) return allDocs;
  
  return allDocs.filter(d => {
    if (filters.deal_id && d.deal_id === filters.deal_id) return true;
    
    // Normalize values for comparison
    const filterPhone = filters.client_phone?.replace(/\D/g, "");
    const docPhone = d.client_phone?.replace(/\D/g, "");
    
    if (filterPhone && docPhone === filterPhone) return true;
    if (filters.client_name && d.client_name === filters.client_name) return true;
    
    return false;
  });
}

export async function addDocument(doc: Omit<StoredDocument, "id" | "created_at" | "updated_at">) {
  try {
    const newDoc = await api<StoredDocument>('/api/documents', {
      method: 'POST',
      body: doc
    });
    // We can either optimistic update or just reload
    documents = [newDoc, ...documents];
    emit();
    return newDoc;
  } catch (err) {
    console.error('Error adding document:', err);
    throw err;
  }
}

export async function updateDocument(id: string, patch: Partial<StoredDocument>) {
  try {
    const updated = await api<StoredDocument>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: patch
    });
    documents = documents.map((d) => (d.id === id ? { ...d, ...updated } : d));
    emit();
    return updated;
  } catch (err) {
    console.error('Error updating document:', err);
    throw err;
  }
}

export async function removeDocument(id: string) {
  try {
    await api(`/api/documents/${id}`, { method: 'DELETE' });
    documents = documents.filter((d) => d.id !== id);
    emit();
    return true;
  } catch (err) {
    console.error('Error removing document:', err);
    throw err;
  }
}

export function refreshDocuments() {
  return loadDocuments();
}
