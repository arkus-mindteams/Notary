# PRD Pre-Aviso

Fuente: PRD Pre-Aviso.pdf (origen externo)
Ubicación origen: C:\Users\ulise\Documents\mindteams-admin-n8n\PRD Pre-Aviso.pdf
Fecha de incorporación al repo: 2026-02-11

## Nota
Este archivo es una transcripción del PRD para versionado en Git.
El contenido funcional del PRD tiene prioridad sobre la implementación actual.

---

## Transcripción
 PRD Completo -- Módulo de
Pre-Avisos
Nombre del módulo: Pre-Aviso (Solicitud de Certificado con efecto de pre-aviso)
Versión: 1.0 (Fase 1 - Preaviso de Compraventa)
Responsable funcional: Notaría 3 / área jurídica
Responsable técnico: Equipo Notaria / Dev




1. Contexto y propósito
La Notaría realiza de forma recurrente documentos de "Solicitud de Certificado con Efecto
de Pre-Aviso" basados en una plantilla fija y en información jurídica que hoy se recopila y
redacta manualmente.

La intención del módulo es:

    Digitalizar el proceso de captura.

    Estandarizar la lógica de los actos jurídicos que se incluyen.

    Integrar IA (OpenAI) para extracción de datos desde documentos cargados (INE,
    contratos, hojas registrales, etc.) y para construir algunos textos.

    Generar automáticamente el documento final en formato .docx / PDF, listo para
    revisarse y usarse en la Notaría.


Este módulo se integrará al sistema existente (ej. donde ya se tiene un módulo de lectura de
plantas arquitectónicas), pero tendrá su propio flujo completo de punta a punta.




2. Objetivos
2.1 Objetivo funcional

Permitir que el usuario de la Notaría (abogado, asistente jurídico, pasante) pueda:

   1. Capturar o subir la información de un caso de compraventa.

   2. Configurar los actos jurídicos que se pretenden otorgar (cancelación, compraventa,
      apertura de crédito).

   3. Obtener automáticamente un documento de Solicitud de Certificado con Efecto de
      Pre-Aviso de Compraventa, en formato Word/PDF, jurídicamente consistente y
      alineado a la plantilla de la Notaría 3.



2.2 Objetivo técnico

   1. Definir un modelo de datos estructurado (Preaviso) que represente todo lo que
      necesita la plantilla.

   2. Implementar un wizard de captura guiada que construya ese modelo.

   3. Integrar servicios de IA (OpenAI) para:

           Extraer campos clave desde documentos cargados.

           Generar algunos textos (descripción del inmueble, normalización de nombres,
           etc.).

   4. Implementar una capa de generación de documentos basada en plantillas .docx.




3. Alcance (Scope)
3.1 En esta Fase 1 (MVP Preaviso de Compraventa)

Tipos de preaviso soportados:

    Preaviso de Compraventa con estas combinaciones de actos:

          1. Acto 2 (Compraventa) SIEMPRE.

          2. Acto 1 (Cancelación de crédito/hipoteca) opcional (si el vendedor aún paga con
             crédito).

            3. Acto 3 (Apertura de crédito con garantía hipotecaria) opcional (si el comprador
               compra con crédito).


Entrada de información:

    Se permite captura manual de todos los campos.

    Se permite carga de documentos para extracción asistida por IA (pero siempre con
    revisión humana).


Salida:

    Documento de preaviso en formato:

             .docx (editable).

             .pdf (para impresión / archivo).


Usuarios:

    Personal de Notaría (no clientes finales).



3.2 Fuera de alcance en Fase 1 (pero considerado en diseño)

    Otros tipos de preaviso: donación, hipoteca, adjudicación, fideicomiso, etc.

    Automatizar el envío al Registro Público.

    Validación automática contra sistemas externos (RPP, bancos).

    Manejo completo de fideicomisos complejos (aunque el modelo de datos debe permitirlo
    en el futuro).



3.3 Supuestos

   1. La plantilla de la Notaría 3 es válida y aceptada jurídicamente.

   2. El artículo 2885 del Código Civil y el 139 de la Ley Urbana no cambiarán de forma
      relevante en el corto plazo.

  3. Los documentos de entrada (INE, hojas de inscripción, contratos, etc.) se recibirán en
     calidad suficiente para permitir OCR razonable.

  4. La notaría está dispuesta a revisar y corregir los primeros documentos generados hasta
     estabilizar el flujo.




4. Actores y roles
   Usuario interno (Capturista jurídico). Son Los asistentes del Abogado.

          Usa el wizard, carga documentos, corrige datos, genera el preaviso.

   Abogado/Notario

          Revisa el documento final.

          Puede exigir cambios en el texto base de plantilla (se considera input para
          futuras iteraciones).

   Admin del sistema

          Gestiona configuraciones: datos del notario, datos de la notaría, plantillas
          vigentes.




5. Flujo general de usuario (end-to-end)
  1. Usuario accede al módulo de Pre-Aviso.

  2. Crea un nuevo expediente de preaviso (Preaviso de Compraventa).

  3. Sigue el wizard:

         1. Paso 0 - Datos de la Notaría (si no vienen por defecto).

         2. Paso 1 - Inmueble (folios, unidad, antecedentes registrales).

          3. Paso 2 - Vendedor(es).

          4. Paso 3 - Crédito del vendedor (cancelación).

          5. Paso 4 - Comprador(es).

          6. Paso 5 - Crédito del comprador (apertura).

          7. Paso 6 - Revisión y confirmación de actos y texto.

   4. El sistema construye un objeto Preaviso completo con todos los datos.

   5. Se genera documento Word usando la plantilla.

   6. Se permite descarga del Word y/o PDF.

   7. El expediente queda almacenado, con versión del documento generada.




6. Requerimientos funcionales (detalle)

 6.1. Gestión de Preavisos -- (Versión ampliada y definitiva)
La gestión de preavisos estará totalmente integrada al concepto de Expediente del
Comprador, que representa el proyecto o caso completo de compraventa.
Todo lo relacionado con esa compraventa (Pre-Aviso, Preventivo, Plantas Arquitectónicas,
documentos cargados, contratos, identificaciones, etc.) forma parte del expediente del
comprador.

Esta decisión impacta directamente en:

    Cómo se crean los expedientes.

    Cómo se nombran.

    Cómo se relacionan con los preavisos.

    Cómo se navegan y organizan los archivos dentro del sistema.

 Regla de negocio (crítica):
      Todo preaviso pertenece obligatoriamente a un "Expediente del Comprador".

      El expediente se nombra por el nombre del comprador principal, ya que es
      quien será propietario final del inmueble y en cuyo expediente se integran todos
      los documentos notariales del proceso completo de la compraventa.




 Estructura del Expediente del Comprador
Cada expediente funcionará como un contenedor maestro que incluye:

    Pre-Aviso

    Preventivo (aviso notarial posterior a la firma)

    Plantas arquitectónicas asociadas

    Documentos del comprador (INE, CURP, actas, RFC, comprobantes, etc.)

    Documentos del vendedor

    Documentos del inmueble (hoja registral, asignación de número oficial, avalúos, etc.)

    Contratos previos (promesa, contratos de compraventa de desarrolladora, fideicomisos,
    etc.)

    Archivos generados automáticamente por el sistema (.docx, PDF, versiones)




 RF-1 (modificado) -- Crear expediente del comprador
Antes de crear un preaviso, se debe crear o seleccionar un Expediente del Comprador.

Al crear el expediente:

    Se solicita el nombre del comprador principal (quien será propietario).

    El sistema crea un expediente con ese nombre.

    Se asocia un identificador único (expediente_id).

    El expediente queda en estado en_proceso. (Se manejará un kanban en futuros
    pasos).


Ejemplo de nombre interno del expediente:

    Expediente: SAUL ORTIZ BOBADILLA



 RF-1.1 -- Asociar múltiples compradores a un expediente
Si hay varios compradores (pareja, copropietarios, coacreditados):

    El expediente se sigue nombrando con el comprador principal, pero internamente se
    registran todos los compradores como parte del expediente.

    Ejemplo:

            Comprador principal: JOSE MANUEL RODRIGUEZ MARTINEZ

            Coacreditada: XIMENA CASTILLO LOPEZ

    Expediente se llama:
    
    EXPEDIENTE: JOSE MANUEL RODRIGUEZ MARTINEZ



 RF-1.2 -- Un expediente puede tener múltiples documentos notariales
Dentro de la carpeta del comprador se debe crear una carpeta del Folio Real.

Dentro del expediente del folio real, se pueden generar varios documentos a lo largo del
proceso:

    Pre-Aviso  (primer documento)
    Preventivo  (después de firma)

    Escritura Pública  FINAL

    Adendas, correcciones, versiones

     Plantas arquitectónicas

     Avaluó

     Escrituras previas

     Todo lo que suba el usuario


El sistema debe permitir:

     Crear y almacenar múltiples versiones del preaviso dentro del expediente.

     Generar nuevos documentos a partir del mismo expediente.

     Descargar todos los archivos del expediente.




 RF-2 (modificado) -- Crear preaviso dentro de un expediente existente
El flujo correcto es:

    1. Usuario abre un expediente del comprador.

    2. Ve la sección "Documentos del expediente".

    3. Da clic en "Crear Pre-Aviso".

    4. Se inicia el wizard del preaviso, pero ya ligado al expediente.


Esto garantiza:

     Integridad documental

     Historial jurídico ordenado

     Coherencia del proceso completo




 RF-3 -- Un preaviso NO puede existir sin expediente

Si el usuario intenta crear un preaviso sin expediente:

    El sistema debe obligarlo a seleccionar o crear un expediente del comprador.

       




 RF-4 -- Datos del expediente reutilizables
Toda información capturada en el expediente puede ser reutilizada automáticamente por el
preaviso y viceversa:

    Datos de comprador(es)

    Datos de vendedor(es)

    Datos del inmueble

    Documentos cargados

    Extractos de OCR / IA


Ejemplo:

Si el usuario ya subió la hoja de inscripción en el expediente:

 En el wizard del preaviso ya aparece precargada.



 RF-5 -- Cada expediente debe permitir almacenar todos los documentos del proceso
Cada expediente debe tener categorías de documentos:

   1. Pre-Aviso

   2. Preventivo

   3. Escrituras

   4. Documentos del comprador

   5. Documentos del vendedor

   6. Documentos del inmueble

   7. Contratos

   8. Otros


Con soporte para:

    Subir archivos

    Previsualizar

    Descargar

    Versionar

    Asociar documentos específicos al preaviso




 RF-6 -- UI del expediente
La página del expediente debe mostrar:

   Encabezado:

    Nombre del comprador principal

    Estatus del expediente

    Unidad / Folio Real

    Fecha de creación

    Responsable (usuario del sistema)



   Tabs o secciones:

   1. Resumen general del expediente

   2. Pre-Aviso(s)

   3. Preventivo

   4. Plantas arquitectónicas

   5. Documentos del expediente

   6. Datos del comprador / vendedor

   7. Historial / auditoría




6.2 Wizard -- Paso 0: Datos de la Notaría

RF-4. Datos del notario y notaría

    Valores por defecto configurables:

           Nombre del notario.

           Cargo (titular / adscrito).

           Número de notaría.

           Nombre del titular.

           Domicilio.

           Teléfono(s).

    El usuario puede revisar y modificar puntualmente (por ejemplo, si firma el titular y no el
    adscrito).




6.3 Wizard -- Paso 1: Inmueble y antecedentes registrales

RF-5. Carga de documentos fuente

    El usuario puede cargar:

          1. Documento de asignación de número oficial (opcional).

          2. Hoja de inscripción del inmueble.

          3. Otros documentos (ej. escrituras previas).


RF-6. OCR / IA para extracción

    El sistema debe ofrecer un botón:
     "Extraer datos desde documentos"

    Al presionar:

          1. Se ejecuta OCR.

          2. Se envía el texto a OpenAI con un prompt para obtener:

                  Número(s) de partida.

                  Sección.

                  Folio real.

                  Tipo de acto registrado (compraventa, hipoteca, fideicomiso, etc.).

                  Titular registrado (vendedor original).


RF-7. Captura manual / edición

    Todos los campos deben ser editables:

           partidas[] (lista de strings).

           seccion.

           folio_real.


RF-8. Datos de la unidad / inmueble

    Capturar campos como:

          Identificador de unidad (ej. "4D", "6-34").

          Nombre del condominio / conjunto.

          Lote.

          Manzana.

          Fraccionamiento / colonia.

          Municipio (por defecto "Tijuana").

    Campo de descripción breve del inmueble:

          Puede:

                 Ser generado automáticamente a partir de los campos estructurados
                 (usando OpenAI).

                 O capturado manualmente.




6.4 Wizard -- Paso 2: Vendedor(es)

RF-9. Manejo de uno o varios vendedores

    Permitir agregar n vendedores.

    Para cada vendedor:

          Nombre completo.

          Tipo de persona: física / moral.

          RFC, CURP.

          Estado civil (para físicas).

          Régimen matrimonial (para casados).

          Si está casado por sociedad conyugal  solicitar datos de cónyuge.

RF-10. Carga de identificaciones

    El usuario puede cargar:

           INE, pasaporte, CURP, acta de matrimonio.

    Botón: "Extraer datos de identificación":

           OpenAI extrae nombre, CURP, RFC (si es visible).


RF-11. Reglas de cónyuge (simplificado Fase 1)

    Si el vendedor es "casado por bienes mancomunados / sociedad conyugal":

           Se debe sugerir que el cónyuge también figure como parte en la compraventa
           (VENDEDOR).

    El sistema debe marcar visualmente que:

           "Este vendedor tiene cónyuge obligado (acción legal)".




6.5 Wizard -- Paso 3: Crédito del vendedor (Acto 1 - Cancelación)

RF-12. Determinar si hay cancelación

    Pregunta clave:

           "¿La propiedad está totalmente pagada o se está pagando mediante crédito?"

    Opciones:

           Pagada  No hay acto de cancelación.

           Crédito vigente  Sí hay acto de cancelación.


RF-13. Datos de la institución

    Si hay crédito vigente:

             Nombre del banco / INFONAVIT / institución financiera.

             Rol jurídico  ACREEDOR.

             Rol del vendedor  DEUDOR (o deudor solidario, según caso; editable).


RF-14. Generación del Acto 1

     El sistema crea (en la estructura interna):


{
    "index": 1,
    "tipo_acto": "CANCELACION DE HIPOTECA",
    "roles": [
        { "rol": "ACREEDOR", "sujeto": "<institución>" },
        { "rol": "DEUDOR", "sujeto": "<vendedor(es)>" }
    ]
}


     Si no hay crédito  No se crea este acto.




6.6 Wizard -- Paso 4: Comprador(es)

RF-15. Manejo de uno o varios compradores

     Igual lógica que vendedores:

             Varios compradores.

             Persona física/moral.

             Carga de identificaciones.

             Estado civil y régimen.


RF-16. Carga y extracción de identificaciones

    Igual que en vendedores:

           INE / CURP  extracción de nombre, CURP, RFC.




6.7 Wizard -- Paso 5: Crédito del comprador (Acto 3 - Apertura)

RF-17. Forma de pago

    Pregunta:

           "¿El comprador pagará de contado o mediante crédito?"

    Opciones:

           Contado  No hay acto de apertura de crédito.

           Crédito  Sí hay.


RF-18. Datos del crédito

    Si hay crédito:

           Institución crediticia.

           Si hay coacreditado o coobligado.

           Mapeo de roles:

                  ACREDITANTE = institución.

                  ACREDITADO / COACREDITADO = comprador(es).

                  OBLIGADO SOLIDARIO Y GARANTE HIPOTECARIO (si aplica, ej.
                  cónyuge). Esta leyenda dependerá de la institución financiera


RF-19. Generación del Acto 3

    El sistema crea algo como:

{
    "index": 3,
    "tipo_acto": "CONTRATO DE APERTURA DE CRÉDITO CON GARANTÍA
HIPOTECARIA",
    "roles": [
        { "rol": "ACREDITANTE", "sujeto": "<institución>" },
        { "rol": "ACREDITADO", "sujeto": "<comprador principal>" },
        { "rol": "OBLIGADO SOLIDARIO Y GARANTE HIPOTECARIO", "sujeto":
"<cónyuge>" }
    ]
}


     Si no hay crédito  No se crea este acto.




6.8 Wizard -- Paso 6: Revisión y confirmación

RF-20. Vista de resumen

     Mostrar una vista consolidada con:

             Datos del notario.

             Inmueble.

             Vendedores / compradores.

             Lista de actos generados (con sus roles).

             Texto de "descripción breve del inmueble".


RF-21. Edición final antes de generar

     Desde aquí se debería poder:

             Editar un acto (nombre de acto, roles, sujetos).

             Editar cualquier texto crítico (como descripción del inmueble).

RF-22. Confirmación

    Botón: "Generar documento de Pre-Aviso".

    Al pulsarse:

           Se ensambla el JSON final.

           Se llama a la capa de generación de documento.




6.9 Generación de documento

RF-23. Mapeo JSON  plantilla Word

    Debe existir una capa que:

          1. Toma el objeto Preaviso.

          2. Rellena los placeholders de la plantilla usando el mapping definido (ej. acts[0]
              acto_1, etc. para Fase 1).


RF-24. Generación de archivo .docx

    Usar herramienta de plantillas (ej. docx-templater / python-docx / similar) para:

           Reemplazar variables.

           Producir un .docx válido.


RF-25. Exportación a PDF

    Opcional pero recomendado:

           Convertir .docx a .pdf para descarga inmediata.


RF-26. Versionado

    Cada vez que se regenere el documento:

           Guardar metadata de versión:

                  fecha/hora.

                  usuario.

                  número de versión.




6.10 Integración con IA (OpenAI)

RF-27. Extracción de datos desde texto

    Dado el texto OCR de un documento:

           El sistema debe enviar a OpenAI un prompt que pida un JSON con los campos
           requeridos (nombre, folio_real, partidas[], etc.).

    El sistema debe validar que:

           La respuesta sea JSON válido.

           Manejar reintentos si no lo es.


RF-28. Generación de descripción de inmueble

    Dado un conjunto de datos estructurados (unidad, lote, manzana, fracc., municipio):

           Llamar a OpenAI para que genere una frase en estilo notarial consistente con los
           ejemplos.

    Siempre debe permitir al usuario editar el resultado.


RF-29. No auto-guardar sin confirmación humana

    Ningún dato extraído por IA debe considerarse "definitivo" sin ser mostrado al usuario
    para revisión.

6.11 Persistencia y auditoría

RF-30. Guardado automático de progreso

    El wizard debe guardar automáticamente el progreso en cada paso para no perder
    trabajo.


RF-31. Historial de cambios

    Se debe registrar:

           Quién creó / modificó el preaviso.

           Qué documentos fueron subidos.


RF-32. Logs de IA

    Registrar:

           Llamadas a OpenAI (tipo de operación, timestamp, éxito/error).

           Nunca guardar el token de API en bases visibles.




7. Modelo de datos (conceptual)

7.1 Entidad Preaviso

Campos principales:

    id


    tipo_preaviso (enum: compraventa)

    estado (en_captura, listo, documento_generado)

    notary (objeto embed o referencia a tabla Notaria)

    registro (objeto: partidas[], seccion, folio_real)

   acts[] (lista de actos)

   property (objeto inmueble)

   created_at, updated_at, created_by, updated_by



7.2 Entidad Acto

   index (1,2,3...)

   tipo_acto (string)

   roles[]  lista de:

         rol (ej. "VENDEDOR", "COMPRADOR", "ACREDITANTE").

         sujeto (nombre en mayúsculas).



7.3 Entidad Compareciente (si se decide normalizar)

   id


   nombre


   tipo_persona (fisica, moral)

   rfc, curp


   estado_civil, regimen_matrimonial


   es_vendedor, es_comprador, es_acreditado, etc. (flags o roles relacionados).



7.4 Entidad Property

   folio_real

   unidad


   conjunto


   lote, manzana


   fraccionamiento / colonia


   descripcion_breve


   municipio, ciudad, estado



7.5 Entidad PreavisoDocumento

   id


   preaviso_id


   version


   ruta_docx


   ruta_pdf


   created_at, created_by




8. Requerimientos no funcionales
  1. Seguridad

        Todo tráfico por HTTPS.

        Cifrado en reposo de documentos cargados.

        Control de acceso: solo usuarios autenticados pueden ver/editar.

  2. Performance

          OCR + llamada a OpenAI para extracción en < 10-15 segundos para
          documentos estándar.

          Generación del documento en < 5 segundos.

  3. Confiabilidad

          En caso de fallo de IA, el sistema debe permitir captura manual sin bloquear el
          flujo.

  4. Usabilidad

          Wizard claro, con barra de progreso.

          Validaciones inline (campos obligatorios, formatos).




9. Edge cases (mapeados, pero algunos fuera del MVP
operativo)
  1. Varios vendedores / compradores (MVP: permitir lista, pero template puede concatenar
     nombres).

  2. Persona moral como vendedor/comprador (MVP: solo cambia el nombre, sin modelar
     representante).

  3. Sin cancelación ni apertura (ej: solo compraventa al contado y propiedad pagada).

  4. El OCR/IA detecta mal un nombre: usuario debe poder corregir.

  5. El acto de cancelación involucra a más de una institución o fase (MVP: no contemplado,
     se resuelve editando texto manual externamente).




10. Riesgos y mitigaciones

 1. Riesgo: IA extrae datos erróneos de documentos.

         Mitigación: Todo se revisa y edita antes de generar documento.

 2. Riesgo: Plantilla cambia por instrucción del notario.

         Mitigación: Mantener la plantilla desacoplada del código y configurable.

 3. Riesgo: Complejidad jurídica futura (fideicomisos complejos).

         Mitigación: Modelo de actos y roles ya es flexible (lista de actos + lista de roles).
         Se agregan nuevos tipos de actos en futuras fases.




11. Roadmap sugerido
 1. Fase 1.1 -- Wizard manual + generación de documento

         Sin extracción IA, sin OCR (solo captura manual).

 2. Fase 1.2 -- Integración IA para extracción básica

         Documentos: hoja de inscripción, INE, contratos.

 3. Fase 1.3 -- Mejora de UX, validaciones y reporting

         Historial de preavisos, filtros, etc.

 4. Fase 2 -- Otros tipos de preaviso

         Donación, adjudicación, etc.


