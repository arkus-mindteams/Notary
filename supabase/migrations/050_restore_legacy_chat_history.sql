-- Migration to restore legacy chat history from consolidated activity_logs to chat_messages
-- This ensures that users don't lose their conversation history after the consolidation.

DO $$
DECLARE
    log_record RECORD;
    msg_record JSONB;
    session_id UUID;
    session_exists BOOLEAN;
BEGIN
    -- Iterate through consolidated conversation logs
    FOR log_record IN 
        SELECT id, user_id, data 
        FROM activity_logs 
        WHERE category = 'conversation' 
    LOOP
        -- Extract conversation_id from data
        session_id := (log_record.data->>'conversation_id')::UUID;
        
        -- Check if chat_sessions already exists for this ID
        SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE id = session_id) INTO session_exists;
        
        -- If session doesn't exist, create it (legacy sessions might not be in chat_sessions)
        IF NOT session_exists AND session_id IS NOT NULL THEN
            INSERT INTO chat_sessions (id, user_id, title, last_context, created_at, updated_at)
            VALUES (
                session_id, 
                log_record.user_id, 
                'Restored Chat ' || session_id,
                COALESCE(log_record.data->'context', '{}'::jsonb),
                (log_record.data->>'created_at')::TIMESTAMPTZ,
                (log_record.data->>'updated_at')::TIMESTAMPTZ
            );
        END IF;

        -- Extract and insert messages if session exists OR was just created
        IF session_id IS NOT NULL THEN
            -- Iterate through messages array in JSONB
            FOR msg_record IN SELECT * FROM jsonb_array_elements(log_record.data->'messages')
            LOOP
                -- Insert into chat_messages if not already there (avoid duplicates)
                -- We use content and role as primitive deduplication since we don't have original message IDs
                INSERT INTO chat_messages (session_id, role, content, metadata, created_at)
                SELECT 
                    session_id, 
                    (msg_record->>'role')::text, 
                    (msg_record->>'content')::text, 
                    (msg_record - 'role' - 'content'), -- Everything else goes to metadata
                    COALESCE((msg_record->>'timestamp')::TIMESTAMPTZ, now())
                WHERE NOT EXISTS (
                    SELECT 1 FROM chat_messages 
                    WHERE session_id = session_id 
                    AND role = (msg_record->>'role')::text 
                    AND content = (msg_record->>'content')::text
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;
