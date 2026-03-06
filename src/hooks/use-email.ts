import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Types
export interface SMTPConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  is_active: boolean;
  is_verified: boolean;
  last_verified_at?: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  category: string;
  subject: string;
  body_html: string;
  body_text?: string;
  available_variables: string[];
  is_active: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SMTPStatus {
  configured: boolean;
  source: 'user' | 'organization' | null;
  verified: boolean;
  from_email: string | null;
}

export interface EmailHistory {
  id: string;
  sender_user_id?: string;
  sender_name?: string;
  to_email: string;
  subject: string;
  context_type?: string;
  context_id?: string;
  status: string;
  error_message?: string;
  created_at: string;
}

// SMTP Status (for UI indicators)
export function useSMTPStatus() {
  return useQuery({
    queryKey: ["smtp-status"],
    queryFn: async () => {
      return api<SMTPStatus>("/api/email/smtp/status");
    },
  });
}

// Organization SMTP Config
export function useOrgSMTPConfig() {
  return useQuery({
    queryKey: ["smtp-org-config"],
    queryFn: async () => {
      return api<SMTPConfig | null>("/api/email/smtp/org");
    },
  });
}

// User SMTP Config
export function useUserSMTPConfig() {
  return useQuery({
    queryKey: ["smtp-user-config"],
    queryFn: async () => {
      return api<SMTPConfig | null>("/api/email/smtp/user");
    },
  });
}

// SMTP Config Mutations
export function useSMTPConfigMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const saveOrgConfig = useMutation({
    mutationFn: async (data: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
      from_name: string;
      from_email: string;
      reply_to?: string;
    }) => {
      return api<SMTPConfig>("/api/email/smtp/org", { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-org-config"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "Configuração SMTP salva" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar SMTP", description: error.message, variant: "destructive" });
    },
  });

  const testOrgConfig = useMutation({
    mutationFn: async (testEmail?: string) => {
      return api<{ success: boolean; message: string }>("/api/email/smtp/org/test", {
        method: "POST",
        body: { test_email: testEmail },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smtp-org-config"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "Teste enviado!", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Falha no teste", description: error.message, variant: "destructive" });
    },
  });

  const saveUserConfig = useMutation({
    mutationFn: async (data: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
      from_name: string;
      from_email: string;
      reply_to?: string;
      is_active?: boolean;
    }) => {
      return api<SMTPConfig>("/api/email/smtp/user", { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-user-config"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "Configuração SMTP pessoal salva" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar SMTP", description: error.message, variant: "destructive" });
    },
  });

  const testUserConfig = useMutation({
    mutationFn: async (testEmail?: string) => {
      return api<{ success: boolean; message: string }>("/api/email/smtp/user/test", {
        method: "POST",
        body: { test_email: testEmail },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smtp-user-config"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "Teste enviado!", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Falha no teste", description: error.message, variant: "destructive" });
    },
  });

  return { saveOrgConfig, testOrgConfig, saveUserConfig, testUserConfig };
}

// Email Templates
export function useEmailTemplates(category?: string) {
  return useQuery({
    queryKey: ["email-templates", category],
    queryFn: async () => {
      const params = category ? `?category=${category}` : "";
      return api<EmailTemplate[]>(`/api/email/templates${params}`);
    },
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery({
    queryKey: ["email-template", id],
    queryFn: async () => {
      if (!id) return null;
      return api<EmailTemplate>(`/api/email/templates/${id}`);
    },
    enabled: !!id,
  });
}

export function useEmailTemplateMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createTemplate = useMutation({
    mutationFn: async (data: Partial<EmailTemplate>) => {
      return api<EmailTemplate>("/api/email/templates", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Template criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar template", description: error.message, variant: "destructive" });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...data }: Partial<EmailTemplate> & { id: string }) => {
      return api<EmailTemplate>(`/api/email/templates/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["email-template"] });
      toast({ title: "Template atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar template", description: error.message, variant: "destructive" });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/email/templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Template excluído" });
    },
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}

// Send Email
export function useSendEmail() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      template_id?: string;
      to_email: string;
      to_name?: string;
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body_html?: string;
      body_text?: string;
      variables?: Record<string, string>;
      context_type?: string;
      context_id?: string;
      send_immediately?: boolean;
      attachments?: { name: string; url: string; type: string; size: number }[];
    }) => {
      return api<{ success: boolean; status: string; queue_id: string }>("/api/email/send", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-history"] });
      toast({
        title: data.status === "sent" ? "Email enviado!" : "Email na fila",
        description: data.status === "sent" ? "O email foi enviado com sucesso" : "O email será enviado em breve",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar email", description: error.message, variant: "destructive" });
    },
  });
}

// Email History for context
export function useEmailHistory(contextType: string, contextId: string) {
  return useQuery({
    queryKey: ["email-history", contextType, contextId],
    queryFn: async () => {
      return api<EmailHistory[]>(`/api/email/history/${contextType}/${contextId}`);
    },
    enabled: !!contextType && !!contextId,
  });
}
