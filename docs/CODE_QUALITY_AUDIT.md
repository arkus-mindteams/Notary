# Code Quality Audit Report - Notary Application

**Date:** January 21, 2026  
**Scope:** Full codebase code quality analysis  
**Methodology:** Based on `clean-code`, `code-review-checklist`, and `typescript-expert` skill guidelines

---

## Executive Summary

This audit analyzes the Notary application codebase against industry best practices for code quality. The project is a **Next.js 16 + React 19 + Supabase** application for notarial document processing with AI/OCR capabilities.

| Category | Status | Critical Issues | Warnings |
|----------|--------|-----------------|----------|
| TypeScript Safety | 🔴 Needs Work | 35+ compile errors | Many `any` types |
| Code Organization | 🟡 Fair | God components | Some good patterns |
| Naming Conventions | 🟢 Good | Minor issues | Spanish/English mix |
| Function Size | 🔴 Needs Work | Functions 200+ lines | Many large files |
| DRY Principles | 🟡 Fair | Some duplication | Opportunity to refactor |
| Error Handling | 🟡 Fair | Inconsistent patterns | Missing edge cases |

---

## 🔴 Critical Issues

### 1. TypeScript Compile Errors (35+ errors)

The codebase has **35+ TypeScript errors** that should be addressed immediately:

#### 1.1 Implicit `any` Types

| File | Line | Issue |
|------|------|-------|
| [structure/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/ai/structure/route.ts#L1501) | 1501, 1504 | Parameter `u` implicitly has `any` type |
| [async/status/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/ocr/async/status/route.ts#L40) | 40, 49 | `resp` and `b` have implicit `any` |
| [preaviso-chat.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/preaviso-chat.tsx#L1955) | 1955 | Parameter `c` implicitly has `any` type |

**Fix:** Add explicit type annotations to all parameters.

```typescript
// ❌ Bad
const filtered = entries.filter((e) => {...})

// ✅ Good
interface CacheEntry { docName: string; text: string; ... }
const filtered = entries.filter((e: CacheEntry) => {...})
```

#### 1.2 Type Incompatibility Errors

| File | Issue | Impact |
|------|-------|--------|
| [preaviso-chat.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/preaviso-chat.tsx#L1026) | `aperturaCreditoComprador` can be `undefined` but type expects `boolean` | Runtime errors |
| [preaviso-chat.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/preaviso-chat.tsx#L2165) | `string` assigned to `DireccionInmueble` type | Data corruption |
| [tramites/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/expedientes/tramites/route.ts#L138) | `estado` type mismatch with `EstadoTramite` enum | API inconsistency |

**Fix:** Use nullish coalescing or proper type guards:

```typescript
// ❌ Bad
aperturaCreditoComprador: tieneCreditos

// ✅ Good
aperturaCreditoComprador: tieneCreditos ?? false
```

#### 1.3 Missing Type Declarations

| File | Issue |
|------|-------|
| [document-exporter.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/document-exporter.ts#L5) | Missing declaration for `file-saver` |
| [pdf-canvas-viewer.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/pdf-canvas-viewer.tsx#L39) | Cannot find module `pdfjs-dist/build/pdf` |
| [pdf-viewer.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/pdf-viewer.tsx#L116-L117) | Missing CSS module types |

**Fix:** Install missing `@types/*` packages or create ambient declarations:

```bash
npm install --save-dev @types/file-saver
```

---

### 2. God Components / God Functions

Several files exceed recommended size limits, making them difficult to maintain, test, and review.

| File | Lines | Classification | Recommendation |
|------|-------|----------------|----------------|
| [preaviso-chat.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/preaviso-chat.tsx) | **3,483** | 🔴 Critical | Split into 8-10 components |
| [preaviso-chat/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/ai/preaviso-chat/route.ts) | **2,686** | 🔴 Critical | Extract to services |
| [preaviso-template-renderer.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-template-renderer.ts) | **815** | 🟡 Warning | Consider splitting |
| [preaviso-state.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-state.ts) | **646** | 🟡 Warning | Extract validators |

#### Recommended Refactoring for `preaviso-chat.tsx`

```
components/
├── preaviso-chat/
│   ├── index.tsx                    # Main orchestrator (< 200 lines)
│   ├── PreavisoChatProvider.tsx     # Context & state
│   ├── ChatMessageList.tsx          # Message rendering
│   ├── ChatInput.tsx                # Input & file upload
│   ├── DocumentUploadZone.tsx       # Drag & drop
│   ├── ProgressPanel.tsx            # Progress indicators
│   ├── ExportOptions.tsx            # Export UI
│   ├── hooks/
│   │   ├── usePreavisoChat.ts      # Main chat logic
│   │   ├── useDocumentUpload.ts    # Upload handling
│   │   └── useServerState.ts       # Server state sync
│   └── types.ts                     # All interfaces
```

---

### 3. Excessive `any` Type Usage

The codebase has extensive use of `any` types, defeating TypeScript's type safety benefits.

#### In `computePreavisoState()` - [preaviso-state.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-state.ts#L57)

```typescript
// ❌ Current: 20+ instances of `any`
export function computePreavisoState(context?: any): PreavisoStateComputation {
  // ...
  const infos = inscripcionDocs.map((d: any) => d?.informacionExtraida || {})
  // ...
}

// ✅ Recommended: Create proper types
interface PreavisoContext {
  documentosProcesados?: ProcessedDocument[];
  tipoOperacion?: 'compraventa' | null;
  creditos?: CreditoElement[];
  vendedores?: VendedorElement[];
  compradores?: CompradorElement[];
  inmueble?: InmuebleV14;
  gravamenes?: GravamenElement[];
  folios?: FolioModel;
}

export function computePreavisoState(context?: PreavisoContext): PreavisoStateComputation {
  // ...
}
```

#### Locations with Heavy `any` Usage

| File | Approximate Count | Priority |
|------|-------------------|----------|
| [preaviso-chat.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/components/preaviso-chat.tsx) | 50+ | High |
| [preaviso-state.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-state.ts) | 30+ | High |
| [preaviso-chat/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/ai/preaviso-chat/route.ts) | 25+ | High |
| [preaviso-template-renderer.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-template-renderer.ts) | 20+ | Medium |

---

## 🟡 Warnings (Code Quality Improvements)

### 4. Deep Nesting & Missing Guard Clauses

Several functions have deep nesting (3-4+ levels) which reduces readability.

#### Example from [preaviso-state.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-state.ts#L401)

```typescript
// ❌ Current: Deep nesting
const registroIndicaGravamen = (() => {
  const v = (infoInscripcion as any)?.gravamenes
  if (v === null || v === undefined) return false
  if (v === true) return true
  if (v === false) return false
  const s = String(v).trim().toLowerCase()
  if (!s) return false
  if (s === 'null' || s === 'ninguno' || s === 'ninguna') return false
  if (/\b(sin|no)\b/.test(s) && /\b(gravamen|grav[aá]menes|hipoteca|embargo)\b/.test(s)) return false
  if (/\b(gravamen|grav[aá]menes|hipoteca|embargo)\b/.test(s)) return true
  return false
})()

// ✅ Recommended: Extracted function with guard clauses
function checkRegistryEncumbrance(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  
  const normalized = String(value).trim().toLowerCase()
  if (!normalized || normalized === 'null' || normalized === 'ninguno') return false
  
  const ENCUMBRANCE_WORDS = /\b(gravamen|grav[aá]menes|hipoteca|embargo)\b/
  const NEGATION_WORDS = /\b(sin|no)\b/
  
  if (NEGATION_WORDS.test(normalized) && ENCUMBRANCE_WORDS.test(normalized)) return false
  return ENCUMBRANCE_WORDS.test(normalized)
}
```

---

### 5. Magic Numbers & Strings

Multiple hardcoded values should be extracted to named constants.

| File | Line | Issue |
|------|------|-------|
| [ai-processor.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/ai-processor.ts#L78) | 78-94 | Confidence values (0.85, 0.92, 0.88, etc.) |
| [preaviso-template-renderer.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-template-renderer.ts#L500) | 500-504 | Page margins (1440) |
| [auth-context.tsx](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/auth-context.tsx#L51) | 51 | Timeout value (7000ms) |

**Fix:**

```typescript
// ❌ Bad
await new Promise(resolve => setTimeout(resolve, 2000))
if (confidence > 0.85) { ... }

// ✅ Good
const OCR_PROCESSING_DELAY_MS = 2000
const CONFIDENCE_THRESHOLD = 0.85
await new Promise(resolve => setTimeout(resolve, OCR_PROCESSING_DELAY_MS))
if (confidence > CONFIDENCE_THRESHOLD) { ... }
```

---

### 6. Duplicated Code Patterns

#### Pattern A: Repeated Type Normalization Logic

The same normalization logic appears in multiple files:

```typescript
// Appears in: preaviso-state.ts, preaviso-chat/route.ts, more
const normalizeForMatch = (value: any): string => {
  const s = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[""\"']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}
```

**Recommendation:** Extract to shared utility:

```typescript
// lib/utils/text-normalization.ts
export const normalizeForMatch = (value: unknown): string => { ... }
export const normalizeDigits = (value: unknown): string | null => { ... }
export const extractFoliosFromValue = (value: unknown): string[] => { ... }
```

#### Pattern B: Repeated Field Extraction

Multiple files have similar regex-based field extraction:

```typescript
// Appears in: ai-processor.ts, preaviso-template-renderer.ts
private static extractPattern(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match ? match[1].trim() : null
}
```

---

### 7. Unused Variables & Imports

From TypeScript analysis, several unused declarations exist:

| File | Variable |
|------|----------|
| [preaviso-state.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/preaviso-state.ts#L196) | `currentSection` (line 196) |
| Multiple files | Imported but unused interfaces |

**Fix:** Configure ESLint `no-unused-vars` rule and run cleanup:

```json
// .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

---

### 8. Inconsistent Error Handling

The codebase has mixed error handling patterns:

#### Pattern A: Silent failures

```typescript
// ❌ Bad: Silent catch
.catch(() => {}) // Ignorar errores en actualización de login
```

#### Pattern B: Generic console.error

```typescript
// ❌ Inconsistent
} catch (error) {
  console.error('Error en login:', error)
  return false
}
```

#### Pattern C: Proper error typing

```typescript
// ✅ Better
} catch (error: any) {
  console.error('[api/auth/me] Error:', error)
  return NextResponse.json(
    { error: 'internal_error', message: error.message || 'Error' },
    { status: 500 }
  )
}
```

**Recommendation:** Standardize error handling with custom error classes:

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
  }
}
```

---

### 9. Missing Input Validation

Several API routes lack proper input validation:

#### [api/auth/me/route.ts](file:///Users/octaviopalacios/Documents/MIND/Notary/app/api/auth/me/route.ts)

```typescript
// ❌ Current: No input validation
export async function GET(req: Request) {
  try {
    const usuario = await getCurrentUserFromRequest(req)
    // ...
  }
}

// ✅ Recommended: Add Zod validation
import { z } from 'zod'

const AuthHeaderSchema = z.object({
  authorization: z.string().startsWith('Bearer ')
})

export async function GET(req: Request) {
  const headers = Object.fromEntries(req.headers.entries())
  const validated = AuthHeaderSchema.safeParse(headers)
  // ...
}
```

---

## 🟢 Good Practices Found

### 10. Positive Observations

| Area | Observation |
|------|-------------|
| **Project Structure** | Clean feature-based organization in `/app`, `/components`, `/lib` |
| **TypeScript Config** | Strict mode enabled in `tsconfig.json` |
| **Supabase Integration** | Proper client memoization with `useMemo` |
| **Auth Context** | Good use of refs to avoid stale closures |
| **Service Layer** | Clean `S3Service` class with proper abstraction |
| **Documentation** | Extensive inline comments explaining business logic |
| **Type Definitions** | Well-defined interfaces for domain models (PreavisoData, etc.) |

#### Example of Good Pattern: [S3Service](file:///Users/octaviopalacios/Documents/MIND/Notary/lib/services/s3-service.ts)

```typescript
// ✅ Good: Clear static methods, proper error handling, documentation
export class S3Service {
  /**
   * Estructura de carpetas en S3:
   * expedientes/{compradorId}/tramites/{tramiteId}/...
   */
  static generateKey(...): string { ... }
  
  private static async verifyBucket(): Promise<void> {
    // Clear error handling with actionable messages
    if (error.name === 'NoSuchBucket') {
      throw new Error(`El bucket "${BUCKET}" no existe. Ejecuta 'npx tsx scripts/verify-s3.ts'...`)
    }
  }
}
```

---

## Recommendations Summary

### Immediate Actions (P0 - This Week)

1. **Fix TypeScript errors** - Run `npx tsc --noEmit` and resolve all 35+ errors
2. **Install missing type declarations** - `@types/file-saver`, etc.
3. **Add explicit types** to all implicit `any` parameters

### Short-Term (P1 - Next 2 Weeks)

4. **Refactor `preaviso-chat.tsx`** - Split into smaller components
5. **Extract shared utilities** - Text normalization, regex patterns
6. **Standardize error handling** - Create custom error classes

### Medium-Term (P2 - Next Month)

7. **Add Zod validation** to all API routes
8. **Configure ESLint** - Install and configure with TypeScript rules
9. **Add unit tests** for utility functions and services

### Long-Term (P3 - Ongoing)

10. **Set up CI/CD checks** for TypeScript, linting, and tests
11. **Document API contracts** with OpenAPI/Swagger
12. **Implement logging standards** with structured logging

---

## Appendix: TypeScript Error Summary

```
Total Errors: 35+

By Category:
- Implicit 'any' types: 8
- Type incompatibility: 12
- Missing declarations: 6
- Property access errors: 5
- Other: 4+

By File:
- preaviso-chat.tsx: 10
- structure/route.ts: 4
- deslinde/page.tsx: 3
- pdf-viewer.tsx: 3
- Other files: 15+
```

---

*This audit was generated following the `clean-code`, `code-review-checklist`, and `typescript-expert` skill guidelines.*
