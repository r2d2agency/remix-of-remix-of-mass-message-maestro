// W-API Service (https://w-api.app)
// API de WhatsApp de terceiros com autenticação Bearer

export interface WApiConfig {
  instanceId: string;
  token: string;
}

export interface WApiConnectionState {
  status: "connected" | "disconnected" | "connecting";
  phoneNumber?: string;
  qrCode?: string;
}

const BASE_URL = "https://api.w-api.app/v1";

export const wapiApi = {
  // Headers padrão para W-API
  getHeaders(token: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  },

  // Verificar status da instância
  async checkInstanceStatus(config: WApiConfig): Promise<WApiConnectionState> {
    try {
      const response = await fetch(
        `${BASE_URL}/instance/status?instanceId=${config.instanceId}`,
        {
          headers: this.getHeaders(config.token),
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao verificar status");
      }

      const data = await response.json();
      
      if (data.connected || data.status === "connected") {
        return {
          status: "connected",
          phoneNumber: data.phoneNumber || data.phone || undefined,
        };
      }

      return { status: "disconnected" };
    } catch (error) {
      console.error("W-API: Erro ao verificar status:", error);
      return { status: "disconnected" };
    }
  },

  // Buscar QR Code
  async getQRCode(config: WApiConfig): Promise<string | null> {
    try {
      const response = await fetch(
        `${BASE_URL}/instance/qrcode?instanceId=${config.instanceId}`,
        {
          headers: this.getHeaders(config.token),
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao buscar QR Code");
      }

      const data = await response.json();
      return data.qrcode || data.base64 || data.qr || null;
    } catch (error) {
      console.error("W-API: Erro ao buscar QR Code:", error);
      return null;
    }
  },

  // Enviar mensagem de texto
  async sendTextMessage(
    config: WApiConfig,
    phone: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch(
        `${BASE_URL}/message/send-text?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
            message: message,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.message || data.error || "Erro ao enviar mensagem" 
        };
      }

      return { 
        success: true, 
        messageId: data.messageId || data.id 
      };
    } catch (error) {
      console.error("W-API: Erro ao enviar texto:", error);
      return { success: false, error: String(error) };
    }
  },

  // Enviar imagem
  async sendImageMessage(
    config: WApiConfig,
    phone: string,
    imageUrl: string,
    caption?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch(
        `${BASE_URL}/message/send-image?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
            image: imageUrl,
            caption: caption || "",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.message || data.error || "Erro ao enviar imagem" 
        };
      }

      return { success: true, messageId: data.messageId || data.id };
    } catch (error) {
      console.error("W-API: Erro ao enviar imagem:", error);
      return { success: false, error: String(error) };
    }
  },

  // Enviar áudio
  async sendAudioMessage(
    config: WApiConfig,
    phone: string,
    audioUrl: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch(
        `${BASE_URL}/message/send-audio?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
            audio: audioUrl,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.message || data.error || "Erro ao enviar áudio" 
        };
      }

      return { success: true, messageId: data.messageId || data.id };
    } catch (error) {
      console.error("W-API: Erro ao enviar áudio:", error);
      return { success: false, error: String(error) };
    }
  },

  // Enviar vídeo
  async sendVideoMessage(
    config: WApiConfig,
    phone: string,
    videoUrl: string,
    caption?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch(
        `${BASE_URL}/message/send-video?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
            video: videoUrl,
            caption: caption || "",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.message || data.error || "Erro ao enviar vídeo" 
        };
      }

      return { success: true, messageId: data.messageId || data.id };
    } catch (error) {
      console.error("W-API: Erro ao enviar vídeo:", error);
      return { success: false, error: String(error) };
    }
  },

  // Enviar documento
  async sendDocumentMessage(
    config: WApiConfig,
    phone: string,
    documentUrl: string,
    filename?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch(
        `${BASE_URL}/message/send-document?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
            document: documentUrl,
            filename: filename || "documento",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.message || data.error || "Erro ao enviar documento" 
        };
      }

      return { success: true, messageId: data.messageId || data.id };
    } catch (error) {
      console.error("W-API: Erro ao enviar documento:", error);
      return { success: false, error: String(error) };
    }
  },

  // Verificar se número é WhatsApp válido
  async checkWhatsAppNumber(
    config: WApiConfig,
    phone: string
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${BASE_URL}/contacts/check-number?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ""),
          }),
        }
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.exists === true || data.isWhatsApp === true;
    } catch (error) {
      console.error("W-API: Erro ao verificar número:", error);
      return false;
    }
  },

  // Desconectar instância
  async disconnect(config: WApiConfig): Promise<boolean> {
    try {
      const response = await fetch(
        `${BASE_URL}/instance/logout?instanceId=${config.instanceId}`,
        {
          method: "POST",
          headers: this.getHeaders(config.token),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("W-API: Erro ao desconectar:", error);
      return false;
    }
  },
};
