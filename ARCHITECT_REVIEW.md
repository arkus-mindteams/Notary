# Architectural Review Report: Notary System (Preaviso Focus)

## Executive Summary

The current architecture implements a flexible, plugin-driven system for handling complex notary procedures. While the core design (System + Plugins) is sound and allows for business flexibility, the implementation has evolved into several **God Objects** and shows signs of **Domain Leakage** in the base abstractions. Strategic refactoring is recommended to ensure long-term maintainability and scalability as more "trámites" are added.

---

## 1. Project Context & Goals

- **Objective**: Automate notary procedures using AI-assisted chat and document processing.
- **Key Challenges**: Handling unstructured user input, extracting data from various document types, and maintaining a consistent state across long-running conversations.
- **Architectural Style**: Modular Monolith with a specialized plugin system for domain-specific logic.

---

## 2. Architectural Assessment

### 2.1 Core System (`TramiteSystem`)
- **Strengths**: Orchestrates plugins effectively; provides a flexible state machine; implements a robust "Loop Guard" to prevent AI hallucinations.
- **Weaknesses**: The file is becoming too large (~36KB). It contains logic that should be generic but currently includes domain-specific knowledge (e.g., `mergeInmuebleData`).

### 2.2 Plugin Architecture (`PreavisoPlugin`)
- **Strengths**: Encapsulates the specific rules for the Preaviso trámite; separates tool definitions from logic.
- **Weaknesses**: The plugin implementation is monolithic (~41KB). It handles too many responsibilities: state definitions, prompt engineering, validation, and document processing.

### 2.3 Document Processing Layer
- **Strengths**: Uses secondary passes for higher accuracy (e.g., folio detection); converts extracted data into standardized commands.
- **Weaknesses**: `PreavisoDocumentProcessor` (~44KB) is a God Object. It contains specific parsers for every supported document type, making it hard to test and extend.

### 2.4 API & Persistence Layer
- **Tight Coupling**: The `/api/ai/preaviso-chat` route contains significant business logic for session management and database updates that should be moved to a service layer.

---

## 3. Key Findings & Anti-patterns

### 🔴 God Objects (Violation of SRP)
Files like `preaviso-plugin.ts` and `document-processor.ts` exceed 1,000 lines. 
- **Impact**: Increased risk of merge conflicts; difficult to understand and test; higher cognitive load for developers.

### 🟠 Leaky Abstractions (Domain Leakage)
The `FlexibleStateMachine` and `TramiteSystem` (base classes) contain hardcoded logic for `persona_fisica`, `conyuge`, and `inmueble`.
- **Impact**: Makes it harder to implement new types of trámites that don't follow the same data structure (e.g., corporate-only transactions).

### 🟡 Tight Coupling in API Tier
The route handlers are doing direct Supabase operations for chat history and session titles.
- **Impact**: Logic isn't reusable; difficult to switch persistence layers or add complex validation logic.

---

## 4. Performance & Scalability

- **LLM Token Usage**: The system heavily relies on LLM calls for every turn. While robust, this could become a cost/performance bottleneck.
- **Concurrency**: The system handles concurrent document processing via batching, but the state merging logic in the frontend/backend needs careful synchronization to avoid race conditions.

---

## 5. Strategic Recommendations

### ✅ Immediate Actions (High Priority)
1. **Decompose `PreavisoDocumentProcessor`**: Move document-specific logic (Inscripción, Identificación, etc.) into separate handler classes or strategies.
2. **Abstract Domain Logic**: Move the hardcoded field checks in `FlexibleStateMachine` and `TramiteSystem` into the plugin interface (e.g., a `getRequiredFieldsMetadata` or `customFieldValidator`).
3. **Refactor `PreavisoPlugin`**: Extract the large `getStates`, `generateQuestion`, and prompt generation blocks into smaller service classes.

### 🚀 Future-Proofing (Medium/Long Term)
1. **Conversation Service**: Create a dedicated service to handle chat persistence and session management, cleaning up the route handlers.
2. **Prompts-as-Code**: Move large prompt blocks into specialized template files or a CMS to separate configuration from logic.
3. **Automated ADRs**: Start documenting major architectural changes using Architecture Decision Records (ADRs).

---

## Conclusion
The architecture is powerful and well-suited for the problem space. However, it is reaching a "complexity ceiling" where massive files and domain leakage will hinder speed. Transitioning from a Modular Monolith to a more granular, Strategy-based architecture within the plugin system is the key to scaling the project further.
