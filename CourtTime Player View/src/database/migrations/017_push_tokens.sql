-- Migration 017: Push notification device tokens

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'unknown', -- 'ios', 'android', 'web'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON user_push_tokens(user_id);
