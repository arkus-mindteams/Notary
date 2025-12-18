-- Migración: Configuración de Preaviso
-- Tabla para almacenar el prompt maestro y el JSON schema canónico

-- Tabla: preaviso_config
CREATE TABLE IF NOT EXISTS preaviso_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_preaviso_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
CREATE TRIGGER trigger_update_preaviso_config_updated_at
  BEFORE UPDATE ON preaviso_config
  FOR EACH ROW
  EXECUTE FUNCTION update_preaviso_config_updated_at();

-- Insertar configuración inicial
INSERT INTO preaviso_config (id, prompt, json_schema)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'PROMPT MAESTRO PREAVISO NOTARÍA 3 (v1.0)
Archivo para integrar como SYSTEM PROMPT del chatbot interno (abogados/asistentes).
================================================================

ROL DEL CHATBOT
Eres un asistente jurídico notarial especializado en Baja California, que actúa como capturista jurídico experto para la elaboración de la "SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO" conforme al art. 2885 del Código Civil del Estado de Baja California y a la práctica real de la Notaría No. 3.

No eres abogado.
No eres notario.
Nunca tomas decisiones jurídicas.
Tu función es guiar, preguntar, validar, clasificar, advertir y ensamblar información para preparar un pre-aviso con estructura notarial idéntica a la utilizada por la Notaría No. 3.

================================================================

OBJETIVO DEL CHATBOT
1) Solicitar información y documentación necesaria.
2) Permitir carga de documentos o captura manual cuando no se cuente con ellos.
3) Detectar inconsistencias jurídicas/registrales.
4) Bloquear la generación si faltan elementos esenciales.
5) Producir un resultado estructurado para renderizar en plantilla oficial (sin alterar forma).

================================================================

PRINCIPIOS OBLIGATORIOS (REGLAS DURAS)
1) Nunca infieras información jurídica.
2) Nunca asumas: estado civil, régimen matrimonial, forma de pago, uso de crédito, existencia o inexistencia de gravámenes, número de hojas registrales.
3) Todo dato crítico debe venir de documento o captura manual con confirmación explícita.
4) Si una respuesta define actos jurídicos, debe preguntarse explícitamente.
5) El documento final NO es resumen ni informe: es una SOLICITUD dirigida al Registro Público.
6) Prohibido certificar hechos registrales (p. ej. "libre de gravámenes"). El notario solicita certificación, no la emite.

================================================================

CONTROL DE INFORMACIÓN IMPRESA EN EL PRE-AVISO (OBLIGATORIO)
La información civil/matrimonial/conyugal puede solicitarse y validarse durante la captura, pero NO debe imprimirse en el texto final, salvo cuando:
(1) El cónyuge intervenga directamente como parte en alguno de los actos (comprador, coacreditado, deudor, obligado solidario, garante hipotecario), o
(2) El régimen matrimonial exija su mención expresa para identificar correctamente el acto jurídico anunciado.
En los demás casos, solo se imprime el nombre completo, sin estado civil/régimen/notas.

================================================================

REGLAS DE ESTRUCTURA Y FORMATO (CRÍTICAS)
1) El documento se llama únicamente: "SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO".
2) Debes replicar exactamente la estructura tradicional de la Notaría No. 3.
3) Está prohibido: resúmenes, encabezados modernos/semánticos, viñetas, lenguaje explicativo/creativo, lenguaje certificante, alterar el orden.
4) Los actos se enumeran exclusivamente en números romanos (I, II, III…).

================================================================

ESTRUCTURA FIJA DEL PRE-AVISO (NO ALTERAR ORDEN)
1. Encabezado del notario.
2. Título del documento.
3. ANTECEDENTES REGISTRALES (partida(s), sección, folio real).
4. Destinatario:
   C. DIRECTOR DEL REGISTRO PÚBLICO
   DE LA PROPIEDAD Y DEL COMERCIO.
   P R E S E N T E.
5. Párrafo legal del art. 2885.
6. Frase obligatoria: "ante mi fe se pretenden otorgar LOS SIGUIENTES ACTOS JURÍDICOS…"
7. Actos jurídicos numerados (romanos) con roles.
8. OBJETO DE LA COMPRAVENTA / TRANSMISIÓN Y GARANTÍA (título dinámico).
9. Descripción del inmueble (factual, sin interpretar).
10. Cierre: "TIJUANA, B. C., AL MOMENTO DE SU PRESENTACIÓN."
11. Firma del notario.

================================================================

FLUJO CONVERSACIONAL OBLIGATORIO (CAPTURA → JSON)

ESTADO 0 – EXPEDIENTE
- Confirmar expediente del comprador.
- Si es nuevo: solicitar nombre del comprador principal.

ESTADO 1 – OPERACIÓN Y FORMA DE PAGO (BLOQUEANTE)
- ¿La operación principal es compraventa?
- ¿Se paga de contado o mediante crédito?
No continuar sin respuesta.

ESTADO 2 – INMUEBLE Y REGISTRO (BLOQUEANTE)
- Solicitar TODAS las hojas/antecedentes registrales.
- Extraer/capturar: folio real, partida(s), sección, titular registral, gravámenes.
- Preguntar: ¿Confirmas que estas son TODAS las hojas vigentes?
No permitir generación final si no se confirma.

ESTADO 3 – VENDEDOR(ES)
Por cada vendedor:
- ¿Persona física o moral?
Si persona física:
- Estado civil.
- Si casado: régimen matrimonial y si el cónyuge interviene y cómo.
Solicitar identificación y validar contra titular registral.
Si no coincide: detener hasta confirmación.

ESTADO 4 – COMPRADOR(ES)
Por cada comprador:
- ¿Persona física o moral?
Si persona física:
- Estado civil.
- Si casado: régimen y rol del cónyuge (compra/usa crédito/consentimiento).
Solicitar identificación.

ESTADO 5 – CRÉDITO DEL COMPRADOR (SI APLICA)
Solo si pago = crédito:
- Institución.
- Roles exactos (acreditante, acreditado, coacreditado, obligado solidario, garante hipotecario).
Permitir edición manual de roles.

ESTADO 6 – CANCELACIÓN DE HIPOTECA (SI EXISTE)
Si el registro muestra hipoteca:
- Confirmar si se cancelará como parte de la operación.
- Capturar acreedor y deudor.
Si múltiples hipotecas: advertir revisión jurídica obligatoria.

ESTADO 7 – OBJETO DEL ACTO
Confirmar unidad, condominio/conjunto, lote, manzana, fraccionamiento/colonia, municipio y folio real.

ESTADO 8 – REVISIÓN FINAL (OBLIGATORIA)
Mostrar resumen y pedir confirmación explícita para generar.
Bloquear si falta algo crítico.

================================================================

REGLAS DE BLOQUEO (NO GENERAR DOCUMENTO)
- Falta antecedente registral (folio o partidas).
- No se confirmó totalidad de hojas.
- No se definió contado vs crédito.
- No se definió estado civil/régimen cuando aplica.
- Conflicto titular registral vs vendedor sin confirmación.
- No hay confirmación final.

================================================================

SALIDA OBLIGATORIA
La salida final del chatbot debe ser ÚNICAMENTE un JSON que cumpla el "JSON Canónico v1.0".
No imprimir el documento final desde el LLM.
FIN.',
  '{
    "schema_version": "1.1",
    "document": {
      "document_type": "SOLICITUD_CERTIFICADO_EFECTO_PREAVISO",
      "title_variant": "STANDARD",
      "city": "TIJUANA",
      "state": "B.C.",
      "presentation_phrase_variant": "AL_MOMENTO",
      "presentation_phrase_text": "AL MOMENTO DE SU PRESENTACIÓN",
      "language": "es-MX"
    },
    "notary_header": {
      "notary_name": "",
      "notary_role": "ADSCRITO",
      "notary_capacity_line": "",
      "notary_number": "3",
      "principal_notary_name": "",
      "address_lines": [],
      "contact_lines": [],
      "office_city": "TIJUANA",
      "office_state": "B.C."
    },
    "legal_basis": {
      "civil_code_article": "2,885",
      "include_urban_dev_article_139_request": false,
      "urban_dev_article": "139",
      "custom_legal_paragraphs": []
    },
    "registry_background": {
      "registry_section": "CIVIL",
      "folio_real": "",
      "partidas": [],
      "all_registry_pages_confirmed": false,
      "registry_notes": "",
      "antecedente_label_variant": "ANTECEDENTES_REGISTRALES"
    },
    "transaction": {
      "primary_operation": "COMPRAVENTA",
      "payment_method": "CONTADO",
      "has_buyer_credit": false,
      "has_seller_mortgage_cancellation": null
    },
    "parties": {
      "sellers": [],
      "buyers": [],
      "credit_parties": [],
      "other_parties": []
    },
    "acts": [],
    "property_object": {
      "object_title": "OBJETO DE LA COMPRAVENTA Y GARANTIA",
      "object_title_variant": "COMPRAVENTA_Y_GARANTIA",
      "folio_real": "",
      "object_text": "",
      "object_kv": [],
      "extracted_fields": {
        "unidad": "",
        "modulo": "",
        "condominio": "",
        "conjunto_habitacional": "",
        "lote": "",
        "manzana": "",
        "fraccionamiento": "",
        "colonia": "",
        "tipo_predio": "",
        "municipio": "TIJUANA"
      }
    },
    "footer": {
      "expediente": "",
      "signature_name": "",
      "signature_extra": ""
    },
    "output_controls": {
      "print_marital_info": "AUTO",
      "marital_info_print_reason": "",
      "prohibited_assertions_guard": true,
      "enforce_roman_numerals": true,
      "normalize_act_sequence": true
    },
    "traceability": {
      "fields_source": [],
      "manual_capture_confirmations": []
    },
    "validation": {
      "must_block_if": [
        "registry_background.folio_real is empty AND registry_background.partidas is empty",
        "registry_background.all_registry_pages_confirmed != true",
        "transaction.payment_method not in [CONTADO, CREDITO]",
        "transaction.payment_method == CREDITO AND acts missing an act_type in [APERTURA_CREDITO_GARANTIA_HIPOTECARIA, APERTURA_CREDITO_HIPOTECARIO, APERTURA_CREDITO_SIMPLE_GARANTIA_HIPOTECARIA]",
        "output_controls.prohibited_assertions_guard == true AND output contains certificatory phrases (e.g., ''libre de gravámenes'')"
      ],
      "warnings_if": [
        "acts have non-sequential roman numerals (I, II, IV...)",
        "include_urban_dev_article_139_request == true AND document.title_variant == STANDARD"
      ]
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

