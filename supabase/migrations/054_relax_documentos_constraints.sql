-- Migration 054: Relax Documentos Constraints
-- Allows documents to be uploaded without a comprador_id (for chat)
-- and expands allowed types to include common identification documents.

BEGIN;

-- 1. Make comprador_id optional
ALTER TABLE public.documentos ALTER COLUMN comprador_id DROP NOT NULL;

-- 2. Relax the tipo check constraint (allow any text value)
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_tipo_check;

-- 3. Notify schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
