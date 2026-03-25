# 提案：将固定聊天 Workflow 升级为 Agent Planning

## 为什么要改

当前聊天主链路使用固定的 `RAG -> Summarize -> Generate -> Review` 步骤。这个结构适合早期验证，但有两个明显限制：

- 任务步骤是写死的，不能根据用户问题动态调整
- 工具、RAG 和内容生成逻辑耦合在单一编排函数里，难以复用到写作、研究或其他任务

## 变更内容

- 引入 `Planner Agent`，负责把用户问题转换成结构化 JSON 任务列表
- 引入 `Executor Agent`，按顺序执行 `RAG`、`LLM`、`TOOL` 等步骤
- 将 Memory 与 RAG 作为 Planner 的可用背景上下文
- 保持现有聊天 API 的流式输出契约不变

## 影响范围

- `chat-core`
- `memory-and-context`
- `rag-and-knowledge`
- `tools-and-integrations`

## 非目标

- 本次不做多 Executor 并行调度
- 本次不引入独立任务队列或外部工作流引擎
- 本次先接入聊天主链路，不同时改造所有其他能力
