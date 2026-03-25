# K-Chat OpenSpec 项目上下文

## 项目概览

K-Chat 是一个基于 Next.js 16、React 19、TypeScript 和通义千问构建的单仓 AI 聊天应用。这个产品的核心行为由几块紧密耦合的能力共同决定：

- 聊天编排
- Prompt 与输出结构控制
- 工具调用
- 短期记忆、摘要记忆与长期记忆
- 本地知识检索
- 流式聊天界面

本项目将 OpenSpec 作为功能设计、行为变更和重要重构的唯一工作流。

## 架构映射

当前实现主要集中在以下区域：

- `src/server/chat/*`：聊天编排、输出解析、工具执行、记忆持久化
- `src/lib/chat-workflow.ts`：分阶段工作流定义
- `src/lib/workflow-engine.ts`：通用工作流运行器
- `src/lib/memory.ts`：短期记忆与摘要记忆
- `src/lib/long-term-memory.ts`：持久化的用户画像记忆
- `src/lib/local-knowledge-search.ts`：本地 Markdown 检索
- `src/components/*` 与 `src/app/*`：聊天 UI 与流式交互体验

## 能力映射

长期能力规格存放在 `openspec/specs/` 下：

- `chat-core`
- `memory-and-context`
- `rag-and-knowledge`
- `tools-and-integrations`
- `ui-and-streaming`

过程性改动通过 `openspec/changes/*` 提出，在工作流稳定后再合并回长期 specs。

## 工作约定

### 1. 编码前先做任务路由

每个任务在实现前都必须先归类：

- `docs-only`：仅文档或文案调整
- `bugfix`：正确性或 UI 问题，但不涉及产品行为重设计
- `behavior-change`：Prompt、回答结构、工具路由、记忆行为、检索行为调整
- `feature`：新的用户能力或开发能力
- `refactor`：代码或架构重组，目标是等价重构或受控行为变化

### 2. 先识别受影响的能力

在编辑代码之前，先列出这次任务影响到哪些 capability specs。如果任务无法映射到至少一个 capability，就先定义能力边界，再进入实现。

### 3. 影响行为时必须创建 OpenSpec change

当任务会改变以下任一内容时，必须创建 `openspec/changes/<change-id>/`：

- 用户可感知的回答行为
- 工具可用性或工具路由
- 记忆读写行为
- 检索策略或知识来源
- 流式交互或关键 UI 行为
- 延迟、Token 消耗或运行成本特征

纯文案修复、非行为型重构、局部样式修复可以走轻路径，不强制创建 change 目录，但长期 spec 仍然必须保持正确。

### 4. 先写 spec，再写实现

对于 change 驱动的任务，要在代码变更之前或至少同步更新 proposal、design、tasks 和 spec delta。代码不能成为唯一真相源。

### 5. 验证行为，而不只是验证语法

对于会影响 AI 行为的改动，验证分三层：

- `static`：lint、类型检查、构建
- `functional`：请求流程、工具执行、UI 行为
- `behavioral`：回答形态、记忆命中/未命中、检索命中/未命中、工具选择、失败兜底

行为验证应记录在 change 内，而不是散落在临时对话记录里。

### 6. 非琐碎 AI 编码任务默认使用 Generator + Evaluator

对于多文件、长任务、高不确定性或行为变更类的 AI 编码工作，默认不要让同一个 agent 既生成又自评。应采用 `Generator + Evaluator` 双角色流程：

- `Generator`：负责理解任务、制定 checkpoint、产出修改和验证证据
- `Evaluator`：负责独立审查，并给出 `PASS`、`REVISE` 或 `BLOCK`

除 `docs-only` 或极小低风险修改外，不应跳过这个评估闸门。

### 7. 长任务必须先拆 checkpoint

如果任务预计需要多阶段推进，就必须先提交 checkpoint 计划，再进入实现。checkpoint 至少要说明：

- 当前阶段目标
- 受影响文件范围
- 完成定义
- 需要的验证方式

未通过 checkpoint 审查前，不应直接一路做到最终交付。

### 8. 交付时必须暴露假设、未知项和最终 verdict

为避免 AI 在长任务中“认不清自己的问题”，每次关键交付都应显式说明：

- 当前假设是什么
- 还有哪些未知项
- 做了哪些验证
- `Evaluator` 的最终 verdict 是什么

如果 verdict 不是 `PASS`，任务不应被视为真正完成。

## 目录约束

- `docs/knowledge/` 仅用于运行时检索语料。
- 工程工作流、评审、proposal、design 文档必须放在 `openspec/` 或其他不会参与检索的工程目录中。
- 不要把工作流文档放进 `docs/knowledge/`，因为 `src/lib/local-knowledge-search.ts` 会递归扫描这个目录。

## 推荐的 Change 结构

```text
openspec/
  changes/
    <change-id>/
      proposal.md
      design.md
      tasks.md
      evals.md
      specs/
        <capability>/
          spec.md
```

当改动影响模型行为、检索、工具、记忆或回答结构时，应补充 `evals.md`。

## 完成检查清单

一项任务只有在以下条件全部满足时，才算真正完成：

1. 已识别受影响的 capability
2. 已更新相关 OpenSpec 文档
3. 已按正确层级完成验证
4. 最终交付能清楚说明改了什么、改在哪里、如何验证

## 后续事项
- 每次实现新功能或完成重要变更后，务必更新 `README.md`，确保文档准确反映当前项目状态和使用方式。
