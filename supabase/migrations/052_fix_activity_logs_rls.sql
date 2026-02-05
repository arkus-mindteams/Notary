-- Migration 052: Fix RLS Policy for Activity Logs
-- The user requested that ONLY admins should see stats.
-- This migration updates the policy to restrict SELECT to superadmins only.

-- Drop the incorrect/permissive policy
DROP POLICY IF EXISTS "Users can view own activity logs" ON activity_logs;

-- Create the Admin-Only policy
CREATE POLICY "Superadmins can view all activity logs"
ON activity_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.rol = 'superadmin'
  )
);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
