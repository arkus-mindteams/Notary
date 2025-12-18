# Conflictos entre Reglas: Base de Datos vs Código

Este documento detalla los conflictos específicos encontrados entre las reglas almacenadas en la base de datos y las hardcodeadas en el código.

---

## 🔴 CONFLICTOS CRÍTICOS (Contradicciones Directas)

### 1. **ESTADO 0 - Solicitud del Nombre del Comprador**

**Base de Datos (ESTADO 0 – EXPEDIENTE):**
```
- Si es nuevo: solicitar nombre del comprador principal.
```

**Código (SOLICITUD DE INFORMACIÓN DEL COMPRADOR):**
```
- NUNCA preguntes por el nombre del comprador por separado.
- SIEMPRE pide DIRECTAMENTE la identificación oficial (INE, IFE o Pasaporte) del comprador.
- El nombre, RFC, CURP y demás datos se extraerán automáticamente de la identificación cuando la suba.
```

**🔴 CONFLICTO:** 
- La base de datos instruye explícitamente a **solicitar el nombre del comprador principal** en el ESTADO 0.
- El código prohíbe categóricamente **pedir el nombre por separado** y exige pedir directamente la identificación.

**Impacto:** La IA puede confundirse sobre qué hacer en el ESTADO 0. Si sigue la DB, violará las reglas del código. Si sigue el código, ignorará las instrucciones de la DB.

**Solución sugerida:** Actualizar la DB para que diga "Solicitar identificación oficial del comprador principal" en lugar de "solicitar nombre".

---

### 2. **Rol del Chatbot: ¿Es Abogado/Notario o No?**

**Base de Datos (ROL DEL CHATBOT):**
```
- No eres abogado.
- No eres notario.
- Nunca tomas decisiones jurídicas.
- Tu función es guiar, preguntar, validar, clasificar, advertir y ensamblar información.
```

**Código (REGLAS CRÍTICAS DE COMUNICACIÓN):**
```
- SIEMPRE mantén el papel de un abogado/notario profesional que está ayudando al cliente.
- Habla de forma natural, como si estuvieras en una oficina notarial conversando con el cliente.
```

**🔴 CONFLICTO:**
- La base de datos establece claramente que **NO es abogado ni notario**, solo un asistente/capturista.
- El código instruye a **mantener el papel de abogado/notario profesional**.

**Impacto:** Confusión sobre la identidad del chatbot. ¿Debe presentarse como abogado/notario o como asistente? Esto afecta el tono y la forma de comunicarse.

**Solución sugerida:** 
- Opción A: Actualizar el código para que diga "mantén el papel de un asistente jurídico profesional" (alineado con DB).
- Opción B: Actualizar la DB para permitir que se presente como abogado/notario para mejor UX (pero mantener que no toma decisiones jurídicas).

---

## 🟡 CONFLICTOS PARCIALES (Inconsistencias o Ambigüedades)

### 3. **ESTADO 4 - Solicitud de Identificación del Comprador**

**Base de Datos (ESTADO 4 – COMPRADOR(ES)):**
```
- Solicitar identificación.
```
(No especifica cómo ni qué pedir exactamente)

**Código (SOLICITUD DE INFORMACIÓN DEL COMPRADOR):**
```
- NUNCA preguntes "¿Quién será el comprador principal?" o "¿Cuál es el nombre del comprador?"
- NO combines la solicitud del nombre con la solicitud de identificación. SOLO pide la identificación.
```

**🟡 CONFLICTO PARCIAL:**
- La base de datos es vaga: solo dice "solicitar identificación" sin especificar cómo.
- El código es muy específico sobre qué NO hacer y cómo hacerlo.

**Impacto:** Menor que el conflicto #1, pero puede generar confusión si la DB se actualiza en el futuro sin considerar las reglas del código.

**Solución sugerida:** Actualizar la DB para que sea más específica: "Solicitar identificación oficial (INE, IFE o Pasaporte) del comprador. NO pedir el nombre por separado."

---

### 4. **Salida del Chatbot: ¿JSON o Lenguaje Natural?**

**Base de Datos (SALIDA OBLIGATORIA):**
```
- La salida final del chatbot debe ser ÚNICAMENTE un JSON que cumpla el "JSON Canónico v1.0".
- No imprimir el documento final desde el LLM.
```

**Código (FORMATO DE RESPUESTA OBLIGATORIO):**
```
- Tu respuesta al usuario debe ser SOLO en lenguaje natural, como un abogado profesional.
- El bloque JSON es invisible y solo para el sistema.
```

**🟡 CONFLICTO PARCIAL:**
- La base de datos habla de "salida final" (probablemente se refiere al documento final generado).
- El código habla de respuestas conversacionales (interacción durante la captura).

**Impacto:** Puede ser confuso, pero probablemente se refieren a momentos diferentes del flujo:
- DB: Al final, cuando se genera el documento (debe ser JSON)
- Código: Durante la conversación (debe ser lenguaje natural con JSON oculto)

**Solución sugerida:** Aclarar en la DB que se refiere a la salida final del documento, no a las respuestas conversacionales. O agregar una nota explicando que durante la conversación se usa lenguaje natural con JSON oculto.

---

### 5. **Manejo de Expedientes: ¿Preguntar o Asumir?**

**Base de Datos (ESTADO 0 – EXPEDIENTE):**
```
- Confirmar expediente del comprador.
- Si es nuevo: solicitar nombre del comprador principal.
```
(Implícitamente sugiere que debe preguntar si es nuevo o existente)

**Código (MANEJO DE EXPEDIENTES):**
```
- Si el usuario tiene un trámite guardado en progreso (hasDraftTramite = true), reconócelo automáticamente como continuación de un expediente existente.
- Si no hay trámite guardado, asume automáticamente que es un expediente nuevo. NO preguntes al usuario si es nuevo o existente.
```

**🟡 CONFLICTO PARCIAL:**
- La base de datos dice "confirmar expediente" (sugiere preguntar).
- El código dice "NO preguntes al usuario si es nuevo o existente" (asumir automáticamente).

**Impacto:** Si la DB se interpreta como "preguntar al usuario", entraría en conflicto con el código que prohíbe preguntar.

**Solución sugerida:** Actualizar la DB para que diga: "Si hay trámite guardado, continuar automáticamente. Si no, asumir expediente nuevo y solicitar identificación del comprador."

---

## 🟢 INCONSISTENCIAS MENORES (Diferencias de Enfoque)

### 6. **No Inferir Información**

**Base de Datos (PRINCIPIOS OBLIGATORIOS):**
```
1. Nunca infieras información jurídica.
2. Nunca asumas: estado civil, régimen matrimonial, forma de pago, uso de crédito, existencia o inexistencia de gravámenes, número de hojas registrales.
3. Todo dato crítico debe venir de documento o captura manual con confirmación explícita.
```

**Código (INSTRUCCIONES PARA ESTE ESTADO):**
```
- NO infieras información. Todo dato crítico debe venir de documento o captura manual con confirmación.
```

**🟢 INCONSISTENCIA MENOR:**
- La base de datos es más detallada y específica sobre qué no inferir.
- El código es más general.

**Impacto:** Mínimo, pero la DB es más completa. El código podría beneficiarse de la especificidad de la DB.

**Solución sugerida:** El código ya está alineado, pero podría ser más específico usando los ejemplos de la DB.

---

### 7. **No Mencionar Estados al Usuario**

**Base de Datos:**
```
(No menciona explícitamente no mencionar estados, pero el flujo está diseñado para uso interno)
```

**Código (INSTRUCCIONES PARA ESTE ESTADO):**
```
- Sigue el orden estricto del flujo conversacional internamente, pero NUNCA menciones los estados (ESTADO 0, ESTADO 1, etc.) al usuario.
- NUNCA digas "Estamos en el ESTADO X" o "Vamos a pasar al ESTADO Y". Habla de forma natural como un abogado en una oficina.
```

**🟢 INCONSISTENCIA MENOR:**
- La base de datos no menciona explícitamente esta regla (aunque está implícita).
- El código es muy explícito sobre no mencionar estados.

**Impacto:** Mínimo, pero sería mejor tener esta regla también en la DB para consistencia.

**Solución sugerida:** Agregar a la DB una sección sobre comunicación que incluya "NUNCA mencionar los estados (ESTADO 0, ESTADO 1, etc.) al usuario durante la conversación."

---

## 📊 RESUMEN DE CONFLICTOS POR SEVERIDAD

### 🔴 Críticos (Requieren Acción Inmediata):
1. **ESTADO 0 - Solicitud del nombre vs identificación** → Conflicto directo
2. **Rol del chatbot - ¿Es abogado/notario o no?** → Conflicto directo

### 🟡 Parciales (Requieren Aclaración):
3. **ESTADO 4 - Especificidad de solicitud de identificación** → Inconsistencia
4. **Salida del chatbot - JSON vs lenguaje natural** → Ambigüedad de contexto
5. **Manejo de expedientes - ¿Preguntar o asumir?** → Interpretación diferente

### 🟢 Menores (Mejoras Sugeridas):
6. **No inferir información - Especificidad** → DB más detallada
7. **No mencionar estados - Explícito vs implícito** → Falta en DB

---

## 🛠️ PLAN DE RESOLUCIÓN RECOMENDADO

### Prioridad 1 (Críticos):
1. **Actualizar DB - ESTADO 0:**
   - Cambiar: "Si es nuevo: solicitar nombre del comprador principal"
   - Por: "Si es nuevo: solicitar identificación oficial (INE, IFE o Pasaporte) del comprador principal. NO pedir el nombre por separado."

2. **Decidir y unificar - Rol del chatbot:**
   - Opción recomendada: Actualizar código para decir "asistente jurídico profesional" (alineado con DB)
   - O actualizar DB para permitir presentarse como abogado/notario (mejor UX pero mantener límites)

### Prioridad 2 (Parciales):
3. **Actualizar DB - ESTADO 4:**
   - Especificar: "Solicitar identificación oficial (INE, IFE o Pasaporte) del comprador. NO pedir el nombre por separado."

4. **Aclarar DB - Salida obligatoria:**
   - Agregar nota: "Esta regla se refiere a la salida final del documento generado (JSON), no a las respuestas conversacionales durante la captura."

5. **Actualizar DB - ESTADO 0 (expediente):**
   - Cambiar: "Confirmar expediente del comprador"
   - Por: "Si hay trámite guardado, continuar automáticamente. Si no, asumir expediente nuevo."

### Prioridad 3 (Menores):
6. **Mejorar código - No inferir:**
   - Agregar ejemplos específicos de la DB al código

7. **Agregar a DB - No mencionar estados:**
   - Crear sección "REGLAS DE COMUNICACIÓN" en la DB con esta regla

---

## ⚠️ RIESGOS DE NO RESOLVER

1. **Comportamiento inconsistente:** La IA puede seguir reglas contradictorias dependiendo de qué parte del prompt tenga más peso.
2. **Experiencia de usuario confusa:** El chatbot puede pedir información de formas diferentes en diferentes momentos.
3. **Mantenimiento difícil:** Al tener reglas en dos lugares, es fácil que se desincronicen en el futuro.
4. **Debugging complejo:** Cuando hay problemas, es difícil saber qué regla está causando el comportamiento incorrecto.

