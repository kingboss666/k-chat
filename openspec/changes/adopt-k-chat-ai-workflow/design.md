# 设计：为 K-Chat 建立原生 OpenSpec AI 工作流

## 摘要

这份设计将 OpenSpec 引入为 K-Chat 的唯一工程工作流。目标是在保持流程足够轻量的同时，让 AI 行为相关的改动具备明确、可审查、可追踪的过程。

## 目录结构

```text
openspec/
  project.md
  specs/
    chat-core/spec.md
    memory-and-context/spec.md
    rag-and-knowledge/spec.md
    tools-and-integrations/spec.md
    ui-and-streaming/spec.md
  changes/
    adopt-k-chat-ai-workflow/
      proposal.md
      design.md
      tasks.md
      specs/
        development-workflow/spec.md
  archive/
```

## 能力边界

### chat-core

负责聊天编排、分阶段生成、有界工具轮次和结构化回答解析。

### memory-and-context

负责最近历史、摘要压缩、长期记忆加载，以及可直接进入 Prompt 的上下文渲染。

### rag-and-knowledge

负责本地 Markdown 检索、分块、向量回退以及检索 Prompt 构建。

### tools-and-integrations

负责工具声明、参数校验与执行行为。

### ui-and-streaming

负责消息渲染、流式交互、中止生成、错误展示和 Token 统计可见性。

## 工作流设计

### 1. 先路由任务

每项任务都先归类为 `docs-only`、`bugfix`、`behavior-change`、`feature` 或 `refactor`。

### 2. 识别受影响的能力

每项任务在实现前都必须映射到一个或多个 capability specs。

### 3. 判断是否必须建立 change 目录

凡是影响回答行为、工具、记忆、检索、流式体验或成本/延迟特征的改动，都要创建 change 目录。

### 4. 按 spec-first 方式推进

对于 change 驱动的任务，proposal、design、tasks 和 spec delta 要先于代码，或至少与代码同步更新。它们不是事后补充的记录。

### 5. 在正确层级完成验证

会影响 AI 行为的改动需要同时完成：

- 静态检查
- 功能检查
- 记录在 `evals.md` 中的行为评测

### 6. 将稳定规则提升为长期规范

当团队确认这套流程稳定可用后，再把 development workflow 的 spec delta 提升为长期 spec，并将该 change 归档。

## 关键决策

### 决策 1：不在 `docs/knowledge/` 中存放工程文档

原因：

当前检索实现会递归扫描该目录。如果把流程文档混进去，会污染模型的检索上下文。

### 决策 2：保持 capability 数量精简

原因：

K-Chat 当前规模较小。五个运行时 capability 足以覆盖核心架构，又不会把 specs 变成新的维护负担。

### 决策 3：AI 相关改动必须附带行为评测

原因：

Prompt、记忆、检索和工具路由变化，仅靠 lint 和类型检查并不足以证明正确性。

## 风险

### 风险：spec 与代码逐渐漂移

缓解方式：

要求每个任务在完成前都明确受影响的 capability，并同步更新相应文档。

### 风险：流程对小修复来说过重

缓解方式：

为纯文案、纯样式和非行为型修复保留轻路径。

### 风险：OpenSpec 只停留在概念层面

缓解方式：

直接把项目上下文、运行时 specs 和工作流采用变更一起落到仓库里，而不是停在讨论阶段。
