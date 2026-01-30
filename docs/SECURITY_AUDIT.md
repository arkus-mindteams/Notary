# Security Audit Report - Notary Application

**Date:** January 2026  
**Auditor:** Automated Security Analysis  
**Application:** Notary (Next.js 16 + React 19 + Supabase)  
**Severity Scale:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | ℹ️ Informational

---

## Executive Summary

This security audit identifies **16 security findings** ranging from critical to informational severity. The most pressing issues involve:

1. **Critical dependency vulnerabilities** (jspdf path traversal, Next.js DoS)
2. **Missing authentication on mutation endpoints** (PUT/DELETE routes)
3. **Absence of rate limiting** on AI/OCR endpoints
4. **No CSRF protection** for state-changing operations
5. **Missing Row Level Security (RLS)** policies in database

| Severity | Count | Action Required |
|----------|-------|-----------------|
| 🔴 Critical | 3 | Immediate (24-48hrs) |
| 🟠 High | 4 | Urgent (1 week) |
| 🟡 Medium | 5 | Planned (2-4 weeks) |
| 🟢 Low | 3 | Scheduled (1-2 months) |
| ℹ️ Info | 1 | Awareness |

---

## 🔴 Critical Findings

### SEC-001: Vulnerable Dependencies with Known Exploits

**Location:** `package.json`  
**CVSS Score:** 9.8 (Critical)  
**CWE:** CWE-22 (Path Traversal), CWE-400 (DoS)

**Finding:** npm audit reveals two critical/high vulnerabilities:

```bash
npm audit

# jspdf <= 3.0.4: Local File Inclusion/Path Traversal (GHSA-f8cm-6447-x5h2) - CRITICAL
# next 16.0.0-16.0.8: DoS with Server Components (GHSA-mwv6-3258-q52c) - HIGH
# next 16.0.0-16.0.8: Source Code Exposure (GHSA-w37m-7fhw-fmv9) - MODERATE
```

**Risk:** 
- **jspdf:** Attackers can read arbitrary files from the server via path traversal
- **next.js:** Denial of Service attacks possible; source code of Server Actions may leak

**Remediation:**
```bash
# Upgrade jspdf to 4.0.0+
npm install jspdf@^4.0.0

# Upgrade Next.js to 16.0.9+
npm install next@^16.0.9
```

---

### SEC-002: Missing Authentication on Critical Endpoints

**Location:** 
- `app/api/expedientes/tramites/route.ts` (PUT, DELETE)
- `app/api/expedientes/compradores/route.ts` (PUT)
- `app/api/rules/route.ts` (GET, PUT)

**CVSS Score:** 9.1 (Critical)  
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Finding:** PUT and DELETE operations lack authentication checks, allowing unauthenticated users to modify or delete data:

```typescript
// app/api/expedientes/tramites/route.ts
export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    // ❌ NO AUTHENTICATION CHECK - Anyone can update any tramite
    // ...
    const tramite = await TramiteService.updateTramite(id, updateData)
```

```typescript
export async function DELETE(req: Request) {
  // ❌ NO AUTHENTICATION CHECK - Anyone can delete any tramite
  await TramiteService.deleteTramite(id)
```

**Risk:** Complete data manipulation/deletion by unauthorized users. IDOR vulnerability allows access to any record.

**Remediation:**
```typescript
export async function PUT(req: Request) {
  // ✅ Add authentication check
  const currentUser = await getCurrentUserFromRequest(req)
  if (!currentUser || !currentUser.activo) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'No autenticado' },
      { status: 401 }
    )
  }
  
  // ✅ Add authorization check - verify user owns/can access this resource
  const tramite = await TramiteService.findTramiteById(id)
  if (tramite?.usuario_id !== currentUser.id && currentUser.rol !== 'superadmin') {
    return NextResponse.json(
      { error: 'forbidden', message: 'Sin permisos para este recurso' },
      { status: 403 }
    )
  }
  // ...
}
```

---

### SEC-003: Missing Row Level Security (RLS) Policies

**Location:** `supabase/migrations/*.sql`  
**CVSS Score:** 8.8 (Critical)  
**CWE:** CWE-862 (Missing Authorization)

**Finding:** No RLS policies are defined in any migration files. All tables (`compradores`, `tramites`, `documentos`, `usuarios`) have no access controls at the database level:

```sql
-- supabase/migrations/001_create_expedientes_tables.sql
CREATE TABLE compradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ...
);
-- ❌ No ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- ❌ No CREATE POLICY statements
```

**Risk:** Even if API routes are secured, direct database access (via compromised credentials or injection) bypasses all authorization.

**Remediation:**
```sql
-- Create new migration: enable_rls_policies.sql
-- Enable RLS on all tables
ALTER TABLE compradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramites ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramite_documentos ENABLE ROW LEVEL SECURITY;

-- Create policies for compradores
CREATE POLICY "Users can only view their notaria's compradores"
  ON compradores FOR SELECT
  USING (notaria_id = (
    SELECT notaria_id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can only insert to their notaria"
  ON compradores FOR INSERT
  WITH CHECK (notaria_id = (
    SELECT notaria_id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can only update their notaria's compradores"
  ON compradores FOR UPDATE
  USING (notaria_id = (
    SELECT notaria_id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

-- Repeat for tramites, documentos, etc.
```

---

## 🟠 High Severity Findings

### SEC-004: No Rate Limiting on AI/OCR Endpoints

**Location:**
- `app/api/ai/preaviso-chat/route.ts`
- `app/api/ai/preaviso-process-document/route.ts`
- `app/api/ocr/extract/route.ts`
- `app/api/ai/notarialize/route.ts`

**CVSS Score:** 7.5 (High)  
**CWE:** CWE-770 (Allocation of Resources Without Limits)

**Finding:** No rate limiting is implemented on expensive AI/OCR endpoints. Each request incurs significant API costs:

| Endpoint | Estimated Cost/Request | Abuse Potential |
|----------|----------------------|-----------------|
| `/api/ai/preaviso-chat` | $0.01-$0.10 (OpenAI) | High |
| `/api/ai/preaviso-process-document` | $0.05-$0.50 (Vision) | Critical |
| `/api/ocr/extract` | $0.01 (Textract) | High |
| `/api/ai/structure` | $0.01-$0.10 (OpenAI) | High |

**Risk:** Financial loss from API abuse, DoS attacks, account suspension from API providers.

**Remediation:**
```typescript
// lib/middleware/rate-limiter.ts
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"), // 10 requests per minute
  analytics: true,
})

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier)
  return { success, limit, reset, remaining }
}

// In API route:
export async function POST(req: Request) {
  const user = await getCurrentUserFromRequest(req)
  const { success } = await checkRateLimit(user?.id || req.headers.get('x-forwarded-for') || 'anonymous')
  
  if (!success) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }
  // ...
}
```

---

### SEC-005: No CSRF Protection

**Location:** All POST/PUT/DELETE API routes  
**CVSS Score:** 7.2 (High)  
**CWE:** CWE-352 (Cross-Site Request Forgery)

**Finding:** No CSRF tokens are implemented. State-changing operations are vulnerable to CSRF attacks when users visit malicious sites while authenticated:

```typescript
// Current implementation - no CSRF protection
export async function PUT(req: Request) {
  const currentUser = await getCurrentUserFromRequest(req)
  // ❌ Only checks auth token, not CSRF token
```

**Risk:** Attackers can trick authenticated users into performing unintended actions (data modification, deletion) via crafted malicious pages.

**Remediation:**
```typescript
// Option 1: Use Next.js middleware with CSRF tokens
// middleware.ts
import { csrf } from "@edge-csrf/nextjs"

export const middleware = csrf({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
})

export const config = {
  matcher: ['/api/expedientes/:path*', '/api/admin/:path*'],
}

// Option 2: Implement double-submit cookie pattern
// Verify Origin/Referer headers for API routes
```

---

### SEC-006: Missing Security Headers

**Location:** `next.config.mjs`  
**CVSS Score:** 6.5 (High)  
**CWE:** CWE-693 (Protection Mechanism Failure)

**Finding:** No security headers configured (CSP, X-Frame-Options, etc.):

```javascript
// next.config.mjs - current state
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // ⚠️ Also concerning
  },
  // ❌ No headers() configuration
}
```

**Risk:** XSS attacks, clickjacking, MIME-sniffing attacks, information disclosure.

**Remediation:**
```javascript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.openai.com;",
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ]
  },
}
```

---

### SEC-007: File System Operations in API Routes

**Location:** `app/api/rules/route.ts`  
**CVSS Score:** 6.8 (High)  
**CWE:** CWE-73 (External Control of File Name or Path)

**Finding:** Direct file system read/write operations without proper sandboxing:

```typescript
// app/api/rules/route.ts
import { readFileSync, writeFileSync } from "fs"

const RULES_FILE_PATH = join(process.cwd(), "data", "rules.json")

export async function PUT(req: Request) {
  // ❌ No authentication check
  const body = await req.json()
  writeFileSync(RULES_FILE_PATH, JSON.stringify(updatedRules, null, 2), "utf-8")
  // ❌ Writes to file system without auth
}
```

**Risk:** Unauthenticated users can overwrite configuration files. Potential for path traversal if input validation is bypassed.

**Remediation:**
1. Add authentication/authorization checks
2. Move configuration to database (Supabase table)
3. If file-based is required, use read-only for production

```typescript
export async function PUT(req: Request) {
  // ✅ Add authentication
  const user = await getCurrentUserFromRequest(req)
  if (!user || user.rol !== 'superadmin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  // ... rest of logic
}
```

---

## 🟡 Medium Severity Findings

### SEC-008: No Authentication Middleware

**Location:** `middleware.ts` (missing)  
**CVSS Score:** 5.5 (Medium)  
**CWE:** CWE-287 (Improper Authentication)

**Finding:** No Next.js middleware for route protection. Authentication is handled per-route and client-side via `ProtectedRoute` component:

```typescript
// components/protected-route.tsx - Client-side only
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, isLoading } = useAuth()
  // ❌ Client-side protection only - doesn't protect API routes
```

**Risk:** Inconsistent auth checks across API routes, potential for missed endpoints.

**Remediation:**
```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  // Protect API routes (except auth endpoints)
  if (req.nextUrl.pathname.startsWith('/api/') && 
      !req.nextUrl.pathname.startsWith('/api/auth/')) {
    if (!session) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401 }
      )
    }
  }

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

---

### SEC-009: Sensitive Data in localStorage

**Location:** `lib/session-manager.ts`  
**CVSS Score:** 5.0 (Medium)  
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

**Finding:** Session/document data stored in localStorage accessible to any JavaScript:

```typescript
// lib/session-manager.ts
localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
// Stores: document content, metadata, file information
```

**Risk:** XSS attacks can exfiltrate document data. Data persists across sessions and is accessible by other scripts.

**Remediation:**
- Store only non-sensitive session IDs in localStorage
- Move document data to server-side storage
- Use sessionStorage for ephemeral data
- Consider IndexedDB with encryption for offline support

---

### SEC-010: TypeScript Build Errors Ignored

**Location:** `next.config.mjs`  
**CVSS Score:** 4.5 (Medium)  
**CWE:** CWE-1188 (Insecure Default Initialization of Resource)

**Finding:** TypeScript compile errors are ignored in production builds:

```javascript
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // ❌ Type safety disabled
  },
}
```

**Risk:** Type errors may hide security vulnerabilities. Implicit `any` types throughout codebase reduce reliability.

**Remediation:**
```javascript
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false, // ✅ Enforce type checking
  },
}
```

Then fix the 35+ TypeScript errors identified in the Code Quality Audit.

---

### SEC-011: Missing Input Validation (Zod)

**Location:** All API routes  
**CVSS Score:** 5.3 (Medium)  
**CWE:** CWE-20 (Improper Input Validation)

**Finding:** API routes use manual runtime checks instead of schema validation:

```typescript
// Current pattern - fragile validation
if (!notarial || !notarial.rules) {
  return NextResponse.json(
    { error: "invalid_request", message: "Notarial rules are required" },
    { status: 400 }
  )
}
```

**Risk:** Inconsistent validation, potential for injection attacks, type confusion.

**Remediation:**
```typescript
import { z } from 'zod'

const UpdateRulesSchema = z.object({
  notarial: z.object({
    rules: z.string().min(1).max(100000),
    version: z.string().optional(),
  }),
})

export async function PUT(req: Request) {
  const body = await req.json()
  const result = UpdateRulesSchema.safeParse(body)
  
  if (!result.success) {
    return NextResponse.json(
      { error: 'validation_error', details: result.error.flatten() },
      { status: 400 }
    )
  }
  
  const { notarial } = result.data
  // ...
}
```

---

### SEC-012: Insecure JSON.parse Usage

**Location:** Multiple API routes  
**CVSS Score:** 4.3 (Medium)  
**CWE:** CWE-502 (Deserialization of Untrusted Data)

**Finding:** JSON.parse used on user input without try/catch in some places:

```typescript
// app/api/expedientes/documentos/upload/route.ts
if (metadataStr) {
  try {
    metadata = JSON.parse(metadataStr) // ✓ Has try/catch
  } catch (e) {
    console.warn('Error parsing metadata, ignoring:', e)
  }
}

// But in other places validation is minimal after parsing
```

**Risk:** Prototype pollution, DoS via deeply nested objects, unexpected behavior.

**Remediation:**
- Always use Zod schemas after JSON.parse
- Consider using a safe JSON parser library
- Limit depth/size of parsed objects

---

## 🟢 Low Severity Findings

### SEC-013: Session Token in Authorization Header Only

**Location:** `lib/auth-context.tsx`, `lib/utils/fetch-with-auth.ts`  
**CVSS Score:** 3.7 (Low)  
**CWE:** CWE-311 (Missing Encryption of Sensitive Data)

**Finding:** Auth tokens handled via JavaScript `Authorization` header rather than httpOnly cookies:

```typescript
headers.set('Authorization', `Bearer ${session.access_token}`)
```

**Risk:** Tokens accessible to XSS attacks. Supabase manages tokens in localStorage by default.

**Remediation:** Consider using Supabase's cookie-based auth with httpOnly cookies for enhanced security:
```typescript
// Use @supabase/auth-helpers-nextjs for cookie-based session management
import { createServerClient } from '@supabase/ssr'
```

---

### SEC-014: Verbose Error Messages

**Location:** Multiple API routes  
**CVSS Score:** 3.1 (Low)  
**CWE:** CWE-209 (Information Exposure Through an Error Message)

**Finding:** Some error responses include stack traces or internal details:

```typescript
return NextResponse.json(
  { error: 'internal_error', message: error.message || 'Error interno del servidor' },
  { status: 500 }
)
// error.message may contain sensitive information
```

**Risk:** Information disclosure that aids attackers.

**Remediation:**
```typescript
// Production-safe error handling
const isProd = process.env.NODE_ENV === 'production'
return NextResponse.json(
  { 
    error: 'internal_error', 
    message: isProd ? 'Error interno del servidor' : error.message,
    ...(isProd ? {} : { stack: error.stack })
  },
  { status: 500 }
)
```

---

### SEC-015: DOMPurify Configuration Could Be Stricter

**Location:** `components/document-preview.tsx`  
**CVSS Score:** 3.3 (Low)  
**CWE:** CWE-79 (XSS)

**Finding:** DOMPurify is correctly used but allows `style` attributes which can be exploited:

```typescript
dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(section.content.replace(/\n/g, '<br>'), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'span', 'div'],
    ALLOWED_ATTR: ['class', 'style'] // ❗ style can be abused
  })
}}
```

**Risk:** CSS-based attacks (data exfiltration via CSS, UI redressing).

**Remediation:**
```typescript
ALLOWED_ATTR: ['class'] // Remove 'style' unless absolutely necessary
```

---

## ℹ️ Informational Findings

### SEC-016: Missing Security Headers for API Routes

**Location:** API routes  
**Severity:** Informational

**Finding:** API responses don't set security headers like `Cache-Control` for sensitive data.

**Recommendation:**
```typescript
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  }
})
```

---

## Good Security Practices Observed ✅

1. **DOMPurify sanitization** - HTML content is sanitized before rendering
2. **Image magic bytes validation** - `preaviso-process-document/route.ts` validates file signatures
3. **File type validation** - Upload endpoints validate MIME types
4. **File size limits** - Maximum file sizes enforced (20MB)
5. **Supabase client memoization** - Prevents token leakage through multiple instances
6. **Environment variable usage** - Secrets stored in `.env.local`, not hardcoded
7. **`.gitignore` coverage** - Sensitive files properly ignored
8. **HTTPS enforcement** - Supabase connections use TLS
9. **UUID primary keys** - Non-guessable identifiers
10. **Role-based access** - Admin routes check for `superadmin` role

---

## Remediation Priority Matrix

| Finding | Severity | Effort | Priority | Timeline |
|---------|----------|--------|----------|----------|
| SEC-001 | Critical | Low | P0 | Immediate |
| SEC-002 | Critical | Medium | P0 | 24-48 hrs |
| SEC-003 | Critical | High | P1 | 1 week |
| SEC-004 | High | Medium | P1 | 1 week |
| SEC-005 | High | Medium | P1 | 1 week |
| SEC-006 | High | Low | P1 | 1 week |
| SEC-007 | High | Low | P1 | 1 week |
| SEC-008 | Medium | Medium | P2 | 2 weeks |
| SEC-009 | Medium | High | P2 | 2 weeks |
| SEC-010 | Medium | High | P2 | 2-4 weeks |
| SEC-011 | Medium | Medium | P2 | 2 weeks |
| SEC-012 | Medium | Low | P2 | 2 weeks |
| SEC-013 | Low | High | P3 | 1-2 months |
| SEC-014 | Low | Low | P3 | 1 month |
| SEC-015 | Low | Low | P3 | 1 month |

---

## Recommended Security Tooling

1. **Dependency Scanning:** `npm audit`, Snyk, Dependabot
2. **SAST:** SonarQube, Semgrep, CodeQL
3. **Secrets Scanning:** GitGuardian, TruffleHog
4. **Rate Limiting:** Upstash, Vercel Edge Rate Limiting
5. **CSRF Protection:** edge-csrf, csurf
6. **Logging/Monitoring:** Sentry, LogRocket, Supabase Logs

---

## Appendix: Security Checklist

```markdown
## Pre-Deployment Security Checklist

### Critical (Must Complete)
- [ ] SEC-001: Upgrade jspdf to 4.0.0+
- [ ] SEC-001: Upgrade Next.js to 16.0.9+
- [ ] SEC-002: Add auth to PUT/DELETE tramites route
- [ ] SEC-002: Add auth to PUT compradores route
- [ ] SEC-002: Add auth to rules route
- [ ] SEC-003: Enable RLS on all Supabase tables
- [ ] SEC-007: Add auth to rules API

### High Priority
- [ ] SEC-004: Implement rate limiting (Upstash)
- [ ] SEC-005: Add CSRF protection
- [ ] SEC-006: Configure security headers
- [ ] SEC-008: Create Next.js middleware

### Medium Priority
- [ ] SEC-010: Fix TypeScript errors, disable ignoreBuildErrors
- [ ] SEC-011: Implement Zod validation on all APIs
- [ ] SEC-012: Add validation after JSON.parse

### Ongoing
- [ ] Set up Dependabot for automated updates
- [ ] Configure SAST in CI/CD pipeline
- [ ] Enable Supabase audit logging
- [ ] Regular security reviews
```

---

*This audit was conducted using static code analysis. A penetration test is recommended for comprehensive security assessment.*
