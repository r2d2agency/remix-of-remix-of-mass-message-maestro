import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface SecretaryConfig {
  id?: string;
  is_active: boolean;
  connection_ids: string[] | null;
  group_jids: string[] | null;
  create_crm_task: boolean;
  show_popup_alert: boolean;
  min_confidence: number;
  ai_provider: string | null;
  ai_model: string | null;
  ai_api_key?: string | null;
  notify_external_enabled?: boolean;
  notify_external_phone?: string;
  notify_members_whatsapp?: boolean;
  default_connection_id?: string | null;
}

export interface SecretaryMember {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string;
  email: string;
  whatsapp_phone: string | null;
  phone: string | null;
  aliases: string[];
  role_description: string | null;
  departments: string[];
  is_active: boolean;
}

export interface SecretaryLog {
  id: string;
  conversation_id: string;
  message_content: string;
  sender_name: string;
  detected_request: string;
  matched_user_id: string | null;
  matched_user_name: string | null;
  confidence: number;
  crm_task_id: string | null;
  alert_id: string | null;
  group_name: string | null;
  processing_time_ms: number;
  created_at: string;
}

export interface AvailableUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface MonitoredGroup {
  id: string;
  remote_jid: string;
  group_name: string;
  connection_id: string;
  connection_name: string;
}

export const useGroupSecretary = () => {
  const [loading, setLoading] = useState(false);

  const getConfig = useCallback(async (): Promise<SecretaryConfig> => {
    const data = await api<SecretaryConfig>('/api/group-secretary/config');
    return data;
  }, []);

  const saveConfig = useCallback(async (config: Partial<SecretaryConfig>): Promise<SecretaryConfig> => {
    const data = await api<SecretaryConfig>('/api/group-secretary/config', {
      method: 'PUT',
      body: config,
    });
    return data;
  }, []);

  const getMembers = useCallback(async (): Promise<SecretaryMember[]> => {
    const data = await api<SecretaryMember[]>('/api/group-secretary/members');
    return data;
  }, []);

  const addMember = useCallback(async (member: {
    user_id: string;
    aliases: string[];
    role_description: string;
    departments: string[];
  }): Promise<SecretaryMember> => {
    const data = await api<SecretaryMember>('/api/group-secretary/members', {
      method: 'POST',
      body: member,
    });
    return data;
  }, []);

  const removeMember = useCallback(async (memberId: string): Promise<void> => {
    await api(`/api/group-secretary/members/${memberId}`, { method: 'DELETE' });
  }, []);

  const getLogs = useCallback(async (limit = 50): Promise<SecretaryLog[]> => {
    const data = await api<SecretaryLog[]>(`/api/group-secretary/logs?limit=${limit}`);
    return data;
  }, []);

  const getAvailableUsers = useCallback(async (): Promise<AvailableUser[]> => {
    const data = await api<AvailableUser[]>('/api/group-secretary/available-users');
    return data;
  }, []);

  const getGroups = useCallback(async (): Promise<MonitoredGroup[]> => {
    const data = await api<MonitoredGroup[]>('/api/group-secretary/groups');
    return data;
  }, []);

  const updateMemberPhone = useCallback(async (userId: string, whatsappPhone: string): Promise<void> => {
    await api(`/api/group-secretary/members/${userId}/phone`, {
      method: 'PUT',
      body: { whatsapp_phone: whatsappPhone },
    });
  }, []);

  return {
    loading,
    setLoading,
    getConfig,
    saveConfig,
    getMembers,
    addMember,
    removeMember,
    getLogs,
    getAvailableUsers,
    getGroups,
    updateMemberPhone,
  };
};
