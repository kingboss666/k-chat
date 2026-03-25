# 任务：采用 Agent Planning 聊天编排

## 1. 规划内核

- [x] 增加 Planner JSON schema
- [x] 增加 planned workflow runner
- [x] 校验任务依赖与最终步骤约束

## 2. 聊天主链路

- [x] 将聊天上下文改为 task-oriented state
- [x] 实现 Planner service
- [x] 实现 Executor service
- [x] 将 `chat-orchestrator` 改为 `plan -> execute`

## 3. 文档

- [x] 写入 proposal
- [x] 写入 design
- [x] 添加 capability spec delta

## 4. 验证

- [x] 运行 lint
- [x] 完成一次基础 smoke check
