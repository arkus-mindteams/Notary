-- Create processed_units_log table for granular unit tracking
-- This table offloads bulky text data from the main usage_stats table

CREATE TABLE processed_units_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stats_id UUID REFERENCES usage_stats(id) ON DELETE CASCADE, -- Link to parent session
  unit_id TEXT NOT NULL,
  
  -- The bulky text content
  original_text TEXT, -- AI generated
  final_text TEXT,    -- Authorized by user
  
  -- Metrics and costs
  similarity_score FLOAT, 
  cost_usd FLOAT,
  
  -- Detailed JSON blobs
  usage JSONB DEFAULT '{}'::jsonb,   -- Token usage for this unit
  metrics JSONB DEFAULT '{}'::jsonb, -- Edit distance, chars added/removed, etc
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE processed_units_log ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_processed_units_stats_id ON processed_units_log(stats_id);
CREATE INDEX idx_processed_units_unit_id ON processed_units_log(unit_id);

-- Policy: Allow authenticated users to insert (linked to their session)
-- We check that the parent stats belongs to them or they can insert generally
CREATE POLICY "Authenticated users can insert unit logs"
ON processed_units_log FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usage_stats
    WHERE usage_stats.id = processed_units_log.stats_id
    -- AND usage_stats.user_id ... (Optional check if stricter security needed)
  )
);

-- Policy: Superadmins can view
CREATE POLICY "Superadmins can view unit logs"
ON processed_units_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.rol = 'superadmin'
  )
);
