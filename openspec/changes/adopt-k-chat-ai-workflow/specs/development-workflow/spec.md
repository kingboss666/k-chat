# development-workflow 规格说明

## ADDED Requirements

### Requirement: 实现前必须先完成任务路由

K-Chat 的工作在开始实现前 MUST 先完成任务分类。

#### Scenario: 收到一个新的任务

- **WHEN** 收到一项请求
- **THEN** 在开始改代码前，先将其分类为 `docs-only`、`bugfix`、`behavior-change`、`feature` 或 `refactor`

### Requirement: 能力可追踪性

每个实现任务 MUST 明确受影响的 capability specs。

#### Scenario: 开发者开始规划一个变更

- **WHEN** 实现规划开始
- **THEN** 任务中应记录这次改动影响了哪些 capability specs

### Requirement: AI 相关改动必须使用 OpenSpec change

行为变化或能力边界变化的工作 MUST 使用 OpenSpec change 目录。

#### Scenario: 某项任务改变了 Prompt、记忆、检索、工具或流式行为

- **WHEN** 任务影响了用户可感知的 AI 行为，或影响了 AI 流程的运行特征
- **THEN** 仓库中必须存在 `openspec/changes/<change-id>/`，并包含 `proposal.md`、`design.md`、`tasks.md` 和对应的 spec delta

### Requirement: AI 相关改动必须补行为评测

会影响 AI 行为的改动 MUST 记录行为验证结果，而不只是做静态检查。

#### Scenario: 某次改动触及聊天编排或模型行为

- **WHEN** 实现修改了 Prompt 逻辑、工具路由、记忆逻辑、检索或回答结构
- **THEN** 该 change 必须在 `evals.md` 中记录行为评测场景和结果

### Requirement: 检索语料隔离

工程工作流产物 MUST 放在运行时检索语料目录之外。

#### Scenario: 开发者新增流程文档

- **WHEN** 创建工作流、评审、proposal 或 design 文档
- **THEN** 文档必须放在 `openspec/` 或其他工程目录中，而不是 `docs/knowledge/`

### Requirement: 交付完成必须有证据

当 spec、代码和验证证据没有同时到位时，工作 MUST NOT 被视为完成。

#### Scenario: 开发者声称任务已完成

- **WHEN** 任务被标记为已交付
- **THEN** 最终交接内容必须能够说明受影响的 capabilities、变更的文件以及验证结果
