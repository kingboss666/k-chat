# OpenSpec 变更目录说明

每个提议中的变更都应单独创建一个目录：

```text
openspec/changes/<change-id>/
```

推荐文件：

- `proposal.md`：为什么要做这次变更
- `design.md`：技术方案与取舍
- `tasks.md`：可执行的任务清单
- `evals.md`：当变更涉及 AI 行为、检索、记忆、工具或回答结构时必须提供
- `specs/<capability>/spec.md`：受影响能力的 spec delta

推荐的 `change-id` 风格：

- `add-web-search-tool`
- `improve-explanation-structure`
- `refactor-chat-orchestrator`

保持 `change-id` 简短、稳定，并尽量围绕能力边界命名。
