-- Blaster SaaS Database Schema v2
-- Hierarquia: Organizations > Users > Connections
-- Integração Asaas para cobrança automática

-- ============================================
-- PARTE 1: ESTRUTURA ORGANIZACIONAL
-- ============================================

-- Roles expandidos
DROP TYPE IF EXISTS app_role CASCADE;
CREATE TYPE app_role AS ENUM ('owner', 'admin', 'manager', 'agent');

-- Organizations (multi-tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization Members (users linked to orgs with roles)
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

-- Update connections to belong to organizations
ALTER TABLE connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Connection Members (which users can access which connections)
CREATE TABLE connection_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_send BOOLEAN DEFAULT true,
    can_manage BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, user_id)
);

-- Update contact_lists to belong to connections (not users)
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id) ON DELETE CASCADE;

-- ============================================
-- PARTE 2: INTEGRAÇÃO ASAAS
-- ============================================

-- Asaas Integrations (one per organization)
CREATE TABLE asaas_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    api_key VARCHAR(500) NOT NULL,
    environment VARCHAR(20) DEFAULT 'sandbox', -- 'sandbox' or 'production'
    webhook_token VARCHAR(255), -- token para validar webhooks
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing Notification Rules (quando enviar cobranças)
CREATE TABLE billing_notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL, -- qual conexão usar para enviar
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL, -- 'before_due', 'on_due', 'after_due'
    days_offset INTEGER NOT NULL DEFAULT 0, -- -3 = 3 dias antes, 0 = no dia, 3 = 3 dias depois
    max_days_overdue INTEGER, -- parar de cobrar após X dias de atraso
    message_template TEXT NOT NULL, -- mensagem com variáveis {{nome}}, {{valor}}, {{vencimento}}, {{link}}
    send_time TIME DEFAULT '09:00', -- horário do envio
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cached Asaas Customers (sincronizado do Asaas)
CREATE TABLE asaas_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    asaas_id VARCHAR(100) NOT NULL, -- ID no Asaas (cus_xxx)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    cpf_cnpj VARCHAR(20),
    external_reference VARCHAR(255), -- referência externa
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, asaas_id)
);

-- Cached Asaas Payments/Boletos (sincronizado do Asaas)
CREATE TABLE asaas_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    asaas_id VARCHAR(100) NOT NULL, -- ID no Asaas (pay_xxx)
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE,
    asaas_customer_id VARCHAR(100) NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    net_value DECIMAL(10, 2),
    due_date DATE NOT NULL,
    billing_type VARCHAR(50) NOT NULL, -- BOLETO, PIX, CREDIT_CARD
    status VARCHAR(50) NOT NULL, -- PENDING, RECEIVED, CONFIRMED, OVERDUE, etc
    payment_link TEXT,
    invoice_url TEXT,
    bank_slip_url TEXT,
    pix_qr_code TEXT,
    pix_copy_paste TEXT,
    description TEXT,
    external_reference VARCHAR(255),
    confirmed_date DATE,
    payment_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, asaas_id)
);

-- Billing Notifications Sent (log de notificações enviadas)
CREATE TABLE billing_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    payment_id UUID REFERENCES asaas_payments(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES billing_notification_rules(id) ON DELETE SET NULL,
    phone VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asaas Webhook Events Log (para debug e auditoria)
CREATE TABLE asaas_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payment_id VARCHAR(100),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PARTE 3: SISTEMA DE CHAT (WhatsApp Web)
-- ============================================

-- Conversations (conversas recebidas/enviadas)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    remote_jid VARCHAR(100) NOT NULL, -- número do contato (5511999999999@s.whatsapp.net)
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL, -- atendente responsável
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, remote_jid)
);

-- Conversation Tags (para classificar conversas)
CREATE TABLE conversation_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

-- Conversation Tag Links
CREATE TABLE conversation_tag_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES conversation_tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (conversation_id, tag_id)
);

-- Chat Messages (histórico de mensagens)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    message_id VARCHAR(100), -- ID da Evolution API
    from_me BOOLEAN DEFAULT false,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL, -- quem enviou (se from_me)
    content TEXT,
    message_type VARCHAR(50) DEFAULT 'text', -- text, image, audio, video, document
    media_url TEXT,
    media_mimetype VARCHAR(100),
    quoted_message_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'sent', -- sent, delivered, read, failed
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PARTE 4: CONTATOS COM JETID
-- ============================================

-- Update contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS jid VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS push_name VARCHAR(255); -- nome salvo no WhatsApp
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- ============================================
-- INDEXES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_members_conn ON connection_members(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_members_user ON connection_members(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_org ON connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_conn ON contact_lists(connection_id);
CREATE INDEX IF NOT EXISTS idx_asaas_integrations_org ON asaas_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_asaas_customers_org ON asaas_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_org ON asaas_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_status ON asaas_payments(status);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_due_date ON asaas_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_billing_notifications_payment ON billing_notifications(payment_id);
CREATE INDEX IF NOT EXISTS idx_conversations_conn ON conversations(connection_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts(jid);
