# 提案：为 K-Chat 采用原生 OpenSpec AI 工作流

## 为什么要做

K-Chat 需要一套适合 AI 应用本身的工作流，而不是大型企业 CRUD 模板。这个仓库当前架构已经比较紧凑，而它最容易出风险的地方主要是行为层面的变化：

- Prompt 与回答结构变化
- 工具路由与工具失败处理
- 记忆与检索行为
- 流式聊天体验

此外，仓库还有一个目录级约束：`docs/knowledge/` 会被当作检索语料，因此工程文档不能放进去。

## 这次变更要做什么

- 引入 `openspec/project.md` 作为项目级运行约定
- 定义运行时系统的初始 capability specs
- 定义面向未来变更的 OpenSpec 开发流程
- 为 AI 相关改动强制加入行为评测要求
- 将 `docs/knowledge/` 保留为运行时检索语料目录

## 非目标

- 本次不改变运行时产品行为
- 本次不删除历史 `metaai/` 资产
- 本次不接入 OpenSpec CLI 或额外自动化

## 预期结果

后续 K-Chat 的工作应以 OpenSpec change 和 capability spec 为起点，而不是依赖临时文档或外部复制来的工作流。
