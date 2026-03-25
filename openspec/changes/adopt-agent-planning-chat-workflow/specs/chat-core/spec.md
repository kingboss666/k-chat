# chat-core 规格增量

## ADDED Requirements

### Requirement: 基于 Planner 的动态步骤生成

系统 SHALL 在生成聊天回答前先产出结构化任务列表，而不是依赖固定写死的步骤序列。

#### Scenario: 用户发送一条新消息

- **WHEN** 聊天服务开始处理请求
- **THEN** Planner 会根据用户问题和上下文生成 JSON 任务列表

### Requirement: 基于任务列表的顺序执行

系统 SHALL 按 Planner 生成的顺序执行步骤，并把每步结果写入共享上下文。

#### Scenario: Planner 返回多个任务

- **WHEN** Executor 收到合法任务列表
- **THEN** 它会按依赖顺序执行任务，并使后续步骤可读取前置结果
