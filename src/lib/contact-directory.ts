import { api } from "@/lib/api";

export interface ContactDirectoryItem {
  id: string;
  list_id: string;
  name: string;
  phone: string;
  is_whatsapp?: boolean | null;
  created_at: string;
  list_name?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedContacts: ContactDirectoryItem[] | null = null;
let cachedAt = 0;
let pendingRequest: Promise<ContactDirectoryItem[]> | null = null;

const normalizeContact = (contact: ContactDirectoryItem): ContactDirectoryItem => ({
  ...contact,
  name: contact.name?.trim() || contact.phone,
  phone: (contact.phone || '').replace(/\D/g, ''),
});

export async function getContactDirectory(forceRefresh = false): Promise<ContactDirectoryItem[]> {
  const isCacheValid = !forceRefresh && cachedContacts && Date.now() - cachedAt < CACHE_TTL_MS;

  if (isCacheValid) {
    return cachedContacts;
  }

  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = api<ContactDirectoryItem[]>('/api/contacts/directory').then((contacts) => {
    const normalized = contacts
      .map(normalizeContact)
      .filter((contact) => contact.phone);

    cachedContacts = normalized;
    cachedAt = Date.now();
    return normalized;
  }).finally(() => {
    pendingRequest = null;
  });

  return pendingRequest;
}

export function clearContactDirectoryCache() {
  cachedContacts = null;
  cachedAt = 0;
}