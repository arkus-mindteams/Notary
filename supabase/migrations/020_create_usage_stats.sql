-- Create usage_stats table for tracking feature usage
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_usage_stats_created_at ON usage_stats(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON usage_stats(user_id);
