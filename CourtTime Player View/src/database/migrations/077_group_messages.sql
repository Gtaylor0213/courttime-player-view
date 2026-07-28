-- Group messaging: conversations can now represent a group (name, creator, up to
-- 30 members) alongside the existing 1:1 shape. DMs keep using
-- participant1_id/participant2_id unchanged; groups use conversation_participants.

ALTER TABLE conversations
  ALTER COLUMN participant1_id DROP NOT NULL,
  ALTER COLUMN participant2_id DROP NOT NULL,
  ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN name VARCHAR(100),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_conversation_participant UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_conversations_is_group ON conversations(is_group);
