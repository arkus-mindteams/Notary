# Prioritized Action Plan - Notary Application

**Date:** January 2026  
**Based On:** Code Quality, Frontend, Backend & Data, Security, and Dependency Audits  

---

## Priority Matrix

| Priority | Timeline | Criteria |
|----------|----------|----------|
| **P0** | Immediate (24-48 hrs) | Security vulnerabilities, data exposure risks |
| **P1** | Urgent (1 week) | High-impact security, blocking issues |
| **P2** | Short-term (2-4 weeks) | Moderate security, code quality, performance |
| **P3** | Medium-term (1-2 months) | Optimization, maintainability, best practices |
| **P4** | Long-term (Quarter) | Refactoring, architecture improvements |

---

## 📊 Summary Dashboard

| Category | P0 | P1 | P2 | P3 | P4 | Total |
|----------|----|----|----|----|----|----|
| Security | 3 | 4 | 2 | 1 | - | 10 |
| Dependencies | 2 | 1 | 1 | 1 | - | 5 |
| Backend | 1 | 2 | 3 | 2 | - | 8 |
| Frontend | - | 1 | 3 | 2 | 1 | 7 |
| Code Quality | - | 1 | 2 | 3 | 2 | 8 |
| **Total** | **6** | **9** | **11** | **9** | **3** | **38** |

---

## 🔴 P0 - Immediate (24-48 hours)

### SEC-001: Upgrade Vulnerable Dependencies
**Source:** Security Audit, Dependency Audit  
**Effort:** Low (30 min)  
**Risk:** Critical - Active exploits available

```bash
npm install jspdf@^4.0.0 next@^16.0.9
npm audit
```

> [!CAUTION]
> jspdf 4.0 has breaking changes. Review `lib/pdf-exporter.ts` and `lib/preaviso-template-renderer.ts` after upgrade.

---

### SEC-002: Add Authentication to Unprotected Routes
**Source:** Security Audit, Backend Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** Critical - Data manipulation by unauthenticated users

**Files to fix:**
- [ ] `app/api/expedientes/tramites/route.ts` - Add auth to PUT, DELETE
- [ ] `app/api/expedientes/compradores/route.ts` - Add auth to PUT
- [ ] `app/api/rules/route.ts` - Add auth to GET, PUT

```typescript
// Template for each route
const currentUser = await getCurrentUserFromRequest(req)
if (!currentUser || !currentUser.activo) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
```

---

### SEC-003: Enable Row Level Security (RLS)
**Source:** Security Audit, Backend Audit  
**Effort:** High (4-6 hrs)  
**Risk:** Critical - Database-level access control missing

Create migration: `supabase/migrations/00X_enable_rls.sql`

```sql
-- Enable RLS on all tables
ALTER TABLE compradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramites ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramite_documentos ENABLE ROW LEVEL SECURITY;

-- Create policies (per table)
CREATE POLICY "Users access own notaria data"
  ON compradores FOR ALL
  USING (notaria_id = (SELECT notaria_id FROM usuarios WHERE auth_user_id = auth.uid()));
```

---

### DEP-001: Remove Unused Dependency
**Source:** Dependency Audit  
**Effort:** Low (5 min)  
**Risk:** Low - Cleanup

```bash
npm uninstall embla-carousel-react
```

---

### DEP-002: Pin Unstable Version
**Source:** Dependency Audit  
**Effort:** Low (5 min)  
**Risk:** Medium - Unpredictable builds

```bash
# Replace "latest" with specific version
npm install @vercel/analytics@^1.5.0
```

---

### SEC-004: Add Security Headers
**Source:** Security Audit  
**Effort:** Low (30 min)  
**Risk:** High - XSS, clickjacking protection missing

Update `next.config.mjs`:
```javascript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }]
}
```

---

## 🟠 P1 - Urgent (1 week)

### SEC-005: Implement Rate Limiting
**Source:** Security Audit, Backend Audit  
**Effort:** Medium (3-4 hrs)  
**Risk:** High - API abuse, cost explosion

**Endpoints to protect:**
- `/api/ai/preaviso-chat`
- `/api/ai/preaviso-process-document`
- `/api/ocr/extract`
- `/api/ai/structure`

```bash
npm install @upstash/ratelimit @upstash/redis
```

---

### SEC-006: Add CSRF Protection
**Source:** Security Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** High - Cross-site request forgery

```bash
npm install @edge-csrf/nextjs
```

---

### SEC-007: Create Next.js Middleware
**Source:** Security Audit, Frontend Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** Medium - Inconsistent auth enforcement

Create `middleware.ts` for centralized route protection.

---

### SEC-008: Add Authorization Checks (IDOR Prevention)
**Source:** Backend Audit  
**Effort:** Medium (3-4 hrs)  
**Risk:** High - Access to other users' data

Verify resource ownership before operations in all API routes.

---

### BK-001: Implement Zod Validation
**Source:** Backend Audit, Code Quality Audit  
**Effort:** Medium (4-6 hrs)  
**Risk:** Medium - Invalid data, injection risks

Create schemas for all API endpoints using Zod.

---

### DEP-003: Update AWS SDK
**Source:** Dependency Audit  
**Effort:** Low (30 min)  
**Risk:** Low - Bug fixes, security patches

```bash
npm install @aws-sdk/client-s3@latest @aws-sdk/client-textract@latest @aws-sdk/s3-request-presigner@latest
```

---

### CQ-001: Fix TypeScript Compile Errors
**Source:** Code Quality Audit  
**Effort:** High (4-8 hrs)  
**Risk:** Medium - Hidden bugs, type unsafety

Fix 35+ TypeScript errors, then update `next.config.mjs`:
```javascript
typescript: { ignoreBuildErrors: false }
```

---

### FE-001: Add loading.tsx and error.tsx
**Source:** Frontend Audit  
**Effort:** Low (1-2 hrs)  
**Risk:** Medium - Poor UX, unhandled errors

Create for all route segments:
- `app/dashboard/loading.tsx`
- `app/dashboard/error.tsx`
- `app/dashboard/preaviso/loading.tsx`

---

### FE-002: Implement React Query
**Source:** Frontend Audit  
**Effort:** Medium (4-6 hrs)  
**Risk:** Medium - Manual data fetching, no caching

```bash
npm install @tanstack/react-query
```

---

## 🟡 P2 - Short-term (2-4 weeks)

### CQ-002: Split God Components
**Source:** Code Quality Audit, Frontend Audit  
**Effort:** Very High (2-3 days)  
**Risk:** Medium - Maintainability, testability

**Primary target:** `components/preaviso-chat.tsx` (3,483 lines)

Split into:
- `PreavisoChatContainer.tsx`
- `ChatMessageList.tsx`
- `ChatInput.tsx`
- `DocumentUploader.tsx`
- `DataExtractorPanel.tsx`
- `hooks/usePreavisoChat.ts`
- `hooks/usePreavisoState.ts`

---

### CQ-003: Split God API Routes
**Source:** Code Quality Audit  
**Effort:** High (1-2 days)  
**Risk:** Medium - Maintainability

**Targets:**
- `app/api/ai/preaviso-chat/route.ts` (2,686 lines)
- `app/api/ai/preaviso-process-document/route.ts` (1,312 lines)

---

### BK-002: Add Pagination to List Endpoints
**Source:** Backend Audit  
**Effort:** Medium (3-4 hrs)  
**Risk:** Low - Performance at scale

Add to:
- `GET /api/expedientes/tramites`
- `GET /api/expedientes/compradores`

---

### BK-003: Fix N+1 Query Patterns
**Source:** Backend Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** Low - Performance

Fix in `app/api/expedientes/tramites/route.ts`.

---

### DEP-004: Update Radix UI Components
**Source:** Dependency Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** Low - Bug fixes, accessibility

```bash
npx npm-check-updates -u "@radix-ui/*"
npm install
```

---

### FE-003: Convert Pages to Server Components
**Source:** Frontend Audit  
**Effort:** High (1-2 days)  
**Risk:** Low - Performance optimization

Convert where data fetching is possible:
- `app/dashboard/page.tsx`

---

### SEC-009: Improve Error Handling (No Stack Traces)
**Source:** Security Audit  
**Effort:** Low (1-2 hrs)  
**Risk:** Low - Information disclosure

Sanitize error messages in production.

---

### BK-004: Standardize Error Response Format
**Source:** Backend Audit  
**Effort:** Low (2-3 hrs)  
**Risk:** Low - API consistency

Create error response utility.

---

### DEP-005: Implement Dynamic Imports
**Source:** Dependency Audit  
**Effort:** Medium (3-4 hrs)  
**Risk:** Low - Bundle size (7.5MB → target <2MB)

Lazy load:
- `docx` - Word export
- `jspdf` + `html2canvas` - PDF export
- `pdfjs-dist` - PDF viewer
- `recharts` - Dashboard charts

---

## 🟢 P3 - Medium-term (1-2 months)

### CQ-004: Remove `any` Types
**Source:** Code Quality Audit  
**Effort:** High (1-2 weeks)  
**Risk:** Low - Type safety

Target files:
- `components/preaviso-chat.tsx`
- `lib/preaviso-state.ts`
- `app/api/ai/preaviso-chat/route.ts`

---

### CQ-005: Extract Magic Numbers/Strings
**Source:** Code Quality Audit  
**Effort:** Medium (1-2 days)  
**Risk:** Low - Maintainability

Create constants files.

---

### CQ-006: Remove Duplicated Code
**Source:** Code Quality Audit  
**Effort:** Medium (1-2 days)  
**Risk:** Low - DRY violations

Extract to utilities:
- Text normalization functions
- Field extraction patterns

---

### FE-004: Add Suspense Boundaries
**Source:** Frontend Audit  
**Effort:** Medium (1 day)  
**Risk:** Low - Progressive loading

---

### BK-005: Lazy Initialize AWS Clients
**Source:** Backend Audit  
**Effort:** Low (1-2 hrs)  
**Risk:** Low - Cold start optimization

---

### SEC-010: Move to httpOnly Cookies
**Source:** Security Audit  
**Effort:** High (1-2 days)  
**Risk:** Low - Token security improvement

Use `@supabase/ssr` cookie-based auth.

---

### DEP-006: Update @hookform/resolvers
**Source:** Dependency Audit  
**Effort:** Medium (2-3 hrs)  
**Risk:** Low - Major version update

```bash
npm install @hookform/resolvers@latest
```

---

### FE-005: Tighten DOMPurify Config
**Source:** Security Audit  
**Effort:** Low (30 min)  
**Risk:** Low - Remove style attribute

---

### BK-006: Add Audit Logging
**Source:** Backend Audit  
**Effort:** Medium (1 day)  
**Risk:** Low - Compliance

---

## 🔵 P4 - Long-term (Quarter)

### ARCH-001: Consider React Query + Server Components
**Source:** Frontend Audit  
**Effort:** Very High  
**Risk:** Low - Architecture modernization

---

### ARCH-002: Implement Domain-Driven Design
**Source:** Code Quality Audit  
**Effort:** Very High  
**Risk:** Low - Clean architecture

---

### ARCH-003: Add Comprehensive Test Suite
**Source:** All Audits  
**Effort:** Very High  
**Risk:** Low - Quality assurance

---

## 📋 Quick Reference Checklist

### Week 1 (P0 + Start P1)
- [ ] Upgrade jspdf and Next.js
- [ ] Add auth to unprotected routes
- [ ] Enable RLS on Supabase tables
- [ ] Add security headers
- [ ] Remove unused dependency
- [ ] Pin @vercel/analytics
- [ ] Start rate limiting implementation

### Week 2 (Complete P1)
- [ ] Complete rate limiting
- [ ] Add CSRF protection
- [ ] Create middleware.ts
- [ ] Implement Zod validation
- [ ] Fix TypeScript errors

### Weeks 3-4 (P2)
- [ ] Split preaviso-chat.tsx
- [ ] Add pagination
- [ ] Implement dynamic imports
- [ ] Update Radix UI

### Month 2 (P3)
- [ ] Remove `any` types
- [ ] Extract constants
- [ ] Add Suspense boundaries
- [ ] Improve error handling

---

## 🛠️ Tooling Recommendations

### CI/CD Integration
```yaml
# .github/workflows/security.yml
- run: npm audit --audit-level=high
- run: npx tsc --noEmit
```

### Automated Updates
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    schedule:
      interval: "weekly"
```

### Pre-commit Hooks
```json
{
  "husky": {
    "pre-commit": "npm run lint && npm audit --audit-level=high"
  }
}
```

---

*Generated from 5 comprehensive audits. Review and adjust timelines based on team capacity.*
