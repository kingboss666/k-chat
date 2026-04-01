## ADDED Requirements

### Requirement: 集中式 Prompt Layer

系统 SHALL 通过集中式 Prompt Layer 组装模型消息，而不是在各个聊天 service 中散落维护手写 Prompt 字符串。

#### Scenario: 工作流角色需要发起模型调用

- **WHEN** Planner、Executor、Evaluator、Summary、LongTermMemory 或 RAG 任一角色需要构建模型输入
- **THEN** 系统会通过共享模板注册表生成对应的消息数组
- **AND** 调用方只需要提供领域变量，而不是重复手写完整 Prompt

### Requirement: 支持多消息角色与变量注入

系统 SHALL 支持基于模板生成带变量注入的 `system`、`user`、`tool` 消息。

#### Scenario: 模板需要拼接不同角色的消息

- **WHEN** 某个 Prompt 模板声明了多个消息片段
- **THEN** 系统会按模板顺序输出 `LLMMessage[]`
- **AND** 占位变量会被替换为调用方提供的上下文值
