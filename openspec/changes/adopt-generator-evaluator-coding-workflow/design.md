# 设计：Generator + Evaluator 对抗式 AI 代码生成工作流

## 需求摘要

这次改造的核心诉求不是“让 AI 更努力一点”，而是从流程上修正单代理模式的结构性缺陷。目标问题主要有两个：

1. 长任务质量差：任务一旦跨多个阶段和文件，agent 会逐渐丢失最初的约束、边界和验收标准。
2. 认不清自己的问题：同一个 agent 既负责产出，又负责判断自己是否合格，天然存在乐观偏差。

因此，本次设计采用运行时的对抗式双角色模式，而不是训练意义上的 GAN。`Generator` 负责生成计划、补丁、验证和交付说明；`Evaluator` 负责独立审查这些产物，并决定 `PASS`、`REVISE` 或 `BLOCK`。

## 高层架构

```text
User / Coordinator
        |
        v
   Generator
        |
        v
Artifact Bundle
  - task framing
  - impacted specs
  - assumptions / unknowns
  - checkpoint plan
  - patch / docs
  - validation evidence
        |
        v
   Evaluator
        |
   +----+-----+
   |          |
 PASS      REVISE / BLOCK
   |          |
 deliver   feedback to Generator
```

这里的 `Coordinator` 可以是人，也可以是最外层调度 agent。它本身不负责写代码，只负责确保任务先被路由到正确流程，并在 `Evaluator` 判定为 `BLOCK` 时决定是否升级到用户确认。

## 关键决策

### 决策 1：Evaluator 必须独立，而不是 Generator 的“自检模式”

`Evaluator` 不能只是让同一个角色“再看一遍”。它必须以独立职责和独立判定标准工作，输入应尽量以 `Artifact Bundle` 为主，而不是读取 `Generator` 的主观解释。这样做的原因是，真正需要被克服的是自我确认偏差，而不是文字润色问题。

权衡：

- 好处：更容易发现错误假设、缺失验证和 spec 漂移。
- 代价：额外增加一次模型调用或一次人工审查，延迟会上升。

结论：对非琐碎任务，这个成本是值得的。

### 决策 2：长任务必须先拆 checkpoint，再进入实现

长任务不再允许“读完需求后直接从头做到尾”。`Generator` 必须先提交 checkpoint 计划，至少包含：

- 当前任务路由和受影响 capability
- 阶段目标
- 涉及文件范围
- 每段的完成定义
- 每段需要的验证方式

`Evaluator` 必须先审这个 checkpoint 计划。只有计划通过后，才允许进入具体实现。这样做是为了在大任务中尽早固定边界，防止上下文滑坡。

### 决策 3：Generator 必须显式暴露假设和未知项

为解决“认不清自己的问题”，`Generator` 每轮都必须输出：

- 已确认事实
- 关键假设
- 仍未知但会影响实现的事项
- 风险最高的可能误解

`Evaluator` 的首要职责之一，就是攻击这些假设和未知项，检查它们是否已被代码库证据或 OpenSpec 文档支持。

## 交互协议

### Generator 输出契约

`Generator` 每次交付给 `Evaluator` 的内容，至少应包含以下部分：

1. `Task Framing`：对用户诉求的简明理解
2. `Impacted Specs`：受影响的 capability / change 文档
3. `Assumptions & Unknowns`：假设、未知项和风险
4. `Checkpoint`：当前阶段目标与退出条件
5. `Changes`：计划修改或已修改的文件
6. `Validation`：已做/待做的验证
7. `Open Risks`：仍未解决的问题

### Evaluator 输出契约

`Evaluator` 只允许输出三类结论：

- `PASS`：满足当前 checkpoint，可继续或可交付
- `REVISE`：存在可修复缺陷，必须按反馈回改
- `BLOCK`：存在方向性错误、边界错误或证据缺失，必须停止并升级

同时必须给出：

- 严重级别排序的发现列表
- 每条发现对应的证据来源
- 缺失的验证项
- 下一步动作建议

`Evaluator` 不应直接“顺手重写答案”。它的职责是判定和施压，而不是代替 `Generator` 偷偷补作业。

## 回合控制

默认策略：

- 小任务：可允许一次 `Generator -> Evaluator -> Deliver`
- 中大任务：采用 `Plan -> Evaluate -> Implement -> Evaluate -> Verify -> Evaluate`
- 默认最多 2 次修订回合
- 第 3 次仍无法通过时，进入 `BLOCK` 并要求人工或上层调度重新定界

这样既避免无限回环，也避免因为“再试一次”而持续堆积错误上下文。

## 失败模式与缓解

### 失败模式：Evaluator 退化成礼貌 reviewer

缓解：

- 明确 `PASS / REVISE / BLOCK` 三态输出
- 要求 findings 优先于总结
- 要求提供仓库证据、OpenSpec 证据或验证缺口

### 失败模式：Generator 继续隐藏不确定性

缓解：

- 把 `Assumptions & Unknowns` 设为强制输出
- 若缺失该部分，`Evaluator` 直接 `REVISE`

### 失败模式：流程太重，导致小任务效率下降

缓解：

- 允许 `docs-only` 和极小的一文件修复走轻量路径
- 对多文件、长任务、行为变更和高风险任务强制启用完整双角色流程

## 产物落地

这次改造只落地到工程工作流层，不改动聊天业务运行时。仓库内会新增：

- 本次 OpenSpec change 文档
- 一份可复用的 `Generator + Evaluator` 工作流手册
- 项目级工作约定更新
- README 中的工程工作流入口说明

这样可以先用最低成本把行为约束固化下来，为之后是否接入自动化编排保留空间。
