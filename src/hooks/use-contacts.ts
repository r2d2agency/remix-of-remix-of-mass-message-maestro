import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface ContactList {
  id: string;
  name: string;
  user_id: string;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  list_id: string;
  name: string;
  phone: string;
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

  const importContacts = useCallback(async (listId: string, contacts: { name: string; phone: string }[]): Promise<number> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ imported: number }>(`/api/contacts/lists/${listId}/import`, {
        method: 'POST',
        body: { contacts },
      });
      return data.imported;
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

  return {
    loading,
    error,
    getLists,
    createList,
    deleteList,
    getContacts,
    addContact,
    importContacts,
    deleteContact,
  };
};
