# Hook 提取模式

本文提供在 Next.js 项目中，从高复杂度组件中提取自定义 Hook 的详细指南。

## 何时提取 Hook

当你识别到以下信号时，应考虑提取自定义 Hook：

1. **状态强耦合**：多个 `useState` 总是一起读取或更新
1. **副作用复杂**：`useEffect` 依赖多、存在清理逻辑或分支更新
1. **业务逻辑堆积**：存在数据转换、校验、计算、流程控制
1. **可复用模式**：相似逻辑在多个组件重复出现

## 提取流程

### 第 1 步：识别状态分组

寻找逻辑上属于同一领域的状态变量：

```typescript
// ❌ 这些状态是同一业务域，应提取到 Hook
const [filters, setFilters] = useState<ProductFilters>({})
const [sortBy, setSortBy] = useState<SortKey>('latest')
const [page, setPage] = useState(1)

// 这些都是列表筛选域状态，建议抽到 useProductQueryState()
```

### 第 2 步：识别关联副作用

定位会修改该状态组的副作用：

```typescript
// ❌ 该 effect 与上面的状态分组强关联
useEffect(() => {
  if (!router.isReady)
    return

  const query = router.query
  setFilters(normalizeFilters(query))
  setSortBy(normalizeSort(query.sort))
}, [router.isReady, router.query])
```

### 第 3 步：创建 Hook

```typescript
import type { ParsedUrlQuery } from 'node:querystring'
// hooks/use-product-query-state.ts
import { useEffect, useMemo, useState } from 'react'

type SortKey = 'latest' | 'price_asc' | 'price_desc'

interface ProductFilters {
  keyword?: string
  category?: string
}

interface UseProductQueryStateParams {
  query: ParsedUrlQuery
  ready: boolean
}

interface UseProductQueryStateReturn {
  filters: ProductFilters
  setFilters: (value: ProductFilters) => void
  sortBy: SortKey
  setSortBy: (value: SortKey) => void
  page: number
  setPage: (value: number) => void
}

function getSortKey(value?: string): SortKey {
  if (value === 'price_asc')
    return 'price_asc'
  if (value === 'price_desc')
    return 'price_desc'
  return 'latest'
}

export function useProductQueryState({
  query,
  ready,
}: UseProductQueryStateParams): UseProductQueryStateReturn {
  const [filters, setFilters] = useState<ProductFilters>({})
  const [sortBy, setSortBy] = useState<SortKey>('latest')
  const [page, setPage] = useState(1)

  const normalized = useMemo(() => {
    const keyword = typeof query.keyword === 'string' ? query.keyword : undefined
    const category = typeof query.category === 'string' ? query.category : undefined
    const sort = typeof query.sort === 'string' ? query.sort : undefined
    const nextPage = typeof query.page === 'string' ? Number(query.page) : 1
    return {
      filters: { keyword, category },
      sortBy: getSortKey(sort),
      page: Number.isNaN(nextPage) || nextPage < 1 ? 1 : nextPage,
    }
  }, [query])

  useEffect(() => {
    if (!ready)
      return
    setFilters(normalized.filters)
    setSortBy(normalized.sortBy)
    setPage(normalized.page)
  }, [ready, normalized])

  return {
    filters,
    setFilters,
    sortBy,
    setSortBy,
    page,
    setPage,
  }
}
```

### 第 4 步：更新组件

```typescript
// 重构前：50+ 行状态与 effect 管理
function ProductListPage() {
  const [filters, setFilters] = useState<ProductFilters>({})
  // ... 大量关联状态和副作用
}

// 重构后：组件更聚焦 UI 编排
function ProductListPage() {
  const {
    filters,
    setFilters,
    sortBy,
    setSortBy,
    page,
    setPage,
  } = useProductQueryState({
    query: router.query,
    ready: router.isReady,
  })

  // 组件主要关注渲染与交互
}
```

## 命名规范

### Hook 命名

- 使用 `use` 前缀：`useProductQueryState`、`useModalState`
- 保持语义具体：`useCheckoutForm` 优于 `useFormData`
- 包含领域词：`useWorkflowVariables`、`useSearchFilters`

### 文件命名

- 使用 kebab-case：`use-product-query-state.ts`
- 多个 Hook 时放入 `hooks/` 子目录
- 单次使用 Hook 可与组件同目录放置

### 类型命名

- 返回类型以 `Return` 结尾：`UseProductQueryStateReturn`
- 参数类型以 `Params` 结尾：`UseProductQueryStateParams`

## Next.js 常见 Hook 模式

### 1. 数据获取 Hook（React Query）

```typescript
// 模式：使用 @tanstack/react-query 封装请求与缓存
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get } from '@/services/base'

const NAMESPACE = 'product'

// Query Key 统一管理
export const productQueryKeys = {
  detail: (id: string) => [NAMESPACE, 'detail', id] as const,
}

// 主数据 Hook
export const useProductDetail = (id: string) => {
  return useQuery({
    enabled: Boolean(id),
    queryKey: productQueryKeys.detail(id),
    queryFn: () => get<ProductDetail>(`/api/products/${id}`),
    select: data => data ?? null,
  })
}

// 失效刷新 Hook
export const useInvalidateProduct = () => {
  const queryClient = useQueryClient()
  return (id: string) => {
    queryClient.invalidateQueries({ queryKey: productQueryKeys.detail(id) })
  }
}

// 组件中使用
const ProductPanel = ({ id }: { id: string }) => {
  const { data, isLoading, error } = useProductDetail(id)
  const invalidateProduct = useInvalidateProduct()

  const handleRefresh = () => {
    invalidateProduct(id)
  }

  return <div>...</div>
}
```

### 2. 表单状态 Hook

```typescript
// 模式：表单状态 + 校验 + 提交流程
export function useProfileForm(initialValues: ProfileFormValues) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = useCallback(() => {
    const nextErrors: Record<string, string> = {}
    if (!values.name)
      nextErrors.name = 'Name is required'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [values])

  const handleChange = useCallback((field: string, value: unknown) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (onSubmit: (nextValues: ProfileFormValues) => Promise<void>) => {
      if (!validate())
        return
      setIsSubmitting(true)
      try {
        await onSubmit(values)
      }
      finally {
        setIsSubmitting(false)
      }
    },
    [values, validate],
  )

  return { values, errors, isSubmitting, handleChange, handleSubmit }
}
```

### 3. Modal 状态 Hook

```typescript
// 模式：多弹窗统一管理
type ModalType = 'edit' | 'delete' | 'duplicate' | null

export function useModalState() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [modalData, setModalData] = useState<unknown>(null)

  const openModal = useCallback((type: ModalType, data?: unknown) => {
    setActiveModal(type)
    setModalData(data ?? null)
  }, [])

  const closeModal = useCallback(() => {
    setActiveModal(null)
    setModalData(null)
  }, [])

  const isOpen = useCallback(
    (type: ModalType) => activeModal === type,
    [activeModal],
  )

  return {
    activeModal,
    modalData,
    openModal,
    closeModal,
    isOpen,
  }
}
```

### 4. Toggle / Boolean Hook

```typescript
// 模式：布尔状态与便捷操作封装
export function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => setValue(prev => !prev), [])
  const setTrue = useCallback(() => setValue(true), [])
  const setFalse = useCallback(() => setValue(false), [])

  return [value, { toggle, setTrue, setFalse, set: setValue }] as const
}

// 使用示例
const [isExpanded, { toggle, setTrue: expand, setFalse: collapse }] = useToggle()
```

## Hook 提取后的测试建议

提取后应对 Hook 做隔离测试：

```typescript
// use-product-query-state.spec.ts
import { renderHook } from '@testing-library/react'
import { useProductQueryState } from './use-product-query-state'

describe('useProductQueryState', () => {
  it('should initialize with normalized query', () => {
    const { result } = renderHook(() =>
      useProductQueryState({
        ready: true,
        query: {
          keyword: 'book',
          sort: 'price_desc',
          page: '2',
        },
      }),
    )

    expect(result.current.filters.keyword).toBe('book')
    expect(result.current.sortBy).toBe('price_desc')
    expect(result.current.page).toBe(2)
  })

  it('should fallback to defaults for invalid query', () => {
    const { result } = renderHook(() =>
      useProductQueryState({
        ready: true,
        query: {
          page: '-1',
        },
      }),
    )

    expect(result.current.sortBy).toBe('latest')
    expect(result.current.page).toBe(1)
  })
})
```
# Hook Extraction Patterns

This document provides detailed guidance on extracting custom hooks from complex components in Dify.

## When to Extract Hooks

Extract a custom hook when you identify:

1. **Coupled state groups** - Multiple `useState` hooks that are always used together
1. **Complex effects** - `useEffect` with multiple dependencies or cleanup logic
1. **Business logic** - Data transformations, validations, or calculations
1. **Reusable patterns** - Logic that appears in multiple components

## Extraction Process

### Step 1: Identify State Groups

Look for state variables that are logically related:

```typescript
// ❌ These belong together - extract to hook
const [modelConfig, setModelConfig] = useState<ModelConfig>(...)
const [completionParams, setCompletionParams] = useState<FormValue>({})
const [modelModeType, setModelModeType] = useState<ModelModeType>(...)

// These are model-related state that should be in useModelConfig()
```

### Step 2: Identify Related Effects

Find effects that modify the grouped state:

```typescript
// ❌ These effects belong with the state above
useEffect(() => {
  if (hasFetchedDetail && !modelModeType) {
    const mode = currModel?.model_properties.mode
    if (mode) {
      const newModelConfig = produce(modelConfig, (draft) => {
        draft.mode = mode
      })
      setModelConfig(newModelConfig)
    }
  }
}, [textGenerationModelList, hasFetchedDetail, modelModeType, currModel])
```

### Step 3: Create the Hook

```typescript
// hooks/use-model-config.ts
import type { FormValue } from '@/app/components/header/account-setting/model-provider-page/declarations'
import type { ModelConfig } from '@/models/debug'
import { produce } from 'immer'
import { useEffect, useState } from 'react'
import { ModelModeType } from '@/types/app'

interface UseModelConfigParams {
  initialConfig?: Partial<ModelConfig>
  currModel?: { model_properties?: { mode?: ModelModeType } }
  hasFetchedDetail: boolean
}

interface UseModelConfigReturn {
  modelConfig: ModelConfig
  setModelConfig: (config: ModelConfig) => void
  completionParams: FormValue
  setCompletionParams: (params: FormValue) => void
  modelModeType: ModelModeType
}

export function useModelConfig({
  initialConfig,
  currModel,
  hasFetchedDetail,
}: UseModelConfigParams): UseModelConfigReturn {
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'langgenius/openai/openai',
    model_id: 'gpt-3.5-turbo',
    mode: ModelModeType.unset,
    // ... default values
    ...initialConfig,
  })

  const [completionParams, setCompletionParams] = useState<FormValue>({})

  const modelModeType = modelConfig.mode

  // Fill old app data missing model mode
  useEffect(() => {
    if (hasFetchedDetail && !modelModeType) {
      const mode = currModel?.model_properties?.mode
      if (mode) {
        setModelConfig(produce(modelConfig, (draft) => {
          draft.mode = mode
        }))
      }
    }
  }, [hasFetchedDetail, modelModeType, currModel])

  return {
    modelConfig,
    setModelConfig,
    completionParams,
    setCompletionParams,
    modelModeType,
  }
}
```

### Step 4: Update Component

```typescript
// Before: 50+ lines of state management
const Configuration: FC = () => {
  const [modelConfig, setModelConfig] = useState<ModelConfig>(...)
  // ... lots of related state and effects
}

// After: Clean component
const Configuration: FC = () => {
  const {
    modelConfig,
    setModelConfig,
    completionParams,
    setCompletionParams,
    modelModeType,
  } = useModelConfig({
    currModel,
    hasFetchedDetail,
  })

  // Component now focuses on UI
}
```

## Naming Conventions

### Hook Names

- Use `use` prefix: `useModelConfig`, `useDatasetConfig`
- Be specific: `useAdvancedPromptConfig` not `usePrompt`
- Include domain: `useWorkflowVariables`, `useMCPServer`

### File Names

- Kebab-case: `use-model-config.ts`
- Place in `hooks/` subdirectory when multiple hooks exist
- Place alongside component for single-use hooks

### Return Type Names

- Suffix with `Return`: `UseModelConfigReturn`
- Suffix params with `Params`: `UseModelConfigParams`

## Common Hook Patterns in Dify

### 1. Data Fetching Hook (React Query)

```typescript
// Pattern: Use @tanstack/react-query for data fetching
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get } from '@/service/base'
import { useInvalid } from '@/service/use-base'

const NAME_SPACE = 'appConfig'

// Query keys for cache management
export const appConfigQueryKeys = {
  detail: (appId: string) => [NAME_SPACE, 'detail', appId] as const,
}

// Main data hook
export const useAppConfig = (appId: string) => {
  return useQuery({
    enabled: !!appId,
    queryKey: appConfigQueryKeys.detail(appId),
    queryFn: () => get<AppDetailResponse>(`/apps/${appId}`),
    select: data => data?.model_config || null,
  })
}

// Invalidation hook for refreshing data
export const useInvalidAppConfig = () => {
  return useInvalid([NAME_SPACE])
}

// Usage in component
const Component = () => {
  const { data: config, isLoading, error, refetch } = useAppConfig(appId)
  const invalidAppConfig = useInvalidAppConfig()

  const handleRefresh = () => {
    invalidAppConfig() // Invalidates cache and triggers refetch
  }

  return <div>...</div>
}
```

### 2. Form State Hook

```typescript
// Pattern: Form state + validation + submission
export function useConfigForm(initialValues: ConfigFormValues) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}
    if (!values.name)
      newErrors.name = 'Name is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [values])

  const handleChange = useCallback((field: string, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleSubmit = useCallback(async (onSubmit: (values: ConfigFormValues) => Promise<void>) => {
    if (!validate())
      return
    setIsSubmitting(true)
    try {
      await onSubmit(values)
    }
    finally {
      setIsSubmitting(false)
    }
  }, [values, validate])

  return { values, errors, isSubmitting, handleChange, handleSubmit }
}
```

### 3. Modal State Hook

```typescript
// Pattern: Multiple modal management
type ModalType = 'edit' | 'delete' | 'duplicate' | null

export function useModalState() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [modalData, setModalData] = useState<any>(null)

  const openModal = useCallback((type: ModalType, data?: any) => {
    setActiveModal(type)
    setModalData(data)
  }, [])

  const closeModal = useCallback(() => {
    setActiveModal(null)
    setModalData(null)
  }, [])

  return {
    activeModal,
    modalData,
    openModal,
    closeModal,
    isOpen: useCallback((type: ModalType) => activeModal === type, [activeModal]),
  }
}
```

### 4. Toggle/Boolean Hook

```typescript
// Pattern: Boolean state with convenience methods
export function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => setValue(v => !v), [])
  const setTrue = useCallback(() => setValue(true), [])
  const setFalse = useCallback(() => setValue(false), [])

  return [value, { toggle, setTrue, setFalse, set: setValue }] as const
}

// Usage
const [isExpanded, { toggle, setTrue: expand, setFalse: collapse }] = useToggle()
```

## Testing Extracted Hooks

After extraction, test hooks in isolation:

```typescript
// use-model-config.spec.ts
import { act, renderHook } from '@testing-library/react'
import { useModelConfig } from './use-model-config'

describe('useModelConfig', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useModelConfig({
      hasFetchedDetail: false,
    }))

    expect(result.current.modelConfig.provider).toBe('langgenius/openai/openai')
    expect(result.current.modelModeType).toBe(ModelModeType.unset)
  })

  it('should update model config', () => {
    const { result } = renderHook(() => useModelConfig({
      hasFetchedDetail: true,
    }))

    act(() => {
      result.current.setModelConfig({
        ...result.current.modelConfig,
        model_id: 'gpt-4',
      })
    })

    expect(result.current.modelConfig.model_id).toBe('gpt-4')
  })
})
```
