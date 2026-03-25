# rag-and-knowledge 规格增量

## ADDED Requirements

### Requirement: RAG 作为可规划执行步骤

系统 SHALL 允许 Planner 显式生成 `RAG` 任务，而不是将检索固定为每次请求必走步骤。

#### Scenario: 用户问题需要知识支撑

- **WHEN** Planner 判断回答依赖知识库内容
- **THEN** 任务列表会包含一个或多个 `RAG` 步骤供 Executor 执行
