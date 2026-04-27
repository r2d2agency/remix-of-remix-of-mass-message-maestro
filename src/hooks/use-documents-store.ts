import { useSyncExternalStore } from "react";

export interface StoredDocument {
  id: string;
  name: string;
  client_name: string;
  case_name?: string;
  type: string;
  status: 'draft' | 'in_analysis' | 'awaiting_signature' | 'signed' | 'refused' | 'expired' | 'archived';
  created_at: string;
  updated_at: string;
  responsible_name: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  signed_at?: string;
  signer_name?: string;
}

const STORAGE_KEY = "legal_gleego_documents_v1";

const seed: StoredDocument[] = [
  {
    id: "seed-1",
    name: "Contrato de Honorários - João Silva",
    client_name: "João Silva",
    case_name: "Processo 001/2024",
    type: "Contrato de honorários",
    status: "awaiting_signature",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    responsible_name: "Dr. Roberto",
  },
  {
    id: "seed-2",
    name: "Procuração Ad Judicia",
    client_name: "Maria Oliveira",
    type: "Procuração",
    status: "signed",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    signed_at: new Date(Date.now() - 86400000).toISOString(),
    signer_name: "Maria Oliveira",
    responsible_name: "Dr. Roberto",
  },
];

function load(): StoredDocument[] {
  if (typeof window === "undefined") return seed;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as StoredDocument[];
  } catch {
    return seed;
  }
}

let documents: StoredDocument[] = load();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDocuments() {
  return useSyncExternalStore(subscribe, () => documents, () => documents);
}

export function addDocument(doc: Omit<StoredDocument, "id" | "created_at" | "updated_at">) {
  const now = new Date().toISOString();
  const newDoc: StoredDocument = {
    ...doc,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };
  documents = [newDoc, ...documents];
  emit();
  return newDoc;
}

export function updateDocument(id: string, patch: Partial<StoredDocument>) {
  documents = documents.map((d) =>
    d.id === id ? { ...d, ...patch, updated_at: new Date().toISOString() } : d
  );
  emit();
}

export function removeDocument(id: string) {
  documents = documents.filter((d) => d.id !== id);
  emit();
}
