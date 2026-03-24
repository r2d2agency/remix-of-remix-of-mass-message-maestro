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
const connectionCache = new Map<string, { contacts: ContactDirectoryItem[]; cachedAt: number }>();
const connectionPendingRequests = new Map<string, Promise<ContactDirectoryItem[]>>();

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

    if (normalized.length > 0 || forceRefresh) {
      cachedContacts = normalized;
      cachedAt = Date.now();
    }
    return normalized;
  }).finally(() => {
    pendingRequest = null;
  });

  return pendingRequest;
}

export async function getConnectionContactDirectory(connectionId: string, forceRefresh = false): Promise<ContactDirectoryItem[]> {
  if (!connectionId) {
    return getContactDirectory(forceRefresh);
  }

  const cached = connectionCache.get(connectionId);
  const isCacheValid = !forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS;

  if (isCacheValid) {
    return cached.contacts;
  }

  const pending = connectionPendingRequests.get(connectionId);
  if (pending) {
    return pending;
  }

  const request = api<ContactDirectoryItem[]>(`/api/chat/contacts?connection=${encodeURIComponent(connectionId)}`)
    .then((contacts) => {
      const normalized = contacts
        .map(normalizeContact)
        .filter((contact) => contact.phone);

      connectionCache.set(connectionId, {
        contacts: normalized,
        cachedAt: Date.now(),
      });

      return normalized;
    })
    .finally(() => {
      connectionPendingRequests.delete(connectionId);
    });

  connectionPendingRequests.set(connectionId, request);
  return request;
}

export function clearContactDirectoryCache() {
  cachedContacts = null;
  cachedAt = 0;
  connectionCache.clear();
  connectionPendingRequests.clear();
}