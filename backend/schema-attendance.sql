-- Schema de Status de Atendimento
-- Adiciona campo para controlar se uma conversa está sendo atendida ou aguardando

-- Status: 'waiting' = aguardando aceite, 'attending' = em atendimento
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index para performance nas queries de status
CREATE INDEX IF NOT EXISTS idx_conversations_attendance_status ON conversations(attendance_status);
CREATE INDEX IF NOT EXISTS idx_conversations_accepted_by ON conversations(accepted_by);
