# 项目总览

## 功能概述

K-Chat 当前是一个本地运行的 AI 对话实验项目，目标不是只做聊天界面，而是把规划、执行、评审、记忆、检索、工具调用和工程治理放进同一个可运行闭环里。

从当前实现看，它已经从“最小聊天 Demo”推进到了“带 Planner / Executor / Evaluator 回路的 Agent Prototype”。

## 最近一次更新

- 日期：2026-03-31
- 类型：`docs-only`
- 摘要：补充当前项目阶段总结，并建立 `openspec/wiki/` 作为后续功能知识沉淀目录

## 本次更新内容

- 总结了当前项目已经具备的核心能力、关键文件和维护边界
- 明确后续新增功能、修复 BUG、需求变更时，需要持续维护 `openspec/wiki/`
- 将“方便未来的人和 AI 阅读学习”作为工程文档的一部分，而不是留在临时对话里

## 当前系统能力

- 支持基于 Next.js App Router 的聊天页面和流式消息返回
- 支持推理过程展示和 Token 消耗观察
- 支持 `Planner` 先拆解任务，再由 `Executor` 按步骤执行
- 支持 `Evaluator` 独立验收结果，并在失败时推动下一轮修正
- 支持短期记忆、摘要记忆和长期记忆三层上下文
- 支持文档切块、Embedding、本地向量检索
- 支持工具调用，当前内置天气、时间、数学计算
- 支持请求级执行日志落盘，便于回看计划、执行和评审过程
- 支持基于 OpenSpec 的行为规格、变更流程和工程治理

## 核心执行链路

```text
Browser UI
  -> /api/chat
    -> chat-orchestrator
      -> 加载短期 / 摘要 / 长期记忆
      -> Planner 生成任务列表
      -> Executor 执行 RAG / TOOL / LLM
      -> Evaluator 判断是否通过
      -> 持久化长期记忆和执行日志
```

## 相关文件

- `src/app/page.tsx`：聊天页面入口
- `src/components/Chat.tsx`：核心聊天组件
- `src/app/api/chat/route.ts`：聊天流式接口
- `src/server/chat/chat-orchestrator.ts`：聊天总编排入口
- `src/server/chat/planner-service.ts`：任务规划
- `src/server/chat/executor-service.ts`：任务执行
- `src/server/chat/evaluator-service.ts`：结果评审
- `src/server/chat/memory-service.ts`：长期记忆提取与持久化
- `src/server/chat/tool-service.ts`：工具路由与执行
- `src/lib/memory.ts`：短期记忆和摘要记忆
- `src/lib/long-term-memory.ts`：长期记忆模型
- `src/lib/vector-store.ts`：本地向量库
- `src/lib/document-chunk.ts`：文档切块
- `openspec/project.md`：项目级工作约定
- `openspec/workflows/generator-evaluator.md`：双角色工程工作流
- `openspec/specs/*`：长期能力规格
- `openspec/changes/*`：过程性变更提案

## 当前限制

- 短期记忆和摘要记忆当前不持久化，服务重启后会丢失
- 长期记忆和向量库基于本地文件，适合原型，不适合高并发生产场景
- 当前工具集合较少，能力边界还比较窄
- 还没有多用户隔离、登录和权限体系
- 自动化测试链路仍不完整，当前验证偏向人工和行为验证

## 工程治理现状

- 重要行为变更默认通过 `openspec/changes/<change-id>/` 进行 proposal、design、tasks、spec delta 管理
- 非琐碎 AI 编码任务默认采用 `Generator + Evaluator` 双角色流程
- 从 2026-03-31 起，新增功能、重要 BUG 修复和需求演进都要求同步维护 `openspec/wiki/`

## 注意事项

- `docs/knowledge/` 只用于运行时检索语料，不要把工程文档放进去
- `openspec/wiki/` 记录的是当前功能认知和维护知识，不替代 `openspec/changes/` 与长期 specs
- 后续如果某个功能持续演进，应优先更新已有主题文档，而不是重复创建相近文件
