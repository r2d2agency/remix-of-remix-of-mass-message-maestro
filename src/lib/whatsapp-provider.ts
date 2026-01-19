// WhatsApp Provider - Abstração para suportar múltiplas APIs
// Unifica Evolution API e W-API em uma interface comum

import { evolutionApi, EvolutionConfig, ConnectionState } from "./evolution-api";
import { wapiApi, WApiConfig, WApiConnectionState } from "./wapi-api";

export type WhatsAppProvider = "evolution" | "wapi";

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
  
  // Se tem instanceId e token (sem apiUrl), é W-API
  if (connection.instanceId && connection.token && !connection.apiUrl) {
    return "wapi";
  }
  
  // Caso contrário, assume Evolution
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
    
    if (provider === "wapi") {
      return wapiApi.checkInstanceStatus(toWApiConfig(connection));
    }
    
    return evolutionApi.checkInstanceStatus(toEvolutionConfig(connection));
  },

  async getQRCode(connection: WhatsAppConnection) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.getQRCode(toWApiConfig(connection));
    }
    
    return evolutionApi.getQRCode(toEvolutionConfig(connection));
  },

  async disconnect(connection: WhatsAppConnection) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.disconnect(toWApiConfig(connection));
    }
    
    return evolutionApi.disconnect(toEvolutionConfig(connection));
  },

  async sendText(connection: WhatsAppConnection, phone: string, message: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.sendTextMessage(toWApiConfig(connection), phone, message);
    }
    
    const success = await evolutionApi.sendTextMessage(toEvolutionConfig(connection), phone, message);
    return { success };
  },

  async sendImage(connection: WhatsAppConnection, phone: string, imageUrl: string, caption?: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.sendImageMessage(toWApiConfig(connection), phone, imageUrl, caption);
    }
    
    // Evolution não tem send image direto, seria via sendMedia
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async sendAudio(connection: WhatsAppConnection, phone: string, audioUrl: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.sendAudioMessage(toWApiConfig(connection), phone, audioUrl);
    }
    
    const success = await evolutionApi.sendAudioMessage(toEvolutionConfig(connection), phone, audioUrl);
    return { success };
  },

  async sendVideo(connection: WhatsAppConnection, phone: string, videoUrl: string, caption?: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.sendVideoMessage(toWApiConfig(connection), phone, videoUrl, caption);
    }
    
    // Evolution não tem send video direto
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async sendDocument(connection: WhatsAppConnection, phone: string, documentUrl: string, filename?: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.sendDocumentMessage(toWApiConfig(connection), phone, documentUrl, filename);
    }
    
    // Evolution não tem send document direto
    return { success: false, error: "Não suportado pela Evolution API" };
  },

  async checkNumber(connection: WhatsAppConnection, phone: string) {
    const provider = detectProvider(connection);
    
    if (provider === "wapi") {
      return wapiApi.checkWhatsAppNumber(toWApiConfig(connection), phone);
    }
    
    return evolutionApi.checkWhatsAppNumber(toEvolutionConfig(connection), phone);
  },
};
