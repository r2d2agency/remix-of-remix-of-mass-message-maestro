-- Document and Signature Management Module for Legal Gleego

-- Settings for the module per organization
CREATE TABLE IF NOT EXISTS document_module_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    signature_enabled BOOLEAN DEFAULT TRUE,
    default_link_validity_days INTEGER DEFAULT 7,
    auto_reminders_count INTEGER DEFAULT 3,
    auto_reminders_interval_days INTEGER DEFAULT 1,
    default_send_message TEXT DEFAULT 'Olá, {{nome}}. Segue o documento {{documento}} para assinatura eletrônica. Acesse o link abaixo para visualizar e assinar com segurança: {{link}}',
    default_reminder_message TEXT DEFAULT 'Olá, {{nome}}. O documento {{documento}} ainda está pendente de assinatura. Você pode assinar pelo link: {{link}}',
    default_confirmation_message TEXT DEFAULT 'Olá, {{nome}}. Recebemos a assinatura do documento {{documento}}. Obrigado.',
    office_logo_url TEXT,
    certificate_footer TEXT DEFAULT 'Este documento foi assinado eletronicamente via Legal Gleego.',
    allowed_validation_methods JSONB DEFAULT '["link", "confirmation", "ip_registry"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    client_id UUID REFERENCES contacts(id) ON DELETE SET NULL, -- Link to CRM contact
    deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,   -- Link to CRM case/process (deal)
    document_type VARCHAR(100), -- 'Contrato de honorários', 'Procuração', etc.
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'in_analysis', 'awaiting_signature', 'signed', 'refused', 'expired', 'archived'
    file_url TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Document Versions
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    version_number INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signature Requests
CREATE TABLE IF NOT EXISTS signature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'sent', 'viewed', 'signed', 'refused', 'expired', 'cancelled'
    deadline TIMESTAMP WITH TIME ZONE,
    send_channel VARCHAR(50) DEFAULT 'whatsapp', -- 'whatsapp', 'email', 'both'
    validation_methods JSONB DEFAULT '["link"]'::jsonb,
    reminder_settings JSONB DEFAULT '{}'::jsonb,
    token VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signature Signers
CREATE TABLE IF NOT EXISTS signature_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES signature_requests(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    cpf_cnpj VARCHAR(20),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'signed', 'refused'
    signed_at TIMESTAMP WITH TIME ZONE,
    ip_address VARCHAR(50),
    user_agent TEXT,
    validation_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signature Events (Audit Trail)
CREATE TABLE IF NOT EXISTS signature_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES signature_requests(id) ON DELETE CASCADE NOT NULL,
    signer_id UUID REFERENCES signature_signers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- 'created', 'sent', 'viewed', 'signed', 'refused', 'reminder_sent'
    description TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signature Certificates
CREATE TABLE IF NOT EXISTS signature_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES signature_requests(id) ON DELETE CASCADE NOT NULL,
    certificate_url TEXT NOT NULL,
    hash VARCHAR(255),
    unique_id VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document Audit Logs
CREATE TABLE IF NOT EXISTS document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_deal ON documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_org ON signature_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_doc ON signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_token ON signature_requests(token);
CREATE INDEX IF NOT EXISTS idx_sig_signers_request ON signature_signers(request_id);
CREATE INDEX IF NOT EXISTS idx_sig_events_request ON signature_events(request_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_org ON document_audit_logs(organization_id);
