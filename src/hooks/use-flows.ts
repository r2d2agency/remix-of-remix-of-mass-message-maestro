import { useState, useCallback } from 'react';
import { API_URL, getAuthToken } from '@/lib/api';

export interface Flow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_enabled: boolean;
  trigger_keywords: string[];
  trigger_match_mode: 'exact' | 'contains' | 'starts_with';
  is_active: boolean;
  is_draft: boolean;
  connection_ids: string[];
  version: number;
  last_edited_by: string | null;
  last_edited_by_name: string | null;
  node_count: number;
  created_at: string;
  updated_at: string;
}

export interface FlowNode {
  id: string;
  flow_id: string;
  node_id: string;
  node_type: string;
  name: string;
  position_x: number;
  position_y: number;
  content: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  flow_id: string;
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  edge_type: string;
}

export interface FlowCanvas {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function useFlows() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  });

  const getFlows = useCallback(async (): Promise<Flow[]> => {
    try {
      const response = await fetch(`${API_URL}/api/flows`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erro ao buscar fluxos');
      return response.json();
    } catch (err) {
      console.error('Get flows error:', err);
      return [];
    }
  }, []);

  const getFlow = useCallback(async (id: string): Promise<Flow | null> => {
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erro ao buscar fluxo');
      return response.json();
    } catch (err) {
      console.error('Get flow error:', err);
      return null;
    }
  }, []);

  const createFlow = useCallback(async (data: Partial<Flow>): Promise<Flow | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/flows`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Erro ao criar fluxo');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFlow = useCallback(async (id: string, data: Partial<Flow>): Promise<Flow | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Erro ao atualizar fluxo');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteFlow = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao deletar fluxo');
      }
      
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFlow = useCallback(async (id: string): Promise<Flow | null> => {
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}/toggle`, {
        method: 'POST',
        headers: getHeaders()
      });
      
      if (!response.ok) throw new Error('Erro ao alternar fluxo');
      return response.json();
    } catch (err) {
      console.error('Toggle flow error:', err);
      return null;
    }
  }, []);

  const duplicateFlow = useCallback(async (id: string): Promise<Flow | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}/duplicate`, {
        method: 'POST',
        headers: getHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao duplicar fluxo');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCanvas = useCallback(async (id: string): Promise<FlowCanvas | null> => {
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}/canvas`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Erro ao buscar canvas');
      return response.json();
    } catch (err) {
      console.error('Get canvas error:', err);
      return null;
    }
  }, []);

  const saveCanvas = useCallback(async (id: string, canvas: { nodes: any[]; edges: any[] }): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/flows/${id}/canvas`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(canvas)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao salvar canvas');
      }
      
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getFlows,
    getFlow,
    createFlow,
    updateFlow,
    deleteFlow,
    toggleFlow,
    duplicateFlow,
    getCanvas,
    saveCanvas
  };
}
