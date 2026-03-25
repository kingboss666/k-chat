# K-Chat

一个基于 Next.js 和通义千问的智能对话应用，支持工具调用和多层记忆系统。

## 功能特性

### 🤖 工具调用能力
- **天气查询**：实时获取全球城市天气信息
- **时间查询**：支持多时区时间查询
- **数学计算**：四则运算和表达式计算

### 🧠 三层记忆系统
1. **短期记忆（Short-term Memory）**
   - 保留最近 6 轮对话
   - 适用于上下文连贯性

2. **摘要记忆（Summary Memory）**
   - 当对话超过 20 条消息时自动触发
   - 将历史对话压缩为摘要
   - 保留最近 6 轮完整对话 + 历史摘要

3. **长期记忆（Long-term Memory）**
   - 持久化存储用户信息（姓名、职业、兴趣等）
   - 跨会话保持用户画像
   - 存储在 `memory/user.json`

## 技术栈

- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript
- **样式**：Tailwind CSS
- **AI 模型**：通义千问 (Qianwen)
- **数据验证**：Zod

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # 聊天 API 路由
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Chat.tsx                  # 主聊天组件
│   └── chat/
│       ├── message-list.tsx      # 消息列表
│       ├── token-panel.tsx       # Token 使用统计
│       └── hooks/
│           ├── useChatStream.ts  # 流式响应处理
│           └── useTokenUsage.ts  # Token 统计
└── lib/
    ├── qianwen.ts                # 通义千问 API 封装
    ├── memory.ts                 # 短期/摘要记忆
    ├── long-term-memory.ts       # 长期记忆
    └── utils.ts

memory/
└── user.json                     # 用户长期记忆存储
```

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

创建 `.env.local` 文件：

```env
QIANWEN_API_KEY=your_api_key_here
```

### 启动开发服务器

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 记忆系统使用

### 配置用户信息

编辑 `memory/user.json`：

```json
{
  "name": "king",
  "profession": "frontend engineer",
  "interests": ["AI", "React"]
}
```

AI 会在每次对话时自动加载这些信息，提供个性化回复。

### 记忆工作流程

1. 用户发送消息
2. 系统加载长期记忆（用户画像）
3. 检查是否需要生成对话摘要
4. 构建上下文：用户信息 + 对话摘要 + 最近对话
5. 调用 AI 生成回复
6. 保存对话到短期记忆

## 工具调用示例

```
用户：北京天气怎么样？
AI：[调用 get_weather 工具] 北京当前温度 15°C，晴朗...

用户：现在几点了？
AI：[调用 get_time 工具] 现在是 2026年3月11日 14:30:00

用户：计算 23 * (7 + 5) / 2
AI：[调用 calculate_expression 工具] 结果是 138
```

## 开发命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 启动生产服务器
pnpm start

# 代码检查
pnpm lint

# 自动修复
pnpm lint:fix
```

## 工程工作流

仓库内的功能设计、行为变更和重要重构统一走 `OpenSpec` 工作流，相关文档放在 `openspec/` 下。

对于非琐碎的 AI 编码任务，默认采用 `Generator + Evaluator` 双角色流程，而不是让单个 agent 从需求理解一路做到自我验收：

- `Generator` 负责产出计划、修改和验证证据
- `Evaluator` 负责独立审查，并给出 `PASS`、`REVISE` 或 `BLOCK`

具体操作手册见 `openspec/workflows/generator-evaluator.md`。

## License

MIT
