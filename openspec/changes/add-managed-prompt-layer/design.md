# Design: Managed Prompt Layer

## Overview

新的 Prompt Layer 把“角色定义”和“变量填充”从业务 service 中抽离出来。服务层只负责整理上下文数据，例如历史摘要、长期记忆、工具目录、前置步骤结果；真正的消息结构由 `prompt-builder` 统一输出。

## Architecture

### 1. Template Registry

`src/lib/prompt-builder.ts` 维护一个模板注册表，每个模板由若干条消息组成：

- `role`: `system | user | assistant | tool`
- `content`: 字符串或字符串数组
- `name` / `tool_call_id`: 仅当模板需要 `tool` 消息时注入

这样 `planner`、`executor`、`evaluator` 等逻辑角色可以稳定映射到一组消息模板，而不是在 service 里反复写字符串。

### 2. Variable Injection

Prompt Layer 使用 `{{variable}}` 占位符做变量注入，并支持：

- 标量值：字符串、数字、布尔值
- 数组与对象的序列化
- 点路径访问，例如 `{{tool.name}}`
- 空值过滤，避免无意义的空块进入 Prompt

### 3. Service Integration

迁移后的 service 只保留两类职责：

- 把领域上下文整理成可读 block
- 调用 `buildPrompt(...)` 获取 `LLMMessage[]`

这让 Planner / Executor / Evaluator 的行为规则被集中维护，也让后续新增 `writer`、`reviewer`、`router` 之类角色时，不需要在 service 层发明新的拼接方式。

## Compatibility

- `buildRagPrompt(...)` 仍然保留，但内部改为调用共享模板并序列化消息，避免破坏现有日志结构
- 现有 `llm.generate(...)` / `llm.generateStream(...)` 接口不需要改动

## Risks

- 模板迁移可能改变少量空白符和段落组织
- 变量缺失时如果模板设计不当，可能出现语义不完整的 Prompt

## Mitigations

- 使用 `buildPromptBlock(...)` 对可选上下文做显式包裹
- 通过 `pnpm exec tsc --noEmit` 和 `pnpm lint` 保证调用点与模板 API 一致
