# Test del Visor de PDF - Verificación de Fuente

## 🧪 **Pasos para Probar la Funcionalidad**

### **1. Preparación del Test**
- [ ] Asegúrate de tener un archivo PDF de prueba
- [ ] El archivo debe tener texto visible (no solo imágenes)
- [ ] Recomendado: PDF con texto sobre plano catastral o escritura

### **2. Proceso de Prueba**

#### **Paso 1: Subir Documento**
1. Ve a la sección "Pre-aviso"
2. Arrastra un archivo PDF a la zona de subida
3. Verifica que se detecte automáticamente como "Plano Catastral" o "Escritura"
4. Confirma que el documento aparezca como "Listo para procesar"

#### **Paso 2: Procesar con IA**
1. Haz clic en "Generar Documento con IA"
2. Espera a que termine el procesamiento
3. Deberías llegar a la pantalla de "Validación de Datos"

#### **Paso 3: Verificar Documento Original**
1. En la sección "Verificación de Fuente" (columna derecha)
2. Busca tu documento subido
3. Haz clic en el botón **"Verificar"** (azul)
4. Se debería abrir el modal de verificación

### **3. Verificaciones en el Modal**

#### **✅ Casos de Éxito:**
- [ ] El PDF se carga y muestra el contenido completo
- [ ] Aparece el resaltado amarillo sobre la región de texto
- [ ] Los controles de zoom (+ y -) funcionan
- [ ] El indicador de zoom muestra el porcentaje correcto
- [ ] Los botones "Abrir en nueva pestaña" y "Descargar PDF" funcionan

#### **⚠️ Casos de Error:**
- [ ] Si aparece "Error al cargar el PDF":
  - [ ] Verifica que el archivo no esté corrupto
  - [ ] Prueba con un PDF diferente
  - [ ] Los botones de fallback deberían funcionar

#### **🔄 Estados Intermedios:**
- [ ] Durante la carga: Spinner de "Cargando documento PDF..."
- [ ] Después de 10 segundos sin carga: Error automático
- [ ] Botón "Reintentar" si hay error

### **4. Problemas Conocidos y Soluciones**

#### **Problema: PDF no se carga en iframe**
- **Causa**: Restricciones de seguridad del navegador
- **Solución**: Los botones de fallback permiten abrir/descargar

#### **Problema: Resaltado no se ve**
- **Causa**: Posicionamiento del overlay
- **Solución**: El resaltado es simulado, se puede ajustar las coordenadas

#### **Problema: Zoom no funciona**
- **Causa**: Limitaciones del iframe
- **Solución**: Usar los controles nativos del PDF en nueva pestaña

### **5. Archivos de Prueba Recomendados**

```
- plano_catastral_lote_15.pdf
- escritura_compraventa_casa.pdf
- documento_notarial.pdf
```

### **6. Navegadores Soportados**

- ✅ Chrome (recomendado)
- ✅ Firefox
- ✅ Edge
- ⚠️ Safari (puede tener limitaciones con iframe)

### **7. Debugging**

Si algo no funciona:
1. Abre las herramientas de desarrollador (F12)
2. Ve a la consola para ver errores
3. Verifica que el archivo PDF no esté corrupto
4. Prueba con un PDF más simple (solo texto)

## 🎯 **Resultado Esperado**

Al final del test, deberías poder:
- Ver el documento PDF original renderizado
- Ver el resaltado amarillo sobre la región de texto extraído
- Usar los controles de zoom
- Acceder a opciones de descarga y apertura en nueva pestaña

**¡Esto demuestra que el sistema realmente procesó el archivo original y puede mostrar de dónde extrajo la información!**

