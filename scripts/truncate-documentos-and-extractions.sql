-- Opción B: Borrar solo datos de document_extractions y documentos.
-- document_extractions: sin FKs, se trunca solo.
-- documentos: TRUNCATE CASCADE vacía también las filas que lo referencian
--   (documento_text_chunks, tramite_documentos, chat_session_documents).
-- La app no se rompe; listados quedarán vacíos y nuevas subidas crearán filas nuevas.

TRUNCATE TABLE public.document_extractions;

TRUNCATE TABLE public.documentos CASCADE;

-- Opcional: notificar a PostgREST para recargar schema
NOTIFY pgrst, 'reload schema';
