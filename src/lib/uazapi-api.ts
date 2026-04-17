// UAZAPI Service (https://docs.uazapi.com/)
// All requests go through our backend at /api/uazapi/*; this client is a thin wrapper.
import { api } from "./api";

export interface UazapiServer {
  id: string;
  name: string;
  server_url: string;
  is_default: boolean;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UazapiServerInfo {
  available: boolean;
  serverUrl?: string;
  name?: string;
}

export interface UazapiConnectionState {
  status: "connected" | "disconnected" | "connecting";
  phoneNumber?: string;
  qrcode?: string;
  pairingCode?: string;
}

export const uazapiApi = {
  // ----- Super-admin server config -----
  listServers: () => api<UazapiServer[]>("/api/uazapi/servers"),

  createServer: (body: {
    name: string;
    server_url: string;
    admin_token: string;
    is_default?: boolean;
    notes?: string;
  }) =>
    api<UazapiServer>("/api/uazapi/servers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateServer: (id: string, body: Partial<UazapiServer> & { admin_token?: string }) =>
    api<UazapiServer>(`/api/uazapi/servers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteServer: (id: string) =>
    api<{ success: boolean }>(`/api/uazapi/servers/${id}`, { method: "DELETE" }),

  testServer: (id: string) =>
    api<{ ok: boolean; status: number; data: unknown }>(
      `/api/uazapi/servers/${id}/test`,
      { method: "POST" }
    ),

  // ----- Client: server availability + instance lifecycle -----
  serverInfo: () => api<UazapiServerInfo>("/api/uazapi/server-info"),

  createInstance: (name: string) =>
    api<{
      id: string;
      name: string;
      status: string;
      uazapi_token?: string;
      uazapi_instance_name?: string;
    }>("/api/uazapi/instances", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  status: (connectionId: string) =>
    api<UazapiConnectionState>(`/api/uazapi/${connectionId}/status`),

  connect: (connectionId: string, phone?: string) =>
    api<{
      success: boolean;
      qrcode: string | null;
      pairingCode: string | null;
    }>(`/api/uazapi/${connectionId}/connect`, {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  disconnect: (connectionId: string) =>
    api<{ success: boolean }>(`/api/uazapi/${connectionId}/disconnect`, {
      method: "POST",
    }),

  reconfigureWebhook: (connectionId: string, url?: string) =>
    api<{ ok: boolean }>(`/api/uazapi/${connectionId}/reconfigure-webhook`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  remove: (connectionId: string) =>
    api<{ success: boolean }>(`/api/uazapi/${connectionId}`, { method: "DELETE" }),

  // ----- Send actions -----
  sendText: (connectionId: string, phone: string, text: string) =>
    api(`/api/uazapi/${connectionId}/send/text`, {
      method: "POST",
      body: JSON.stringify({ phone, text }),
    }),

  sendMedia: (
    connectionId: string,
    body: {
      phone: string;
      type: "image" | "video" | "document" | "audio" | "ptt" | "sticker";
      fileUrl: string;
      caption?: string;
      filename?: string;
    }
  ) =>
    api(`/api/uazapi/${connectionId}/send/media`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  checkNumbers: (connectionId: string, phones: string[]) =>
    api<{ success: boolean; results: { phone: string; exists: boolean }[] }>(
      `/api/uazapi/${connectionId}/check-number`,
      { method: "POST", body: JSON.stringify({ phones }) }
    ),

  // Webhook audit
  webhookEvents: (connectionId: string) =>
    api<{ events: any[] }>(`/api/uazapi/${connectionId}/webhook-events`),

  // Native UAZAPI features
  listGroups: (connectionId: string) => api(`/api/uazapi/${connectionId}/groups`),
  listLabels: (connectionId: string) => api(`/api/uazapi/${connectionId}/labels`),
  listQuickReplies: (connectionId: string) => api(`/api/uazapi/${connectionId}/quick-replies`),
  listNewsletters: (connectionId: string) => api(`/api/uazapi/${connectionId}/newsletters`),
  listCampaigns: (connectionId: string) => api(`/api/uazapi/${connectionId}/campaigns`),

  createCampaign: (connectionId: string, payload: Record<string, unknown>) =>
    api(`/api/uazapi/${connectionId}/campaigns`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
