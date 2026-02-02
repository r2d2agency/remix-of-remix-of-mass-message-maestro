import { pool } from './db.js';

// ============================================
// STEP 1: ENUMS (must be first)
// ============================================
const step1Enums = `
DO $$
BEGIN
  -- Create enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('owner', 'admin', 'manager', 'agent', 'user');
  ELSE
    -- Ensure all expected values exist (supports older schemas)
    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'manager';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'agent';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'user';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
`;

// ============================================
// STEP 2: CORE TABLES (no foreign key dependencies)
// ============================================
const step2CoreTables = `
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

-- Plans table (SaaS)
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    max_connections INTEGER NOT NULL DEFAULT 1,
    max_monthly_messages INTEGER NOT NULL DEFAULT 1000,
    max_users INTEGER NOT NULL DEFAULT 5,
    max_supervisors INTEGER NOT NULL DEFAULT 1,
    has_asaas_integration BOOLEAN DEFAULT false,
    has_chat BOOLEAN DEFAULT true,
    has_whatsapp_groups BOOLEAN DEFAULT false,
    has_campaigns BOOLEAN DEFAULT true,
    has_chatbots BOOLEAN DEFAULT true,
    has_scheduled_messages BOOLEAN DEFAULT true,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    billing_period VARCHAR(20) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new plan columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_supervisors INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_whatsapp_groups BOOLEAN DEFAULT false;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_campaigns BOOLEAN DEFAULT true;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_chatbots BOOLEAN DEFAULT true;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_scheduled_messages BOOLEAN DEFAULT true;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS visible_on_signup BOOLEAN DEFAULT false;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 3;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
`;

// ============================================
// STEP 3: ORGANIZATIONS (depends on plans)
// ============================================
const step3Organizations = `
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
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS modules_enabled JSONB DEFAULT '{"campaigns": true, "billing": true, "groups": true, "scheduled_messages": true, "chatbots": true, "chat": true}'::jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;
`;

// ============================================
// STEP 4: USER RELATIONS (depends on users, organizations)
// ============================================
const step4UserRelations = `
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
`;

// ============================================
// STEP 5: CONNECTIONS (depends on users, organizations)
// ============================================
const step5Connections = `
-- WhatsApp Connections (Evolution API + W-API)
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,

    -- Evolution provider fields (nullable because W-API doesn't use them)
    api_url VARCHAR(500),
    api_key VARCHAR(500),
    instance_name VARCHAR(255),

    -- Multi-provider fields
    provider VARCHAR(20) NOT NULL DEFAULT 'evolution',
    instance_id VARCHAR(255),
    wapi_token TEXT,

    status VARCHAR(50) DEFAULT 'disconnected',
    phone_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add organization_id column if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add webhook_url column if not exists
DO $$ BEGIN
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS webhook_url TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- W-API / multi-provider columns (for existing databases)
DO $$ BEGIN
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'evolution';
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS instance_id VARCHAR(255);
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS wapi_token TEXT;
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS show_groups BOOLEAN DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Ensure nullable Evolution-only columns (required by Evolution, but unused by W-API)
DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN api_url DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN api_key DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN instance_name DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

-- Enforce required fields per provider
DO $$
BEGIN
    -- Normalize provider
    UPDATE connections SET provider = 'evolution' WHERE provider IS NULL;

    -- Provider value constraint
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connections_provider_chk') THEN
        ALTER TABLE connections
        ADD CONSTRAINT connections_provider_chk
        CHECK (provider IN ('evolution', 'wapi'));
    END IF;

    -- Required fields per provider constraint
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connections_provider_required_fields_chk') THEN
        ALTER TABLE connections
        ADD CONSTRAINT connections_provider_required_fields_chk
        CHECK (
            (provider = 'wapi' AND instance_id IS NOT NULL AND wapi_token IS NOT NULL)
            OR
            (provider = 'evolution' AND api_url IS NOT NULL AND api_key IS NOT NULL AND instance_name IS NOT NULL)
        );
    END IF;
END $$;


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
`;

// ============================================
// STEP 6: CONTACTS & MESSAGES (depends on users, connections)
// ============================================
const step6ContactsMessages = `
-- Contact Lists
CREATE TABLE IF NOT EXISTS contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add connection_id column if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

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

-- Add missing columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_whatsapp BOOLEAN;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS jid VARCHAR(100);
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS push_name VARCHAR(255);
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Message Templates
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

// ============================================
// STEP 7: CAMPAIGNS (depends on contacts, messages, connections)
// ============================================
const step7Campaigns = `
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
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    min_delay INTEGER DEFAULT 120,
    max_delay INTEGER DEFAULT 300,
    pause_after_messages INTEGER DEFAULT 20,
    pause_duration INTEGER DEFAULT 10,
    random_order BOOLEAN DEFAULT false,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new campaign columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_time VARCHAR(10);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_time VARCHAR(10);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_after_messages INTEGER DEFAULT 20;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_duration INTEGER DEFAULT 10;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS random_order BOOLEAN DEFAULT false;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flow_id UUID;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add foreign key for flow_id if flows table exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'flows') THEN
        BEGIN
            ALTER TABLE campaigns 
            ADD CONSTRAINT campaigns_flow_id_fkey 
            FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE SET NULL;
        EXCEPTION 
            WHEN duplicate_object THEN null;
        END;
    END IF;
END $$;

-- Create index for flow-based campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_flow_id ON campaigns(flow_id);

-- Campaign Messages Log
CREATE TABLE IF NOT EXISTS campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    message_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    phone VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new campaign_messages columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE campaign_messages ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;
    ALTER TABLE campaign_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
`;

// ============================================
// STEP 8: ASAAS INTEGRATION (depends on organizations, connections)
// ============================================
const step8Asaas = `
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
    min_delay INTEGER DEFAULT 120,
    max_delay INTEGER DEFAULT 300,
    pause_after_messages INTEGER DEFAULT 20,
    pause_duration INTEGER DEFAULT 600,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add delay columns if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE billing_notification_rules ADD COLUMN IF NOT EXISTS min_delay INTEGER DEFAULT 120;
    ALTER TABLE billing_notification_rules ADD COLUMN IF NOT EXISTS max_delay INTEGER DEFAULT 300;
    ALTER TABLE billing_notification_rules ADD COLUMN IF NOT EXISTS pause_after_messages INTEGER DEFAULT 20;
    ALTER TABLE billing_notification_rules ADD COLUMN IF NOT EXISTS pause_duration INTEGER DEFAULT 600;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

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
-- ASAAS v3 (advanced billing controls)
-- These columns/tables are required by backend/src/routes/asaas.js
-- ============================================

-- Customer blacklist + pause controls
DO $$ BEGIN
    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false;
    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMP WITH TIME ZONE;

    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN DEFAULT false;
    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused_until TIMESTAMP WITH TIME ZONE;
    ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
    WHEN others THEN null;
END $$;

-- Integration settings (limits/alerts/global pause)
DO $$ BEGIN
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS daily_message_limit_per_customer INTEGER;

    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN DEFAULT false;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused_until TIMESTAMP WITH TIME ZONE;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT;

    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS critical_alert_threshold DECIMAL(10, 2);
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS critical_alert_days INTEGER;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_email TEXT;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_whatsapp BOOLEAN DEFAULT false;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;

    -- Auto-sync settings (for 2AM/8AM CRON jobs)
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN DEFAULT true;
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS sync_time_morning VARCHAR(5) DEFAULT '02:00';
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS check_time_morning VARCHAR(5) DEFAULT '08:00';
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMP WITH TIME ZONE;
    
    -- Webhook configuration
    ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS webhook_url TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
    WHEN others THEN null;
END $$;

-- Daily message count per customer (anti-spam)
CREATE TABLE IF NOT EXISTS billing_daily_message_count (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE NOT NULL,
    day DATE NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (customer_id, day)
);

-- Critical delinquency alerts
CREATE TABLE IF NOT EXISTS billing_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    total_overdue DECIMAL(12, 2),
    days_overdue INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

// ============================================
// STEP 9: CHAT SYSTEM (depends on connections, users, organizations)
// ============================================
const step9Chat = `
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
    is_pinned BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, remote_jid)
);

-- Add is_pinned column if not exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

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
    wa_media_key TEXT,
    quoted_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'sent',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure W-API media key column exists (for existing databases)
DO $$ BEGIN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS wa_media_key TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add sender_name column for group messages (WhatsApp pushName)
DO $$ BEGIN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(50);
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add unique index on message_id to prevent duplicates (excludes temp_ messages)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_id 
  ON chat_messages (message_id) 
  WHERE message_id IS NOT NULL AND message_id NOT LIKE 'temp_%';

-- Backward compatibility: if older DB has quoted_message_id as VARCHAR, convert to UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'quoted_message_id'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE chat_messages
      ALTER COLUMN quoted_message_id TYPE UUID
      USING NULLIF(quoted_message_id, '')::uuid;
  END IF;
EXCEPTION WHEN others THEN
  -- Ignore conversion errors to avoid blocking startup
  NULL;
END $$;

-- Internal Notes (Chat)
CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scheduled Messages (Chat)
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text',
    media_url TEXT,
    media_mimetype VARCHAR(100),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quick Replies (Chat productivity)
CREATE TABLE IF NOT EXISTS quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    shortcut VARCHAR(50),
    category VARCHAR(100),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backward-compatible column adds (older databases may miss columns)
DO $$ BEGIN
    ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS shortcut VARCHAR(50);
    ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS category VARCHAR(100);
    ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
EXCEPTION
    WHEN duplicate_column THEN null;
    WHEN others THEN null;
END $$;

-- Alerts (for scheduled message sent notifications)
CREATE TABLE IF NOT EXISTS user_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'scheduled_message_sent',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Contacts (agenda de contatos para chat - não campanhas)
CREATE TABLE IF NOT EXISTS chat_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    jid VARCHAR(100),
    profile_picture_url TEXT,
    push_name VARCHAR(255),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, phone)
);

-- Backward-compatible column adds for chat_contacts
DO $$ BEGIN
    ALTER TABLE chat_contacts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE chat_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
EXCEPTION
    WHEN duplicate_column THEN null;
    WHEN others THEN null;
END $$;
`;

// ============================================
// STEP 10: SYSTEM SETTINGS
// ============================================
const step10Settings = `
-- System Settings (for branding, logos, etc)
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO system_settings (key, value, description) VALUES
    ('logo_login', NULL, 'Logo da tela de login'),
    ('logo_sidebar', NULL, 'Logo/ícone da sidebar'),
    ('favicon', NULL, 'Favicon do sistema')
ON CONFLICT (key) DO NOTHING;
`;

// ============================================
// STEP 11: INDEXES (last step, non-critical)
// ============================================
const step11Indexes = `
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

CREATE INDEX IF NOT EXISTS idx_billing_alerts_org ON billing_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_unresolved ON billing_alerts(organization_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_billing_daily_msg_customer_day ON billing_daily_message_count(customer_id, day);

CREATE INDEX IF NOT EXISTS idx_conversations_conn ON conversations(connection_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conv ON conversation_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_time ON scheduled_messages(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_quick_replies_org ON quick_replies(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_replies_shortcut_org ON quick_replies(organization_id, shortcut) WHERE shortcut IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_alerts_user_unread ON user_alerts(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_chat_contacts_conn ON chat_contacts(connection_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_phone ON chat_contacts(phone);
`;

// Step 12: Attendance Status
const step12Attendance = `
-- Attendance status columns for conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_attendance_status ON conversations(attendance_status);
CREATE INDEX IF NOT EXISTS idx_conversations_accepted_by ON conversations(accepted_by);
`;

// Step 13: Chatbots System
const step13Chatbots = `
-- Enum para provedor de IA
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM ('gemini', 'openai', 'none');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para modo de operação do chatbot
DO $$ BEGIN
  CREATE TYPE chatbot_mode AS ENUM ('always', 'business_hours', 'outside_hours', 'pre_service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para tipo de nó do fluxo
DO $$ BEGIN
  CREATE TYPE flow_node_type AS ENUM ('start', 'message', 'menu', 'input', 'condition', 'action', 'transfer', 'ai_response', 'end');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela principal de chatbots
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  
  mode chatbot_mode DEFAULT 'always',
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  ai_provider ai_provider DEFAULT 'none',
  ai_model VARCHAR(100),
  ai_api_key TEXT,
  ai_system_prompt TEXT,
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 500,
  
  welcome_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, não entendi. Vou transferir você para um atendente.',
  transfer_after_failures INTEGER DEFAULT 3,
  typing_delay_ms INTEGER DEFAULT 1500,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbots_organization ON chatbots(organization_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_connection ON chatbots(connection_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_active ON chatbots(is_active);

-- Tabela de fluxos do chatbot
CREATE TABLE IF NOT EXISTS chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  
  node_id VARCHAR(50) NOT NULL,
  node_type flow_node_type NOT NULL,
  name VARCHAR(255),
  
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  
  content JSONB DEFAULT '{}',
  next_node_id VARCHAR(50),
  order_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flows_chatbot ON chatbot_flows(chatbot_id);

-- Tabela de sessões do chatbot
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_phone VARCHAR(50) NOT NULL,
  
  current_node_id VARCHAR(50),
  variables JSONB DEFAULT '{}',
  
  is_active BOOLEAN DEFAULT true,
  failure_count INTEGER DEFAULT 0,
  transferred_at TIMESTAMP WITH TIME ZONE,
  transferred_to UUID REFERENCES users(id),
  
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_chatbot ON chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_conversation ON chatbot_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_active ON chatbot_sessions(is_active);

-- Tabela de mensagens do chatbot
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
  
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  content TEXT,
  message_type VARCHAR(20) DEFAULT 'text',
  media_url TEXT,
  
  node_id VARCHAR(50),
  ai_generated BOOLEAN DEFAULT false,
  ai_tokens_used INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON chatbot_messages(session_id);

-- Tabela de estatísticas
CREATE TABLE IF NOT EXISTS chatbot_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  total_sessions INTEGER DEFAULT 0,
  completed_sessions INTEGER DEFAULT 0,
  transferred_sessions INTEGER DEFAULT 0,
  
  total_messages_in INTEGER DEFAULT 0,
  total_messages_out INTEGER DEFAULT 0,
  
  ai_requests INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  
  avg_session_duration_seconds INTEGER,
  avg_messages_per_session DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, date)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_stats_chatbot_date ON chatbot_stats(chatbot_id, date);
`;

// Step 14: Chatbot Permissions
const step14ChatbotPermissions = `
-- Enum para nível de permissão de chatbot
DO $$ BEGIN
  CREATE TYPE chatbot_permission_level AS ENUM ('view', 'edit', 'manage', 'owner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela de múltiplas conexões por chatbot
CREATE TABLE IF NOT EXISTS chatbot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_connections_chatbot ON chatbot_connections(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_connections_connection ON chatbot_connections(connection_id);

-- Tabela de permissões de usuário para chatbots
CREATE TABLE IF NOT EXISTS chatbot_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level chatbot_permission_level NOT NULL DEFAULT 'view',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_permissions_chatbot ON chatbot_permissions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_permissions_user ON chatbot_permissions(user_id);

-- Configuração de permissões por papel (role-based)
CREATE TABLE IF NOT EXISTS chatbot_role_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  
  -- Quais papéis podem fazer o quê
  owner_can_manage BOOLEAN DEFAULT true,
  admin_can_manage BOOLEAN DEFAULT true,
  admin_can_edit BOOLEAN DEFAULT true,
  manager_can_view BOOLEAN DEFAULT true,
  manager_can_edit BOOLEAN DEFAULT false,
  agent_can_view BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_role_settings_chatbot ON chatbot_role_settings(chatbot_id);

-- Migrar connection_id existente para chatbot_connections
INSERT INTO chatbot_connections (chatbot_id, connection_id)
SELECT id, connection_id FROM chatbots WHERE connection_id IS NOT NULL
ON CONFLICT DO NOTHING;
`;

// Step 15: Chatbot Team Assignment & Keywords
const step15ChatbotTeamKeywords = `
-- Atendente padrão do chatbot (recebe transferências)
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS default_agent_id UUID REFERENCES users(id);

-- Palavras-chave para ativação automática do fluxo
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS trigger_keywords TEXT[] DEFAULT '{}';
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS trigger_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chatbots_trigger_keywords ON chatbots USING GIN(trigger_keywords);
CREATE INDEX IF NOT EXISTS idx_chatbots_default_agent ON chatbots(default_agent_id);

-- Tabela de equipe de atendentes do chatbot
CREATE TABLE IF NOT EXISTS chatbot_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_agents_chatbot ON chatbot_agents(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_agents_user ON chatbot_agents(user_id);

-- Sessões de fluxo ativas em conversas (para encaminhamento manual)
CREATE TABLE IF NOT EXISTS conversation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  current_node_id TEXT,
  variables JSONB DEFAULT '{}',
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'transferred')),
  
  UNIQUE(conversation_id) -- apenas um fluxo ativo por conversa
);

CREATE INDEX IF NOT EXISTS idx_conversation_flows_conversation ON conversation_flows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_flows_chatbot ON conversation_flows(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_conversation_flows_status ON conversation_flows(status);
`;

// Step 16: Independent Flows System
const step16IndependentFlows = `
-- Fluxos independentes (separados dos chatbots)
CREATE TABLE IF NOT EXISTS flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Ativação por palavra-chave
  trigger_enabled BOOLEAN DEFAULT false,
  trigger_keywords TEXT[] DEFAULT '{}',
  trigger_match_mode VARCHAR(20) DEFAULT 'exact' CHECK (trigger_match_mode IN ('exact', 'contains', 'starts_with')),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_draft BOOLEAN DEFAULT true,
  
  -- Conexões vinculadas
  connection_ids UUID[] DEFAULT '{}',
  
  -- Metadata
  version INTEGER DEFAULT 1,
  last_edited_by UUID REFERENCES users(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flows_organization ON flows(organization_id);
CREATE INDEX IF NOT EXISTS idx_flows_active ON flows(is_active);
CREATE INDEX IF NOT EXISTS idx_flows_trigger_keywords ON flows USING GIN(trigger_keywords);

-- Nós do fluxo
CREATE TABLE IF NOT EXISTS flow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  
  content JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(flow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow ON flow_nodes(flow_id);

-- Arestas do fluxo (conexões entre nós)
CREATE TABLE IF NOT EXISTS flow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  
  edge_id VARCHAR(100) NOT NULL,
  source_node_id VARCHAR(100) NOT NULL,
  target_node_id VARCHAR(100) NOT NULL,
  source_handle VARCHAR(50),
  target_handle VARCHAR(50),
  
  label VARCHAR(255),
  edge_type VARCHAR(50) DEFAULT 'default',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(flow_id, edge_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_edges_flow ON flow_edges(flow_id);

-- Sessões de execução do fluxo (necessário para continuar após Input/Menu via webhooks)
CREATE TABLE IF NOT EXISTS flow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_phone VARCHAR(50) NOT NULL,

  -- Estado atual
  current_node_id VARCHAR(100) NOT NULL DEFAULT 'start',
  variables JSONB DEFAULT '{}'::jsonb,

  -- Controle
  is_active BOOLEAN DEFAULT true,
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Backward/forward compatibility (for existing DBs)
DO $$ BEGIN
  ALTER TABLE flow_sessions ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  ALTER TABLE flow_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Apenas uma sessão ativa por conversa (permite ON CONFLICT (conversation_id) WHERE is_active = true)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_flow_sessions_active_conversation
  ON flow_sessions(conversation_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow ON flow_sessions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_conversation ON flow_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_active ON flow_sessions(is_active);

-- Histórico de versões do fluxo
CREATE TABLE IF NOT EXISTS flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  
  nodes_data JSONB NOT NULL,
  edges_data JSONB NOT NULL,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_flow_versions_flow ON flow_versions(flow_id);

-- Vincular chatbot a um fluxo
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS linked_flow_id UUID REFERENCES flows(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chatbots_linked_flow ON chatbots(linked_flow_id);
`;

// Step 18: CRM System
const step18CRM = `
-- CRM User Groups
CREATE TABLE IF NOT EXISTS crm_user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS crm_user_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES crm_user_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    is_supervisor BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- CRM Funnels
CREATE TABLE IF NOT EXISTS crm_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS crm_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID REFERENCES crm_funnels(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    position INTEGER NOT NULL DEFAULT 0,
    inactivity_hours INTEGER DEFAULT 24,
    inactivity_color VARCHAR(20) DEFAULT '#ef4444',
    is_final BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Companies
CREATE TABLE IF NOT EXISTS crm_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Deals
CREATE TABLE IF NOT EXISTS crm_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    funnel_id UUID REFERENCES crm_funnels(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    group_id UUID REFERENCES crm_user_groups(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    value DECIMAL(15, 2) DEFAULT 0,
    probability INTEGER DEFAULT 50,
    expected_close_date DATE,
    status VARCHAR(20) DEFAULT 'open',
    won_at TIMESTAMP WITH TIME ZONE,
    lost_at TIMESTAMP WITH TIME ZONE,
    lost_reason TEXT,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_deal_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    role VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(deal_id, contact_id)
);

CREATE TABLE IF NOT EXISTS crm_deal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    from_value TEXT,
    to_value TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
    company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'task',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date TIMESTAMP WITH TIME ZONE,
    reminder_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Indexes
CREATE INDEX IF NOT EXISTS idx_crm_user_groups_org ON crm_user_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_group_members_group ON crm_user_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_group_members_user ON crm_user_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_funnels_org ON crm_funnels(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_funnel ON crm_stages(funnel_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_org ON crm_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_org ON crm_deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_funnel ON crm_deals(funnel_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_activity ON crm_deals(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_crm_deal_contacts_deal ON crm_deal_contacts(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON crm_deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org ON crm_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal ON crm_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);
`;

// Step 19: CRM Configuration (Task Types, Segments, Custom Fields)
const step19CRMConfig = `
-- Task Types (Global + Organization-specific)
CREATE TABLE IF NOT EXISTS crm_task_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'check-square',
    color VARCHAR(20) DEFAULT '#6366f1',
    is_global BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Segments/Tags for Deals
CREATE TABLE IF NOT EXISTS crm_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    description TEXT,
    is_global BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deal Segments (Many-to-Many)
CREATE TABLE IF NOT EXISTS crm_deal_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    segment_id UUID REFERENCES crm_segments(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(deal_id, segment_id)
);

-- Custom Fields Definition
CREATE TABLE IF NOT EXISTS crm_custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- 'deal', 'company', 'task'
    field_name VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) DEFAULT 'text', -- text, number, date, select, multiselect, boolean
    options JSONB, -- for select/multiselect
    is_required BOOLEAN DEFAULT false,
    is_global BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_task_types_org ON crm_task_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_segments_org ON crm_segments(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_segments_deal ON crm_deal_segments(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_segments_segment ON crm_deal_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_org ON crm_custom_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_entity ON crm_custom_fields(entity_type);

-- Insert default global task types
INSERT INTO crm_task_types (name, icon, color, is_global, position) VALUES
    ('Tarefa', 'check-square', '#6366f1', true, 0),
    ('Ligação', 'phone', '#22c55e', true, 1),
    ('E-mail', 'mail', '#f59e0b', true, 2),
    ('Reunião', 'calendar', '#8b5cf6', true, 3),
    ('WhatsApp', 'message-circle', '#25d366', true, 4),
    ('Follow-up', 'repeat', '#ec4899', true, 5)
ON CONFLICT DO NOTHING;

-- Loss Reasons (motivos de perda)
CREATE TABLE IF NOT EXISTS crm_loss_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    position INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_loss_reasons_org ON crm_loss_reasons(organization_id);

-- Add loss_reason_id to crm_deals if not exists
DO $$ BEGIN
    ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS loss_reason_id UUID REFERENCES crm_loss_reasons(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Insert default loss reasons
INSERT INTO crm_loss_reasons (name, description, is_active, position) VALUES
    ('Preço muito alto', 'Cliente achou o valor elevado para o orçamento disponível', true, 0),
    ('Optou pela concorrência', 'Cliente escolheu um concorrente', true, 1),
    ('Sem orçamento', 'Cliente não possui verba disponível no momento', true, 2),
    ('Timing inadequado', 'O momento não é propício para a compra', true, 3),
    ('Não respondeu', 'Cliente parou de responder às tentativas de contato', true, 4),
    ('Mudança de prioridades', 'O projeto/necessidade deixou de ser prioridade', true, 5),
    ('Proposta não atende', 'Produto/serviço não atende às necessidades do cliente', true, 6)
ON CONFLICT DO NOTHING;
`;

// Step 17: Departments / Queues System (depends on organizations, users, conversations)
// NOTE: This was previously defined only in a standalone SQL file, but not executed
// during initDatabase(). If the tables don't exist, /api/departments will 500.
const step17Departments = `
-- Schema para sistema de Filas/Departamentos de Atendimento
-- Cada organização pode ter múltiplos departamentos
-- Cada usuário pode pertencer a múltiplos departamentos

-- Tabela de departamentos/filas
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(50) DEFAULT 'users',

  is_active BOOLEAN DEFAULT true,

  max_concurrent_chats INTEGER DEFAULT 5,
  auto_assign BOOLEAN DEFAULT false,

  business_hours_enabled BOOLEAN DEFAULT false,
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

  welcome_message TEXT,
  offline_message TEXT,
  queue_message TEXT DEFAULT 'Você está na fila de espera. Em breve um atendente irá te atender.',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, name)
);

-- Índices para departments
CREATE INDEX IF NOT EXISTS idx_departments_organization ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

-- Tabela de membros do departamento (relação N:N entre users e departments)
CREATE TABLE IF NOT EXISTS department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role VARCHAR(20) DEFAULT 'agent' CHECK (role IN ('supervisor', 'agent')),

  is_available BOOLEAN DEFAULT true,
  current_chats INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(department_id, user_id)
);

-- Índices para department_members
CREATE INDEX IF NOT EXISTS idx_department_members_department ON department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_department_members_user ON department_members(user_id);
CREATE INDEX IF NOT EXISTS idx_department_members_available ON department_members(is_available);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_department_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_departments_updated_at ON departments;
CREATE TRIGGER trigger_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_department_updated_at();
`;

// Step 17b: Add department_id to conversations (separate step to avoid dependency issues)
const step17bDepartmentConversations = `
-- Adicionar coluna de departamento na tabela de conversas (se não existir)
DO $$ BEGIN
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN undefined_table THEN null;
  WHEN undefined_column THEN null;
END $$;

-- Índice para buscar conversas por departamento
CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department_id);
`;

// Step 20: CRM Migrations (additional columns)
const step20CRMMigrations = `
-- Add has_crm to plans table
DO $$ BEGIN
  ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_crm BOOLEAN DEFAULT true;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add segment_id to crm_companies (linking company to a segment)
DO $$ BEGIN
  ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES crm_segments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
  WHEN undefined_table THEN null;
END $$;

-- Index for segment lookup on companies
CREATE INDEX IF NOT EXISTS idx_crm_companies_segment ON crm_companies(segment_id);
`;

// Step 21: CRM Prospects
const step21Prospects = `
-- Prospects table for simple lead management before conversion to deals
CREATE TABLE IF NOT EXISTS crm_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(50),
    address TEXT,
    zip_code VARCHAR(20),
    is_company BOOLEAN DEFAULT false,
    custom_fields JSONB DEFAULT '{}',
    converted_at TIMESTAMP WITH TIME ZONE,
    converted_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, phone)
);

-- Add new columns if not exists
DO $$ BEGIN
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS city VARCHAR(100);
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS state VARCHAR(50);
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS is_company BOOLEAN DEFAULT false;
    ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS email VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Indexes for prospects
CREATE INDEX IF NOT EXISTS idx_crm_prospects_org ON crm_prospects(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_phone ON crm_prospects(phone);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_converted ON crm_prospects(converted_at);

-- Prospect custom field definitions per organization
CREATE TABLE IF NOT EXISTS crm_prospect_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) DEFAULT 'text',
    is_required BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_prospect_fields_org ON crm_prospect_fields(organization_id);
`;

// ============================================
// STEP 22: CRM AUTOMATION
// ============================================
const step22CRMAutomation = `
-- CRM Stage Automations (one per stage)
CREATE TABLE IF NOT EXISTS crm_stage_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID REFERENCES crm_stages(id) ON DELETE CASCADE NOT NULL UNIQUE,
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    wait_hours INTEGER NOT NULL DEFAULT 24,
    next_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    fallback_funnel_id UUID REFERENCES crm_funnels(id) ON DELETE SET NULL,
    fallback_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    execute_immediately BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Deal Automations (active automation per deal)
CREATE TABLE IF NOT EXISTS crm_deal_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES crm_stages(id) ON DELETE CASCADE NOT NULL,
    automation_id UUID REFERENCES crm_stage_automations(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending',
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    flow_session_id UUID,
    flow_sent_at TIMESTAMP WITH TIME ZONE,
    wait_until TIMESTAMP WITH TIME ZONE,
    responded_at TIMESTAMP WITH TIME ZONE,
    moved_at TIMESTAMP WITH TIME ZONE,
    next_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    contact_phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Automation Logs
CREATE TABLE IF NOT EXISTS crm_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_automation_id UUID REFERENCES crm_deal_automations(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for CRM Automation
CREATE INDEX IF NOT EXISTS idx_crm_stage_automations_stage ON crm_stage_automations(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_automations_flow ON crm_stage_automations(flow_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_deal ON crm_deal_automations(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_status ON crm_deal_automations(status);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_wait ON crm_deal_automations(wait_until);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_phone ON crm_deal_automations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_crm_automation_logs_deal ON crm_automation_logs(deal_id);
`;

// ============================================
// STEP 23: EMAIL SYSTEM
// ============================================
const step23Email = `
-- Email SMTP configs (organization level)
CREATE TABLE IF NOT EXISTS email_smtp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 587,
    secure BOOLEAN DEFAULT true,
    username VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email SMTP configs (user level - overrides org)
CREATE TABLE IF NOT EXISTS email_user_smtp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 587,
    secure BOOLEAN DEFAULT true,
    username VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'general',
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    available_variables TEXT[] DEFAULT ARRAY['nome', 'email', 'telefone', 'empresa'],
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email queue
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    to_email VARCHAR(255) NOT NULL,
    to_name VARCHAR(255),
    cc TEXT[],
    bcc TEXT[],
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    context_type VARCHAR(50),
    context_id UUID,
    variables JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email history
CREATE TABLE IF NOT EXISTS email_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    queue_id UUID REFERENCES email_queue(id) ON DELETE SET NULL,
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    context_type VARCHAR(50),
    context_id UUID,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for email system
CREATE INDEX IF NOT EXISTS idx_email_smtp_configs_org ON email_smtp_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_user_smtp_configs_user ON email_user_smtp_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_history_org ON email_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_history_context ON email_history(context_type, context_id);
`;

// ============================================
// STEP 24: GOOGLE CALENDAR INTEGRATION
// ============================================
const step24GoogleCalendar = `
-- Google OAuth tokens
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT,
    google_email VARCHAR(255),
    google_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Calendar events mapping
CREATE TABLE IF NOT EXISTS google_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE CASCADE,
    crm_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    google_event_id VARCHAR(255) NOT NULL,
    google_calendar_id VARCHAR(255) DEFAULT 'primary',
    event_summary VARCHAR(500),
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    meet_link VARCHAR(500),
    sync_status VARCHAR(20) DEFAULT 'synced',
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, crm_task_id)
);

-- Add new columns if not exists (migration for existing databases)
DO $$ BEGIN
    ALTER TABLE google_calendar_events ADD COLUMN IF NOT EXISTS event_summary VARCHAR(500);
    ALTER TABLE google_calendar_events ADD COLUMN IF NOT EXISTS event_start TIMESTAMP WITH TIME ZONE;
    ALTER TABLE google_calendar_events ADD COLUMN IF NOT EXISTS event_end TIMESTAMP WITH TIME ZONE;
    ALTER TABLE google_calendar_events ADD COLUMN IF NOT EXISTS meet_link VARCHAR(500);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add unique constraint on google_event_id if not exists
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'google_calendar_events_user_id_google_event_id_key'
    ) THEN
        ALTER TABLE google_calendar_events ADD CONSTRAINT google_calendar_events_user_id_google_event_id_key UNIQUE (user_id, google_event_id);
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_oauth_user ON google_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_user ON google_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_task ON google_calendar_events(crm_task_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_deal ON google_calendar_events(crm_deal_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_start ON google_calendar_events(event_start);
`;

// ============================================
// STEP 25: AI AGENTS MODULE
// ============================================
const step25AIAgents = `
-- Enum for AI provider
DO $$ BEGIN
  CREATE TYPE agent_ai_provider AS ENUM ('openai', 'gemini');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum for knowledge source type
DO $$ BEGIN
  CREATE TYPE knowledge_source_type AS ENUM ('file', 'url', 'text');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum for processing status
DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum for agent capabilities
DO $$ BEGIN
  CREATE TYPE agent_capability AS ENUM (
    'respond_messages',
    'read_files',
    'schedule_meetings',
    'create_deals',
    'suggest_actions',
    'generate_content',
    'summarize_history',
    'qualify_leads',
    'manage_tasks',
    'google_calendar'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add new enum values if they don't exist
DO $$ BEGIN
  ALTER TYPE agent_capability ADD VALUE IF NOT EXISTS 'manage_tasks';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE agent_capability ADD VALUE IF NOT EXISTS 'google_calendar';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AI Agents main table
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  ai_provider agent_ai_provider NOT NULL DEFAULT 'openai',
  ai_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  ai_api_key TEXT,
  system_prompt TEXT NOT NULL DEFAULT 'Você é um assistente virtual prestativo e profissional.',
  personality_traits JSONB DEFAULT '[]',
  language VARCHAR(10) DEFAULT 'pt-BR',
  temperature DECIMAL(2,1) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1000,
  context_window INTEGER DEFAULT 10,
  capabilities agent_capability[] DEFAULT ARRAY['respond_messages']::agent_capability[],
  greeting_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, não consegui entender. Pode reformular sua pergunta?',
  handoff_message TEXT DEFAULT 'Vou transferir você para um atendente humano.',
  handoff_keywords TEXT[] DEFAULT ARRAY['humano', 'atendente', 'pessoa'],
  auto_handoff_after_failures INTEGER DEFAULT 3,
  default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  default_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lead_scoring_criteria JSONB DEFAULT '{}',
  auto_create_deal_funnel_id UUID,
  auto_create_deal_stage_id UUID,
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  satisfaction_score DECIMAL(3,2),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Calendar connection for agents (which user's calendar to use)
DO $$ BEGIN
  ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS google_calendar_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Knowledge sources
CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  source_type knowledge_source_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_content TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  original_filename VARCHAR(255),
  status processing_status DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  chunk_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge chunks for RAG
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  token_count INTEGER,
  char_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent sessions
CREATE TABLE IF NOT EXISTS ai_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_phone VARCHAR(50),
  contact_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  context_variables JSONB DEFAULT '{}',
  lead_score INTEGER,
  qualification_data JSONB DEFAULT '{}',
  handoff_requested BOOLEAN DEFAULT false,
  handoff_at TIMESTAMP WITH TIME ZONE,
  handoff_to_user_id UUID REFERENCES users(id),
  handoff_reason TEXT,
  message_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Agent messages
CREATE TABLE IF NOT EXISTS ai_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  media_type VARCHAR(50),
  media_url TEXT,
  knowledge_sources_used UUID[],
  context_chunks JSONB,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  tool_calls JSONB,
  tool_results JSONB,
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_comment TEXT,
  processing_time_ms INTEGER,
  model_used VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prompt templates
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent connections (WhatsApp)
CREATE TABLE IF NOT EXISTS ai_agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  mode VARCHAR(50) DEFAULT 'always',
  trigger_keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, connection_id)
);

-- Agent statistics
CREATE TABLE IF NOT EXISTS ai_agent_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_sessions INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  handoff_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  positive_feedback_count INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,
  deals_created INTEGER DEFAULT 0,
  meetings_scheduled INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, date)
);

-- Add tasks_created column if not exists
DO $$ BEGIN
  ALTER TABLE ai_agent_stats ADD COLUMN IF NOT EXISTS tasks_created INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Indexes for AI Agents
CREATE INDEX IF NOT EXISTS idx_ai_agents_organization ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON ai_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sources_agent ON ai_knowledge_sources(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sources_status ON ai_knowledge_sources(status);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_source ON ai_knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_agent ON ai_agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_conversation ON ai_agent_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_active ON ai_agent_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_agent_messages_session ON ai_agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_organization ON ai_prompt_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_connections_agent ON ai_agent_connections(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_connections_connection ON ai_agent_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_stats_agent_date ON ai_agent_stats(agent_id, date);

-- Add has_ai_agents to plans if not exists
DO $$ BEGIN
  ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_ai_agents BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Add ai_agents to organizations modules_enabled
UPDATE organizations 
SET modules_enabled = modules_enabled || '{"ai_agents": true}'::jsonb
WHERE modules_enabled IS NOT NULL 
  AND NOT (modules_enabled ? 'ai_agents');
`;

// ============================================
// STEP 26: EXTERNAL FORMS
// ============================================
const step26ExternalForms = `
-- Form definitions table
CREATE TABLE IF NOT EXISTS external_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(20) DEFAULT '#6366f1',
  background_color VARCHAR(20) DEFAULT '#ffffff',
  text_color VARCHAR(20) DEFAULT '#1f2937',
  button_text VARCHAR(100) DEFAULT 'Enviar',
  welcome_message TEXT DEFAULT 'Olá! Vamos começar?',
  
  -- Post-submission config
  thank_you_message TEXT DEFAULT 'Obrigado pelo contato! Em breve entraremos em contato.',
  redirect_url TEXT,
  trigger_flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  
  -- Stats
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, slug)
);

-- Form fields (customizable per form)
CREATE TABLE IF NOT EXISTS external_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES external_forms(id) ON DELETE CASCADE,
  
  field_key VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) DEFAULT 'text',
  placeholder TEXT,
  is_required BOOLEAN DEFAULT false,
  validation_regex TEXT,
  options JSONB,
  position INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(form_id, field_key)
);

-- Form submissions (leads captured)
CREATE TABLE IF NOT EXISTS external_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES external_forms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Core captured data
  data JSONB NOT NULL DEFAULT '{}',
  
  -- Extracted standard fields for easy querying
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  
  -- Tracking
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  
  -- Integration status
  prospect_id UUID REFERENCES crm_prospects(id),
  contact_id UUID REFERENCES chat_contacts(id),
  flow_session_id UUID,
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_external_forms_org ON external_forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_external_forms_slug ON external_forms(slug);
CREATE INDEX IF NOT EXISTS idx_external_forms_active ON external_forms(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_external_form_fields_form ON external_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_external_form_submissions_form ON external_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_external_form_submissions_org ON external_form_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_external_form_submissions_phone ON external_form_submissions(phone);
CREATE INDEX IF NOT EXISTS idx_external_form_submissions_created ON external_form_submissions(created_at DESC);
`;

// Migration steps in order of execution
const migrationSteps = [
  { name: 'Enums', sql: step1Enums, critical: true },
  { name: 'Core Tables (users, plans)', sql: step2CoreTables, critical: true },
  { name: 'Organizations', sql: step3Organizations, critical: true },
  { name: 'User Relations', sql: step4UserRelations, critical: true },
  { name: 'Connections', sql: step5Connections, critical: true },
  { name: 'Contacts & Messages', sql: step6ContactsMessages, critical: false },
  { name: 'Campaigns', sql: step7Campaigns, critical: false },
  { name: 'Asaas Integration', sql: step8Asaas, critical: false },
  { name: 'Chat System', sql: step9Chat, critical: false },
  { name: 'System Settings', sql: step10Settings, critical: false },
  { name: 'Indexes', sql: step11Indexes, critical: false },
  { name: 'Attendance Status', sql: step12Attendance, critical: false },
  { name: 'Departments / Queues', sql: step17Departments, critical: false },
  { name: 'Departments Conversations Link', sql: step17bDepartmentConversations, critical: false },
  { name: 'Chatbots System', sql: step13Chatbots, critical: false },
  { name: 'Chatbot Permissions', sql: step14ChatbotPermissions, critical: false },
  { name: 'Chatbot Team & Keywords', sql: step15ChatbotTeamKeywords, critical: false },
  { name: 'Independent Flows', sql: step16IndependentFlows, critical: false },
  { name: 'CRM System', sql: step18CRM, critical: false },
  { name: 'CRM Config', sql: step19CRMConfig, critical: false },
  { name: 'CRM Migrations', sql: step20CRMMigrations, critical: false },
  { name: 'CRM Prospects', sql: step21Prospects, critical: false },
  { name: 'CRM Automation', sql: step22CRMAutomation, critical: false },
  { name: 'Email System', sql: step23Email, critical: false },
  { name: 'Google Calendar', sql: step24GoogleCalendar, critical: false },
  { name: 'AI Agents', sql: step25AIAgents, critical: false },
  { name: 'External Forms', sql: step26ExternalForms, critical: false },
];

export async function initDatabase() {
  console.log('🔄 Initializing database in steps...');
  
  let successCount = 0;
  let failedSteps = [];
  let criticalFailure = false;

  for (const step of migrationSteps) {
    try {
      console.log(`  → Step: ${step.name}...`);
      await pool.query(step.sql);
      console.log(`  ✅ ${step.name} - OK`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ ${step.name} - FAILED: ${error.message}`);
      failedSteps.push({ name: step.name, error: error.message });
      
      if (step.critical) {
        criticalFailure = true;
        console.error(`  🛑 Critical step failed, stopping initialization`);
        break;
      }
      // Non-critical steps: continue to next step
    }
  }

  console.log('');
  console.log('📊 Database initialization summary:');
  console.log(`   - Steps completed: ${successCount}/${migrationSteps.length}`);
  
  if (failedSteps.length > 0) {
    console.log(`   - Failed steps: ${failedSteps.map(s => s.name).join(', ')}`);
  }
  
  if (criticalFailure) {
    console.error('❌ Database initialization failed (critical step error)');
    return false;
  }
  
  if (failedSteps.length === 0) {
    console.log('✅ Database initialized successfully!');
  } else {
    console.log('⚠️ Database initialized with warnings (some non-critical steps failed)');
  }
  
  return true;
}
