-- Create usage_stats table for tracking feature usage
-- We drop it first to ensure schema changes are applied (FK change)
DROP TABLE IF EXISTS usage_stats;

CREATE TABLE usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL, -- Changed to reference public.usuarios
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to insert their own stats (or system events)
-- We allow any authenticated user to insert.
CREATE POLICY "Authenticated users can insert stats"
ON usage_stats FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Only superadmins can view stats
-- We need to check the public.usuarios table to see if the user is a superadmin
CREATE POLICY "Superadmins can view all stats"
ON usage_stats FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.rol = 'superadmin'
  )
);

-- Index for faster querying by event type and time
CREATE INDEX IF NOT EXISTS idx_usage_stats_event_type ON usage_stats(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON usage_stats(user_id);

-- Policy: Allow authenticated users to update their own stats
-- This is necessary for the "Draft -> Completed" flow where we update the record
CREATE POLICY "Authenticated users can update own stats"
ON usage_stats FOR UPDATE
TO authenticated
USING (
  -- Users can update rows where the user_id matches their own ID
  -- Note: We need to match usage_stats.user_id (which looks like a UUID)
  -- against the public.usuarios table which maps auth.uid() -> id
  user_id IN (
    SELECT id FROM public.usuarios
    WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  user_id IN (
    SELECT id FROM public.usuarios
    WHERE auth_user_id = auth.uid()
  )
);

-- Grants
GRANT ALL ON TABLE usage_stats TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE usage_stats TO authenticated;
