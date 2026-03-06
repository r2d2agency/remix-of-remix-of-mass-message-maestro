import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface ContactList {
  id: string;
  name: string;
  user_id: string;
  contact_count: number;
  connection_id: string | null;
  connection_name: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  list_id: string;
  name: string;
  phone: string;
  is_whatsapp?: boolean | null;
  custom_fields?: Record<string, string>;
  created_at: string;
}

export const useContacts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLists = useCallback(async (): Promise<ContactList[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ContactList[]>('/api/contacts/lists');
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar listas';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createList = useCallback(async (name: string): Promise<ContactList> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ContactList>('/api/contacts/lists', {
        method: 'POST',
        body: { name },
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar lista';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteList = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/contacts/lists/${id}`, { method: 'DELETE' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar lista';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getContacts = useCallback(async (listId: string): Promise<Contact[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Contact[]>(`/api/contacts/lists/${listId}/contacts`);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar contatos';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addContact = useCallback(async (listId: string, name: string, phone: string): Promise<Contact> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Contact>(`/api/contacts/lists/${listId}/contacts`, {
        method: 'POST',
        body: { name, phone },
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar contato';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const importContacts = useCallback(async (listId: string, contacts: { name: string; phone: string; is_whatsapp?: boolean | null }[]): Promise<{ imported: number; duplicates: number }> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ imported: number; duplicates: number }>(`/api/contacts/lists/${listId}/import`, {
        method: 'POST',
        body: { contacts },
      });
      return { imported: data.imported, duplicates: data.duplicates || 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar contatos';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const importContactsBatched = useCallback(async (
    listId: string,
    contacts: { name: string; phone: string; is_whatsapp?: boolean | null }[],
    onProgress?: (progress: number, imported: number, total: number) => void
  ): Promise<{ imported: number; duplicates: number }> => {
    setLoading(true);
    setError(null);
    const BATCH_SIZE = 500;
    let totalImported = 0;
    let totalDuplicates = 0;

    try {
      for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE);
        const data = await api<{ imported: number; duplicates: number }>(`/api/contacts/lists/${listId}/import`, {
          method: 'POST',
          body: { contacts: batch },
        });
        totalImported += data.imported;
        totalDuplicates += (data.duplicates || 0);
        const progress = Math.min(100, Math.round(((i + batch.length) / contacts.length) * 100));
        onProgress?.(progress, totalImported, contacts.length);
      }

      // Verification: count actual contacts in list
      const listContacts = await api<any[]>(`/api/contacts/lists/${listId}/contacts`);
      const actualCount = listContacts.length;

      return { imported: totalImported, duplicates: totalDuplicates };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar contatos';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteContact = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/contacts/${id}`, { method: 'DELETE' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar contato';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateContact = useCallback(async (id: string, updates: { name?: string; phone?: string; is_whatsapp?: boolean }): Promise<Contact> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Contact>(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: updates,
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar contato';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getLists,
    createList,
    deleteList,
    getContacts,
    addContact,
    importContacts,
    importContactsBatched,
    deleteContact,
    updateContact,
  };
};
