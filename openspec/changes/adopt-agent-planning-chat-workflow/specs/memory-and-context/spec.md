# memory-and-context 规格增量

## ADDED Requirements

### Requirement: 为 Planner 提供记忆背景

系统 SHALL 在 Planner 生成任务列表前先准备长期记忆、摘要记忆和最近对话上下文。

#### Scenario: 聊天请求进入规划阶段

- **WHEN** Planner 开始生成任务列表
- **THEN** 用户画像、历史摘要和最近对话会作为规划背景提供给 Planner
