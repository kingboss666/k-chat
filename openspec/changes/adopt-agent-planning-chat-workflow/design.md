# 设计：Agent Planning 聊天编排

## 概览

新的聊天链路拆成三个清晰角色：

1. `Planner Agent`
   - 输入用户问题、记忆上下文、历史摘要、最近对话和可用工具目录
   - 输出 JSON 任务列表
2. `Executor Agent`
   - 顺序执行 Planner 产出的任务
   - 把每步结果写入共享上下文
3. `Final LLM Step`
   - 作为计划中的最后一个 `LLM` 任务对用户输出最终结果
   - 保持当前前端流式消费模型

## 关键决策

### 决策 1：Planner 只输出 JSON

Planner 输出固定 schema，至少包含：

- `id`
- `title`
- `tool`
- `dependsOn`
- `parameters`

这样 Executor 不需要解析自然语言计划，减少提示词波动带来的执行风险。

### 决策 2：Executor 仍然串行

虽然计划是动态的，但本次 Executor 仍然按顺序执行。原因是：

- 当前聊天 UI 已按单条流式回复设计
- 工具和 RAG 结果通常会成为后续 LLM 步骤的输入
- 串行先足够解决“固定 workflow”的刚性问题

### 决策 3：Memory 直接进入 Planner 上下文，RAG 由任务决定

长期记忆、对话摘要和最近历史会直接给 Planner 用于决策。RAG 不再是固定前置步骤，而是 Planner 在需要知识支撑时显式生成的任务。

## 数据流

```text
User Input
  -> Planner Prompt
  -> Planner JSON Tasks
  -> Executor Loop
     -> step result map
     -> final LLM stream
  -> UI text stream + usage
```

## 失败处理

- Planner JSON 解析失败时，回退到最小可用计划
- 单步工具失败时，失败信息作为结构化结果传给后续步骤
- 最后一步必须是 `LLM`，否则拒绝执行计划

## 兼容性

- `/api/chat` 的 NDJSON 流格式保持不变
- 前端仍然只消费 `reasoning`、`text`、`usage`、`error`
- 长期记忆写入时机不变，仍在最终回答结束后进行
