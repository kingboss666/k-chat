# Agent Planning Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fixed chat workflow with a planner-driven task list that the executor can run step-by-step with memory, RAG, and tool support.

**Architecture:** Introduce a generic planning schema and planned-workflow runner in `src/lib`, then add chat-specific planner and executor services in `src/server/chat`. The chat route keeps the same streaming contract, but the backend path changes from hardcoded `RAG -> Summarize -> Generate -> Review` to `plan -> execute -> synthesize`.

**Tech Stack:** Next.js 16, TypeScript, Zod, Qianwen, local vector store

---

### Task 1: Define planning primitives

**Files:**
- Create: `src/lib/agent-planning.ts`
- Modify: `src/lib/workflow-engine.ts`

**Step 1: Add planner JSON schema**

Define the planner task union for `RAG`, `LLM`, and `TOOL`, including dependency validation and JSON parsing helpers.

**Step 2: Add a planned-workflow runner**

Extend the workflow engine with an async task runner that can yield execution events while preserving ordered task results.

**Step 3: Verify type safety**

Run: `pnpm lint`
Expected: no new schema or generic type errors

### Task 2: Refactor chat orchestration around planner and executor

**Files:**
- Modify: `src/lib/chat-workflow.ts`
- Create: `src/server/chat/planner-service.ts`
- Create: `src/server/chat/executor-service.ts`
- Modify: `src/server/chat/chat-orchestrator.ts`

**Step 1: Move chat context to task-oriented state**

Replace fixed workflow fields with `plannedTasks`, `taskResults`, and final execution state.

**Step 2: Implement planner service**

Create the planner prompt, JSON plan parsing, fallback plan generation, and tool catalog rendering.

**Step 3: Implement executor service**

Add RAG, LLM, and TOOL handlers that consume planner tasks sequentially and stream the final LLM step.

**Step 4: Rewire orchestrator**

Load memory, call planner, execute the planned tasks, stream text events, then persist chat and long-term memory.

**Step 5: Verify the route contract**

Run: `pnpm lint`
Expected: no API typing or orchestration errors

### Task 3: Document behavior change

**Files:**
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/proposal.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/design.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/tasks.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/specs/chat-core/spec.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/specs/memory-and-context/spec.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/specs/rag-and-knowledge/spec.md`
- Create: `openspec/changes/adopt-agent-planning-chat-workflow/specs/tools-and-integrations/spec.md`

**Step 1: Capture the requirement change**

Describe why fixed steps are being replaced and what remains compatible.

**Step 2: Record architectural decisions**

Document planner JSON output, executor sequencing, and how memory/RAG influence planning.

**Step 3: Mark implementation tasks**

Keep the change task list aligned with the delivered code and validation.

### Task 4: Final verification

**Files:**
- Modify: none expected

**Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 2: Smoke-check planner flow**

Confirm the planner can produce a valid plan, the executor can consume it, and the final step still streams to the UI contract.
