# K-Chat

K-Chat 是一个基于 Next.js 16、React 19、TypeScript 和通义千问（Qwen）构建的本地 AI 对话实验项目。它不是单纯的聊天 UI，而是一个把记忆、RAG、工具调用、任务规划、结果评审、流式交互和工程工作流放进同一个闭环里的最小可运行系统。

## 这个项目在做什么

这个项目的核心目标，是把“模型直接回答”升级成“可规划、可执行、可评审、可观测”的 AI 对话流程。

它当前已经覆盖了几类关键能力：

- 聊天请求的流式收发
- 基于 Planner 的任务拆解
- 基于 Executor 的分步执行
- 基于 Evaluator 的结果验收和多轮修正
- 短期记忆、摘要记忆、长期记忆
- 文档切块、Embedding、向量检索
- 工具调用
- Token 和执行轮次的可观测性
- OpenSpec 驱动的工程文档与行为治理

如果把它当成一个学习项目来看，它已经从“最小聊天 Demo”推进到了“带规划和评审回路的 Agent Prototype”。

## 这个项目解决了什么问题

普通聊天应用通常有几个典型问题：

- 模型直接回答，缺少任务拆解，复杂问题容易漏步骤
- 回答没有独立验收机制，出错后不会自我修正
- 上下文只靠最近消息，跨轮次和跨会话容易失忆
- 没有知识库约束时，模型容易脑补
- 工具调用、推理过程、Token 消耗和执行质量难以观察
- 行为变更只体现在代码里，没有独立的规格和工作流约束

K-Chat 对这些问题的处理方式是：

- 用 `Planner` 先把用户问题拆成最小可执行步骤
- 用 `Executor` 顺序执行 `RAG`、`TOOL`、`LLM` 三类任务
- 用 `Evaluator` 独立判断结果是否达标，不达标则进入下一轮
- 用摘要记忆和长期记忆补足上下文
- 用本地向量库约束知识来源
- 用前端推理面板、Token 面板和后端迭代日志提升可观测性
- 用 `openspec/` 管理行为变更和工程流程

## 系统架构

从代码结构上看，这个项目是一个很清晰的分层架构：

- 表现层：`src/app/*`、`src/components/*`
  - 负责聊天 UI、流式渲染、推理过程展开、Token 面板展示
- 协议层：`src/app/api/*`
  - 负责 HTTP 请求校验、流式响应协议、文档入库入口
- 编排层：`src/server/chat/*`
  - 负责 Planner / Executor / Evaluator、工具路由、记忆写入、执行日志
- 基础能力层：`src/lib/*`
  - 负责 Qwen API 适配、记忆模型、向量存储、文档切块、工作流引擎、计划 schema
- 数据层：`memory/*`、`.memory/*`
  - 负责用户长期记忆、向量库、聊天迭代日志
- 规范层：`openspec/*`
  - 负责行为规格、变更提案和 Generator + Evaluator 工作流

### 核心执行链路

```text
Browser UI
  -> /api/chat
    -> chat-orchestrator
      -> 加载短期/摘要/长期记忆
      -> Planner 生成任务列表
      -> Executor 逐步执行
        -> RAG 检索
        -> 工具调用
        -> LLM 生成
      -> Evaluator 判断是否通过
        -> 通过: 输出最终答案
        -> 不通过: 带反馈进入下一轮
      -> 持久化长期记忆和迭代日志
```

### 一次聊天请求的实际流程

1. 前端把用户消息发送到 `/api/chat`。
2. Route Handler 建立 `NDJSON` 流，把后端事件持续推给前端。
3. `chat-orchestrator` 读取摘要记忆和长期记忆，必要时先更新摘要。
4. `planner-service` 让模型生成结构化任务列表；如果解析失败，则走内置兜底计划。
5. `executor-service` 逐步执行任务：
   - `RAG`：查本地向量库
   - `TOOL`：执行天气、时间、计算工具
   - `LLM`：生成中间结果或最终结果
6. `evaluator-service` 独立判断当前结果是否满足用户目标。
7. 如果不满足，系统会把失败原因和修正建议喂回下一轮，最多迭代 `3` 轮。
8. 请求结束后，系统会更新长期记忆并把本轮日志写入 `.memory/chat-iteration-logs/`。

## 当前能力边界

这个仓库当前更像一个单用户、本地运行的 Agent 实验场，而不是完整的生产级聊天产品。

### 已实现

- 基于 Next.js App Router 的聊天页面
- 流式响应和前端逐字渲染
- 推理过程展示
- Token 消耗统计
- Planner 驱动的任务编排
- Evaluator 驱动的多轮修正
- 三类工具：天气、时间、数学计算
- 文档入库接口 `/api/document/ingest`
- 本地 JSON 向量库检索
- 摘要记忆和长期记忆
- 聊天执行日志落盘
- OpenSpec 规范与 Generator + Evaluator 工程流程

### 当前限制

- 短期记忆和摘要记忆目前在进程内存里，服务重启后会丢失
- 长期记忆和向量库是本地文件存储，适合原型验证，不适合高并发生产环境
- 当前工具集合还比较小
- 没有多用户隔离、登录和权限体系
- 还没有看到自动化测试链路，当前验证更偏人工和行为验证

## 数据与存储

- `memory/user.json`
  - 长期记忆，保存用户画像、偏好、兴趣和稳定事实
- `memory/vectors.json`
  - 本地向量库，保存文档片段及其 embedding
- `.memory/chat-iteration-logs/YYYY-MM-DD.jsonl`
  - 每次请求的计划、执行结果、评审结论、延迟和 Token 使用

需要注意的是：

- 摘要记忆和最近对话历史当前不落盘
- 长期记忆和向量库是持久化的

## 目录结构

```text
src/
  app/
    api/
      chat/route.ts               # 聊天流式接口
      document/ingest/route.ts    # 文档切块和向量入库接口
    layout.tsx
    page.tsx
  components/
    Chat.tsx                      # 聊天页面主组件
    chat/
      message-list.tsx            # 消息列表
      token-panel.tsx             # Token 面板
      hooks/
        useChatStream.ts          # 前端流式读取
        useTokenUsage.ts          # Token 统计
  server/chat/
    chat-orchestrator.ts          # 一次聊天请求的总编排
    planner-service.ts            # Planner
    executor-service.ts           # Executor
    evaluator-service.ts          # Evaluator
    tool-service.ts               # 工具执行
    memory-service.ts             # 长期记忆提取与持久化
    iteration-log-service.ts      # 每轮执行日志
  lib/
    qianwen.ts                    # Qwen 聊天 / 流式 / embedding 适配
    agent-planning.ts             # 计划 schema 和解析
    workflow-engine.ts            # 通用工作流执行器
    memory.ts                     # 短期记忆和摘要记忆
    long-term-memory.ts           # 长期记忆
    vector-store.ts               # 本地向量库
    document-chunk.ts             # 文档切块

memory/
  user.json
  vectors.json

openspec/
  specs/                          # 长期能力规格
  changes/                        # 行为变更提案和设计
  workflows/                      # 工程工作流说明
```

## 技术栈

- 前端：Next.js 16、React 19、Tailwind CSS
- 语言：TypeScript
- 模型：通义千问（Qwen）
- 校验：Zod
- 检索：本地 JSON 向量库 + cosine similarity
- 工程规范：OpenSpec

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

创建 `.env.local`：

```env
QIANWEN_API_KEY=your_api_key_here

# 可选
QIANWEN_MODEL=qwen-plus-2025-07-28
QIANWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QIANWEN_EMBEDDING_MODEL=text-embedding-v4
QIANWEN_EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
```

说明：

- 如果没有配置 `QIANWEN_API_KEY`，项目会退化到本地 mock 模式，方便调试 UI 和编排流程
- 天气工具依赖外部天气服务，联网环境下才会返回真实结果

### 3. 启动开发环境

```bash
pnpm dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

## RAG 使用方式

项目提供了一个文档入库接口：

- `POST /api/document/ingest`

它会完成三件事：

- 对文本做切块
- 为每个 chunk 生成 embedding
- 写入 `memory/vectors.json`

仓库里自带了一份测试语料：`docs/rag-test-fixture.md`。它是一个虚构知识体，适合验证系统是否真的依赖知识库回答，而不是脑补。

## 开发命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm lint:fix
pnpm lint:error
pnpm lint:css
```

## 学习进度 / 建议阅读顺序

如果你是把这个仓库当成一个 AI 应用学习项目来看，建议按下面的顺序理解：

1. 最小聊天闭环
   - 先看 `src/app/page.tsx`、`src/components/Chat.tsx`、`src/app/api/chat/route.ts`
   - 理解前端如何发消息、后端如何按流返回
2. 记忆系统
   - 看 `src/lib/memory.ts`、`src/lib/long-term-memory.ts`、`src/server/chat/memory-service.ts`
   - 理解“最近消息 + 摘要 + 长期画像”三层上下文
3. RAG
   - 看 `src/app/api/document/ingest/route.ts`、`src/lib/document-chunk.ts`、`src/lib/vector-store.ts`
   - 理解文本是怎么切块、向量化和检索的
4. Agent 编排
   - 看 `src/server/chat/planner-service.ts`、`src/server/chat/executor-service.ts`、`src/server/chat/evaluator-service.ts`、`src/server/chat/chat-orchestrator.ts`
   - 理解为什么系统从固定流水线升级成了 Planner -> Executor -> Evaluator
5. 工程治理
   - 看 `openspec/project.md` 和 `openspec/workflows/generator-evaluator.md`
   - 理解为什么这个项目不仅写代码，也管理行为边界和变更流程

### 当前阶段判断

按项目成熟度看，K-Chat 目前大致处在下面这个阶段：

- 已完成：最小聊天链路、记忆、工具、RAG、Agent 编排、执行日志
- 正在形成：更稳定的行为约束和更清晰的工程流程
- 下一步更值得做：会话持久化、多用户隔离、更强的向量库、更多工具、自动化测试

## 工程工作流

这个仓库把 `OpenSpec` 当作重要行为变更的统一入口。

对于非琐碎的 AI 编码任务，默认采用 `Generator + Evaluator` 双角色流程：

- `Generator` 负责理解任务、修改代码、提交验证证据
- `Evaluator` 负责独立审查，并输出 `PASS`、`REVISE` 或 `BLOCK`

相关文档位于：

- `openspec/project.md`
- `openspec/workflows/generator-evaluator.md`
- `openspec/specs/*`
- `openspec/changes/*`

## License

MIT
