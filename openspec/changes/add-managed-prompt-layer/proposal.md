# Proposal: Add Managed Prompt Layer

## Why

当前聊天流程里的 Prompt 分散在 `planner-service`、`executor-service`、`evaluator-service`、`memory-service` 和 `chat-orchestrator` 中，以手写字符串形式拼接。这样的问题很直接：

- Prompt 难以复用，角色边界散落在多个文件里
- 变量注入规则不统一，后续扩展容易复制粘贴
- `system / user / tool` 多角色消息没有统一抽象
- 行为调整时难以判断哪些 Prompt 需要同步修改

## What Changes

- 新增一个集中式 Prompt Layer，由 `src/lib/prompt-builder.ts` 维护模板注册表
- 提供 `buildPrompt({ role, ...variables })` 入口，支持变量注入
- 让模板直接产出 `LLMMessage[]`，支持 `system`、`user`、`tool` 消息角色
- 将 `summary`、`rag`、`planner`、`executor`、`evaluator`、`longTermMemory` 等角色迁移到共享模板
- 保留 RAG prompt 的文本预览能力，兼容现有日志与执行上下文

## Impact

- 影响 capability：`chat-core`
- 影响范围：Prompt 组装路径、可维护性、后续角色扩展方式
- 不改变 HTTP 协议、前端 UI 或工具 schema
