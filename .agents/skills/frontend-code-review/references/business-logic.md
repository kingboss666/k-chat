# 规则目录 — 业务逻辑

## Node 组件中不可使用 workflowStore

IsUrgent: True

### 描述

Node 组件的文件路径模式：`web/app/components/workflow/nodes/[nodeName]/node.tsx`

Node 组件在基于模板创建 RAG Pipe 时也会被使用，但该场景下不存在 workflowStore Provider，会导致页面白屏。[这个 Issue](https://github.com/langgenius/dify/issues/29168) 正是由此原因引发。

### 建议修复

使用 `import { useNodes } from 'reactflow'`，替代 `import useNodes from '@/app/components/workflow/store/workflow/use-nodes'`。
