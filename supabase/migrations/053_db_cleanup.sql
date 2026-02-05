-- Migration 053: Database Cleanup (Robust Transactional Wipe)
-- Wipes chats, logs, documents, and tramites while preserving users and notaria.

DO $$ 
DECLARE
    tables_to_truncate text[] := ARRAY[
        'activity_logs', 
        'usage_stats', 
        'agent_usage_logs', 
        'preaviso_conversation_logs', 
        'processed_units_log',
        'chat_messages',
        'chat_sessions',
        'document_extractions',
        'documento_text_chunks',
        'tramite_documentos',
        'documentos',
        'tramites',
        'compradores'
    ];
    t text;
BEGIN
    -- Disable foreign key checks temporarily
    SET session_replication_role = 'replica';
    
    FOREACH t IN ARRAY tables_to_truncate
    LOOP
        -- Only truncate if the table exists in the public schema
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
            RAISE NOTICE 'Truncated table: %', t;
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping.', t;
        END IF;
    END LOOP;
    
    -- Re-enable foreign key checks
    SET session_replication_role = 'origin';
    
    RAISE NOTICE 'Cleanup complete.';
END $$;

-- Notify Schema Reload
NOTIFY pgrst, 'reload schema';
