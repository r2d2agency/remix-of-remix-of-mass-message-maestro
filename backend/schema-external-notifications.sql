-- ==========================================
-- External Notification for AI Agents and Group Secretary
-- ==========================================

-- Add external notification fields to ai_agents
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS notify_external_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS notify_external_phone VARCHAR(50);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS notify_external_summary BOOLEAN DEFAULT true;

-- Add external notification fields to group_secretary_config
ALTER TABLE group_secretary_config ADD COLUMN IF NOT EXISTS notify_external_enabled BOOLEAN DEFAULT false;
ALTER TABLE group_secretary_config ADD COLUMN IF NOT EXISTS notify_external_phone VARCHAR(50);
ALTER TABLE group_secretary_config ADD COLUMN IF NOT EXISTS notify_members_whatsapp BOOLEAN DEFAULT false;
ALTER TABLE group_secretary_config ADD COLUMN IF NOT EXISTS default_connection_id UUID;

COMMENT ON COLUMN ai_agents.notify_external_enabled IS 'Envia resumo da conversa para um número externo via WhatsApp';
COMMENT ON COLUMN ai_agents.notify_external_phone IS 'Número do WhatsApp para receber notificações (com DDI, ex: 5511999999999)';
COMMENT ON COLUMN ai_agents.notify_external_summary IS 'Se true, envia resumo da solicitação; se false, envia apenas alerta';
COMMENT ON COLUMN group_secretary_config.notify_external_enabled IS 'Envia notificação de detecções para número externo';
COMMENT ON COLUMN group_secretary_config.notify_external_phone IS 'Número WhatsApp externo para notificações';
COMMENT ON COLUMN group_secretary_config.notify_members_whatsapp IS 'Notifica o responsável detectado via WhatsApp pessoal';
COMMENT ON COLUMN group_secretary_config.default_connection_id IS 'Conexão padrão para envio de notificações WhatsApp';
