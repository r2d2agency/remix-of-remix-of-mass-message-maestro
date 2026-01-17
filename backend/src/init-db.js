import { pool } from './db.js';

const schema = `
-- ============================================
-- WHATSALE DATABASE SCHEMA (Auto-migration)
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_superadmin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add is_superadmin column if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Roles enum (use DO block to handle existing type)
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('owner', 'admin', 'manager', 'agent', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- PLANS (SaaS)
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    max_connections INTEGER NOT NULL DEFAULT 1,
    max_monthly_messages INTEGER NOT NULL DEFAULT 1000,
    has_asaas_integration BOOLEAN DEFAULT false,
    has_chat BOOLEAN DEFAULT true,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    billing_period VARCHAR(20) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organizations (multi-tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    asaas_customer_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add plan columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

-- User roles (legacy/global roles)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    UNIQUE (user_id, role)
);

-- Evolution API Connections
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    api_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(500) NOT NULL,
    instance_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'disconnected',
    phone_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Connection Members
CREATE TABLE IF NOT EXISTS connection_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_send BOOLEAN DEFAULT true,
    can_manage BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, user_id)
);

-- Contact Lists
CREATE TABLE IF NOT EXISTS contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID REFERENCES contact_lists(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    jid VARCHAR(100),
    profile_picture_url TEXT,
    push_name VARCHAR(255),
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message Templates
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
    list_id UUID REFERENCES contact_lists(id) ON DELETE SET NULL,
    message_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    min_delay INTEGER DEFAULT 5,
    max_delay INTEGER DEFAULT 15,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Messages Log
CREATE TABLE IF NOT EXISTS campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    phone VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ASAAS INTEGRATION
-- ============================================

-- Asaas Integrations
CREATE TABLE IF NOT EXISTS asaas_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    api_key VARCHAR(500) NOT NULL,
    environment VARCHAR(20) DEFAULT 'sandbox',
    webhook_token VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing Notification Rules
CREATE TABLE IF NOT EXISTS billing_notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    days_offset INTEGER NOT NULL DEFAULT 0,
    max_days_overdue INTEGER,
    message_template TEXT NOT NULL,
    send_time TIME DEFAULT '09:00',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asaas Customers (cached)
CREATE TABLE IF NOT EXISTS asaas_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    asaas_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    cpf_cnpj VARCHAR(20),
    external_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, asaas_id)
);

-- Asaas Payments (cached)
CREATE TABLE IF NOT EXISTS asaas_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    asaas_id VARCHAR(100) NOT NULL,
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE,
    asaas_customer_id VARCHAR(100) NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    net_value DECIMAL(10, 2),
    due_date DATE NOT NULL,
    billing_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
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

-- Billing Notifications Log
CREATE TABLE IF NOT EXISTS billing_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    payment_id UUID REFERENCES asaas_payments(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES billing_notification_rules(id) ON DELETE SET NULL,
    phone VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asaas Webhook Events Log
CREATE TABLE IF NOT EXISTS asaas_webhook_events (
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
-- CHAT SYSTEM
-- ============================================

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    remote_jid VARCHAR(100) NOT NULL,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, remote_jid)
);

-- Conversation Tags
CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

-- Conversation Tag Links
CREATE TABLE IF NOT EXISTS conversation_tag_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES conversation_tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (conversation_id, tag_id)
);

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    message_id VARCHAR(100),
    from_me BOOLEAN DEFAULT false,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    message_type VARCHAR(50) DEFAULT 'text',
    media_url TEXT,
    media_mimetype VARCHAR(100),
    quoted_message_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'sent',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_org ON connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_user_id ON contact_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_conn ON contact_lists(connection_id);
CREATE INDEX IF NOT EXISTS idx_contacts_list_id ON contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts(jid);
CREATE INDEX IF NOT EXISTS idx_message_templates_user_id ON message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(status);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_members_conn ON connection_members(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_members_user ON connection_members(user_id);
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
`;

export async function initDatabase() {
  console.log('🔄 Initializing database...');
  
  try {
    await pool.query(schema);
    console.log('✅ Database initialized successfully!');
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    // Don't throw - allow app to start even if some tables already exist
    return false;
  }
}
