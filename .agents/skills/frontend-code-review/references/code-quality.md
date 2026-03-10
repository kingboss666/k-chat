# 规则目录 — 代码质量

## 条件类名使用工具函数

IsUrgent: True
Category: 代码质量

### 描述

确保条件样式通过共享的 `classNames` 处理，而不是自定义三元表达式、字符串拼接或模板字符串。集中管理类名逻辑可让组件保持一致并更易维护。

### 建议修复

```ts
import { cn } from '@/utils/classnames'
const classNames = cn(isActive ? 'text-primary-600' : 'text-gray-500')
```

## Tailwind 优先的样式策略

IsUrgent: True
Category: 代码质量

### 描述

优先使用 Tailwind CSS 工具类，而不是新增 `.module.css` 文件；只有在 Tailwind 组合无法满足所需样式时才使用额外样式文件。将样式尽量保留在 Tailwind 体系中可以提升一致性并降低维护成本。

在新增、修改或删除代码质量规则时，请同步更新此文件，确保目录内容准确。

## 便于覆盖的 className 顺序

### 描述

编写组件时，应始终将外部传入的 `className` 放在组件自身类名之后，便于下游调用方覆盖或扩展样式。这既保留了组件默认样式，也允许外部按需修改或移除特定样式。

示例：

```tsx
import { cn } from '@/utils/classnames'

function Button({ className }) {
  return <div className={cn('bg-primary-600', className)}></div>
}
```
