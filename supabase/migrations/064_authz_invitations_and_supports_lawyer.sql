-- Authz: Invitaciones de usuario + relacion N:M abogado-asistente (supports_lawyer)

CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL,
  notaria_id uuid NOT NULL REFERENCES notarias(id) ON DELETE CASCADE,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  preconfig_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  resent_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_token
  ON user_invitations (token);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email
  ON user_invitations (email);

CREATE INDEX IF NOT EXISTS idx_user_invitations_notaria
  ON user_invitations (notaria_id);

CREATE INDEX IF NOT EXISTS idx_user_invitations_status
  ON user_invitations (status);

COMMENT ON TABLE user_invitations IS 'Invitaciones de usuarios para onboarding por notaria (RBAC/ReBAC).';

-- Relacion N:M abogado-asistente (supports_lawyer)

CREATE TABLE IF NOT EXISTS usuarios_supports_lawyer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  assistant_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  notaria_id uuid NOT NULL REFERENCES notarias(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_supports_lawyer_unique
  ON usuarios_supports_lawyer (lawyer_id, assistant_id, notaria_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_supports_lawyer_lawyer
  ON usuarios_supports_lawyer (lawyer_id, notaria_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_supports_lawyer_assistant
  ON usuarios_supports_lawyer (assistant_id, notaria_id);
