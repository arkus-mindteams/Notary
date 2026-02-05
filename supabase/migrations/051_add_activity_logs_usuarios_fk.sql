-- Migration 051: Add Foreign Key between activity_logs and usuarios
-- This is required for PostgREST to allow joins like select('*, usuarios(*)')

-- 1. Add FK constraint relating activity_logs.user_id to usuarios.auth_user_id
-- We reference auth_user_id because that's the column in public.usuarios that corresponds 
-- to the auth.users.id stored in activity_logs.user_id.
-- public.usuarios.auth_user_id is already UNIQUE (required for FK target).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_activity_logs_usuarios'
    ) THEN
        ALTER TABLE activity_logs 
        ADD CONSTRAINT fk_activity_logs_usuarios 
        FOREIGN KEY (user_id) 
        REFERENCES public.usuarios(auth_user_id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Notify PostgREST schema cache reload (usually automatic, but good to note)
NOTIFY pgrst, 'reload schema';
