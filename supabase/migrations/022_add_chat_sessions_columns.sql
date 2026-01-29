-- Migration: add title and archived to preaviso_conversation_logs
ALTER TABLE public.preaviso_conversation_logs
ADD COLUMN IF NOT EXISTS title text NULL,
ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Index for listing active sessions
CREATE INDEX IF NOT EXISTS preaviso_conversation_logs_user_archived_idx
ON public.preaviso_conversation_logs (user_id, archived, updated_at DESC);
