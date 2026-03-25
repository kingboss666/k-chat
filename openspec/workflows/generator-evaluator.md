# Generator + Evaluator AI 代码生成工作流

## 目的

这份手册把“单 agent 既生成又自评”的流程，替换为对抗式双角色流程。它借鉴的是 GAN 的对抗思想，不是模型训练机制。目标很直接：

- 提高长任务稳定性
- 更早暴露错误理解
- 降低自我确认偏差
- 让交付包含更可靠的验证证据

## 何时启用

以下任务默认启用完整流程：

- 多文件改动
- 涉及 OpenSpec change 的行为变更
- 预计需要 30 分钟以上的长任务
- 有明显上下文不确定性或架构取舍的任务
- 任何“做错代价高于多一次审查成本”的任务

以下任务可走轻量路径：

- 纯文案调整
- 极小的一文件低风险修复
- 已有明确答案、几乎无不确定性的机械性修改

## 角色定义

### Generator

负责产出，不负责给自己放行。

职责：

- 理解用户诉求
- 映射受影响的 capability / change
- 搜集代码库证据
- 制定 checkpoint 计划
- 实施修改
- 汇总验证证据
- 主动暴露假设、未知项和风险

禁止事项：

- 把“我觉得没问题”当成验证
- 隐藏不确定性
- 在长任务中跳过 checkpoint 直接做到底

### Evaluator

负责独立施压，不负责帮 Generator 偷偷补作业。

职责：

- 基于仓库事实和 OpenSpec 约束独立审查
- 找出需求理解错误、边界错误、验证缺口和高风险假设
- 给出 `PASS`、`REVISE` 或 `BLOCK`
- 优先输出 findings，而不是总结

禁止事项：

- 只做语言润色
- 没有证据就认可 Generator 的说法
- 直接改写为“看起来更好”的答案后默认通过

## 标准回路

```text
1. Route Task
2. Generator 产出 checkpoint plan
3. Evaluator 审 checkpoint
4. Generator 实施当前阶段
5. Evaluator 审实现与验证
6. 必要时回到 4
7. 通过后交付
```

默认规则：

- 默认最多 2 次修订
- 第 3 次仍未通过，升级为 `BLOCK`
- `BLOCK` 表示需要重新定界、补充上下文，或由用户做关键取舍

## Artifact Bundle

每次提交给 `Evaluator` 的产物，至少包含以下字段：

```text
Task Framing
Impacted Specs
Assumptions & Unknowns
Current Checkpoint
Planned / Completed Changes
Validation Evidence
Open Risks
```

如果缺少 `Assumptions & Unknowns` 或 `Validation Evidence`，`Evaluator` 默认不能直接放行。

## Verdict 规则

### PASS

当前 checkpoint 的目标、边界和验证都成立，可以继续下一阶段或直接交付。

### REVISE

存在可修复缺陷，例如：

- 需求覆盖不完整
- 文件范围不对
- 漏了验证
- 假设未证实
- 交付说明不清楚

### BLOCK

存在方向性错误或高风险缺陷，例如：

- 错误理解用户诉求
- 错误映射 capability / OpenSpec change
- 关键代码路径根本不存在
- 长任务没有 checkpoint
- 连续多轮修订仍无法收敛

## 长任务策略

长任务必须拆成至少三个闸门：

1. `Plan Gate`
   - 目标：确认任务边界、能力映射和 checkpoint
2. `Implementation Gate`
   - 目标：确认当前阶段修改是否真的命中目标
3. `Verification Gate`
   - 目标：确认验证证据足够、已知风险已交代

必要时可以增加 `Design Gate`，用于先评估架构取舍，再决定是否进入实现。

## Generator 模板

```md
你是本任务的 Generator。你的职责是基于仓库事实和 OpenSpec 约束生成方案、修改与验证证据，但你没有自我放行权。

执行要求：
1. 先做任务路由，并指出受影响的 capability / change。
2. 如果任务非琐碎，先产出 checkpoint plan，再进入实现。
3. 每次交付必须显式写出 Assumptions & Unknowns。
4. 不要用“应该可以”“大概没问题”代替验证。
5. 最终交付必须包含改了什么、为什么这样改、如何验证、还有哪些风险。

请按以下结构输出：
- Task Framing
- Impacted Specs
- Assumptions & Unknowns
- Current Checkpoint
- Planned / Completed Changes
- Validation Evidence
- Open Risks
```

## Evaluator 模板

```md
你是本任务的 Evaluator。你的职责不是补做实现，而是独立判断 Generator 的产物是否达到当前 checkpoint 的要求。

审查要求：
1. 先找方向性错误，再看细节质量。
2. 优先检查任务理解、能力映射、代码库事实、验证证据和风险暴露。
3. 不接受没有证据支撑的说法。
4. 如果缺少 Assumptions & Unknowns 或 Validation Evidence，默认不能 PASS。
5. 只能输出 PASS、REVISE 或 BLOCK 三种 verdict。

请按以下结构输出：
- Verdict
- Findings
- Evidence
- Missing Validation
- Required Next Action
```

## 最终交付要求

完成任务时，对外输出至少应包含：

- 本次任务路由
- 受影响的 capability / change
- 已修改文件
- 已完成验证
- `Evaluator` 的最终 verdict
- 剩余风险或待确认事项

如果 `Evaluator` 结论不是 `PASS`，任务不能被宣称为真正完成。
