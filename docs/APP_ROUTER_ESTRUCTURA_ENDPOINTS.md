# Estructura App Router y endpoints

Estructura exacta de carpetas y archivos del App Router (Next.js) y correspondencia con cada endpoint y ruta de página.

---

## 1. Árbol de `app/` (solo rutas y layouts)

```
app/
├── layout.tsx
├── page.tsx
├── login/
│   └── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── deslinde/
│   │   └── page.tsx
│   ├── preaviso/
│   │   └── page.tsx
│   ├── expedientes/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   └── admin/
│       ├── usage/
│       │   └── page.tsx
│       ├── usuarios/
│       │   └── page.tsx
│       └── preaviso-config/
│           └── page.tsx
└── api/
    ├── auth/
    │   ├── login/
    │   │   └── route.ts
    │   ├── logout/
    │   │   └── route.ts
    │   └── me/
    │       └── route.ts
    ├── chat/
    │   └── sessions/
    │       ├── route.ts
    │       ├── [id]/
    │       │   ├── route.ts
    │       │   └── messages/
    │       │       └── route.ts
    ├── ai/
    │   ├── chat/
    │   │   ├── route.ts
    │   │   └── rag/
    │   │       └── route.ts
    │   ├── preaviso-chat/
    │   │   └── route.ts
    │   ├── preaviso-process-document/
    │   │   └── route.ts
    │   ├── preaviso-check-document/
    │   │   └── route.ts
    │   ├── preaviso-ocr-cache/
    │   │   └── upsert/
    │   │       └── route.ts
    │   ├── structure/
    │   │   └── route.ts
    │   ├── notarialize/
    │   │   └── route.ts
    │   ├── combine-notarial/
    │   │   └── route.ts
    │   ├── stats-analysis/
    │   │   └── route.ts
    │   ├── document-jobs/
    │   │   ├── start/
    │   │   │   └── route.ts
    │   │   ├── active/
    │   │   │   └── route.ts
    │   │   └── [id]/
    │   │       ├── route.ts
    │   │       └── progress/
    │   │           └── route.ts
    │   └── document-intake-batch/
    │       └── route.ts
    ├── expedientes/
    │   ├── compradores/
    │   │   └── route.ts
    │   ├── tramites/
    │   │   ├── route.ts
    │   │   ├── active-draft/
    │   │   │   └── route.ts
    │   │   └── [id]/
    │   │       ├── documentos/
    │   │       │   └── route.ts
    │   │       └── extract/
    │   │           └── route.ts
    │   ├── documentos/
    │   │   ├── route.ts
    │   │   ├── upload/
    │   │   │   └── route.ts
    │   │   └── text-chunks/
    │   │       └── upsert/
    │   │           └── route.ts
    │   └── preaviso/
    │       ├── wizard-state/
    │       │   └── route.ts
    │       └── finalize/
    │           └── route.ts
    ├── documents/
    │   └── [id]/
    │       └── index/
    │           └── route.ts
    ├── ocr/
    │   ├── extract/
    │   │   └── route.ts
    │   └── async/
    │       ├── start/
    │       │   └── route.ts
    │       ├── upload/
    │       │   └── route.ts
    │       └── status/
    │           └── route.ts
    ├── pdf/
    │   └── to-images/
    │       └── route.ts
    ├── admin/
    │   ├── usage-stats/
    │   │   └── route.ts
    │   ├── usuarios/
    │   │   ├── route.ts
    │   │   └── [id]/
    │   │       └── route.ts
    │   ├── notarias/
    │   │   ├── route.ts
    │   │   └── [id]/
    │   │       └── route.ts
    │   ├── preaviso-config/
    │   │   └── route.ts
    │   ├── conversations/
    │   │   └── [userId]/
    │   │       ├── route.ts
    │   │       └── [sessionId]/
    │   │           └── route.ts
    │   └── documents/
    │       └── [docId]/
    │           └── download/
    │               └── route.ts
    ├── stats/
    │   └── route.ts
    └── rules/
        └── route.ts
```

---

## 2. Rutas de página (URL → archivo)

| URL | Archivo |
|-----|---------|
| `/` | `app/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/dashboard` | `app/dashboard/page.tsx` |
| `/dashboard/deslinde` | `app/dashboard/deslinde/page.tsx` |
| `/dashboard/preaviso` | `app/dashboard/preaviso/page.tsx` |
| `/dashboard/expedientes` | `app/dashboard/expedientes/page.tsx` |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` |
| `/dashboard/admin/usage` | `app/dashboard/admin/usage/page.tsx` |
| `/dashboard/admin/usuarios` | `app/dashboard/admin/usuarios/page.tsx` |
| `/dashboard/admin/preaviso-config` | `app/dashboard/admin/preaviso-config/page.tsx` |

**Layout:** `app/layout.tsx` aplica a toda la app.

---

## 3. API: archivo → endpoint

Cada `route.ts` define el endpoint según su ruta en `app/api/`. Los segmentos `[nombre]` son parámetros dinámicos (ej. `[id]` → `:id` en la URL).

### Auth

| Endpoint | Archivo |
|----------|---------|
| `POST /api/auth/login` | `app/api/auth/login/route.ts` |
| `POST /api/auth/logout` | `app/api/auth/logout/route.ts` |
| `GET /api/auth/me` | `app/api/auth/me/route.ts` |

### Chat / sesiones

| Endpoint | Archivo |
|----------|---------|
| `GET/POST /api/chat/sessions` | `app/api/chat/sessions/route.ts` |
| `GET/PATCH/DELETE /api/chat/sessions/:id` | `app/api/chat/sessions/[id]/route.ts` |
| `GET/POST /api/chat/sessions/:id/messages` | `app/api/chat/sessions/[id]/messages/route.ts` |

### IA – Chat y preaviso

| Endpoint | Archivo |
|----------|---------|
| `POST /api/ai/chat` | `app/api/ai/chat/route.ts` |
| `POST /api/ai/chat/rag` | `app/api/ai/chat/rag/route.ts` |
| `POST /api/ai/preaviso-chat` | `app/api/ai/preaviso-chat/route.ts` |
| `POST /api/ai/preaviso-process-document` | `app/api/ai/preaviso-process-document/route.ts` |
| `POST /api/ai/preaviso-check-document` | `app/api/ai/preaviso-check-document/route.ts` |
| `POST /api/ai/preaviso-ocr-cache/upsert` | `app/api/ai/preaviso-ocr-cache/upsert/route.ts` |

### IA – Estructura, notarial, análisis, jobs

| Endpoint | Archivo |
|----------|---------|
| `POST /api/ai/structure` | `app/api/ai/structure/route.ts` |
| `POST /api/ai/notarialize` | `app/api/ai/notarialize/route.ts` |
| `POST /api/ai/combine-notarial` | `app/api/ai/combine-notarial/route.ts` |
| `POST /api/ai/stats-analysis` | `app/api/ai/stats-analysis/route.ts` |
| `POST /api/ai/document-jobs/start` | `app/api/ai/document-jobs/start/route.ts` |
| `GET /api/ai/document-jobs/active` | `app/api/ai/document-jobs/active/route.ts` |
| `GET/DELETE /api/ai/document-jobs/:id` | `app/api/ai/document-jobs/[id]/route.ts` |
| `GET /api/ai/document-jobs/:id/progress` | `app/api/ai/document-jobs/[id]/progress/route.ts` |
| `POST /api/ai/document-intake-batch` | `app/api/ai/document-intake-batch/route.ts` |

### Expedientes

| Endpoint | Archivo |
|----------|---------|
| `GET/POST /api/expedientes/compradores` | `app/api/expedientes/compradores/route.ts` |
| `GET/POST /api/expedientes/tramites` | `app/api/expedientes/tramites/route.ts` |
| `GET /api/expedientes/tramites/active-draft` | `app/api/expedientes/tramites/active-draft/route.ts` |
| `GET/POST /api/expedientes/tramites/:id/documentos` | `app/api/expedientes/tramites/[id]/documentos/route.ts` |
| `POST /api/expedientes/tramites/:id/extract` | `app/api/expedientes/tramites/[id]/extract/route.ts` |
| `GET/POST /api/expedientes/documentos` | `app/api/expedientes/documentos/route.ts` |
| `POST /api/expedientes/documentos/upload` | `app/api/expedientes/documentos/upload/route.ts` |
| `POST /api/expedientes/documentos/text-chunks/upsert` | `app/api/expedientes/documentos/text-chunks/upsert/route.ts` |
| `GET/POST/PATCH /api/expedientes/preaviso/wizard-state` | `app/api/expedientes/preaviso/wizard-state/route.ts` |
| `POST /api/expedientes/preaviso/finalize` | `app/api/expedientes/preaviso/finalize/route.ts` |

### Documentos e indexado

| Endpoint | Archivo |
|----------|---------|
| `GET/POST /api/documents/:id/index` | `app/api/documents/[id]/index/route.ts` |

### OCR y PDF

| Endpoint | Archivo |
|----------|---------|
| `POST /api/ocr/extract` | `app/api/ocr/extract/route.ts` |
| `POST /api/ocr/async/start` | `app/api/ocr/async/start/route.ts` |
| `POST /api/ocr/async/upload` | `app/api/ocr/async/upload/route.ts` |
| `GET /api/ocr/async/status` | `app/api/ocr/async/status/route.ts` |
| `POST /api/pdf/to-images` | `app/api/pdf/to-images/route.ts` |

### Admin

| Endpoint | Archivo |
|----------|---------|
| `GET /api/admin/usage-stats` | `app/api/admin/usage-stats/route.ts` |
| `GET/POST /api/admin/usuarios` | `app/api/admin/usuarios/route.ts` |
| `GET/PATCH/DELETE /api/admin/usuarios/:id` | `app/api/admin/usuarios/[id]/route.ts` |
| `GET/POST /api/admin/notarias` | `app/api/admin/notarias/route.ts` |
| `GET/PATCH/DELETE /api/admin/notarias/:id` | `app/api/admin/notarias/[id]/route.ts` |
| `GET/PATCH /api/admin/preaviso-config` | `app/api/admin/preaviso-config/route.ts` |
| `GET /api/admin/conversations/:userId` | `app/api/admin/conversations/[userId]/route.ts` |
| `GET/DELETE /api/admin/conversations/:userId/:sessionId` | `app/api/admin/conversations/[userId]/[sessionId]/route.ts` |
| `GET /api/admin/documents/:docId/download` | `app/api/admin/documents/[docId]/download/route.ts` |

### Otros

| Endpoint | Archivo |
|----------|---------|
| `GET /api/stats` | `app/api/stats/route.ts` |
| `GET/POST /api/rules` | `app/api/rules/route.ts` |

---

## 4. Resumen por prefijo

| Prefijo | Cantidad de endpoints |
|---------|------------------------|
| `/api/auth/*` | 3 |
| `/api/chat/*` | 3 |
| `/api/ai/*` | 14 |
| `/api/expedientes/*` | 10 |
| `/api/documents/*` | 1 |
| `/api/ocr/*` | 4 |
| `/api/pdf/*` | 1 |
| `/api/admin/*` | 8 |
| `/api/stats` | 1 |
| `/api/rules` | 1 |
| **Total API** | **46** |

Los métodos HTTP (GET, POST, PATCH, DELETE) dependen de la implementación de cada `route.ts`; esta tabla asocia **archivo ↔ path del endpoint**.
