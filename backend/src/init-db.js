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
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
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
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

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
    quoted_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'sent',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
