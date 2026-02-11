# Validación del Plan Short Term — Preaviso a Producción

Guía para validar cada ítem del checklist de salida antes de dar por cerrado el plan.

---

## Validación ST-1: Indexación en RAG (documento_text_chunks)

**Objetivo:** Confirmar que, al subir un documento en el chat de preaviso, se crea al menos un registro en `documento_text_chunks` con texto y embedding.

### Requisitos previos

- App en marcha (por ejemplo `pnpm dev`).
- Usuario autenticado.
- Trámite de preaviso creado (para tener `tramiteId` en contexto).
- `OPENAI_API_KEY` configurada (necesaria para generar embeddings).

### Pasos

1. **Abrir el chat de preaviso**  
   Ir a la pantalla donde se usa el componente de chat de preaviso (con subida de documentos).

2. **Subir un documento**  
   Subir un archivo que el sistema procese (por ejemplo: inscripción, identificación o acta de matrimonio). Asegurarse de que la extracción termine bien (sin error en la UI).

3. **Anotar datos para la consulta**  
   - Nombre del archivo subido (ej. `inscripcion.pdf`).  
   - Si tienes acceso a logs del servidor, el `documento.id` o el `tramite_id` que aparezcan al procesar.

4. **Comprobar en base de datos**  
   Ejecutar en tu cliente SQL (Supabase SQL Editor, `psql`, etc.):

```sql
-- Últimos documentos guardados desde el chat de preaviso
SELECT
  d.id AS documento_id,
  d.nombre,
  d.tipo,
  d.metadata->>'via' AS via,
  d.created_at AS doc_created_at
FROM documentos d
WHERE d.metadata->>'via' = 'preaviso_chat'
ORDER BY d.created_at DESC
LIMIT 10;
```

Con uno de los `documento_id` (o el nombre del archivo):

```sql
-- Chunks e embeddings para un documento recién subido (ligados a session_id para RAG por chat)
SELECT
  dtc.id AS chunk_id,
  dtc.documento_id,
  dtc.session_id,
  dtc.tramite_id,
  dtc.page_number,
  LEFT(dtc.text, 200) AS text_preview,
  CASE WHEN dtc.embedding IS NOT NULL THEN 'Sí' ELSE 'No' END AS tiene_embedding,
  dtc.created_at
FROM documento_text_chunks dtc
JOIN documentos d ON d.id = dtc.documento_id
WHERE d.metadata->>'via' = 'preaviso_chat'
ORDER BY dtc.created_at DESC
LIMIT 20;
```

### Criterios de éxito (ST-1)

- Existe al menos una fila en `documento_text_chunks` para el documento que acabas de subir.
- `documento_id` coincide con el documento en `documentos` (via = preaviso_chat).
- `session_id` es el UUID de la sesión de chat (conversation_id); así al reabrir el chat el RAG filtra por esta sesión.
- `tramite_id` puede ser UUID o nulo (en chat se guarda ambos cuando hay trámite).
- `text` tiene contenido legible (resumen de lo extraído).
- `tiene_embedding` = Sí (columna `embedding` no nula).

Si algo falla, revisar en la **consola del servidor** (donde corre `pnpm dev`) en este orden:

1. **`[preaviso-process-document] incoming`**  
   Debe incluir `conversation_id: <uuid>`. Si es `null`, el frontend no envía sesión: comprobar que el chat tenga chatId en la URL y que no se suba el documento antes de que aparezca "Preparando chat...".
2. **`No conversation_id in context`**  
   No se guarda documento ni RAG. Solución: asegurar que la sesión esté creada (URL con `?chatId=...`) antes de subir.
3. **`Saving document and RAG`**  
   Confirma que se entra al bloque que guarda en `documentos` e indexa.
4. **`Indexing document for RAG`**  
   Confirma que se llama a indexación con `sessionId` y `documentoId`.
5. **`[DocumentoService] No embedding generated`**  
   Falta `OPENAI_API_KEY` o la API de embeddings falló. Configurar la key en `.env` y revisar conectividad.
6. **`[DocumentoService] Error saving text chunk`**  
   Fallo al escribir en BD (código y mensaje en el log). Comprobar que las migraciones 056 y 057 estén aplicadas (`session_id` en la tabla, `tramite_id` nullable). Si el error es de restricción (constraint), revisar el esquema.
7. **`RAG index saved successfully`**  
   La indexación terminó bien; debería haber fila en `documento_text_chunks`.

### Validación rápida desde consola (opcional)

Si tienes Node y variables de entorno cargadas, puedes usar un script que llame a `DocumentExtractionTextBuilder` y a `DocumentoService.processAndSaveText` con un `extractedData` de prueba y luego comprobar en la DB que exista el chunk (el script no está incluido aquí; se puede añadir en `scripts/` si lo necesitas).

---

## Validación ST-2: tramiteId disponible al subir documentos

- En una conversación nueva de preaviso, antes de subir el primer documento, comprobar en Network (DevTools) que la petición a `/api/ai/preaviso-process-document` incluya en el payload (formData o context) el `tramiteId` como UUID.
- Si el trámite se crea al iniciar o al crear expediente, asegurarse de que ese `tramiteId` se pase en el contexto al subir archivos.

---

## Validación ST-3: Contexto actualizado devuelto y aplicado

- Después de enviar un mensaje en el chat, comprobar que la respuesta del API incluya el objeto de contexto actualizado (p. ej. `data` o `context`).
- En el frontend, comprobar que tras cada respuesta exitosa se actualice el estado con ese contexto (p. ej. `setData(result.data)`), y que al enviar el siguiente mensaje se envíe de nuevo ese contexto actualizado.

---

## Validación ST-4: Sin regresiones en merge defensivo

- Flujo manual: completar comprador, crédito, inmueble; subir documento; enviar más mensajes.
- Comprobar que arrays como `compradores`, `vendedores`, `creditos` no se vacíen y que el objeto `inmueble` no pierda datos ya capturados.

---

## Validación ST-4b: Historial de 20 mensajes

- Ya implementado. Opcional: en DevTools, verificar que el body del POST a `/api/ai/preaviso-chat` incluya un array `messages` con hasta 20 mensajes cuando la conversación es larga.

---

## Validación E2E (flujo completo)

1. Nueva conversación de preaviso.
2. Subir al menos un documento (inscripción o identificación) y ver que se procese.
3. Responder a las preguntas del asistente (o dar datos a mano) hasta llegar a estado “listo para generar” o equivalente.
4. Comprobar que se pueda generar el preaviso (botón o acción correspondiente) y que los datos mostrados en el documento generado coincidan con lo capturado.

Si en algún paso el asistente “olvida” datos que ya estaban en documentos o que el usuario escribió, revisar ST-1 (RAG) y ST-4b (historial).
