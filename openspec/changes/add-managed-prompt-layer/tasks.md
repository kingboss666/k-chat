# Tasks: Add Managed Prompt Layer

- [x] 识别受影响 capability：`chat-core`
- [x] 在 `src/lib/prompt-builder.ts` 中实现集中式模板注册表
- [x] 实现 `buildPrompt({ role, ...variables })` 和变量注入
- [x] 支持 `system / user / tool` 多角色消息输出
- [x] 将 `summary`、`rag`、`planner`、`executor`、`evaluator`、`longTermMemory` 迁移到共享 Prompt Layer
- [x] 保留 RAG prompt 的可序列化预览
- [x] 更新 `README.md`
- [x] 更新 `openspec/wiki/project-overview.md`
- [x] 记录验证结果
