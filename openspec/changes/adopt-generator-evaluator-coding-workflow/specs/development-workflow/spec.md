# development-workflow 规格说明

## ADDED Requirements

### Requirement: 非琐碎 AI 编码任务必须拆分生成与评估角色

多文件、长任务、高不确定性或行为变更类的 AI 编码工作 MUST 使用 `Generator + Evaluator` 双角色流程。

#### Scenario: 开发者处理一个非琐碎任务

- **WHEN** 任务涉及多个阶段、多个文件、受影响 capability 较多，或存在明显不确定性
- **THEN** 流程必须让 `Generator` 负责产出方案与实现，让 `Evaluator` 独立给出通过、打回或阻断判定

### Requirement: Evaluator 必须具备独立否决能力

`Evaluator` MUST 基于仓库事实、OpenSpec 文档和验证证据进行独立审查，而不是只对 `Generator` 的自述做润色。

#### Scenario: Evaluator 审查 Generator 产物

- **WHEN** `Generator` 提交了计划、补丁、验证说明或最终交付
- **THEN** `Evaluator` 必须输出 `PASS`、`REVISE` 或 `BLOCK` 之一，并列出带证据的 findings

### Requirement: 长任务必须先提交 checkpoint 计划

长任务 MUST 在进入实现前先提交阶段性 checkpoint，并由 `Evaluator` 先行审查。

#### Scenario: 一个任务预计需要多轮推进

- **WHEN** 任务无法在一个紧凑阶段内稳定完成
- **THEN** `Generator` 必须先提交阶段目标、涉及文件、退出条件和验证方式，且未通过审查前不得直接进入实现

### Requirement: Generator 必须暴露假设与未知项

`Generator` MUST 在每个关键阶段显式记录假设、未知项和主要风险，而 SHALL NOT 假装所有前提都已确认。

#### Scenario: 任务存在信息不完备或多种实现路径

- **WHEN** `Generator` 无法从仓库和任务描述中直接确认所有关键事实
- **THEN** 交付内容中必须包含 `Assumptions & Unknowns`，供 `Evaluator` 重点攻击和核查

### Requirement: 最终交付必须附带评估结论

非琐碎 AI 编码任务在交付时 MUST 同时包含实现结果、验证证据和 `Evaluator` 的最终结论。

#### Scenario: 一项任务被宣称已完成

- **WHEN** 开发者准备交付结果
- **THEN** 交接内容必须能说明当前 verdict、主要 findings 是否已关闭、以及剩余风险
