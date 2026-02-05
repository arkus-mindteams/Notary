-- Migration 055: Final Verification Wipe
-- Wipes all operational and logging data to allow for a clean end-to-end test.

DO $$ 
DECLARE
    tables_to_truncate text[] := ARRAY[
        'activity_logs', 
        'chat_session_documents', -- Added to the previous wipe list
        'chat_messages',
        'chat_sessions',
        'documentos',
        'tramite_documentos',
        'tramites',
        'compradores'
    ];
    t text;
BEGIN
    -- Disable foreign key checks
    SET session_replication_role = 'replica';
    
    FOREACH t IN ARRAY tables_to_truncate
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
        END IF;
    END LOOP;
    
    -- Re-enable foreign key checks
    SET session_replication_role = 'origin';
END $$;

NOTIFY pgrst, 'reload schema';
