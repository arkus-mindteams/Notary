import { NextResponse } from "next/server"
import type { StructuringRequest, StructuringResponse, StructuredUnit } from "@/lib/ai-structuring-types"

const cache = new Map<string, StructuredUnit[]>()
const metadataCache = new Map<string, { lotLocation?: string; totalLotSurface?: number }>()

function hashPayload(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `${h}-${s.length}`
}

/**
 * Normaliza una dirección en español o inglés a su código normalizado corto
 * @param rawDir - Dirección original (ej: "SURESTE", "NORTE", "SOUTHWEST", "NORTH")
 * @returns Código normalizado: "N", "S", "E", "W", "NE", "NW", "SE", "SW", "UP", "DOWN"
 */
function normalizeDirectionCode(rawDir: string): "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "UP" | "DOWN" {
  const upper = rawDir.toUpperCase().trim()

  // Mapeo de direcciones a códigos normalizados
  const dirMap: Record<string, "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "UP" | "DOWN"> = {
    // Cardinales en español
    "NORTE": "N",
    "SUR": "S",
    "ESTE": "E",
    "OESTE": "W",
    // Cardinales en inglés
    "NORTH": "N",
    "SOUTH": "S",
    "EAST": "E",
    "WEST": "W",
    // Intercardinales en español
    "NORESTE": "NE",
    "NOROESTE": "NW",
    "SURESTE": "SE",
    "SUROESTE": "SW",
    // Intercardinales en inglés
    "NORTHEAST": "NE",
    "NORTHWEST": "NW",
    "SOUTHEAST": "SE",
    "SOUTHWEST": "SW",
    // Verticales en español
    "ARRIBA": "UP",
    "ABAJO": "DOWN",
    "SUPERIOR": "UP",
    "INFERIOR": "DOWN",
    "COLINDANCIA SUPERIOR": "UP",
    "COLINDANCIA INFERIOR": "DOWN",
    // Verticales en inglés
    "UP": "UP",
    "DOWN": "DOWN",
  }

  // Buscar coincidencia exacta
  if (dirMap[upper]) {
    return dirMap[upper]
  }

  // Si no hay coincidencia exacta, intentar normalización con variantes comunes
  // Normalizar variantes con dos puntos o espacios
  const normalized = upper.replace(/[:]+$/, "").replace(/\s+/g, "")

  if (dirMap[normalized]) {
    return dirMap[normalized]
  }

  // Fallback: si es un código ya normalizado (1-2 caracteres), devolverlo
  if (/^[NSEW]|[NS][EW]|UP|DOWN$/.test(upper)) {
    return upper as any
  }

  // Si no se puede normalizar, devolver "N" como fallback (aunque esto no debería pasar)
  console.warn(`[normalizeDirectionCode] No se pudo normalizar dirección: "${rawDir}", usando fallback "N"`)
  return "N"
}

/**
 * Obtiene las reglas para la extracción de colindancias.
 * Estas reglas son SOLO INTERNAS y NO se leen del JSON.
 * Las reglas se mantienen hardcodeadas en buildDefaultPrompt().
 */
function getColindanciasRules(): string {
  // Las reglas de colindancias son solo internas, siempre usar el prompt base
  return buildDefaultPrompt()
}

function buildDefaultPrompt(): string {
  return [
    "Eres un extractor experto de medidas y colindancias de planos arquitectónicos. Tu tarea es analizar un bloque de texto (producido por OCR o lectura visual de un plano) y devolver únicamente las colindancias, organizadas en JSON, siguiendo reglas estrictas.",
    "",
    "Debes aplicar TODAS las siguientes reglas sin excepción.",
    "",
    "=== AGRUPACIÓN DE COLINDANCIAS POR DIRECCIÓN ===",
    "",
    "⚠️ REGLA CRÍTICA - DEBES SEGUIR ESTO ESTRICTAMENTE:",
    "",
    "1. Cuando aparece una dirección explícita (ej: \"NORTE:\", \"SUROESTE:\", \"NORTE:\", \"SUROESTE:\"), SIEMPRE crea un nuevo bloque de dirección independiente.",
    "",
    "2. Cada dirección explícita es SIEMPRE un bloque separado:",
    "   - Si ves \"SUROESTE:\" dos veces → son DOS bloques SUROESTE independientes",
    "   - Si ves \"SUROESTE:\" tres veces → son TRES bloques SUROESTE independientes",
    "   - Cada una tiene exactamente UN segmento (el de esa línea)",
    "   - NO las agrupes nunca, incluso si son la misma dirección",
    "",
    "3. Solo agrupa líneas en un solo bloque cuando:",
    "   - La primera línea tiene dirección explícita (ej: \"NORTE:\")",
    "   - Las siguientes líneas NO tienen dirección explícita",
    "   - Las siguientes líneas están visualmente indentadas o en las líneas inmediatas siguientes",
    "   - Las siguientes líneas solo tienen medidas y colindantes (sin dirección)",
    "   → Estas líneas heredadas forman un solo bloque con múltiples segments",
    "",
    "4. Ejemplo de AGRUPACIÓN CORRECTA (líneas heredadas):",
    "   Texto:",
    '     "NORTE:\\n',
    '      EN 6.750 m CON UNIDAD B-4\\n',
    '      EN 1.750 m CON CUBO DE ILUMINACION"',
    "   Resultado:",
    "     Un bloque NORTE con 2 segments",
    "",
    "5. Ejemplo de NO AGRUPACIÓN (direcciones explícitas repetidas):",
    "   Texto:",
    '     "SUROESTE: EN 0.95 m CON VACIO\\n',
    '      SUROESTE: EN 0.4 m CON VACIO\\n',
    '      SUROESTE: EN 0.8 m CON VACIO"',
    "   Resultado:",
    "     TRES bloques SUROESTE independientes, cada uno con 1 segment",
    "     NO un solo bloque SUROESTE con 3 segments",
    "",
    "6. REGLA DE ORO:",
    "   - Si una línea tiene dirección explícita (termina en \":\" o tiene \"DIRECCIÓN:\" al inicio) → bloque independiente",
    "   - Si una línea NO tiene dirección explícita → pertenece al bloque anterior (si está indentada o es línea siguiente inmediata)",
    "",
    "5. Prefijo de longitud:",
    "   - Capturar el prefijo si existe: \"\", \"EN\", \"LC=\", etc.",
    "   - Si no hay prefijo visible (ej: \"6.750 MTS\"), usar \"\"",
    "   - Si el prefijo es \"LC=\", capturarlo tal cual: \"LC=\"",
    "   - Guardar en el campo \"length_prefix\"",
    "",
    "=== IDENTIFICACIÓN DE UNIDADES ===",
    "",
    "1. Una nueva unidad inicia cuando aparece un encabezado como:",
    '   - "UNIDAD X"',
    '   - "COCHERA X"',
    '   - "ESTACIONAMIENTO"',
    '   - "ÁREA CONSTRUIDA"',
    '   - "CAJÓN DE ESTACIONAMIENTO"',
    '   - "MEDIDAS Y COLINDANCIAS"',
    "",
    "2. Cada unidad genera un JSON independiente.",
    '3. El bloque de colindancias comienza después del encabezado "MEDIDAS Y COLINDANCIAS".',
    "",
    "=== DIRECCIONES PERMITIDAS ===",
    "",
    "Cardinales:",
    '  - NORTE → "N"',
    '  - SUR → "S"',
    '  - ESTE → "E"',
    '  - OESTE → "W"',
    "",
    "Intercardinales:",
    '  - NORESTE → "NE"',
    '  - NOROESTE → "NW"',
    '  - SURESTE → "SE"',
    '  - SUROESTE → "SW"',
    "",
    "Verticales:",
    '  - ARRIBA / SUPERIOR / COLINDANCIA SUPERIOR → "UP"',
    '  - ABAJO / INFERIOR / COLINDANCIA INFERIOR → "DOWN"',
    "",
    "Regla:",
    "No inventes direcciones. Normaliza variantes incorrectas usando distancia Levenshtein. Por ejemplo:",
    '  "SUREST" → SURESTE',
    '  "SUROESTE:" → SUROESTE',
    '  "NROESTE" → NOROESTE',
    '  "ARIBA" → ARRIBA',
    "",
    "=== ORDEN DEL DOCUMENTO ===",
    "",
    "1. Conserva el orden EXACTO en que aparecen las líneas.",
    "2. No reordenes según cardinalidad ni sentido del perímetro.",
    "3. No uses orden geométrico. El orden textual es el orden maestro.",
    "",
    "=== MEDIDAS ===",
    "",
    "Formatos aceptados:",
    "  EN 7.500 M",
    "  7.50 M",
    "  7.500",
    "  1.200 MTS",
    "  LC=2.736",
    "  0.500 m",
    "  15.000 m",
    "",
    "Reglas:",
    '  - Convertir coma decimal a punto: "7,500" → "7.500"',
    "  - CRÍTICO: Preservar EXACTAMENTE el número de decimales que aparecen en el documento original",
    "",
    "  ⚠️ IMPORTANTE - FORMATO DE NÚMEROS CON DECIMALES:",
    "  Para preservar los decimales exactos del documento, devuelve length_m como STRING cuando tenga decimales:",
    '    - Si el documento dice "7.43" → devolver "length_m": "7.43" (como string)',
    '    - Si el documento dice "7.430" → devolver "length_m": "7.430" (como string, preserva el cero)',
    '    - Si el documento dice "7.4" → devolver "length_m": "7.4" (como string)',
    '    - Si el documento dice "7.4000" → devolver "length_m": "7.4000" (como string, preserva todos los decimales)',
    "",
    "  Razón: JavaScript pierde ceros finales cuando los números son float (7.430 se convierte a 7.43).",
    "  Usando strings preservamos exactamente el formato del documento original.",
    "",
    "  - Mantener hasta 4 decimales máximo si el documento los tiene",
    '  - Si no hay medida → "length_m": null',
    "",
    "=== COLINDANTES ===",
    "",
    "Detectar con:",
    '  - CON <texto>',
    '  - COLINDA CON <texto>',
    '  - LIMITA CON <texto>',
    '  - HACIA <texto>',
    "",
    "Reglas:",
    "1. El colindante puede estar en la misma línea o en las 2 siguientes.",
    '2. El colindante puede contener números: "L3 Manzana 424".',
    '3. Números después de "CON" NO son medidas.',
    "",
    "=== DIRECCIONES REPETIDAS ===",
    "",
    "Si una dirección aparece repetida:",
    "  SURESTE 1",
    "  SURESTE 2",
    "  SURESTE 3",
    "",
    "→ No fusionar.",
    "→ No colapsar.",
    "→ Cada una es una colindancia independiente.",
    "",
    "=== ERRORES OCR (DEBES CORREGIRLOS) ===",
    "",
    "1. Valores sospechosamente repetidos:",
    "   - Si dos medidas iguales aparecen en direcciones repetidas (ej. 0.500 y 0.500), verificar si en el plano había valores grandes (ej. 9.200, 5.800, 15.000).",
    "   - Priorizar la interpretación numérica más lógica.",
    "",
    "2. Corrección de confusiones comunes:",
    "   - SURESTE ↔ SUROESTE",
    "   - NORESTE ↔ NOROESTE",
    "   - NORTE ↔ NOROESTE",
    "",
    "3. Anti-distorsión:",
    "   Si el texto está ruidoso o pixelado, usar corrección fonética y el patrón más consistente.",
    "",
    "=== BLOQUES RUIDOSOS ===",
    "",
    "1. Si la imagen tiene ruido o sombra, nunca confiar en OCR global.",
    '2. Preferir CROP local del bloque "MEDIDAS Y COLINDANCIAS".',
    "3. Las longitudes pequeñas (<1m) SON válidas.",
    "4. Las longitudes grandes (≥5m, ≥10m, ≥15m) son válidas aunque OCR las deforme.",
    "",
    "=== COLINDANTES QUE CONTIENEN NÚMEROS ===",
    "",
    "Regla:",
    'Si un número aparece después de "CON", forma parte del nombre.',
    "",
    "Ej:",
    '"Con L3 Manzana 424" → colindante válido.',
    '"Con Unidad 4" → colindante válido.',
    "",
    "=== BLOQUES SIN MEDIDAS ===",
    "",
    "Si aparece:",
    "  ARRIBA: CON UNIDAD C604",
    "",
    "Entonces:",
    "  length_m = null",
    "  length_prefix = null",
    "",
    "=== BLOQUES MÚLTIPLES ===",
    "",
    "Ejemplos:",
    "  UNIDAD C504",
    "  COCHERA 1",
    "  COCHERA 2",
    "",
    "Cada bloque produce un JSON independiente.",
    "",
    "=== SUPERFICIES ===",
    "",
    "Debes extraer la superficie total de cada unidad si aparece en el plano.",
    "",
    "Formatos aceptados:",
    "  SUPERFICIE: 55.980 m²",
    "  SUPERFICIE TOTAL: 55.980 m²",
    "  SUP.: 55.980 m²",
    "  SUPERFICIE LOTE: 145.600 m²",
    "  55.980 m²",
    "  55.980 m2",
    "",
    "Reglas:",
    "  - Buscar superficies cerca del nombre de la unidad o en la sección de medidas",
    "  - Extraer el valor numérico en metros cuadrados (m² o m2)",
    "  - Convertir coma decimal a punto: \"55,980\" → 55.980",
    "  - Si hay múltiples superficies (ej: ÁREA CONSTRUIDA, ÁREA TOTAL), extraer todas",
    "  - Preferir \"TOTAL\" o \"LOTE\" si hay múltiples superficies",
    "  - Si no hay superficie explícita, dejar el array surfaces vacío []",
    "",
    "=== VALIDACIÓN DE UNIDADES ===",
    "",
    "Una colindancia es válida si tiene:",
    "  - Dirección (obligatoria)",
    "  - Medida (opcional)",
    "  - Colindante (opcional)",
    "",
    "Una unidad es válida si tiene ≥ 1 colindancia válida.",
    "",
    "=== FORMATO FINAL JSON ===",
    "",
    "Debes devolver SIEMPRE este formato:",
    "",
    "[",
    "  {",
    '    "unit_name": "UNIDAD X",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    "          {",
    '            "length_prefix": "",',
    '            "length_m": 6.750,',
    '            "abutter": "UNIDAD B-4",',
    '            "order_index": 0',
    "          },",
    "          {",
    '            "length_prefix": "",',
    '            "length_m": 1.750,',
    '            "abutter": "CUBO DE ILUMINACION",',
    '            "order_index": 1',
    "          }",
    "        ]",
    "      }",
    "    ],",
    '    "surfaces": [',
    '      { "name": "TOTAL", "value_m2": 55.980 }',
    "    ]",
    "  }",
    "]",
    "",
    "Reglas del JSON:",
    "  - JSON válido siempre.",
    "  - unit_name según aparece en el plano.",
    "  - directions: array de bloques de dirección, en orden de aparición.",
    "  - raw_direction = dirección original del texto (ej: \"SURESTE\", \"NORTE\", \"ARRIBA\", \"COLINDANCIA SUPERIOR\", \"COLINDANCIA INFERIOR\").",
    "  - normalized_direction = código corto: N/S/E/W/NE/NW/SE/SW/UP/DOWN.",
    "  - direction_order_index: orden de aparición de cada dirección en el documento (inicia en 0, se incrementa por cada dirección explícita).",
    "  - segments: array de colindancias que pertenecen a esta dirección.",
    "  - length_prefix: prefijo de la medida (\"\", \"EN\", \"LC=\", etc.) o null si no hay medida.",
    "  - length_m: longitud en metros (número O string) o null si no hay medida. " +
    "IMPORTANTE: Si el documento muestra decimales específicos (ej: 7.430), devuélvelo como string '7.430' para preservar los decimales exactos.",
    "  - abutter: nombre del colindante (string vacío si no hay).",
    "  - order_index: orden GLOBAL secuencial de cada segmento en el documento (inicia en 0, se incrementa continuamente sin importar la dirección).",
    "  - Cada dirección explícita crea un nuevo bloque en el array \"directions\", incluso si es la misma que la anterior.",
    "  - surfaces: array opcional de superficies extraídas del plano (ej: [{ name: \"TOTAL\", value_m2: 55.980 }]).",
    "  - Si no hay superficie, usar array vacío: []",
    "",
    "EJEMPLO COMPLETO (CON direcciones verticales explícitas):",
    "",
    "Texto de entrada:",
    '"UNIDAD B-2\\n',
    'OESTE:\\n',
    '6.750 MTS. CON UNIDAD B-4\\n',
    '1.750 MTS. CON CUBO DE ILUMINACION\\n',
    'NORTE:\\n',
    '2.550 MTS CON CUBO DE ILUMINACION\\n',
    '4.720 MTS. CON JUNTA CONSTRUCTIVA 1\\n',
    'ESTE:\\n',
    '0.520 MTS CON AREA COMUN DE SERVICIO 7\\n',
    'SUR:\\n',
    '5.370 MTS CON AREA COMUN 1\\n',
    'ARRIBA: CON UNIDAD C504\\n',
    'ABAJO: CON UNIDAD C506\\n',
    'COLINDANCIA SUPERIOR: CON UNIDAD D-5\\n',
    'COLINDANCIA INFERIOR: CON UNIDAD D-6"',
    "",
    "NOTA: Este ejemplo incluye ARRIBA, ABAJO, COLINDANCIA SUPERIOR y COLINDANCIA INFERIOR porque aparecen EXPLÍCITAMENTE en el texto.",
    "Si NO aparecen en el texto/imagen, NO los incluyas.",
    "",
    "Variantes aceptadas para direcciones verticales:",
    "  - ARRIBA / SUPERIOR / COLINDANCIA SUPERIOR → todas se normalizan a UP",
    "  - ABAJO / INFERIOR / COLINDANCIA INFERIOR → todas se normalizan a DOWN",
    "",
    "⚠️ EJEMPLO CRÍTICO SIN direcciones verticales ⚠️",
    "",
    "IMPORTANTE: Este ejemplo muestra cómo NO incluir direcciones verticales cuando NO aparecen explícitamente.",
    "",
    "Texto de entrada:",
    '"UNIDAD B-2\\n',
    'OESTE:\\n',
    '6.750 MTS. CON UNIDAD B-4\\n',
    '1.750 MTS. CON CUBO DE ILUMINACION\\n',
    'NORTE:\\n',
    '2.550 MTS CON CUBO DE ILUMINACION\\n',
    '4.720 MTS. CON JUNTA CONSTRUCTIVA 1\\n',
    'ESTE:\\n',
    '0.520 MTS CON AREA COMUN DE SERVICIO 7\\n',
    'SUR:\\n',
    '5.370 MTS CON AREA COMUN 1"',
    "",
    "⚠️ NOTA: En este texto NO aparece \"ARRIBA:\" ni \"ABAJO:\" ⚠️",
    "",
    "Salida JSON esperada (SIN direcciones verticales - SOLO incluir las que aparecen):",
    "[",
    "  {",
    '    "unit_name": "UNIDAD B-2",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "OESTE",',
    '        "normalized_direction": "W",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 6.750, "abutter": "UNIDAD B-4", "order_index": 0 },',
    '          { "length_prefix": "", "length_m": 1.750, "abutter": "CUBO DE ILUMINACION", "order_index": 1 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 1,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 2.550, "abutter": "CUBO DE ILUMINACION", "order_index": 2 },',
    '          { "length_prefix": "", "length_m": 4.720, "abutter": "JUNTA CONSTRUCTIVA 1", "order_index": 3 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "ESTE",',
    '        "normalized_direction": "E",',
    '        "direction_order_index": 2,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 0.520, "abutter": "AREA COMUN DE SERVICIO 7", "order_index": 4 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SUR",',
    '        "normalized_direction": "S",',
    '        "direction_order_index": 3,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 5.370, "abutter": "AREA COMUN 1", "order_index": 5 }',
    "        ]",
    "      }",
    "    ]",
    "  }",
    "]",
    "",
    "IMPORTANTE: NO incluyas ARRIBA o ABAJO si no aparecen en el texto/imagen.",
    "",
    "Salida JSON esperada:",
    "[",
    "  {",
    '    "unit_name": "UNIDAD B-2",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "OESTE",',
    '        "normalized_direction": "W",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 6.750, "abutter": "UNIDAD B-4", "order_index": 0 },',
    '          { "length_prefix": "", "length_m": 1.750, "abutter": "CUBO DE ILUMINACION", "order_index": 1 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 1,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 2.550, "abutter": "CUBO DE ILUMINACION", "order_index": 2 },',
    '          { "length_prefix": "", "length_m": 4.720, "abutter": "JUNTA CONSTRUCTIVA 1", "order_index": 3 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "ESTE",',
    '        "normalized_direction": "E",',
    '        "direction_order_index": 2,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 0.520, "abutter": "AREA COMUN DE SERVICIO 7", "order_index": 4 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SUR",',
    '        "normalized_direction": "S",',
    '        "direction_order_index": 3,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 5.370, "abutter": "AREA COMUN 1", "order_index": 5 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "ARRIBA",',
    '        "normalized_direction": "UP",',
    '        "direction_order_index": 4,',
    '        "segments": [',
    '          { "length_prefix": null, "length_m": null, "abutter": "UNIDAD C504", "order_index": 6 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "ABAJO",',
    '        "normalized_direction": "DOWN",',
    '        "direction_order_index": 5,',
    '        "segments": [',
    '          { "length_prefix": null, "length_m": null, "abutter": "UNIDAD C506", "order_index": 7 }',
    "        ]",
    "      }",
    "    ]",
    "  }",
    "]",
    "",
    "EJEMPLO CON DIRECCIONES REPETIDAS (todas explícitas - NO agrupar):",
    "",
    "⚠️ CASO CRÍTICO: Si TODAS las líneas tienen dirección explícita, cada una es un bloque independiente",
    "",
    "Texto de entrada:",
    '"SUROESTE: EN 0.95 m CON VACIO A AREA COMUN 20\\n',
    'SUROESTE: EN 0.4 m CON VACIO A AREA COMUN 20\\n',
    'SURESTE: EN 0.8 m CON VACIO A AREA COMUN 20\\n',
    'SURESTE: EN 5.8 m CON VACIO A AREA COMUN 20\\n',
    'SUROESTE: EN 4.05 m CON VACIO A AREA COMUN 20"',
    "",
    "Salida JSON esperada (cada dirección explícita = bloque independiente):",
    "[",
    "  {",
    '    "unit_name": "UNIDAD X",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "SUROESTE",',
    '        "normalized_direction": "SW",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    '          { "length_prefix": "EN", "length_m": 0.95, "abutter": "VACIO A AREA COMUN 20", "order_index": 0 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SUROESTE",',
    '        "normalized_direction": "SW",',
    '        "direction_order_index": 1,',
    '        "segments": [',
    '          { "length_prefix": "EN", "length_m": 0.4, "abutter": "VACIO A AREA COMUN 20", "order_index": 1 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SURESTE",',
    '        "normalized_direction": "SE",',
    '        "direction_order_index": 2,',
    '        "segments": [',
    '          { "length_prefix": "EN", "length_m": 0.8, "abutter": "VACIO A AREA COMUN 20", "order_index": 2 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SURESTE",',
    '        "normalized_direction": "SE",',
    '        "direction_order_index": 3,',
    '        "segments": [',
    '          { "length_prefix": "EN", "length_m": 5.8, "abutter": "VACIO A AREA COMUN 20", "order_index": 3 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SUROESTE",',
    '        "normalized_direction": "SW",',
    '        "direction_order_index": 4,',
    '        "segments": [',
    '          { "length_prefix": "EN", "length_m": 4.05, "abutter": "VACIO A AREA COMUN 20", "order_index": 4 }',
    "        ]",
    "      }",
    "    ]",
    "  }",
    "]",
    "",
    "⚠️ ERROR COMÚN: NO hacer esto:",
    "   NO crear un solo bloque SUROESTE con múltiples segments cuando hay múltiples líneas \"SUROESTE:\" explícitas",
    "",
    "EJEMPLO CON DIRECCIONES REPETIDAS (con líneas heredadas):",
    "",
    "Texto de entrada:",
    '"NORTE: 6.750 MTS. CON UNIDAD B-4\\n',
    '1.750 mts con cubo de iluminacion\\n',
    'SUR: 5.370 MTS CON AREA COMUN 1\\n',
    'NORTE: 2.550 MTS CON UNIDAD C-5"',
    "",
    "Salida JSON esperada:",
    "[",
    "  {",
    '    "unit_name": "UNIDAD X",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 6.750, "abutter": "UNIDAD B-4", "order_index": 0 },',
    '          { "length_prefix": "", "length_m": 1.750, "abutter": "CUBO DE ILUMINACION", "order_index": 1 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "SUR",',
    '        "normalized_direction": "S",',
    '        "direction_order_index": 1,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 5.370, "abutter": "AREA COMUN 1", "order_index": 2 }',
    "        ]",
    "      },",
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 2,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 2.550, "abutter": "UNIDAD C-5", "order_index": 3 }',
    "        ]",
    "      }",
    "    ]",
    "  }",
    "]",
    "",
    "EJEMPLO CON PREFIJO LC=:",
    "",
    "Texto de entrada:",
    '"NORTE: 6.750 MTS. CON UNIDAD B-4\\n',
    '1.750 mts con cubo de iluminacion\\n',
    'LC=2.55 con junta constructiva 1"',
    "",
    "Salida JSON esperada:",
    "[",
    "  {",
    '    "unit_name": "UNIDAD X",',
    '    "directions": [',
    "      {",
    '        "raw_direction": "NORTE",',
    '        "normalized_direction": "N",',
    '        "direction_order_index": 0,',
    '        "segments": [',
    '          { "length_prefix": "", "length_m": 6.750, "abutter": "UNIDAD B-4", "order_index": 0 },',
    '          { "length_prefix": "", "length_m": 1.750, "abutter": "CUBO DE ILUMINACION", "order_index": 1 },',
    '          { "length_prefix": "LC=", "length_m": 2.55, "abutter": "JUNTA CONSTRUCTIVA 1", "order_index": 2 }',
    "        ]",
    "      }",
    "    ]",
    "  }",
    "]",
    "",
    "=== REGLA CRÍTICA: NO INVENTAR DIRECCIONES ===",
    "",
    "⚠️ ⚠️ ⚠️ REGLA MÁS IMPORTANTE: NUNCA INVENTES DIRECCIONES ⚠️ ⚠️ ⚠️",
    "",
    "NUNCA agregues direcciones que NO aparezcan explícitamente en el texto o imagen.",
    "",
    "Esta es una de las reglas MÁS IMPORTANTES. Violar esta regla es un ERROR GRAVE.",
    "",
    "ADVERTENCIA ESPECIAL SOBRE DIRECCIONES VERTICALES:",
    "",
    "Si NO ves explícitamente \"ARRIBA:\", \"ABAJO:\", \"SUPERIOR:\", \"INFERIOR:\", \"COLINDANCIA SUPERIOR:\" o \"COLINDANCIA INFERIOR:\" en el texto/imagen:",
    "→ NUNCA las agregues",
    "→ NO las infieras de las direcciones horizontales",
    "→ NO las asumas por defecto",
    "→ SOLO incluye las direcciones que VERDADERAMENTE aparecen en el texto/imagen",
    "",
    "",
    "Ejemplos de ERRORES que DEBES EVITAR:",
    "",
    "1. Si NO ves \"ARRIBA:\" o \"ABAJO:\" en el texto/imagen:",
    "   → NO agregues direcciones verticales (ARRIBA, ABAJO, SUPERIOR, INFERIOR)",
    "   → NO las inventes, NO las infieras, NO las asumas",
    "",
    "2. Si solo ves direcciones horizontales (NORTE, SUR, ESTE, OESTE, intercardinales):",
    "   → NO agregues direcciones verticales automáticamente",
    "   → Solo devuelve las direcciones que VERDADERAMENTE aparecen",
    "",
    "3. Ejemplo de ERROR (NO HACER):",
    "   Texto/imagen muestra:",
    "     \"NORTE: 6.750 m CON UNIDAD B-4\"",
    "     \"SUR: 5.370 m CON AREA COMUN 1\"",
    "   Respuesta INCORRECTA:",
    "     Incluye ARRIBA y ABAJO (aunque no aparecen en el texto)",
    "   Respuesta CORRECTA:",
    "     Solo incluye NORTE y SUR (únicamente lo que aparece explícitamente)",
    "",
    "4. Las direcciones verticales (ARRIBA, ABAJO, SUPERIOR, INFERIOR, COLINDANCIA SUPERIOR, COLINDANCIA INFERIOR) SOLO deben incluirse SI:",
    "   - Aparecen EXPLÍCITAMENTE en el texto/imagen con \"ARRIBA:\", \"ABAJO:\", \"SUPERIOR:\", \"INFERIOR:\", \"COLINDANCIA SUPERIOR:\" o \"COLINDANCIA INFERIOR:\"",
    "   - Están CLARAMENTE VISIBLES en la imagen con esos textos exactos",
    "   - Si no las ves, NO las agregues bajo NINGUNA circunstancia",
    "",
    "5. Reglas para direcciones verticales:",
    "   - Variantes aceptadas: ARRIBA, ABAJO, SUPERIOR, INFERIOR, COLINDANCIA SUPERIOR, COLINDANCIA INFERIOR",
    "   - Si el texto dice \"ARRIBA: CON UNIDAD C504\" → SÍ incluirla",
    "   - Si el texto dice \"COLINDANCIA SUPERIOR: CON UNIDAD X\" → SÍ incluirla",
    "   - Si el texto dice \"COLINDANCIA INFERIOR: CON UNIDAD Y\" → SÍ incluirla",
    "   - Si el texto NO dice ninguna variante de dirección vertical → NO incluir ninguna dirección vertical",
    "   - Si la imagen NO muestra ninguna variante de dirección vertical → NO inventar direcciones verticales",
    "",
    "REGLA DE ORO:",
    "Solo extrae lo que VERDADERAMENTE está en el texto/imagen.",
    "No infieras, no asumas, no inventes, no deduzcas.",
    "Si no aparece explícitamente, NO existe. Punto.",
    "",
    "⚠️ VERIFICACIÓN FINAL ANTES DE ENVIAR LA RESPUESTA ⚠️",
    "",
    "Antes de enviar tu respuesta JSON, verifica:",
    "1. ¿Aparece explícitamente \"ARRIBA:\" en el texto/imagen?",
    "   → SI NO → NO incluir dirección ARRIBA",
    "2. ¿Aparece explícitamente \"ABAJO:\" en el texto/imagen?",
    "   → SI NO → NO incluir dirección ABAJO",
    "3. Si solo ves direcciones horizontales (NORTE, SUR, ESTE, OESTE, intercardinales):",
    "   → SOLO incluir esas direcciones",
    "   → NO agregar direcciones verticales automáticamente",
    "",
    "Si tienes dudas, NO incluyas la dirección. Es mejor omitir que inventar.",
    "",
    "=== REGLA FINAL ===",
    "",
    "Nunca inventes datos.",
    "Si existe ambigüedad, elige la interpretación más lógica basada en las reglas y ejemplos reales, pero NO generes información que no esté en el texto.",
    "NO agregues direcciones verticales si no aparecen explícitamente en el documento.",
    "",
    "Ahora analiza las imágenes y extrae las colindancias según estas reglas.",
  ].join("\n")
}

function preFilterOCRText(ocrText: string, unitHint?: string): string {
  if (!ocrText) return ""
  const text = ocrText.replace(/\r/g, "")
  const lower = text.toLowerCase()
  // Encontrar TODAS las ocurrencias de "Medidas y Colindancias" para construir candidatos
  const headings: number[] = []
  const regex = /medidas\s*y\s*colindancias/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(lower)) !== null) {
    headings.push(m.index)
  }
  // Si no hay encabezados claros, regresar texto original acotado
  if (headings.length === 0) {
    let sliced = text
    const endMatch = sliced.match(/(^|\n)\s*(superficie|superficies|descripci[oó]n|caracter[ií]sticas|observaciones|datos)\b/gi)
    if (endMatch && endMatch.index !== undefined && endMatch.index > 0) {
      sliced = sliced.slice(0, endMatch.index)
    }
    if (sliced.length > 8000) sliced = sliced.slice(0, 8000)
    return sliced.trim()
  }
  // Crear bloques candidatos entre cada encabezado y el siguiente encabezado fuerte
  const strongHeaderRe = /(^|\n)\s*(superficie|superficies|descripci[oó]n|caracter[ií]sticas|observaciones|datos|medidas\s*y\s*colindancias)\b/gi
  const candidates: string[] = []
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i]
    const slice = text.slice(start)
    const endMatch = slice.match(strongHeaderRe)
    let candidate = slice
    if (endMatch && endMatch.index !== undefined && endMatch.index > 0) {
      candidate = slice.slice(0, endMatch.index)
    }
    candidates.push(candidate.trim())
  }
  // Preparar pistas de unidad
  const unitUpper = (unitHint || "").toUpperCase()
  let unitToken = ""
  const mUnit = unitUpper.match(/UNIDAD\s+([A-Z0-9\-]+)/)
  if (mUnit && mUnit[1]) {
    unitToken = mUnit[1]
  }
  // Puntuar candidatos
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const cu = c.toUpperCase()
    let score = 0
    // Presencia de la unidad sugerida
    if (unitUpper && cu.includes(unitUpper)) score += 8
    if (unitToken && cu.includes(unitToken)) score += 6
    // Densidad de direcciones
    const dirCount = (cu.match(/\b(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE)\b/g) || []).length
    score += dirCount
    // Penalizar bloques típicos de estacionamiento (pero no descartar)
    if (/\bESTACIONAMIENTO|CAJ[ÓO]N\b/.test(cu)) score -= 3
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  let chosen = candidates[bestIdx] || candidates[0] || text
  if (chosen.length > 8000) chosen = chosen.slice(0, 8000)
  return chosen.trim()
}

type UnitBlock = {
  heading: string
  text: string
}

function splitTextIntoUnitBlocks(ocrText: string): UnitBlock[] {
  if (!ocrText) return []
  const text = ocrText.replace(/\r/g, "")
  const lines = text.split(/\n+/)

  const headingPattern = new RegExp(
    [
      "^UNIDAD\\s+[A-Z0-9\\-]+",
      "^CUBO\\s+DE\\s+ILUMINACI[ÓO]N",
      "^JUNTA\\s+CONSTRUCTIVA\\s+\\d+",
      "^CAJ[ÓO]N\\s+DE\\s+ESTACIONAMIENTO(?:\\s+[A-Z0-9\\-]+)?",
      "^ESTACIONAMIENTO(?:\\s+[A-Z0-9\\-]+)?",
      "^ÁREAS?\\s+COMUN(?:ES)?(?:\\s+DE\\s+SERVICIO)?(?:\\s+[A-Z0-9\\-]+)?",
      "^AREAS?\\s+COMUN(?:ES)?(?:\\s+DE\\s+SERVICIO)?(?:\\s+[A-Z0-9\\-]+)?",
    ].join("|"),
    "i"
  )

  const blocks: UnitBlock[] = []
  let currentHeading = "UNIDAD"
  let currentLines: string[] = []

  const pushCurrent = () => {
    const chunk = currentLines.join("\n").trim()
    if (!chunk) return
    blocks.push({
      heading: currentHeading,
      text: chunk,
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && headingPattern.test(trimmed)) {
      if (currentLines.length) pushCurrent()
      currentHeading = trimmed
      currentLines = [trimmed]
    } else {
      currentLines.push(line)
    }
  }
  pushCurrent()

  if (!blocks.length) {
    blocks.push({ heading: "UNIDAD", text })
  }

  return blocks
}

function pickUnitNameFromText(ocrText: string, fallback: string = "UNIDAD"): string {
  const upper = ocrText.toUpperCase()
  const patterns = [
    /UNIDAD\s+[A-Z0-9\-]+/g,
    /U[\-\s]?(\d+)/g, // e.g. U-64 => UNIDAD 64
    /CUBO DE ILUMINACI[ÓO]N/g,
    /JUNTA CONSTRUCTIVA\s+\d+/g,
    /CAJ[ÓO]N DE ESTACIONAMIENTO|ESTACIONAMIENTO/g,
    /LOTE\s+[0-9A-Z\-]+(?:\s*,\s*MANZANA\s+[0-9A-Z\-]+)?/g,
    /ÁREAS?\s+COMUN(?:ES)?(?:\s*\([^)]*\))?/g,
    /AREAS?\s+COMUN(?:ES)?(?:\s*\([^)]*\))?/g,
  ]
  for (const p of patterns) {
    const m = upper.match(p)
    if (m && m[0]) {
      const hit = m[0]
      if (/^U[\-\s]?\d+$/i.test(hit)) {
        const num = hit.replace(/[^0-9]/g, "")
        if (num) return `UNIDAD ${num}`
      }
      return hit
    }
  }
  return fallback
}

function normalizeUnitName(name: string | undefined | null): string {
  return (name || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:]+$/g, "")
    .trim()
}

function isHeadingLikeName(name: string): boolean {
  const bad = normalizeUnitName(name)
  if (!bad) return true
  if (bad === "MEDIDAS Y COLINDANCIAS") return true
  if (bad === "MEDIDAS") return true
  if (bad === "COLINDANCIAS") return true
  if (bad.startsWith("SUPERFICIE")) return true
  if (bad === "CONDOMINIO" || bad === "FRACCIONAMIENTO") return true
  if (/PROMOTORA|DESARROLLADORA|S\.?A\.?/i.test(bad)) return true
  // Descartar nombres demasiado largos (descripciones completas)
  if (bad.length > 80) return true
  return false
}

// Fusionar unidades con el mismo nombre lógico (ignorando mayúsculas/acentos)
// Updated for new format (unit_name)
function mergeUnitsByNameNew(units: StructuredUnit[]): StructuredUnit[] {
  const byName = new Map<string, StructuredUnit>()

  for (const u of units) {
    const rawName = u.unit_name || u.unit?.name || ""
    const norm = normalizeUnitName(rawName)
    if (!norm || isHeadingLikeName(rawName)) {
      continue
    }

    const existing = byName.get(norm)
    if (!existing) {
      // Ensure unit is in new format - preserve directions if present with deep copy
      const normalizedUnit: StructuredUnit = {
        unit_name: u.unit_name || u.unit?.name || "UNIDAD",
        directions: u.directions && Array.isArray(u.directions)
          ? u.directions.map((dir: any) => ({
            ...dir,
            segments: Array.isArray(dir.segments)
              ? dir.segments.map((seg: any) => ({ ...seg }))
              : []
          }))
          : undefined,
        boundaries: u.boundaries || [],
        surfaces: u.surfaces || [],
        anomalies: u.anomalies,
      }
      byName.set(norm, normalizedUnit)
      continue
    }

    // Preserve directions if present - merge directions when both units have them
    if (Array.isArray(u.directions) && u.directions.length > 0) {
      if (Array.isArray(existing.directions) && existing.directions.length > 0) {
        // Merge directions: preserve order by direction_order_index with deep copy
        const mergedDirections = [
          ...(existing.directions || []).map((dir: any) => ({
            ...dir,
            segments: Array.isArray(dir.segments)
              ? dir.segments.map((seg: any) => ({ ...seg }))
              : []
          })),
          ...(u.directions || []).map((dir: any) => ({
            ...dir,
            segments: Array.isArray(dir.segments)
              ? dir.segments.map((seg: any) => ({ ...seg }))
              : []
          })),
        ].sort((a, b) => (a.direction_order_index ?? 0) - (b.direction_order_index ?? 0))
        existing.directions = mergedDirections
      } else {
        // Existing unit doesn't have directions, use the new one with deep copy
        existing.directions = u.directions.map((dir: any) => ({
          ...dir,
          segments: Array.isArray(dir.segments)
            ? dir.segments.map((seg: any) => ({ ...seg }))
            : []
        }))
      }
    }

    // Fusionar boundaries
    const mergedBoundaries: StructuredUnit["boundaries"] = [
      ...(existing.boundaries || []),
      ...(u.boundaries || []),
    ]
    mergedBoundaries.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    mergedBoundaries.forEach((b, idx) => {
      b.order_index = idx
    })

    // Fusionar surfaces (por nombre)
    const mergedSurfaces: { name: string; value_m2: number }[] = []
    const seen = new Map<string, { name: string; value_m2: number }>()
    const pushSurface = (s: { name: string; value_m2: number }) => {
      const key = normalizeUnitName(s.name)
      const prev = seen.get(key)
      if (!prev) {
        seen.set(key, { name: s.name, value_m2: s.value_m2 })
      } else {
        // Si hay conflicto, conservar el valor mayor como heurística
        if (typeof s.value_m2 === "number" && s.value_m2 > (prev.value_m2 || 0)) {
          seen.set(key, { name: s.name, value_m2: s.value_m2 })
        }
      }
    }
      ; (existing.surfaces || []).forEach(pushSurface)
      ; (u.surfaces || []).forEach(pushSurface)
    seen.forEach((v) => mergedSurfaces.push(v))

    existing.boundaries = mergedBoundaries
    existing.surfaces = mergedSurfaces
  }

  return Array.from(byName.values())
}

// Legacy function for backward compatibility
function mergeUnitsByName(units: StructuredUnit[]): StructuredUnit[] {
  return mergeUnitsByNameNew(units)
}

function heuristicBoundaries(ocrText: string): StructuredUnit["boundaries"] {
  const lines = ocrText.split(/\n+/)
  const out: StructuredUnit["boundaries"] = []
  const dirMap: Record<string, string> = {
    NORTE: "NORTH",
    SUR: "SOUTH",
    ESTE: "EAST",
    OESTE: "WEST",
    NOROESTE: "NORTHWEST",
    NORESTE: "NORTHEAST",
    SUROESTE: "SOUTHWEST",
    SURESTE: "SOUTHEAST",
    ARRIBA: "UP",
    ABAJO: "DOWN",
    SUPERIOR: "UP",
    INFERIOR: "DOWN",
    "COLINDANCIA SUPERIOR": "UP",
    "COLINDANCIA INFERIOR": "DOWN",
  }
  let order = 0
  for (const raw of lines) {
    const l = raw.toUpperCase().trim()
    // Try to match "COLINDANCIA SUPERIOR" or "COLINDANCIA INFERIOR" first (two words)
    let dirMatch = l.match(/\b(AL\s+)?(COLINDANCIA\s+SUPERIOR|COLINDANCIA\s+INFERIOR)\b/i)
    let dir: string | undefined
    if (dirMatch) {
      dir = dirMap[(dirMatch[2] || "").toUpperCase().replace(/\s+/g, " ")]
    } else {
      // Otherwise try single word directions
      dirMatch = l.match(/\b(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\b/i)
      if (dirMatch) {
        dir = dirMap[(dirMatch[2] || "").toUpperCase()]
      }
    }
    if (!dirMatch || !dir) continue
    if (!dir) continue
    // Longitud: números con punto o coma, opcional m/mts/ml
    const lenMatch =
      l.match(/(\d+(?:[.,]\d+)?)(?=\s*(MTS?|ML|M\.?)(\b|[^A-Z]))/) ||
      l.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
    const length_m =
      lenMatch ? parseFloat(lenMatch[1].replace(",", ".")) : NaN
    // Abutter: después de "CON" o "COLINDA CON"
    let abutter = ""
    const conIdx = l.indexOf(" CON ")
    if (conIdx >= 0) {
      abutter = l.slice(conIdx + 5).replace(/\s+/g, " ").trim()
    } else {
      const colIdx = l.indexOf(" COLINDA CON ")
      if (colIdx >= 0) abutter = l.slice(colIdx + 13).replace(/\s+/g, " ").trim()
    }
    out.push({
      direction: dir,
      length_m: isNaN(length_m) ? 0 : length_m,
      abutter,
      order_index: order++,
    })
  }
  return out
}

// Más estricto: escanea encabezados de dirección y busca línea(s) siguientes con "EN <n> m" y "CON ..."
function parseBoundariesFromText(ocrText: string): StructuredUnit["boundaries"] {
  const dirMap: Record<string, string> = {
    NORTE: "NORTH",
    SUR: "SOUTH",
    ESTE: "EAST",
    OESTE: "WEST",
    NOROESTE: "NORTHWEST",
    NORESTE: "NORTHEAST",
    SUROESTE: "SOUTHWEST",
    SURESTE: "SOUTHEAST",
    ARRIBA: "UP",
    ABAJO: "DOWN",
    SUPERIOR: "UP",
    INFERIOR: "DOWN",
    "COLINDANCIA SUPERIOR": "UP",
    "COLINDANCIA INFERIOR": "DOWN",
  }
  const lines = ocrText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const upper = lines.map((s) => s.toUpperCase())
  const out: StructuredUnit["boundaries"] = []
  let order = 0
  for (let i = 0; i < upper.length; i++) {
    // Acepta encabezado solo o encabezado con contenido en la misma línea
    // Try to match "COLINDANCIA SUPERIOR" or "COLINDANCIA INFERIOR" first (two words)
    let lm = upper[i].match(/^(AL\s+)?(COLINDANCIA\s+SUPERIOR|COLINDANCIA\s+INFERIOR)\s*:?\s*(.*)$/i)
    let direction: string | undefined
    if (lm) {
      const dirEs = (lm[2] || "").toUpperCase().replace(/\s+/g, " ")
      direction = dirMap[dirEs]
    } else {
      // Otherwise try single word directions
      lm = upper[i].match(/^(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\s*:?\s*(.*)$/i)
      if (lm) {
        const dirEs = (lm[2] || "").toUpperCase()
        direction = dirMap[dirEs]
      }
    }
    if (!lm || !direction) continue
    if (!direction) continue
    // Buscar en las próximas líneas un patrón de longitud y colindante.
    let length_m = 0
    let abutter = ""
    // 1) Intentar extraer en la misma línea si hay contenido tras el encabezado
    const sameLine = (lm[3] || "").trim()
    if (sameLine) {
      const uj = sameLine
      const lenEn = uj.match(/\bEN\s+(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenBare = uj.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenLc = uj.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
      const lenMatch = lenEn || lenBare || lenLc
      if (lenMatch) {
        length_m = parseFloat(lenMatch[1].replace(",", "."))
        const conSame = uj.match(/\bCON\s+(.+?)\s*$/) || uj.match(/\bCOLINDA CON\s+(.+?)\s*$/)
        if (conSame && conSame[1]) {
          abutter = conSame[1].trim()
        }
      }
    }
    // 2) Si no se encontró en la misma línea, buscar en las siguientes
    if (!length_m || !abutter) {
      for (let j = i + 1; j < Math.min(i + 8, upper.length); j++) {
        const uj = upper[j]
        // Formatos válidos:
        // 1) "EN <n> M" (con o sin punto) opcional "CON ...".
        // 2) "<n> M" (con o sin punto) opcional "CON ...".
        // 3) línea posterior que inicie con "CON " o "COLINDA CON ".
        // 4) "LC=<n> M" o "LC=<n>" (longitud de arco común en planos)
        const lenEn = uj.match(/\bEN\s+(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
        const lenBare = uj.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
        const lenLc = uj.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
        const lenMatch = lenEn || lenBare || lenLc
        if (lenMatch) {
          length_m = parseFloat(lenMatch[1].replace(",", "."))
          // abutter mismo renglón si viene tras "CON ..."
          const conSame = uj.match(/\bCON\s+(.+?)\s*$/) || uj.match(/\bCOLINDA CON\s+(.+?)\s*$/)
          if (conSame && conSame[1]) {
            abutter = conSame[1].trim()
          } else if (j + 1 < upper.length) {
            const next = upper[j + 1]
            const conNext = next.match(/^\s*(CON|COLINDA CON)\s+(.+?)\s*$/)
            if (conNext && conNext[2]) abutter = conNext[2].trim()
          }
          break
        } else {
          // Línea tipo "CON ..." sin longitud aún
          const onlyCon = uj.match(/^\s*(CON|COLINDA CON)\s+(.+?)\s*$/)
          if (onlyCon && onlyCon[2] && !abutter) {
            abutter = onlyCon[2].trim()
          }
        }
      }
    }
    out.push({
      direction,
      length_m: isFinite(length_m) ? length_m : 0,
      abutter,
      order_index: order++,
    })
  }
  return out
}

/**
 * Call OpenAI Vision API with images
 * Supports any OpenAI model with vision capabilities:
 * - gpt-4o (default, recommended)
 * - gpt-4o-mini
 * - gpt-4-turbo
 * - gpt-5.1 (if available - use OPENAI_MODEL=gpt-5.1)
 * 
 * To verify available models, check: https://platform.openai.com/docs/models
 * or call: GET https://api.openai.com/v1/models
 * 
 * To use GPT-5.1, set OPENAI_MODEL=gpt-5.1 in your environment variables
 * 
 * @param prompt System prompt for the model
 * @param images Array of image files to analyze
 * @returns Parsed JSON response
 */
async function callOpenAIVision(prompt: string, images: File[]): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY
  // Default to gpt-4o, but can be overridden with OPENAI_MODEL env var
  // For GPT-5.1, set OPENAI_MODEL=gpt-5.1
  // Note: Model names may vary (e.g., gpt-5.1, gpt-5.1-preview, gpt-5.1-2024-12-01)
  // Check OpenAI documentation for the exact model identifier
  const model = process.env.OPENAI_MODEL || "gpt-4o"

  // Log the model being used for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[OpenAI Vision] Using model: ${model}`)
  }

  if (!apiKey) throw new Error("OPENAI_API_KEY missing")

  // Convert images to base64
  const imageParts = await Promise.all(
    images.map(async (image) => {
      const arrayBuffer = await image.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString("base64")
      return {
        type: "image_url",
        image_url: {
          url: `data:${image.type};base64,${base64}`,
        },
      }
    })
  )

  const url = `https://api.openai.com/v1/chat/completions`
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza estas imágenes de planos arquitectónicos y extrae la información de unidades, colindancias y superficies según las instrucciones del sistema. Devuelve SOLO JSON válido sin markdown ni explicaciones.",
            },
            ...imageParts,
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      // GPT-5.1 and newer models require max_completion_tokens instead of max_tokens
      // We use max_completion_tokens for newer models (gpt-5.x, o1) and max_tokens for older ones
      ...(model.includes("gpt-5") || model.includes("o1")
        ? { max_completion_tokens: 4000 }
        : { max_tokens: 4000 }
      ),
    }),
  })

  if (!resp.ok) {
    const errorText = await resp.text()
    throw new Error(`OpenAI API error: ${resp.status} - ${errorText}`)
  }

  const data = await resp.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("empty_response")

  // Try to parse JSON, handle markdown code blocks if present
  let jsonText = text.trim()
  if (jsonText.startsWith("```")) {
    const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/)
    if (match) jsonText = match[1]
  }

  return {
    result: JSON.parse(jsonText),
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  }
}

// Updated for new format
function simpleFallbackNew(source: string): StructuredUnit {
  const name = source?.replace(/\.(png|jpg|jpeg|pdf)$/i, "").slice(0, 60) || "UNIDAD"
  return {
    unit_name: name,
    boundaries: [],
    surfaces: [],
    anomalies: [],
  }
}

// Legacy function for backward compatibility
function simpleFallback(source: string): StructuredUnit {
  return simpleFallbackNew(source)
}

function extractSurfacesFromText(ocrText: string): { name: string; value_m2: number }[] {
  if (!ocrText) return []
  const text = ocrText.replace(/\r/g, "")
  const lines = text.split(/\n+/)
  const out: { name: string; value_m2: number }[] = []

  // Helper to parse a number with comma or dot decimals
  const parseNum = (s: string): number => {
    const trimmed = s.trim()
    // If both separators appear, assume the last occurrence is the decimal separator
    const lastComma = trimmed.lastIndexOf(",")
    const lastDot = trimmed.lastIndexOf(".")
    let normalized = trimmed
    if (lastComma > lastDot) {
      normalized = trimmed.replace(/\./g, "").replace(",", ".")
    } else if (lastDot > lastComma) {
      normalized = trimmed.replace(/,/g, "")
    } else {
      normalized = trimmed.replace(",", ".")
    }
    const n = Number.parseFloat(normalized)
    return isNaN(n) ? NaN : n
  }

  const pushSurface = (nameRaw: string, valueRaw: string) => {
    const value = parseNum(valueRaw)
    if (!isNaN(value)) {
      // Normalize name to Title Case without leading "SUPERFICIE"/"SUP."
      let name = nameRaw.trim()
      name = name.replace(/^SUPERFICIE(S)?\s*/i, "")
      name = name.replace(/^SUP\.\s*/i, "")
      name = name.replace(/[:=\-]+$/g, "").trim()
      // If empty, use generic "TOTAL"
      if (!name) name = "TOTAL"
      // Title case
      name = name
        .toLowerCase()
        .replace(/(^|[\s_-])([a-záéíóúñ])/g, (_m, sep, c) => `${sep}${c.toUpperCase()}`)
      out.push({ name, value_m2: value })
    }
  }

  // Pattern 1: SUPERFICIE <LABEL>: <VALUE> m2|m²
  const reSurface = /(SUPERFICIE(?:S)?(?:\s+DE)?\s+[A-ZÁÉÍÓÚÑ0-9\s._-]{0,40})[:=]\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i
  // Pattern 2: SUP. <LABEL>[:=]? <VALUE> m2|m²
  const reSup = /(SUP\.\s+[A-ZÁÉÍÓÚÑ0-9\s._-]{1,40})[:=]?\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i
  // Pattern 3: Standalone SUPERFICIE LOTE <VALUE>
  const reLot = /(SUPERFICIE\s+LOTE)\s*[:=]?\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i

  for (const raw of lines) {
    const l = raw.trim()
    let m = l.match(reSurface)
    if (m) {
      pushSurface(m[1], m[2])
      continue
    }
    m = l.match(reSup)
    if (m) {
      pushSurface(m[1], m[2])
      continue
    }
    m = l.match(reLot)
    if (m) {
      pushSurface("LOTE", m[2])
      continue
    }
  }
  return out
}

export async function POST(req: Request) {
  try {
    // Accept FormData with images
    const formData = await req.formData()
    const images = formData.getAll("images") as File[]

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "bad_request", message: "images required" }, { status: 400 })
    }

    // Cache is disabled - always process images with AI
    // This ensures fresh results every time, avoiding stale cache issues
    console.log(`[api/ai/structure] Processing ${images.length} image(s) with AI (cache disabled)...`)

    let processedUnits: StructuredUnit[] | null = null
    let processedMetadata: { lotLocation?: string; totalLotSurface?: number } | undefined = undefined
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined = undefined

    // Always process (cache disabled)
    try {
      const prompt = getColindanciasRules()
      // Call OpenAI Vision with all images
      const { result: aiResponse, usage: aiUsage } = await callOpenAIVision(prompt, images)
      usage = aiUsage

      // Extract lot-level metadata if present
      let lotLocation: string | undefined = undefined
      let totalLotSurface: number | undefined = undefined

      if (typeof aiResponse.lotLocation === "string" && aiResponse.lotLocation.trim()) {
        lotLocation = aiResponse.lotLocation.trim()
      }
      if (typeof aiResponse.totalLotSurface === "number" && aiResponse.totalLotSurface > 0) {
        totalLotSurface = aiResponse.totalLotSurface
      }

      // OpenAI might return a single unit or multiple units
      // Handle both cases and normalize to new format
      let units: StructuredUnit[] = []

      // Normalize response to new format
      function normalizeUnit(unitRaw: any): StructuredUnit | null {
        if (!unitRaw || typeof unitRaw !== "object") return null

        // Extract unit_name (new format) or unit.name (legacy)
        const unitName = unitRaw.unit_name || unitRaw.unit?.name || "UNIDAD"
        if (!unitName) return null

        // Check if unit has directions array (new format from AI)
        if (Array.isArray(unitRaw.directions) && unitRaw.directions.length > 0) {
          // Preserve new format with directions and segments
          const directions = unitRaw.directions
            .filter((dir: any) => dir.raw_direction && Array.isArray(dir.segments))
            .map((dir: any) => {
              const rawDir = String(dir.raw_direction).trim()
              // Ensure normalized_direction is correct, normalize it if needed
              let normalizedDir = dir.normalized_direction
              if (!normalizedDir || !["N", "S", "E", "W", "NE", "NW", "SE", "SW", "UP", "DOWN"].includes(normalizedDir)) {
                normalizedDir = normalizeDirectionCode(rawDir)
              }

              return {
                raw_direction: rawDir,
                normalized_direction: normalizedDir as any,
                direction_order_index: typeof dir.direction_order_index === "number" ? dir.direction_order_index : 0,
                segments: (dir.segments || [])
                  .map((seg: any) => {
                    // Preserve length_m as string if it's already a string, otherwise convert to number
                    // This allows preserving exact decimal places from the AI response
                    let lengthM: number | string | null = null
                    if (seg.length_m !== null && seg.length_m !== undefined) {
                      if (typeof seg.length_m === "string") {
                        // Already a string, preserve it as-is (maintains exact decimals)
                        lengthM = seg.length_m.trim()
                      } else if (typeof seg.length_m === "number") {
                        // It's a number, keep it as number
                        lengthM = seg.length_m
                      } else {
                        // Try to parse, but prefer string if original was likely a decimal
                        const parsed = parseFloat(String(seg.length_m))
                        lengthM = isNaN(parsed) ? null : parsed
                      }
                    }

                    return {
                      length_prefix: seg.length_prefix === null || seg.length_prefix === undefined ? null : String(seg.length_prefix).trim(),
                      length_m: lengthM,
                      abutter: String(seg.abutter || "").trim(),
                      order_index: typeof seg.order_index === "number" ? seg.order_index : 0,
                    }
                  })
                  .filter((seg: any) => seg.abutter || seg.length_m !== null),
              }
            })
            .filter((dir: any) => dir.segments.length > 0)

          if (directions.length === 0) return null

          return {
            unit_name: unitName,
            directions,
            // boundaries removed - frontend will generate from directions when needed
            surfaces: Array.isArray(unitRaw.surfaces) ? unitRaw.surfaces : [],
            anomalies: Array.isArray(unitRaw.anomalies) ? unitRaw.anomalies : undefined,
          }
        }

        // Handle legacy format: flat boundaries array
        if (Array.isArray(unitRaw.boundaries) && unitRaw.boundaries.length > 0) {
          const boundaries = unitRaw.boundaries
            .map((b: any, idx: number) => {
              // Handle new format boundary
              if (b.raw_direction && b.normalized_direction) {
                return {
                  raw_direction: b.raw_direction,
                  normalized_direction: b.normalized_direction as any,
                  length_m: b.length_m === null || b.length_m === undefined ? null : (typeof b.length_m === "number" ? b.length_m : parseFloat(String(b.length_m))),
                  abutter: String(b.abutter || "").trim(),
                  order_index: typeof b.order_index === "number" ? b.order_index : idx,
                }
              }

              // Handle legacy format (convert to new format)
              const rawDir = String(b.direction || "").trim()
              const normalizedDir = normalizeDirectionCode(rawDir)

              return {
                raw_direction: rawDir,
                normalized_direction: normalizedDir,
                length_m: b.length_m === null || b.length_m === undefined ? null : (typeof b.length_m === "number" ? b.length_m : parseFloat(String(b.length_m))),
                abutter: String(b.abutter || "").trim(),
                order_index: typeof b.order_index === "number" ? b.order_index : idx,
              }
            })
            .filter((b: any) => b.raw_direction && b.normalized_direction)

          // Sort by order_index to ensure correct order
          boundaries.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

          if (boundaries.length === 0) return null

          return {
            unit_name: unitName,
            boundaries,
            surfaces: Array.isArray(unitRaw.surfaces) ? unitRaw.surfaces : [],
            anomalies: Array.isArray(unitRaw.anomalies) ? unitRaw.anomalies : undefined,
          }
        }

        return null
      }

      // Handle new format: array of units directly
      if (Array.isArray(aiResponse)) {
        units = aiResponse.map(normalizeUnit).filter((u): u is StructuredUnit => u !== null)
      } else if (Array.isArray(aiResponse.results)) {
        // Legacy format with results wrapper
        units = aiResponse.results.map(normalizeUnit).filter((u): u is StructuredUnit => u !== null)
      } else if (Array.isArray(aiResponse.units)) {
        // New format with units wrapper (IA puede devolver { units: [...] })
        units = aiResponse.units.map(normalizeUnit).filter((u): u is StructuredUnit => u !== null)
      } else if (aiResponse.result) {
        const normalized = normalizeUnit(aiResponse.result)
        if (normalized) units = [normalized]
      } else if (aiResponse.unit_name || aiResponse.unit) {
        const normalized = normalizeUnit(aiResponse)
        if (normalized) units = [normalized]
      } else {
        // Log the actual response for debugging
        console.error("[api/ai/structure] Invalid AI response shape:", JSON.stringify(aiResponse, null, 2))
        throw new Error("invalid_ai_shape")
      }

      if (units.length === 0) {
        throw new Error("No valid units found in AI response")
      }

      // Merge units with the same name (if needed for legacy compatibility)
      // For new format, units are already normalized
      const merged = mergeUnitsByNameNew(units)

      // Filter out units without boundaries or directions
      const validUnits = merged.filter((u) =>
        (u.directions && Array.isArray(u.directions) && u.directions.length > 0) ||
        (u.boundaries && Array.isArray(u.boundaries) && u.boundaries.length > 0)
      )

      // If no valid units, create a fallback
      if (validUnits.length > 0) {
        processedUnits = validUnits
        console.log(`[api/ai/structure] Processed ${validUnits.length} valid units from AI response`)
      } else {
        console.warn(`[api/ai/structure] No valid units found in AI response, using fallback`)
        processedUnits = [simpleFallbackNew(images[0]?.name || "UNIDAD")]
      }

      // Store metadata
      if (lotLocation || totalLotSurface) {
        processedMetadata = { lotLocation, totalLotSurface }
        console.log(`[api/ai/structure] Extracted metadata: location=${lotLocation}, surface=${totalLotSurface}`)
      }
    } catch (e: any) {
      console.error("[api/ai/structure] OpenAI Vision error:", e)

      // Return a proper error response that the frontend can handle
      const errorMessage = e.message || "Error desconocido al procesar las imágenes"

      return Response.json({
        error: errorMessage,
        code: "AI_PROCESSING_ERROR",
        details: "La IA no pudo procesar las imágenes proporcionadas. Esto puede deberse a baja calidad, resolución insuficiente, o formato no compatible."
      }, {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Ensure all units have valid structure
    if (!processedUnits) {
      processedUnits = [simpleFallbackNew(images[0]?.name || "UNIDAD")]
    }

    // Ensure all units are in new format
    const results = processedUnits.map((result) => {
      const unit = JSON.parse(JSON.stringify(result)) as StructuredUnit

      // Ensure unit_name exists
      if (!unit.unit_name) {
        unit.unit_name = "UNIDAD"
      }

      // Preserve directions if present (new format from AI)
      if (Array.isArray(unit.directions) && unit.directions.length > 0) {
        // Unit already has directions format - preserve it with deep copy
        // Ensure each direction has valid segments
        unit.directions = unit.directions.map((dir: any) => ({
          raw_direction: dir.raw_direction,
          normalized_direction: dir.normalized_direction,
          direction_order_index: dir.direction_order_index,
          segments: Array.isArray(dir.segments)
            ? dir.segments.map((seg: any) => ({
              length_prefix: seg.length_prefix,
              length_m: seg.length_m,
              abutter: seg.abutter,
              order_index: seg.order_index,
            }))
            : [],
        })).filter((dir: any) => Array.isArray(dir.segments) && dir.segments.length > 0)

        // boundaries removed - frontend will generate from directions when needed

        // Debug: Log directions and segments
        console.log(`[api/ai/structure] Unit ${unit.unit_name} has ${unit.directions.length} directions`)
        unit.directions.forEach((dir: any, idx: number) => {
          console.log(`[api/ai/structure]   Direction ${idx}: ${dir.raw_direction} with ${dir.segments?.length || 0} segments`)
        })
      } else {
        // Legacy format: ensure boundaries array exists and is valid
        if (!Array.isArray(unit.boundaries)) {
          unit.boundaries = []
        }

        // Normalize each boundary to ensure it has required fields
        unit.boundaries = unit.boundaries.map((b, idx) => {
          if (!b.raw_direction) {
            // Legacy format: try to derive from normalized_direction or direction
            const rawDir = b.direction || b.normalized_direction || ""
            b.raw_direction = rawDir
          }
          if (!b.normalized_direction) {
            // Derive from raw_direction
            const normalizedDir = normalizeDirectionCode(b.raw_direction || b.direction || "")
            b.normalized_direction = normalizedDir
          }
          if (b.order_index === undefined || b.order_index === null) {
            b.order_index = idx
          }
          return b
        }).filter((b) => b.raw_direction && b.normalized_direction)
      }

      // Ensure surfaces array exists (optional)
      if (!Array.isArray(unit.surfaces)) {
        unit.surfaces = []
      }

      return unit
    })

    // Debug: Verify segments are present before returning
    results.forEach((unit, idx) => {
      if (Array.isArray(unit.directions) && unit.directions.length > 0) {
        unit.directions.forEach((dir: any, dirIdx: number) => {
          if (!Array.isArray(dir.segments) || dir.segments.length === 0) {
            console.warn(`[api/ai/structure] WARNING: Unit ${idx} (${unit.unit_name}), Direction ${dirIdx} (${dir.raw_direction}) has NO segments!`)
          } else {
            console.log(`[api/ai/structure] Unit ${idx} (${unit.unit_name}), Direction ${dirIdx} (${dir.raw_direction}) has ${dir.segments.length} segments`)
          }
        })
      }
    })

    const resp: StructuringResponse = {
      results,
      ...(processedMetadata?.lotLocation ? { lotLocation: processedMetadata.lotLocation } : {}),
      ...(processedMetadata?.totalLotSurface ? { totalLotSurface: processedMetadata.totalLotSurface } : {}),
      usage,
    }

    console.log(`[api/ai/structure] Returning ${results.length} units (fresh processing, cache disabled)`)
    return NextResponse.json(resp)
  } catch (e: any) {
    console.error("[api/ai/structure] Error:", e)
    return NextResponse.json({ error: "structure_failed", message: String(e?.message || e) }, { status: 400 })
  }
}
