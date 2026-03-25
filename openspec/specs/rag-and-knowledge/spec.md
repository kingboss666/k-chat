# rag-and-knowledge 规格说明

## 目的

定义本地 Markdown 知识与向量检索如何共同支撑有依据的回答。

## 要求

### Requirement: 扫描本地知识目录

系统 SHALL 将 `docs/knowledge/` 视为本地 Markdown 检索语料目录。

#### Scenario: 存在本地 Markdown 文件

- **WHEN** 针对某个用户问题启动检索
- **THEN** 系统会扫描 `docs/knowledge/` 下的 Markdown 文件，并为相关分块打分

### Requirement: 分块后的检索输入

系统 SHALL 在执行本地打分或向量检索前，先把 Markdown 知识切分成分块。

#### Scenario: 某个 Markdown 文件被加载用于检索

- **WHEN** 文件内容被准备进入检索流程
- **THEN** 系统会将其转换为可排序并可插入 Prompt 的分块

### Requirement: 本地优先的检索策略

系统 SHALL 优先尝试本地 Markdown 检索，再回退到向量检索。

#### Scenario: 本地检索返回了相关结果

- **WHEN** 本地知识检索返回一个或多个相关分块
- **THEN** 系统会直接使用这些结果，并跳过本次请求的向量回退流程

### Requirement: 带分数阈值的向量回退

只有当本地检索不足时，系统 SHALL 才使用向量检索，并过滤低分结果。

#### Scenario: 本地检索没有找到有效内容

- **WHEN** 没有任何本地 Markdown 分块达到相关性要求
- **THEN** 系统会生成 embedding、执行向量搜索，并只保留高于配置阈值的结果

### Requirement: 基于检索结果构建 Prompt

系统 SHALL 构建一个同时包含用户问题和所选知识分块的检索 Prompt。

#### Scenario: 检索结果可用

- **WHEN** 本地检索或向量检索找到了支持性内容
- **THEN** Prompt 构建器会接收到用户问题与所选分块，用于生成有依据的回答
