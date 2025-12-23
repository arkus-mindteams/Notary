-- Migración: Actualizar Canonical JSON Schema a versión 1.4
-- Soporta: coacreditados, múltiples créditos, créditos en diferentes instituciones
-- SIN inferencias jurídicas
-- 
-- REGLAS DE DISEÑO:
-- 1. El sistema describe hechos declarados, NO infiere relaciones jurídicas
-- 2. Los compradores se modelan como un ARRAY con IDs únicos
-- 3. Los créditos se modelan como un ARRAY con:
--    - UNA institución por crédito
--    - UNO o MÁS participantes explícitos (referencia por party_id)
-- 4. No existe relación implícita entre créditos
-- 5. Un comprador puede participar en uno o varios créditos
-- 6. Está PROHIBIDO:
--    - Asumir jerarquías entre créditos
--    - Inferir coacreditación
--    - Colapsar múltiples créditos en uno solo

UPDATE preaviso_config
SET
  json_schema = '{
  "meta": {
    "version": "1.4",
    "tipo_tramite": "preaviso_notarial",
    "fecha_captura": null,
    "entidad_federativa": "Baja California"
  },
  "inmueble": {
    "folio_real": null,
    "partidas": [],
    "all_registry_pages_confirmed": false,
    "direccion": {
      "calle": null,
      "numero": null,
      "colonia": null,
      "municipio": null,
      "estado": null,
      "codigo_postal": null
    },
    "superficie": null,
    "valor": null,
    "datos_catastrales": {
      "lote": null,
      "manzana": null,
      "fraccionamiento": null,
      "condominio": null,
      "unidad": null,
      "modulo": null
    }
  },
  "vendedores": [],
  "compradores": [],
  "creditos": [],
  "gravamenes": [],
  "control_impresion": {
    "imprimir_conyuges": false,
    "imprimir_coacreditados": false,
    "imprimir_creditos": false
  },
  "validaciones": {
    "expediente_existente": false,
    "datos_completos": false,
    "bloqueado": true
  },
  "schema_definitions": {
    "vendedor_element": {
      "party_id": null,
      "tipo_persona": null,
      "persona_fisica": {
        "nombre": null,
        "rfc": null,
        "curp": null,
        "estado_civil": null,
        "conyuge": {
          "nombre": null,
          "participa": false
        }
      },
      "persona_moral": {
        "denominacion_social": null,
        "rfc": null,
        "csf_provided": false,
        "csf_reference": null,
        "name_confirmed_exact": false
      },
      "tiene_credito": null,
      "credito_vendedor": {
        "institucion": null,
        "numero_credito": null
      }
    },
    "comprador_element": {
      "party_id": null,
      "tipo_persona": null,
      "persona_fisica": {
        "nombre": null,
        "rfc": null,
        "curp": null,
        "estado_civil": null,
        "conyuge": {
          "nombre": null,
          "participa": false
        }
      },
      "persona_moral": {
        "denominacion_social": null,
        "rfc": null,
        "csf_provided": false,
        "csf_reference": null,
        "name_confirmed_exact": false
      }
    },
    "credito_element": {
      "credito_id": null,
      "institucion": null,
      "monto": null,
      "participantes": [],
      "tipo_credito": null
    },
    "gravamen_element": {
      "gravamen_id": null,
      "tipo": null,
      "institucion": null,
      "numero_credito": null,
      "cancelacion_confirmada": false
    },
    "participante_credito": {
      "party_id": null,
      "rol": null
    }
  }
}'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000001';

