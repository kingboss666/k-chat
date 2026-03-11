# AI / RAG Notes

这份文档只讲一个目标：你看完后，能理解这个项目里为什么要做 `Document Chunk`，以及一个最小 RAG 是怎么串起来的。

## 什么是 RAG

RAG 是 `Retrieval-Augmented Generation`。

可以把它理解成：

1. 先从知识库里找资料
2. 再把资料连同用户问题一起发给 LLM
3. 让模型基于检索结果回答

它解决的问题很直接：

- 模型参数里没有你的私有知识
- prompt 塞不下整篇文档
- 模型容易胡说，需要给它“证据”

## 一个最小 RAG 流程

最常见的链路是：

```text
原始文档
-> chunk
-> embedding
-> 存入向量库

用户提问
-> query embedding
-> 相似度检索 topK chunk
-> chunk + 问题 一起发给 LLM
-> 生成答案
```

如果只记一件事，可以记这个：

`RAG = 检索 + 生成`

## 为什么要 Chunk

因为 embedding 和 LLM 都有长度限制。

如果你直接把整篇文档拿去做 embedding，会有几个问题：

- 可能超过模型输入上限
- 一个向量表示整篇文章，语义太粗
- 检索时只能命中“大概相关”，很难精确到某一段

所以要先把文档切成小块。

例如：

```text
文档
↓
chunk1
chunk2
chunk3
```

常见配置：

- `500 token / chunk`
- `50 token overlap`

`overlap` 的作用是让相邻 chunk 保留一点上下文，避免一句话被切断后语义丢失。

## 这个项目里已经有的能力

你现在已经有一个通用切块工具和一个统一入库接口：

- [document-chunk.ts](/Users/king/Desktop/k-chat/src/lib/document-chunk.ts)
- [route.ts](/Users/king/Desktop/k-chat/src/app/api/document/ingest/route.ts)

它做的事情是：

- 估算文本 token 数
- 优先按段落、句子切分
- 单句太长时继续细切
- 支持 `maxTokens`
- 支持 `overlapTokens`

默认值：

- `maxTokens = 500`
- `overlapTokens = 50`

## 调用示例

```json
POST /api/document/ingest
{
  "text": "这里是一大段文档内容",
  "maxTokens": 500,
  "overlapTokens": 50,
  "sourceId": "article-1"
}
```

返回结果大致会像这样：

```json
{
  "sourceId": "article-1",
  "totalChunks": 1,
  "storedDocuments": 1,
  "preview": [
    {
      "id": "article-1-chunk-1",
      "text": "第一段内容",
      "tokenCount": 128
    }
  ],
  "config": {
    "maxTokens": 500,
    "overlapTokens": 50
  }
}
```

## Chunk 之后下一步做什么

做 RAG 时，chunk 只是第一步。后面通常还要补 3 层：

### 1. Embedding

把每个 chunk 的 `text` 转成向量。

你最终需要存的数据，通常至少包括：

```ts
{
  id: 'article-1-chunk-1',
  text: '...',
  embedding: [0.12, -0.03, ...],
  sourceId: 'article-1',
  index: 0
}
```

### 2. Retrieval

用户提问时：

1. 先把问题转成 embedding
2. 去向量库做相似度搜索
3. 取前 `topK` 个 chunk

例如取前 3 段：

```text
question -> embedding -> search top 3 chunks
```

### 3. Generation

把检索出的 chunk 和用户问题一起交给模型：

```text
你只能基于以下资料回答：

[chunk 1]
...

[chunk 2]
...

用户问题：
...
```

这样模型回答时就不是“纯猜”，而是“参考资料后回答”。

## 一个很实用的心智模型

你可以把 RAG 分成两个阶段：

### 离线阶段

- 读文档
- 切块
- 做 embedding
- 入库

### 在线阶段

- 收到用户问题
- 检索相关 chunk
- 把 chunk 塞进 prompt
- 让 LLM 回答

离线阶段处理“建知识库”，在线阶段处理“回答问题”。

## 什么时候 chunk 太大，什么时候太小

这件事没有绝对标准，但有个简单判断：

- 太大：检索命中不准，一段里混了太多主题
- 太小：上下文不够，模型看不懂

实践里可以先从这个默认值起步：

- 中文文档：`300 ~ 500 token`
- overlap：`30 ~ 80 token`

如果内容是教程、API 文档、FAQ，chunk 往往可以更小一点。
如果内容是论文、长叙述、上下文依赖强的内容，chunk 可以稍大一点。

## 一版最小实现建议

如果你只是想先把 RAG 跑通，不要一开始就追求复杂系统。

建议顺序：

1. 先用现在的 `/api/document/ingest` 完成切块、embedding 和入库
2. 暂时用内存数组或本地 JSON 存下来
3. 用户提问时先做相似度检索
4. 把 topK chunks 拼进 prompt
5. 跑通后再换正式向量库

先通路，再优化。

## 你接下来最可能要补的文件

如果继续在这个仓库里实现 RAG，下一步通常会围绕这些模块继续增强：

- `src/lib/vector-store.ts`
- `src/lib/prompt-builder.ts`
- `src/app/api/chat/route.ts`

它们分别负责：

- 存储和检索向量
- 构建知识库 prompt
- 暴露最终问答入口

## 总结

RAG 不复杂，核心只有两句：

1. 文档不能直接全塞给模型，所以先 chunk
2. 回答前先检索相关 chunk，再让模型生成

而你现在这一步 `Document Chunk`，就是整个 RAG 流程的入口。
