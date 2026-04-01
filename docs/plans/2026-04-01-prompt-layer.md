# Prompt Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a centralized prompt layer that replaces ad-hoc prompt strings with reusable role-based templates and variable injection.

**Architecture:** Keep prompt concerns inside a shared `src/lib/prompt-builder.ts` module. Chat services should only prepare domain data, pass it into `buildPrompt(...)`, and send the returned `LLMMessage[]` to the provider layer.

**Tech Stack:** TypeScript, Next.js 16, React 19, Qwen provider adapter, ESLint, OpenSpec

---

### Task 1: Define The Shared Prompt Layer

**Files:**
- Modify: `src/lib/prompt-builder.ts`
- Verify: `src/lib/llm/types.ts`

**Step 1: Define the prompt template registry**

Add typed templates for `writer`, `summary`, `rag`, `planner`, `executor`, `evaluator`, `longTermMemory`, and `toolResult`.

**Step 2: Add variable injection**

Implement `{{variable}}` replacement with support for strings, arrays, objects, and nested paths.

**Step 3: Return structured messages**

Make `buildPrompt({ role, ...variables })` return `LLMMessage[]` so templates can emit `system`, `user`, and `tool` messages.

**Step 4: Add prompt helpers**

Expose helpers for optional labeled blocks and serialized prompt previews to keep service code small.

### Task 2: Migrate Existing Chat Services

**Files:**
- Modify: `src/server/chat/planner-service.ts`
- Modify: `src/server/chat/executor-service.ts`
- Modify: `src/server/chat/evaluator-service.ts`
- Modify: `src/server/chat/chat-orchestrator.ts`
- Modify: `src/server/chat/memory-service.ts`

**Step 1: Replace planner prompt assembly**

Move planner `system` and `user` prompts into the shared prompt layer and pass contextual blocks as variables.

**Step 2: Replace executor prompt assembly**

Switch executor intermediate/final message generation to template-driven prompts while preserving final-step constraints.

**Step 3: Replace evaluator, summary, and long-term memory prompts**

Route each model call through `buildPrompt(...)` instead of inline string assembly.

**Step 4: Preserve RAG prompt preview**

Keep `buildRagPrompt(...)` as a serialized compatibility wrapper over the shared prompt layer for logging and execution context.

### Task 3: Verify And Document The Behavior Change

**Files:**
- Create: `openspec/changes/add-managed-prompt-layer/proposal.md`
- Create: `openspec/changes/add-managed-prompt-layer/design.md`
- Create: `openspec/changes/add-managed-prompt-layer/tasks.md`
- Create: `openspec/changes/add-managed-prompt-layer/evals.md`
- Create: `openspec/changes/add-managed-prompt-layer/specs/chat-core/spec.md`
- Modify: `README.md`
- Modify: `openspec/wiki/project-overview.md`

**Step 1: Document the behavior change**

Capture why prompt management is now centralized and how templates map to workflow roles.

**Step 2: Update long-lived docs**

Describe the new prompt layer in `README.md` and the project wiki so future maintainers know where prompts live.

**Step 3: Run static verification**

Run `pnpm exec tsc --noEmit` and `pnpm lint`.

**Step 4: Record verification evidence**

Summarize the static checks and the behavioral expectations in `evals.md`.
