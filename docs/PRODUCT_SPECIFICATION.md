# Product Specification Document - Notary Application

**Version:** 1.0  
**Date:** January 2026  
**Application Name:** Notary (Sistema de Gestión Notarial)

---

## 1. Product Overview

### 1.1 Purpose
The Notary application is a web-based document management and automation system designed for Mexican notarial offices (Notarías). It streamlines the creation of legal documents, particularly "Preavisos" (preliminary notices for property transactions), using AI-powered document processing and OCR capabilities.

### 1.2 Target Users
- **Notary Lawyers (Abogados):** Primary users who create and manage legal documents
- **Superadmins:** System administrators who manage users and configurations
- **Notarial Staff:** Supporting personnel who upload and process documents

### 1.3 Core Value Proposition
- Automated extraction of property and personal data from uploaded documents
- AI-assisted document generation following Mexican notarial standards
- Real-time chat interface for iterative document refinement
- Multi-tenant architecture supporting multiple notarial offices

---

## 2. Features & Functionality

### 2.1 Authentication & User Management

| Feature | Description | User Roles |
|---------|-------------|------------|
| **Login** | Email/password authentication via Supabase | All users |
| **Role-Based Access** | Two roles: `superadmin`, `abogado` | System-wide |
| **Multi-Tenant** | Users belong to specific `notaria_id` | All users |
| **Protected Routes** | Dashboard and features require authentication | All users |

**User Flow:**
1. User navigates to `/login`
2. Enters email and password
3. On success, redirected to `/dashboard`
4. Session managed via Supabase Auth tokens

---

### 2.2 Dashboard

| Feature | Description |
|---------|-------------|
| **Welcome Section** | Personalized greeting with user name |
| **Quick Stats** | Document counts, pending tasks (static currently) |
| **Feature Navigation** | Cards linking to Preaviso, Deslinde, Expedientes |
| **Admin Panel** | Link to admin features (superadmin only) |

**URL:** `/dashboard`

---

### 2.3 Preaviso (Pre-Notice) Module

**Primary feature of the application**

#### 2.3.1 Chat Interface
| Feature | Description |
|---------|-------------|
| **AI Chat** | Conversational interface to gather property data |
| **Document Upload** | Upload escrituras, planos, INEs for data extraction |
| **OCR Processing** | AWS Textract + OpenAI Vision for document analysis |
| **Data Extraction** | Automatic field population from documents |
| **Field Editing** | Manual editing of extracted data |

**URL:** `/dashboard/preaviso`

#### 2.3.2 Document Processing Flow
```
1. User uploads document (PDF/Image)
   ├── PDF → Client-side conversion to images
   └── Image → Direct processing

2. Document sent to AI processing
   ├── OCR extraction via AWS Textract
   └── OpenAI Vision for structured data extraction

3. Extracted data displayed in chat
   └── User confirms or corrects data

4. Data accumulated for document generation
```

#### 2.3.3 Supported Document Types
| Document Type | Key Data Extracted |
|--------------|-------------------|
| **Escritura (Title Deed)** | Folio real, property address, owner name, RFC, CURP |
| **Plano (Property Plan)** | Surface area, coordinates, boundaries |
| **INE Vendedor** | Seller ID information |
| **INE Comprador** | Buyer ID information |
| **RFC Documents** | Tax identification |

#### 2.3.4 Document Generation
| Feature | Description |
|---------|-------------|
| **Preview Mode** | HTML/Text preview of generated document |
| **Section Navigation** | Jump to specific document sections |
| **Export Options** | PDF, Word (DOCX), HTML export |
| **Confidence Scoring** | AI confidence level for extracted data |

---

### 2.4 Deslinde Module

| Feature | Description |
|---------|-------------|
| **Plano Upload** | Upload architectural/cadastral plans |
| **Image Processing** | Rotation, cropping tools |
| **OCR Extraction** | Extract boundary descriptions |
| **Template Generation** | Generate deslinde documents |

**URL:** `/dashboard/deslinde`

---

### 2.5 Expedientes (Case Files)

#### 2.5.1 Compradores (Buyers)
| Feature | Description |
|---------|-------------|
| **Create Buyer** | Register new buyers with personal data |
| **Search** | Search by name, RFC, CURP |
| **Edit** | Update buyer information |

**API:** `/api/expedientes/compradores`

#### 2.5.2 Trámites (Procedures)
| Feature | Description |
|---------|-------------|
| **Create Trámite** | New procedure linked to buyer |
| **Types** | Preaviso, Plano Arquitectónico |
| **Status Tracking** | Draft, In Progress, Completed |
| **Document Attachment** | Link documents to procedures |

**API:** `/api/expedientes/tramites`

#### 2.5.3 Documentos (Documents)
| Feature | Description |
|---------|-------------|
| **Upload** | File upload to AWS S3 |
| **Deduplication** | MD5 hash prevents duplicate uploads |
| **Signed URLs** | Secure download links |
| **Metadata** | Store extracted data as JSON |

**API:** `/api/expedientes/documentos/upload`

---

### 2.6 Admin Features

#### 2.6.1 Preaviso Configuration (Superadmin Only)
| Feature | Description |
|---------|-------------|
| **Prompt Editor** | Customize AI system prompts |
| **JSON Schema** | Define expected extraction schema |

**URL:** `/dashboard/admin/preaviso-config`
**API:** `/api/admin/preaviso-config`

#### 2.6.2 Notarial Rules Management
| Feature | Description |
|---------|-------------|
| **Rules Editor** | Define notarial transformation rules |
| **Version Control** | Track rule changes |

**API:** `/api/rules`

---

## 3. Technical Architecture

### 3.1 Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Styling** | Tailwind CSS v4, Radix UI components |
| **Backend** | Next.js API Routes (serverless) |
| **Database** | PostgreSQL via Supabase |
| **Authentication** | Supabase Auth |
| **File Storage** | AWS S3 |
| **OCR** | AWS Textract |
| **AI** | OpenAI GPT-4 Vision |
| **Deployment** | Vercel (implied) |

### 3.2 Database Schema

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  notarias   │────▶│  usuarios   │     │ compradores │
│             │     │             │     │             │
│ id          │     │ id          │     │ id          │
│ nombre      │     │ email       │     │ nombre      │
│ direccion   │     │ rol         │     │ rfc         │
└─────────────┘     │ notaria_id  │     │ curp        │
                    └─────────────┘     │ notaria_id  │
                                        └──────┬──────┘
                                               │
                    ┌─────────────────────────┐│
                    │       tramites          ◀┘
                    │                         │
                    │ id                      │
                    │ tipo (preaviso, etc)    │
                    │ estado (draft, etc)     │
                    │ datos (JSONB)           │
                    │ comprador_id            │
                    │ notaria_id              │
                    └──────────┬──────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   tramite_documentos │
                    │ (many-to-many link)  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │     documentos       │
                    │                      │
                    │ id                   │
                    │ tipo                 │
                    │ s3_key               │
                    │ metadata (JSONB)     │
                    │ hash_md5             │
                    └──────────────────────┘
```

### 3.3 API Endpoints

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/auth/me` | GET | Get current user |
| `/api/auth/login` | POST | Record login |
| `/api/expedientes/compradores` | GET, POST, PUT | Buyer management |
| `/api/expedientes/tramites` | GET, POST, PUT, DELETE | Procedure management |
| `/api/expedientes/documentos/upload` | POST | Upload documents |
| `/api/ai/preaviso-chat` | POST | AI chat for preaviso |
| `/api/ai/preaviso-process-document` | POST | Process uploaded document |
| `/api/ocr/extract` | POST | OCR text extraction |
| `/api/admin/preaviso-config` | GET, PUT | Admin config |
| `/api/rules` | GET, PUT | Notarial rules |

---

## 4. User Flows

### 4.1 Login Flow
```
/login → Enter credentials → Supabase Auth → /dashboard
         ↓ (if error)
         Show error message, stay on /login
```

### 4.2 Preaviso Creation Flow
```
/dashboard → Click "Preaviso" → /dashboard/preaviso
    │
    ├── Upload documents (escritura, plano, INE)
    │   ├── PDF converted to images client-side
    │   └── Images sent to /api/ai/preaviso-process-document
    │
    ├── AI extracts data and asks clarifying questions
    │   └── Chat interaction via /api/ai/preaviso-chat
    │
    ├── User confirms/edits extracted data
    │
    ├── Document generated with preview
    │   └── Sections: Header, Property Data, Parties, etc.
    │
    └── Export as PDF/Word
```

### 4.3 Document Upload Flow
```
User drops file → Validate type/size → Upload to S3
    │
    ├── Generate MD5 hash for deduplication
    ├── Store metadata in Supabase
    └── Return signed URL for access
```

---

## 5. UI Components

### 5.1 Page Structure
| Route | Component | Auth Required |
|-------|-----------|---------------|
| `/` | Redirect to dashboard/login | No |
| `/login` | Login form | No |
| `/dashboard` | Dashboard home | Yes |
| `/dashboard/preaviso` | Preaviso chat interface | Yes |
| `/dashboard/deslinde` | Deslinde module | Yes |
| `/dashboard/expedientes` | Case files list | Yes |
| `/dashboard/admin/*` | Admin panels | Yes (superadmin) |

### 5.2 Key UI Components
- **Sidebar:** Navigation with user info, logout
- **ProtectedRoute:** Auth guard wrapper
- **PreavisoChat:** Main chat interface (3,483 lines)
- **UploadZone:** Drag-and-drop file upload
- **DocumentPreview:** Generated document viewer
- **PDFViewer:** PDF display component

### 5.3 Design System
- **Colors:** OKLCH color space with light/dark modes
- **Components:** Radix UI primitives (shadcn/ui style)
- **Icons:** Lucide React
- **Toasts:** Sonner notifications

---

## 6. Business Rules

### 6.1 Document Validation
- Max file size: 20MB (configurable via env)
- Supported formats: PDF, PNG, JPG, JPEG, GIF, WEBP
- PDFs converted to images client-side before processing

### 6.2 Data Extraction Rules
- Folio Real: Must match registry format
- RFC: 12-13 character validation
- CURP: 18 character validation
- Addresses: Parsed into structured components

### 6.3 Access Control
| Role | Permissions |
|------|-------------|
| **superadmin** | All features, all notarías, admin config |
| **abogado** | Own notaría data only, no admin |

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Initial page load: < 3 seconds
- Document processing: < 30 seconds (AI dependent)
- API response time: < 500ms for CRUD operations

### 7.2 Security
- HTTPS only
- JWT-based authentication
- Row-Level Security (RLS) on database (to be implemented)
- File type validation with magic bytes
- DOMPurify for HTML sanitization

### 7.3 Scalability
- Serverless architecture (Next.js + Vercel)
- S3 for file storage
- Supabase handles database scaling

### 7.4 Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

---

## 8. Environment Configuration

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key |
| `OPENAI_API_KEY` | OpenAI API authentication |
| `OPENAI_MODEL` | AI model selection (gpt-4o) |
| `AWS_REGION` | AWS region for S3/Textract |
| `AWS_ACCESS_KEY_ID` | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | AWS secret |
| `AWS_S3_BUCKET` | S3 bucket name |
| `NEXT_PUBLIC_MAX_FILE_SIZE` | Max upload size |
| `NEXT_PUBLIC_APP_URL` | Application base URL |

---

## 9. Testing Requirements

### 9.1 Critical User Flows to Test
1. **Authentication:** Login, logout, session persistence
2. **Preaviso Flow:** Upload → Extract → Chat → Generate → Export
3. **Document Upload:** File validation, S3 storage, deduplication
4. **Role Access:** Admin-only features blocked for abogado

### 9.2 Edge Cases
- Invalid file types
- Oversized files
- Network failures during upload
- Session expiration during work
- Concurrent document edits

---

*This document serves as the Product Specification for the Notary application and can be used for test planning and development reference.*
