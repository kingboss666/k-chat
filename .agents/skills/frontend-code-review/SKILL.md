---
name: frontend-code-review
description: "当用户请求审查前端文件（如 `.tsx`、`.ts`、`.js`）时触发。支持待提交变更审查与指定文件审查，并按清单规则执行。"
---

# 前端代码审查

## 目标
当用户要求审查前端代码（尤其是 `.tsx`、`.ts`、`.js` 文件）时使用该技能。支持两种审查模式：

1. **待提交变更审查（Pending-change review）**：检查暂存区/工作区中计划提交的文件，在提交前标记违反清单规则的问题。
2. **指定文件审查（File-targeted review）**：审查用户明确指定的文件，并报告相关清单项的发现。

对所有适用文件和审查模式，都必须严格遵循下方清单。

## Checklist
请查看 [references/code-quality.md](references/code-quality.md)、[references/performance.md](references/performance.md)、[references/business-logic.md](references/business-logic.md)。这些是按类别拆分的动态清单，视为必须遵循的权威规则集合。

每条规则违规都要带上紧急程度标记，便于后续审查者按优先级修复。

## 审查流程
1. 打开相关组件/模块，收集与类名、React Flow hooks、props 记忆化和样式相关的代码行。
2. 针对每条审查规则，定位代码偏离点并截取具有代表性的片段。
3. 按下方模板输出审查结果。先按 **Urgent（紧急）** 分组，再按类别顺序（Code Quality、Performance、Business Logic）组织。

## 输出要求
调用该技能时，输出必须严格符合以下两种模板之一：

### 模板 A（存在问题时）
```
# Code review
Found <N> urgent issues need to be fixed:

## 1 <问题简述>
FilePath: <文件路径> line <行号>
<相关代码片段>

### Suggested fix
<修复建议说明>

---
...（每个 urgent 问题重复）...

Found <M> suggestions for improvement:

## ## 1 <问题简述>
FilePath: <文件路径> line <行号>
<相关代码片段>

### Suggested fix
<修复建议说明>
---
...（每个 suggestion 重复）...
```
如果没有紧急问题，省略该部分；如果没有改进建议，也省略该部分。

如果问题数量超过 10，使用 "10+ urgent issues" 或 "10+ suggestions" 概括，并仅输出前 10 条。

不要压缩段落之间的空行，按原样保留以保证可读性。

如果使用模板 A（即有问题需要修复），且至少一条问题需要改代码，请在结构化输出末尾追加一句简短追问，询问用户是否希望你按 Suggested fix 执行修复。例如："Would you like me to use the Suggested fix section to address these issues?"

### 模板 B（无问题时）
```
## Code review
No issues found.
```
