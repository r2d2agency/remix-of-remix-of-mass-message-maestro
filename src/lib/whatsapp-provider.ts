// WhatsApp Provider - Abstração para suportar múltiplas APIs
// Unifica Evolution API, W-API e UAZAPI em uma interface comum

import { evolutionApi, EvolutionConfig, ConnectionState } from "./evolution-api";
import { wapiApi, WApiConfig, WApiConnectionState } from "./wapi-api";
import { uazapiApi } from "./uazapi-api";

export type WhatsAppProvider = "evolution" | "wapi" | "uazapi";

export interface WhatsAppConnection {
  id: string;
  provider: WhatsAppProvider;
  // Evolution API fields
  apiUrl?: string;
  apiKey?: string;
  instanceName?: string;
  // W-API fields
  instanceId?: string;
  token?: string;
  // UAZAPI fields
  uazapiToken?: string;
  uazapiServerUrl?: string;
  uazapiInstanceName?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppProviderInterface {
  checkStatus: (connection: WhatsAppConnection) => Promise<ConnectionState | WApiConnectionState>;
  getQRCode: (connection: WhatsAppConnection) => Promise<string | null>;
  disconnect: (connection: WhatsAppConnection) => Promise<boolean>;
  sendText: (connection: WhatsAppConnection, phone: string, message: string) => Promise<SendMessageResult>;
  sendImage: (connection: WhatsAppConnection, phone: string, imageUrl: string, caption?: string) => Promise<SendMessageResult>;
  sendAudio: (connection: WhatsAppConnection, phone: string, audioUrl: string) => Promise<SendMessageResult>;
  sendVideo: (connection: WhatsAppConnection, phone: string, videoUrl: string, caption?: string) => Promise<SendMessageResult>;
  sendDocument: (connection: WhatsAppConnection, phone: string, documentUrl: string, filename?: string) => Promise<SendMessageResult>;
  checkNumber: (connection: WhatsAppConnection, phone: string) => Promise<boolean>;
}

// Detectar automaticamente o provider baseado nos campos disponíveis
export function detectProvider(connection: WhatsAppConnection): WhatsAppProvider {
  if (connection.provider) {
    return connection.provider;
  }

  // UAZAPI: tem uazapiToken
  if (connection.uazapiToken) {
    return "uazapi";
  }

  // W-API: tem instanceId e token sem apiUrl
  if (connection.instanceId && connection.token && !connection.apiUrl) {
    return "wapi";
  }

  return "evolution";
}

// Converter conexão para config da Evolution
function toEvolutionConfig(connection: WhatsAppConnection): EvolutionConfig {
  return {
    apiUrl: connection.apiUrl || "",
    apiKey: connection.apiKey || "",
    instanceName: connection.instanceName || "",
  };
}

// Converter conexão para config da W-API
function toWApiConfig(connection: WhatsAppConnection): WApiConfig {
  return {
    instanceId: connection.instanceId || "",
    token: connection.token || "",
  };
}

// Provider unificado
export const whatsappProvider: WhatsAppProviderInterface = {
  async checkStatus(connection: WhatsAppConnection) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      return uazapiApi.status(connection.id);
    }
    if (provider === "wapi") {
      return wapiApi.checkInstanceStatus(toWApiConfig(connection));
    }
    return evolutionApi.checkInstanceStatus(toEvolutionConfig(connection));
  },

  async getQRCode(connection: WhatsAppConnection) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      const r = await uazapiApi.connect(connection.id);
      return r.qrcode;
    }
    if (provider === "wapi") {
      return wapiApi.getQRCode(toWApiConfig(connection));
    }
    return evolutionApi.getQRCode(toEvolutionConfig(connection));
  },

  async disconnect(connection: WhatsAppConnection) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      const r = await uazapiApi.disconnect(connection.id);
      return !!r.success;
    }
    if (provider === "wapi") {
      return wapiApi.disconnect(toWApiConfig(connection));
    }
    return evolutionApi.disconnect(toEvolutionConfig(connection));
  },

  async sendText(connection: WhatsAppConnection, phone: string, message: string) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        await uazapiApi.sendText(connection.id, phone, message);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    }
    if (provider === "wapi") {
      return wapiApi.sendTextMessage(toWApiConfig(connection), phone, message);
    }
    const success = await evolutionApi.sendTextMessage(toEvolutionConfig(connection), phone, message);
    return { success };
  },

  async sendImage(connection, phone, imageUrl, caption) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        await uazapiApi.sendMedia(connection.id, { phone, type: "image", fileUrl: imageUrl, caption });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    }
    if (provider === "wapi") {
      return wapiApi.sendImageMessage(toWApiConfig(connection), phone, imageUrl, caption);
    }
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async sendAudio(connection, phone, audioUrl) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        await uazapiApi.sendMedia(connection.id, { phone, type: "ptt", fileUrl: audioUrl });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    }
    if (provider === "wapi") {
      return wapiApi.sendAudioMessage(toWApiConfig(connection), phone, audioUrl);
    }
    const success = await evolutionApi.sendAudioMessage(toEvolutionConfig(connection), phone, audioUrl);
    return { success };
  },

  async sendVideo(connection, phone, videoUrl, caption) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        await uazapiApi.sendMedia(connection.id, { phone, type: "video", fileUrl: videoUrl, caption });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    }
    if (provider === "wapi") {
      return wapiApi.sendVideoMessage(toWApiConfig(connection), phone, videoUrl, caption);
    }
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async sendDocument(connection, phone, documentUrl, filename) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        await uazapiApi.sendMedia(connection.id, {
          phone,
          type: "document",
          fileUrl: documentUrl,
          filename,
        });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    }
    if (provider === "wapi") {
      return wapiApi.sendDocumentMessage(toWApiConfig(connection), phone, documentUrl, filename);
    }
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async checkNumber(connection, phone) {
    const provider = detectProvider(connection);

    if (provider === "uazapi") {
      try {
        const r = await uazapiApi.checkNumbers(connection.id, [phone]);
        return !!r.results?.[0]?.exists;
      } catch {
        return false;
      }
    }
    if (provider === "wapi") {
      return wapiApi.checkWhatsAppNumber(toWApiConfig(connection), phone);
    }
    return evolutionApi.checkWhatsAppNumber(toEvolutionConfig(connection), phone);
  },
};
