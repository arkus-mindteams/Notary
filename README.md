# 🏛️ Sistema de Interpretación y Redacción Notarial de Deslindes

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

Sistema web frontend para abogados y notarios que permite procesar documentos de deslindes (medidas y colindancias de propiedades) y generar solicitudes de pre-aviso con procesamiento de IA.

## ✨ Características Principales

- 🔍 **Lectura de Deslinde**: Procesamiento OCR y validación visual
- 📋 **Pre-aviso**: Generación automática de solicitudes de certificado
- 🤖 **IA Integrada**: Procesamiento inteligente de documentos
- ✅ **Validación Avanzada**: Sistema robusto de validación de datos
- 📊 **Dashboard**: Interfaz centralizada para gestión
- 🔐 **Autenticación**: Sistema de seguridad completo
- 📄 **Exportación**: Generación de documentos .docx
- 🎯 **Resaltado Visual**: Sincronización entre documento y texto

## 🚀 Tecnologías

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Estado**: Context API + React Hooks

### Backend & Servicios
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage
- **IA**: Cursos (procesamiento de documentos)
- **Automatización**: N8N (workflows)

## 📚 Documentación

- 📖 [Documentación Completa del Sistema](./DOCUMENTACION_SISTEMA.md)
- 🗺️ [Roadmap de Desarrollo](./ROADMAP_DESARROLLO.md)
- 🧪 [Archivos de Prueba](./DEMO_FILES.md)

## 🛠️ Instalación

### Prerrequisitos
- Node.js 18+ 
- npm o yarn
- Cuenta de Supabase (para backend)

### Pasos de Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/TU_USUARIO/notaria-deslinde.git
cd notaria-deslinde

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

# 4. Ejecutar en desarrollo
npm run dev

# 5. Abrir en el navegador
# http://localhost:3000
```

### Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
```

## 📈 Estado del Proyecto

### ✅ Funcionalidades Implementadas (20/20)
- [x] Sistema de autenticación completo
- [x] Dashboard principal con navegación
- [x] Módulo de Lectura de Deslinde
- [x] Módulo de Pre-aviso
- [x] Sistema de procesamiento con IA
- [x] Sistema de validación avanzado
- [x] Generador de documentos notariales
- [x] Gestión de sesiones
- [x] Visores de documentos múltiples
- [x] Sistema de resaltado de campos
- [x] Sistema de alertas de validación
- [x] Detección automática de documentos
- [x] Verificación de fuentes
- [x] Carga de documentos (drag & drop)
- [x] Procesamiento OCR simulado
- [x] Transformación a lenguaje notarial
- [x] Validación visual con wizard
- [x] Visor de documentos con resaltado
- [x] Edición en tiempo real
- [x] Exportación a .docx

### 🔄 En Desarrollo
- Integración con servicios de IA reales
- Backend API completo
- Optimización de performance
- Testing automatizado

## 🏗️ Arquitectura

```
app/
├── page.tsx                    # Página principal
├── login/                      # Autenticación
└── dashboard/                  # Dashboard principal
    ├── deslinde/              # Módulo de Lectura de Deslinde
    └── preaviso/              # Módulo de Pre-aviso

components/
├── upload-zone.tsx            # Carga de archivos
├── validation-wizard.tsx      # Wizard de validación
├── document-viewer.tsx        # Visor de documentos
├── pdf-viewer-*.tsx          # Visores de PDF
└── ui/                       # Componentes base

lib/
├── ai-processor.ts           # Procesamiento de IA
├── data-validator.ts         # Validación de datos
├── document-generator.ts     # Generación de documentos
└── session-manager.ts        # Gestión de sesiones
```

## 🧪 Testing

```bash
# Ejecutar tests unitarios
npm run test

# Ejecutar tests de integración
npm run test:integration

# Ejecutar tests E2E
npm run test:e2e

# Linting
npm run lint

# Type checking
npm run type-check
```

## 🚀 Despliegue

### Vercel (Recomendado)
```bash
# Instalar Vercel CLI
npm i -g vercel

# Desplegar
vercel

# Desplegar con variables de entorno
vercel --env-file .env.local
```

### Docker
```bash
# Construir imagen
docker build -t notaria-deslinde .

# Ejecutar contenedor
docker run -p 3000:3000 notaria-deslinde
```

## 📊 Métricas de Éxito

- **Performance**: Tiempo de carga < 3 segundos
- **Disponibilidad**: 99.9% uptime
- **Precisión OCR**: > 95% accuracy
- **Satisfacción**: > 4.5/5 en feedback de usuarios

## 👥 Equipo

- **Desarrollador Senior Full-Stack**: Backend, IA, Infraestructura
- **Desarrollador Frontend/UX**: Interfaz, Usabilidad, Testing

## 📅 Roadmap

- **Semana 1-2**: Optimización y integración con backend
- **Semana 3-4**: Integración con servicios de IA
- **Semana 5-6**: Lanzamiento en producción

Ver [Roadmap Detallado](./ROADMAP_DESARROLLO.md) para más información.

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es privado y confidencial. Todos los derechos reservados.

## 📞 Soporte

Para soporte técnico o preguntas sobre el proyecto, contactar al equipo de desarrollo.

---

**Desarrollado con ❤️ para la comunidad notarial mexicana**
