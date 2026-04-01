# Evals: Add Managed Prompt Layer

## Static

- `2026-04-01`: `pnpm exec tsc --noEmit` -> PASS
- `2026-04-01`: `pnpm lint` -> PASS

## Behavioral Expectations

- Planner、Executor、Evaluator、Summary、LongTermMemory、RAG 的 Prompt 不再由各 service 手写拼接
- `buildPrompt({ role, ...variables })` 可以直接产出 `LLMMessage[]`
- 模板支持变量注入，并可组合 `system / user / tool` 三类消息
- RAG 仍然能产出可写入执行结果的文本 prompt 预览
