-- Legal Meetings Module Schema

CREATE TYPE meeting_type AS ENUM (
  'atendimento_inicial',
  'reuniao_cliente',
  'audiencia_remota',
  'reuniao_estrategica',
  'reuniao_interna',
  'alinhamento_processual',
  'outro'
);

CREATE TYPE meeting_status AS ENUM (
  'aguardando_transcricao',
  'transcrevendo',
  'resumo_gerado',
  'pendente_revisao',
  'finalizado',
  'com_pendencias'
);

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  meeting_type meeting_type NOT NULL DEFAULT 'outro',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER,
  status meeting_status NOT NULL DEFAULT 'aguardando_transcricao',
  lawyer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  team_member_ids UUID[] DEFAULT '{}',
  -- Vínculos
  contact_id UUID,
  company_id UUID,
  whatsapp_contact_id UUID,
  process_number VARCHAR(255),
  deal_id UUID,
  -- Links
  meeting_link VARCHAR(1000),
  -- Conteúdo
  transcript TEXT,
  summary JSONB DEFAULT '{}',
  key_points JSONB DEFAULT '[]',
  client_requests JSONB DEFAULT '[]',
  lawyer_guidance JSONB DEFAULT '[]',
  sensitive_points JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  cited_documents JSONB DEFAULT '[]',
  next_steps JSONB DEFAULT '[]',
  internal_notes TEXT,
  -- Metadados
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE meeting_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE meeting_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_url VARCHAR(1000) NOT NULL,
  file_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_meetings_org ON meetings(organization_id);
CREATE INDEX idx_meetings_contact ON meetings(contact_id);
CREATE INDEX idx_meetings_company ON meetings(company_id);
CREATE INDEX idx_meetings_lawyer ON meetings(lawyer_user_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_scheduled ON meetings(scheduled_at);
CREATE INDEX idx_meeting_tasks_meeting ON meeting_tasks(meeting_id);
CREATE INDEX idx_meeting_tasks_assigned ON meeting_tasks(assigned_to);
