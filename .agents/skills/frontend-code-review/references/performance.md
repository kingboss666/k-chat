# 规则目录 — 性能

## React Flow 数据使用

IsUrgent: True
Category: 性能

### 描述

在渲染 React Flow 时，优先使用 `useNodes`/`useEdges` 来满足 UI 消费场景；在回调函数中若需读写节点/边状态，应依赖 `useStoreApi`。避免在这些 Hook 之外手动拉取 Flow 数据。

## 复杂属性记忆化

IsUrgent: True
Category: 性能

### 描述

将复杂的 props 值（对象、数组、Map 等）在传入子组件前通过 `useMemo` 包裹，确保引用稳定，防止不必要的重复渲染。

在新增、修改或删除性能规则时，请同步更新此文件，确保目录内容准确。

错误示例：

```tsx
<HeavyComp
    config={{
        provider: ...,
        detail: ...
    }}
/>
```

正确示例：

```tsx
const config = useMemo(() => ({
    provider: ...,
    detail: ...
}), [provider, detail]);

<HeavyComp
    config={config}
/>
```
