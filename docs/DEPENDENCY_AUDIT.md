# Dependency Audit Report - Notary Application

**Date:** January 2026  
**Auditor:** Automated Dependency Analysis  
**Application:** Notary (Next.js 16 + React 19 + Supabase)  

---

## Executive Summary

This audit analyzes the 65 direct dependencies and 468 total packages in the Notary application. Key findings:

| Category | Status | Issues Found |
|----------|--------|--------------|
| 🔴 Security | Critical | 2 vulnerabilities (jspdf, next.js) |
| 🟠 Outdated | Warning | 35+ packages significantly outdated |
| 🟡 Bundle Size | Concern | 7.5MB main bundle, 2.1MB PDF chunk |
| 🟢 Licenses | OK | All MIT/Apache 2.0 compatible |
| ⚠️ Unused | Review | 1 unused dependency found |

**Total node_modules size:** 664MB  
**Total packages:** 468 (333 prod, 77 dev, 109 optional)

---

## 🔴 Security Vulnerabilities

### Critical: jspdf v3.0.3

| Field | Value |
|-------|-------|
| **Current Version** | 3.0.3 |
| **Safe Version** | 4.0.0+ |
| **Vulnerability** | Local File Inclusion / Path Traversal |
| **CVE** | GHSA-f8cm-6447-x5h2 |
| **CWE** | CWE-22, CWE-35, CWE-73 |
| **Used In** | `lib/preaviso-template-renderer.ts`, `lib/pdf-exporter.ts` |

**Remediation:**
```bash
npm install jspdf@^4.0.0
```

> [!CAUTION]
> **Breaking Changes in jspdf 4.0:**
> - API changes for font handling
> - `addImage()` signature changes
> - Review migration guide before upgrading

---

### High: next v16.0.7

| Field | Value |
|-------|-------|
| **Current Version** | 16.0.7 |
| **Safe Version** | 16.0.9+ |
| **Vulnerabilities** | DoS with Server Components, Source Code Exposure |
| **CVE** | GHSA-mwv6-3258-q52c, GHSA-w37m-7fhw-fmv9 |
| **CVSS** | 7.5 (High), 5.3 (Medium) |

**Remediation:**
```bash
npm install next@^16.0.9
```

---

## 🟠 Outdated Dependencies (35+ packages)

### Critical Updates (Major Version Behind)

| Package | Current | Latest | Gap | Impact |
|---------|---------|--------|-----|--------|
| `@hookform/resolvers` | 3.10.0 | **5.2.2** | Major | New validation features |
| `@radix-ui/react-checkbox` | 1.1.3 | **1.3.3** | Minor | Accessibility improvements |
| `@radix-ui/react-select` | 2.1.4 | **2.2.6** | Minor | Bug fixes |
| `@radix-ui/react-slot` | 1.1.1 | **1.2.4** | Minor | Performance |

### AWS SDK (Patch Updates Available)

| Package | Current | Latest | Priority |
|---------|---------|--------|----------|
| `@aws-sdk/client-s3` | 3.931.0 | 3.972.0 | Medium |
| `@aws-sdk/client-textract` | 3.931.0 | 3.972.0 | Medium |
| `@aws-sdk/s3-request-presigner` | 3.947.0 | 3.972.0 | Medium |

### Radix UI Components (All Outdated)

All 26 Radix UI components are outdated. Batch update recommended:

```bash
npx npm-check-updates -u "@radix-ui/*"
npm install
```

| Component | Current | Latest |
|-----------|---------|--------|
| `@radix-ui/react-accordion` | 1.2.2 | 1.2.12 |
| `@radix-ui/react-alert-dialog` | 1.1.4 | 1.1.15 |
| `@radix-ui/react-avatar` | 1.1.2 | 1.1.11 |
| `@radix-ui/react-dialog` | 1.1.4 | 1.1.15 |
| `@radix-ui/react-dropdown-menu` | 2.1.4 | 2.1.16 |
| `@radix-ui/react-popover` | 1.1.4 | 1.1.15 |
| `@radix-ui/react-tabs` | 1.1.2 | 1.1.13 |
| `@radix-ui/react-toast` | 1.2.4 | 1.2.15 |
| `@radix-ui/react-tooltip` | 1.1.6 | 1.1.16 |
| *(+17 more)* | ... | ... |

### Other Updates

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `@vercel/analytics` | latest | - | ⚠️ Using `latest` tag (unstable) |
| `lucide-react` | 0.454.0 | 0.469.0+ | Icon updates |
| `zod` | 3.25.76 | 3.25.80+ | Bug fixes |

---

## 🟡 Bundle Size Analysis

### Overall Size

| Metric | Value | Status |
|--------|-------|--------|
| **node_modules** | 664 MB | ⚠️ Large |
| **main-app.js** | 7.5 MB | 🔴 Critical |
| **pdfjs-dist chunk** | 2.1 MB | 🔴 Very Large |
| **app-pages-internals.js** | 250 KB | ⚠️ Moderate |
| **webpack.js** | 141 KB | OK |

### Heavy Dependencies Analysis

| Package | Estimated Size | Used In | Recommendation |
|---------|---------------|---------|----------------|
| `pdfjs-dist` | ~2.1 MB | PDF viewer, OCR | Lazy load via dynamic import |
| `docx` | ~500 KB | Word export | Lazy load on export action |
| `jspdf` | ~400 KB | PDF export | Lazy load on export action |
| `html2canvas` | ~200 KB | PDF generation | Lazy load with jspdf |
| `recharts` | ~500 KB | Dashboard charts | Lazy load on dashboard |
| `handlebars` | ~100 KB | Template rendering | Consider lighter alternative |

### Bundle Optimization Recommendations

#### 1. Dynamic Imports for Heavy Libraries

```typescript
// ❌ Current: Static import (adds to main bundle)
import { Document, Packer } from 'docx'

// ✅ Recommended: Dynamic import
const exportToWord = async () => {
  const { Document, Packer } = await import('docx')
  // ... export logic
}
```

#### 2. Code Splitting for PDF Libraries

```typescript
// lib/pdf-exporter.ts - Add lazy loading
export async function exportToPDF(content: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas')
  ])
  // ... export logic
}
```

#### 3. Tree-Shaking for Radix UI

Ensure individual component imports (already correct):
```typescript
// ✅ Good - imports specific component
import { Dialog } from '@radix-ui/react-dialog'

// ❌ Bad - would import all components
import * as RadixUI from '@radix-ui'
```

---

## 🟢 License Compliance

All dependencies use permissive licenses compatible with commercial use:

| License | Package Count | Commercial Use |
|---------|---------------|----------------|
| MIT | ~400+ | ✅ Allowed |
| Apache-2.0 | ~50+ | ✅ Allowed |
| ISC | ~20+ | ✅ Allowed |
| BSD-3-Clause | ~10+ | ✅ Allowed |

**No GPL, AGPL, or other copyleft licenses detected.**

---

## ⚠️ Unused/Underutilized Dependencies

### Confirmed Unused

| Package | Used In | Recommendation |
|---------|---------|----------------|
| `embla-carousel-react` | Not found in codebase | **Remove** |

### Underutilized (UI Components Only)

These packages are only used in `components/ui/` wrappers. Review if actually used in app:

| Package | Wrapper File | Actually Used? |
|---------|-------------|----------------|
| `input-otp` | `components/ui/input-otp.tsx` | Check usage |
| `react-day-picker` | `components/ui/calendar.tsx` | Check usage |
| `cmdk` | `components/ui/command.tsx` | Check usage |
| `react-resizable-panels` | `components/ui/resizable.tsx` | Check usage |
| `vaul` | `components/ui/drawer.tsx` | Check usage |

### Check for Unused UI Components

```bash
# Find if calendar is used anywhere
grep -r "Calendar" --include="*.tsx" app/ components/ | grep -v "ui/calendar.tsx"

# Find if command palette is used
grep -r "<Command" --include="*.tsx" app/ components/ | grep -v "ui/command.tsx"
```

---

## 📦 Dependency Categories

### Core Framework (5 packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.0.7 | Framework |
| `react` | 19.1.0 | UI Library |
| `react-dom` | 19.1.0 | DOM Renderer |
| `typescript` | ^5 | Type System |
| `tailwindcss` | ^4.1.9 | Styling |

### Supabase Stack (3 packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.76.1 | Client SDK |
| `@supabase/ssr` | ^0.7.0 | SSR Helpers |
| `@supabase/auth-helpers-nextjs` | ^0.10.0 | Auth Integration |

### AWS SDK (3 packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `@aws-sdk/client-s3` | 3.931.0 | S3 Storage |
| `@aws-sdk/client-textract` | 3.931.0 | OCR |
| `@aws-sdk/s3-request-presigner` | ^3.943.0 | Signed URLs |

### UI Components - Radix UI (26 packages)

All `@radix-ui/react-*` packages for accessible UI primitives.

### Document Processing (6 packages)

| Package | Version | Purpose | Size Impact |
|---------|---------|---------|-------------|
| `docx` | ^9.5.1 | Word export | High |
| `jspdf` | ^3.0.3 | PDF export | High |
| `pdfjs-dist` | ^5.4.296 | PDF viewing | Very High |
| `react-pdf` | ^10.2.0 | PDF component | High |
| `html2canvas` | ^1.4.1 | Screenshots | Medium |
| `handlebars` | ^4.7.8 | Templates | Low |

### Forms & Validation (4 packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | ^7.60.0 | Form handling |
| `@hookform/resolvers` | ^3.10.0 | Schema resolvers |
| `zod` | 3.25.76 | Validation |
| `class-variance-authority` | ^0.7.1 | Variant styling |

### Utilities (8 packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | 4.1.0 | Date handling |
| `clsx` | ^2.1.1 | Class names |
| `tailwind-merge` | ^2.5.5 | TW merging |
| `lucide-react` | ^0.454.0 | Icons |
| `sonner` | ^1.7.4 | Toasts |
| `next-themes` | ^0.4.6 | Theme switching |
| `file-saver` | ^2.0.5 | File downloads |
| `@vercel/analytics` | latest | Analytics |

---

## 🔧 Recommended Actions

### Immediate (P0) - Security Fixes

```bash
# Fix critical vulnerabilities
npm install jspdf@^4.0.0 next@^16.0.9

# Verify fixes
npm audit
```

### Short-term (P1) - Cleanup

```bash
# Remove unused dependency
npm uninstall embla-carousel-react

# Pin @vercel/analytics to specific version
npm install @vercel/analytics@^1.5.0
```

### Medium-term (P2) - Updates

```bash
# Update all Radix UI components
npx npm-check-updates -u "@radix-ui/*"
npm install

# Update AWS SDK
npm install @aws-sdk/client-s3@latest @aws-sdk/client-textract@latest @aws-sdk/s3-request-presigner@latest

# Update form handling
npm install @hookform/resolvers@latest
```

### Long-term (P3) - Optimization

1. **Implement Dynamic Imports**
   - `docx`, `jspdf`, `html2canvas` for exports
   - `pdfjs-dist` for PDF viewer
   - `recharts` for dashboard

2. **Consider Alternatives**
   - `handlebars` → Template literals or `mustache` (smaller)
   - `html2canvas` → Server-side rendering with Puppeteer (if needed)

3. **Bundle Analysis**
   ```bash
   # Install bundle analyzer
   npm install @next/bundle-analyzer
   
   # Add to next.config.mjs
   const withBundleAnalyzer = require('@next/bundle-analyzer')({
     enabled: process.env.ANALYZE === 'true',
   })
   
   # Run analysis
   ANALYZE=true npm run build
   ```

---

## 📊 Dependency Health Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Known Vulnerabilities | 2 | 0 | 🔴 |
| Outdated (Major) | 1 | 0 | 🟠 |
| Outdated (Minor) | 30+ | <10 | 🟠 |
| Unused Dependencies | 1 | 0 | 🟡 |
| Total Dependencies | 468 | - | ℹ️ |
| node_modules Size | 664 MB | <500 MB | 🟡 |
| Main Bundle | 7.5 MB | <1 MB | 🔴 |

---

## Maintenance Recommendations

### Enable Automated Updates

1. **Dependabot** (GitHub)
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      radix-ui:
        patterns:
          - "@radix-ui/*"
      aws-sdk:
        patterns:
          - "@aws-sdk/*"
```

2. **Renovate Bot** (Alternative)
```json
// renovate.json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchPackagePatterns": ["@radix-ui/*"],
      "groupName": "Radix UI"
    }
  ]
}
```

### Pre-commit Hooks

```json
// package.json
{
  "scripts": {
    "precommit": "npm audit --audit-level=high"
  }
}
```

### CI/CD Integration

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm audit --audit-level=high
```

---

## Appendix: Full Outdated Package List

<details>
<summary>Click to expand (35+ packages)</summary>

| Package | Current | Wanted | Latest |
|---------|---------|--------|--------|
| @aws-sdk/client-s3 | 3.931.0 | 3.931.0 | 3.972.0 |
| @aws-sdk/client-textract | 3.931.0 | 3.931.0 | 3.972.0 |
| @aws-sdk/s3-request-presigner | 3.947.0 | 3.972.0 | 3.972.0 |
| @hookform/resolvers | 3.10.0 | 3.10.0 | 5.2.2 |
| @radix-ui/react-accordion | 1.2.2 | 1.2.2 | 1.2.12 |
| @radix-ui/react-alert-dialog | 1.1.4 | 1.1.4 | 1.1.15 |
| @radix-ui/react-aspect-ratio | 1.1.1 | 1.1.1 | 1.1.8 |
| @radix-ui/react-avatar | 1.1.2 | 1.1.2 | 1.1.11 |
| @radix-ui/react-checkbox | 1.1.3 | 1.1.3 | 1.3.3 |
| @radix-ui/react-collapsible | 1.1.2 | 1.1.2 | 1.1.12 |
| @radix-ui/react-context-menu | 2.2.4 | 2.2.4 | 2.2.16 |
| @radix-ui/react-dialog | 1.1.4 | 1.1.4 | 1.1.15 |
| @radix-ui/react-dropdown-menu | 2.1.4 | 2.1.4 | 2.1.16 |
| @radix-ui/react-hover-card | 1.1.4 | 1.1.4 | 1.1.15 |
| @radix-ui/react-label | 2.1.1 | 2.1.1 | 2.1.8 |
| @radix-ui/react-menubar | 1.1.4 | 1.1.4 | 1.1.16 |
| @radix-ui/react-navigation-menu | 1.2.3 | 1.2.3 | 1.2.14 |
| @radix-ui/react-popover | 1.1.4 | 1.1.4 | 1.1.15 |
| @radix-ui/react-radio-group | 1.2.2 | 1.2.2 | 1.3.8 |
| @radix-ui/react-scroll-area | 1.2.2 | 1.2.2 | 1.2.10 |
| @radix-ui/react-select | 2.1.4 | 2.1.4 | 2.2.6 |
| @radix-ui/react-separator | 1.1.1 | 1.1.1 | 1.1.8 |
| @radix-ui/react-slider | 1.2.2 | 1.2.2 | 1.3.6 |
| @radix-ui/react-slot | 1.1.1 | 1.1.1 | 1.2.4 |
| @radix-ui/react-switch | 1.1.2 | 1.1.2 | 1.2.6 |
| @radix-ui/react-tabs | 1.1.2 | 1.1.2 | 1.1.13 |
| @radix-ui/react-toast | 1.2.4 | 1.2.4 | 1.2.15 |
| @radix-ui/react-toggle | 1.1.1 | 1.1.1 | 1.1.10 |
| @radix-ui/react-toggle-group | 1.1.1 | 1.1.1 | 1.1.10 |
| @radix-ui/react-tooltip | 1.1.6 | 1.1.6 | 1.1.16 |

</details>

---

*This audit was generated using npm audit, npm outdated, and static code analysis.*
