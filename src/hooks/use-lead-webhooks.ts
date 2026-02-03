import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface LeadWebhook {
  id: string;
  name: string;
  description?: string;
  webhook_token: string;
  is_active: boolean;
  funnel_id?: string;
  stage_id?: string;
  owner_id?: string;
  field_mapping: Record<string, string>;
  default_value: number;
  default_probability: number;
  total_leads: number;
  last_lead_at?: string;
  funnel_name?: string;
  stage_name?: string;
  owner_name?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  request_body: Record<string, any>;
  response_status: number;
  response_message: string;
  deal_id?: string;
  prospect_id?: string;
  source_ip: string;
  user_agent: string;
  created_at: string;
}

export function useLeadWebhooks() {
  return useQuery({
    queryKey: ["lead-webhooks"],
    queryFn: async () => {
      return api<LeadWebhook[]>("/api/lead-webhooks");
    },
  });
}

export function useWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: ["webhook-logs", webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      return api<WebhookLog[]>(`/api/lead-webhooks/${webhookId}/logs`);
    },
    enabled: !!webhookId,
  });
}

export function useLeadWebhookMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createWebhook = useMutation({
    mutationFn: async (data: Partial<LeadWebhook>) => {
      return api<LeadWebhook>("/api/lead-webhooks", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast({ title: "Webhook criado com sucesso" });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LeadWebhook> & { id: string }) => {
      return api<LeadWebhook>(`/api/lead-webhooks/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast({ title: "Webhook atualizado" });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/lead-webhooks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast({ title: "Webhook excluído" });
    },
  });

  const regenerateToken = useMutation({
    mutationFn: async (id: string) => {
      return api<LeadWebhook>(`/api/lead-webhooks/${id}/regenerate-token`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast({ title: "Token regenerado" });
    },
  });

  return { createWebhook, updateWebhook, deleteWebhook, regenerateToken };
}

export function getWebhookUrl(token: string): string {
  const baseUrl = API_URL || window.location.origin;
  return `${baseUrl}/api/lead-webhooks/receive/${token}`;
}
