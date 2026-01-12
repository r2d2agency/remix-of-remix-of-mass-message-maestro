import { useState, useEffect, useCallback } from "react";
import { evolutionApi, EvolutionConfig, ConnectionState } from "@/lib/evolution-api";
import { toast } from "sonner";

export function useEvolution() {
  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "disconnected",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Carregar config salva
  useEffect(() => {
    const savedConfig = evolutionApi.getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
    }
  }, []);

  // Salvar configuração
  const saveConfig = useCallback((newConfig: EvolutionConfig) => {
    evolutionApi.saveConfig(newConfig);
    setConfig(newConfig);
    toast.success("Configuração salva com sucesso!");
  }, []);

  // Verificar status
  const checkStatus = useCallback(async () => {
    if (!config) return;

    setIsLoading(true);
    try {
      const state = await evolutionApi.checkInstanceStatus(config);
      setConnectionState(state);
      
      if (state.status === "connected") {
        setQrCode(null);
      }
    } catch (error) {
      console.error("Erro ao verificar status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Conectar (buscar QR Code)
  const connect = useCallback(async () => {
    if (!config) {
      toast.error("Configure a API primeiro!");
      return;
    }

    setIsLoading(true);
    setConnectionState({ status: "connecting" });

    try {
      // Primeiro tenta criar a instância (ignora erro se já existe)
      await evolutionApi.createInstance(config);

      // Busca o QR Code
      const qr = await evolutionApi.getQRCode(config);
      
      if (qr) {
        setQrCode(qr);
        toast.info("Escaneie o QR Code com seu WhatsApp");
      } else {
        // Verifica se já está conectado
        const state = await evolutionApi.checkInstanceStatus(config);
        setConnectionState(state);
        
        if (state.status === "connected") {
          toast.success("WhatsApp já está conectado!");
        } else {
          toast.error("Não foi possível obter o QR Code");
        }
      }
    } catch (error) {
      toast.error("Erro ao conectar");
      setConnectionState({ status: "disconnected" });
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Desconectar
  const disconnect = useCallback(async () => {
    if (!config) return;

    setIsLoading(true);
    try {
      await evolutionApi.disconnect(config);
      setConnectionState({ status: "disconnected" });
      setQrCode(null);
      toast.success("Desconectado com sucesso!");
    } catch (error) {
      toast.error("Erro ao desconectar");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Atualizar QR Code
  const refreshQRCode = useCallback(async () => {
    if (!config) return;

    setIsLoading(true);
    try {
      const qr = await evolutionApi.getQRCode(config);
      if (qr) {
        setQrCode(qr);
        toast.success("QR Code atualizado!");
      }
    } catch (error) {
      toast.error("Erro ao atualizar QR Code");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Auto-check status quando config muda
  useEffect(() => {
    if (config) {
      checkStatus();
    }
  }, [config, checkStatus]);

  return {
    config,
    connectionState,
    isLoading,
    qrCode,
    saveConfig,
    checkStatus,
    connect,
    disconnect,
    refreshQRCode,
    isConfigured: !!config,
  };
}
