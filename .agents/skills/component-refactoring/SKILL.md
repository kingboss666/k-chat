---
name: component-refactoring
description: 在 Next.js 前端项目中重构高复杂度 React 组件。当 `pnpm analyze-component --json` 显示 complexity > 50 或 lineCount > 300，或用户明确提出代码拆分、Hook 提取、复杂度下降需求时使用；对结构简单组件、第三方包装层、或仅要求测试不要求重构的场景不建议使用。
---

# Next.js 组件重构技能

使用以下模式与流程，在 Next.js 代码库中重构高复杂度 React 组件。

> **复杂度阈值**：当组件复杂度 > 50（通过 `pnpm analyze-component` 评估）时，应先重构再测试。

## 快速参考

### 命令（在项目根目录执行）

路径请使用相对项目根目录的写法（例如 `src/app/...`、`src/components/...`）。
`refactor-component` 用于生成重构提示，`analyze-component` 用于测试前分析与指标校验。

```bash
# 生成重构提示
pnpm refactor-component <path>

# 以 JSON 输出重构分析
pnpm refactor-component <path> --json

# 生成测试前分析提示（重构后）
pnpm analyze-component <path>

# 以 JSON 输出测试分析
pnpm analyze-component <path> --json
```

### 复杂度分析

```bash
# 分析组件复杂度
pnpm analyze-component <path> --json

# 关键指标：
# - complexity: 0-100 归一化复杂度（目标 < 50）
# - maxComplexity: 单个函数的最高复杂度
# - lineCount: 代码总行数（目标 < 300）
```

### 复杂度评分解释

| 分数 | 等级 | 建议动作 |
|------|------|----------|
| 0-25 | 🟢 简单 | 可直接测试 |
| 26-50 | 🟡 中等 | 建议小幅重构 |
| 51-75 | 🟠 复杂 | **先重构后测试** |
| 76-100 | 🔴 极复杂 | **必须重构** |

## 核心重构模式

### 模式 1：提取自定义 Hook

**适用时机**：组件存在复杂状态管理、多个 `useState`/`useEffect`、业务逻辑与 UI 混杂。

**Next.js 约定**：将 Hook 放在 `src/hooks/`，或组件目录下的 `hooks/` 子目录，命名建议 `use-<feature>.ts`。

```typescript
// ❌ 重构前：状态逻辑堆在组件里
const ProductFilterPanel = () => {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState('latest')
  const [page, setPage] = useState(1)

  // 50+ 行筛选/分页/同步逻辑...

  return <div>...</div>
}

// ✅ 重构后：抽到 Hook
// hooks/use-product-filters.ts
export const useProductFilters = () => {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState('latest')
  const [page, setPage] = useState(1)

  // 聚合相关状态与行为
  return { filters, setFilters, sort, setSort, page, setPage }
}

// 组件更聚焦于渲染
const ProductFilterPanel = () => {
  const { filters, setFilters, sort, setSort } = useProductFilters()
  return <div>...</div>
}
```

### 模式 2：拆分子组件

**适用时机**：单组件包含多个 UI 分区、条件渲染块过多、重复模式明显。

**Next.js 约定**：将子组件拆分到同级文件或子目录，`index.tsx` 只保留编排逻辑。

```typescript
// ❌ 重构前：单体 JSX 过大
const DashboardPage = () => {
  return (
    <div>
      {/* 100 行头部 */}
      {/* 120 行图表 */}
      {/* 80 行弹窗 */}
    </div>
  )
}

// ✅ 重构后：按关注点拆分
// dashboard/
//   ├── index.tsx
//   ├── dashboard-header.tsx
//   ├── dashboard-charts.tsx
//   └── dashboard-modals.tsx
```

### 模式 3：简化条件逻辑

**适用时机**：嵌套过深（>3 层）、复杂三元表达式、长 `if/else` 链。

```typescript
// ❌ 重构前：条件分支复杂
const EmptyState = () => {
  if (role === 'admin') {
    if (locale === 'zh-CN') return <AdminZh />
    if (locale === 'ja-JP') return <AdminJa />
    return <AdminEn />
  }
  if (role === 'editor') {
    // 更多分支...
  }
  return <Guest />
}

// ✅ 重构后：查表 + 提前返回
const EMPTY_STATE_MAP = {
  admin: { 'zh-CN': AdminZh, 'ja-JP': AdminJa, default: AdminEn },
  editor: { 'zh-CN': EditorZh, default: EditorEn },
  guest: { default: Guest },
}

const EmptyState = () => {
  const roleMap = EMPTY_STATE_MAP[role] ?? EMPTY_STATE_MAP.guest
  const Component = roleMap[locale] || roleMap.default
  return <Component />
}
```

### 模式 4：提取 API / 数据逻辑

**适用时机**：组件直接处理接口请求、数据转换、复杂异步流程。

**Next.js 约定**：
- 客户端组件：优先使用 React Query / SWR 的数据 Hook。
- 服务端：优先 Route Handlers（`src/app/api/*`）或 Server Actions。
- 组件尽量只处理 UI 组合，不直接承载复杂请求编排。

```typescript
// ❌ 重构前：组件内部写请求逻辑
function ProfileCard() {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/profile')
      const data = await res.json()
      setProfile(data)
    })()
  }, [])
}

// ✅ 重构后：封装为数据 Hook
// src/hooks/use-profile.ts
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await fetch('/api/profile')).json(),
    staleTime: 60_000,
  })
}
```

### 模式 5：提取 Modal / Dialog 状态管理

**适用时机**：单组件管理多个弹窗状态，开关逻辑复杂。

**Next.js 约定**：弹窗状态统一到单一 `activeModal`，配合 `open/close` 行为函数。

```typescript
type ModalType = 'edit' | 'delete' | 'share' | null

function useModalState() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const openModal = useCallback((type: ModalType) => setActiveModal(type), [])
  const closeModal = useCallback(() => setActiveModal(null), [])

  return {
    activeModal,
    openModal,
    closeModal,
    isOpen: (type: ModalType) => activeModal === type,
  }
}
```

### 模式 6：提取表单逻辑

**适用时机**：表单校验复杂、提交流程复杂、字段转换逻辑多。

**Next.js 约定**：使用统一表单方案（如 React Hook Form + Zod），将 schema、默认值、submit handler 解耦。

```typescript
const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: '', description: '' },
})
```

## Next.js 特有重构准则

### 1. Client / Server 组件边界

**适用时机**：组件同时承担数据获取与重交互逻辑。

**准则**：
- 将强交互（事件、状态、浏览器 API）下沉到 Client Component（`'use client'`）。
- 将数据预取、SEO 相关逻辑、静态内容优先放到 Server Component。
- 避免“全页面都加 `'use client'`”导致包体积膨胀。

### 2. 路由与目录组织（App Router）

**适用时机**：重构页面级组件时。

**建议结构**：

```
src/app/(group)/feature/
  ├── page.tsx
  ├── loading.tsx
  ├── error.tsx
  ├── _components/
  │   ├── feature-header.tsx
  │   └── feature-list.tsx
  └── hooks/
      └── use-feature-state.ts
```

### 3. 事件处理与命名规范

**准则**：
- 事件处理函数统一用 `handle` 前缀，如 `handleClick`、`handleSubmit`。
- 复杂事件链拆分为小函数，主事件函数仅负责流程编排。

### 4. 样式策略

**准则**：
- 优先 Tailwind 工具类，减少新增 `.module.css`。
- 仅当 Tailwind 难以表达时再使用局部 CSS。
- 组件接收 `className` 时，把外部 `className` 放在内部默认类名之后，便于覆盖。

## 重构工作流

### 第 1 步：生成重构提示

```bash
pnpm refactor-component <path>
```

该命令应输出：
- 组件复杂度与特征分析
- 推荐的重构动作
- 可用于 AI 助手的提示词

### 第 2 步：查看细粒度指标

```bash
pnpm analyze-component <path> --json
```

重点识别：
- 总复杂度
- 最大函数复杂度
- 行数
- 检测到的特征（state、effects、API、events 等）

### 第 3 步：制定计划

根据特征做映射：

| 检测特征 | 重构动作 |
|----------|----------|
| `hasState: true` + `hasEffects: true` | 提取自定义 Hook |
| `hasAPI: true` | 提取数据 Hook / 服务层 |
| `hasEvents: true`（较多） | 提取事件处理函数 |
| `lineCount > 300` | 拆分子组件 |
| `maxComplexity > 50` | 简化条件逻辑 |

### 第 4 步：增量执行

1. 一次只提取一个关注点
2. 每次提取后执行 lint、type-check、tests
3. 功能验证通过再进入下一步

```text
每轮提取执行：
1) 提取代码
3) pnpm type-check
4) pnpm test
5) 手动验证交互与边界场景
6) 通过则继续；失败先修复
```

### 第 5 步：回归验证

```bash
pnpm refactor-component <path>
pnpm analyze-component <path> --json
```

目标指标：
- `complexity < 50`
- `lineCount < 300`
- `maxComplexity < 30`

### 第 6 步：优化

```bash
pnpm lint:fix
   - 若仍有报错，尝试修复
   - 若无法修复，列出错误清单并说明阻塞原因
```

目标指标：
- `complexity < 50`
- `lineCount < 300`
- `maxComplexity < 30`

## 常见误区

### ❌ 过度设计

```typescript
// ❌ 拆成过多微小 Hook，反而难维护
const useButtonText = () => useState('Click')
const useButtonLoading = () => useState(false)

// ✅ 保持内聚
function useButtonState() {
  const [text, setText] = useState('Click')
  const [loading, setLoading] = useState(false)
  return { text, setText, loading, setLoading }
}
```

### ❌ 打破现有约定

- 遵循现有目录结构
- 保持命名一致性
- 维持导出方式兼容性

### ❌ 过早抽象

- 只有在复杂度收益明确时才提取
- 单次使用代码不要强行抽象
- 重构后代码尽量仍留在同一业务域

## 参考实践（Next.js）

- **Hook 提取**：`src/hooks/` 或 `feature/hooks/`
- **组件拆分**：`src/app/**/_components/`
- **服务层**：`src/services/`
- **路由处理**：`src/app/api/**/route.ts`
- **表单模式**：React Hook Form + Zod

## 相关技能

- `frontend-code-review`：重构后做质量与风险检查
- `frontend-testing`：重构后补充与执行测试
---
name: component-refactoring
description: Refactor high-complexity React components in Dify frontend. Use when `pnpm analyze-component --json` shows complexity > 50 or lineCount > 300, when the user asks for code splitting, hook extraction, or complexity reduction, or when `pnpm analyze-component` warns to refactor before testing; avoid for simple/well-structured components, third-party wrappers, or when the user explicitly wants testing without refactoring.
---

# Dify Component Refactoring Skill

Refactor high-complexity React components in the Dify frontend codebase with the patterns and workflow below.

> **Complexity Threshold**: Components with complexity > 50 (measured by `pnpm analyze-component`) should be refactored before testing.

## Quick Reference

### Commands (run from `web/`)

Use paths relative to `web/` (e.g., `app/components/...`).
Use `refactor-component` for refactoring prompts and `analyze-component` for testing prompts and metrics.

```bash
cd web

# Generate refactoring prompt
pnpm refactor-component <path>

# Output refactoring analysis as JSON
pnpm refactor-component <path> --json

# Generate testing prompt (after refactoring)
pnpm analyze-component <path>

# Output testing analysis as JSON
pnpm analyze-component <path> --json
```

### Complexity Analysis

```bash
# Analyze component complexity
pnpm analyze-component <path> --json

# Key metrics to check:
# - complexity: normalized score 0-100 (target < 50)
# - maxComplexity: highest single function complexity
# - lineCount: total lines (target < 300)
```

### Complexity Score Interpretation

| Score | Level | Action |
|-------|-------|--------|
| 0-25 | 🟢 Simple | Ready for testing |
| 26-50 | 🟡 Medium | Consider minor refactoring |
| 51-75 | 🟠 Complex | **Refactor before testing** |
| 76-100 | 🔴 Very Complex | **Must refactor** |

## Core Refactoring Patterns

### Pattern 1: Extract Custom Hooks

**When**: Component has complex state management, multiple `useState`/`useEffect`, or business logic mixed with UI.

**Dify Convention**: Place hooks in a `hooks/` subdirectory or alongside the component as `use-<feature>.ts`.

```typescript
// ❌ Before: Complex state logic in component
const Configuration: FC = () => {
  const [modelConfig, setModelConfig] = useState<ModelConfig>(...)
  const [datasetConfigs, setDatasetConfigs] = useState<DatasetConfigs>(...)
  const [completionParams, setCompletionParams] = useState<FormValue>({})

  // 50+ lines of state management logic...

  return <div>...</div>
}

// ✅ After: Extract to custom hook
// hooks/use-model-config.ts
export const useModelConfig = (appId: string) => {
  const [modelConfig, setModelConfig] = useState<ModelConfig>(...)
  const [completionParams, setCompletionParams] = useState<FormValue>({})

  // Related state management logic here

  return { modelConfig, setModelConfig, completionParams, setCompletionParams }
}

// Component becomes cleaner
const Configuration: FC = () => {
  const { modelConfig, setModelConfig } = useModelConfig(appId)
  return <div>...</div>
}
```

**Dify Examples**:
- `web/app/components/app/configuration/hooks/use-advanced-prompt-config.ts`
- `web/app/components/app/configuration/debug/hooks.tsx`
- `web/app/components/workflow/hooks/use-workflow.ts`

### Pattern 2: Extract Sub-Components

**When**: Single component has multiple UI sections, conditional rendering blocks, or repeated patterns.

**Dify Convention**: Place sub-components in subdirectories or as separate files in the same directory.

```typescript
// ❌ Before: Monolithic JSX with multiple sections
const AppInfo = () => {
  return (
    <div>
      {/* 100 lines of header UI */}
      {/* 100 lines of operations UI */}
      {/* 100 lines of modals */}
    </div>
  )
}

// ✅ After: Split into focused components
// app-info/
//   ├── index.tsx           (orchestration only)
//   ├── app-header.tsx      (header UI)
//   ├── app-operations.tsx  (operations UI)
//   └── app-modals.tsx      (modal management)

const AppInfo = () => {
  const { showModal, setShowModal } = useAppInfoModals()

  return (
    <div>
      <AppHeader appDetail={appDetail} />
      <AppOperations onAction={handleAction} />
      <AppModals show={showModal} onClose={() => setShowModal(null)} />
    </div>
  )
}
```

**Dify Examples**:
- `web/app/components/app/configuration/` directory structure
- `web/app/components/workflow/nodes/` per-node organization

### Pattern 3: Simplify Conditional Logic

**When**: Deep nesting (> 3 levels), complex ternaries, or multiple `if/else` chains.

```typescript
// ❌ Before: Deeply nested conditionals
const Template = useMemo(() => {
  if (appDetail?.mode === AppModeEnum.CHAT) {
    switch (locale) {
      case LanguagesSupported[1]:
        return <TemplateChatZh />
      case LanguagesSupported[7]:
        return <TemplateChatJa />
      default:
        return <TemplateChatEn />
    }
  }
  if (appDetail?.mode === AppModeEnum.ADVANCED_CHAT) {
    // Another 15 lines...
  }
  // More conditions...
}, [appDetail, locale])

// ✅ After: Use lookup tables + early returns
const TEMPLATE_MAP = {
  [AppModeEnum.CHAT]: {
    [LanguagesSupported[1]]: TemplateChatZh,
    [LanguagesSupported[7]]: TemplateChatJa,
    default: TemplateChatEn,
  },
  [AppModeEnum.ADVANCED_CHAT]: {
    [LanguagesSupported[1]]: TemplateAdvancedChatZh,
    // ...
  },
}

const Template = useMemo(() => {
  const modeTemplates = TEMPLATE_MAP[appDetail?.mode]
  if (!modeTemplates) return null

  const TemplateComponent = modeTemplates[locale] || modeTemplates.default
  return <TemplateComponent appDetail={appDetail} />
}, [appDetail, locale])
```

### Pattern 4: Extract API/Data Logic

**When**: Component directly handles API calls, data transformation, or complex async operations.

**Dify Convention**: Use `@tanstack/react-query` hooks from `web/service/use-*.ts` or create custom data hooks.

```typescript
// ❌ Before: API logic in component
// ✅ After: Extract to data hook using React Query
// use-app-config.ts
import { useQuery } from '@tanstack/react-query'
import { get } from '@/service/base'

function MCPServiceCard() {
  const [basicAppConfig, setBasicAppConfig] = useState({})

  useEffect(() => {
    if (isBasicApp && appId) {
      (async () => {
        const res = await fetchAppDetail({ url: '/apps', id: appId })
        setBasicAppConfig(res?.model_config || {})
      })()
    }
  }, [appId, isBasicApp])

  // More API-related logic...
}

const NAME_SPACE = 'appConfig'

export function useAppConfig(appId: string, isBasicApp: boolean) {
  return useQuery({
    enabled: isBasicApp && !!appId,
    queryKey: [NAME_SPACE, 'detail', appId],
    queryFn: () => get<AppDetailResponse>(`/apps/${appId}`),
    select: data => data?.model_config || {},
  })
}

// Component becomes cleaner
function MCPServiceCard() {
  const { data: config, isLoading } = useAppConfig(appId, isBasicApp)
  // UI only
}
```

**React Query Best Practices in Dify**:
- Define `NAME_SPACE` for query key organization
- Use `enabled` option for conditional fetching
- Use `select` for data transformation
- Export invalidation hooks: `useInvalidXxx`

**Dify Examples**:
- `web/service/use-workflow.ts`
- `web/service/use-common.ts`
- `web/service/knowledge/use-dataset.ts`
- `web/service/knowledge/use-document.ts`

### Pattern 5: Extract Modal/Dialog Management

**When**: Component manages multiple modals with complex open/close states.

**Dify Convention**: Modals should be extracted with their state management.

```typescript
// ❌ Before: Multiple modal states in component
function AppInfo() {
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [showImportDSLModal, setShowImportDSLModal] = useState(false)
  // 5+ more modal states...
}

// ✅ After: Extract to modal management hook
type ModalType = 'edit' | 'duplicate' | 'delete' | 'switch' | 'import' | null

function useAppInfoModals() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  const openModal = useCallback((type: ModalType) => setActiveModal(type), [])
  const closeModal = useCallback(() => setActiveModal(null), [])

  return {
    activeModal,
    openModal,
    closeModal,
    isOpen: (type: ModalType) => activeModal === type,
  }
}
```

### Pattern 6: Extract Form Logic

**When**: Complex form validation, submission handling, or field transformation.

**Dify Convention**: Use `@tanstack/react-form` patterns from `web/app/components/base/form/`.

```typescript
// ✅ Use existing form infrastructure
import { useAppForm } from '@/app/components/base/form'

const ConfigForm = () => {
  const form = useAppForm({
    defaultValues: { name: '', description: '' },
    onSubmit: handleSubmit,
  })

  return <form.Provider>...</form.Provider>
}
```

## Dify-Specific Refactoring Guidelines

### 1. Context Provider Extraction

**When**: Component provides complex context values with multiple states.

```typescript
// ❌ Before: Large context value object
const value = {
  appId, isAPIKeySet, isTrailFinished, mode, modelModeType,
  promptMode, isAdvancedMode, isAgent, isOpenAI, isFunctionCall,
  // 50+ more properties...
}
return <ConfigContext.Provider value={value}>...</ConfigContext.Provider>

// ✅ After: Split into domain-specific contexts
<ModelConfigProvider value={modelConfigValue}>
  <DatasetConfigProvider value={datasetConfigValue}>
    <UIConfigProvider value={uiConfigValue}>
      {children}
    </UIConfigProvider>
  </DatasetConfigProvider>
</ModelConfigProvider>
```

**Dify Reference**: `web/context/` directory structure

### 2. Workflow Node Components

**When**: Refactoring workflow node components (`web/app/components/workflow/nodes/`).

**Conventions**:
- Keep node logic in `use-interactions.ts`
- Extract panel UI to separate files
- Use `_base` components for common patterns

```
nodes/<node-type>/
  ├── index.tsx              # Node registration
  ├── node.tsx               # Node visual component
  ├── panel.tsx              # Configuration panel
  ├── use-interactions.ts    # Node-specific hooks
  └── types.ts               # Type definitions
```

### 3. Configuration Components

**When**: Refactoring app configuration components.

**Conventions**:
- Separate config sections into subdirectories
- Use existing patterns from `web/app/components/app/configuration/`
- Keep feature toggles in dedicated components

### 4. Tool/Plugin Components

**When**: Refactoring tool-related components (`web/app/components/tools/`).

**Conventions**:
- Follow existing modal patterns
- Use service hooks from `web/service/use-tools.ts`
- Keep provider-specific logic isolated

## Refactoring Workflow

### Step 1: Generate Refactoring Prompt

```bash
pnpm refactor-component <path>
```

This command will:
- Analyze component complexity and features
- Identify specific refactoring actions needed
- Generate a prompt for AI assistant (auto-copied to clipboard on macOS)
- Provide detailed requirements based on detected patterns

### Step 2: Analyze Details

```bash
pnpm analyze-component <path> --json
```

Identify:
- Total complexity score
- Max function complexity
- Line count
- Features detected (state, effects, API, etc.)

### Step 3: Plan

Create a refactoring plan based on detected features:

| Detected Feature | Refactoring Action |
|------------------|-------------------|
| `hasState: true` + `hasEffects: true` | Extract custom hook |
| `hasAPI: true` | Extract data/service hook |
| `hasEvents: true` (many) | Extract event handlers |
| `lineCount > 300` | Split into sub-components |
| `maxComplexity > 50` | Simplify conditional logic |

### Step 4: Execute Incrementally

1. **Extract one piece at a time**
2. **Run lint, type-check, and tests after each extraction**
3. **Verify functionality before next step**

```
For each extraction:
  ┌────────────────────────────────────────┐
  │ 1. Extract code                        │
  │ 2. Run: pnpm lint:fix                  │
  │    - If errors remain, attempt to fix  │
  │    - If unable to fix, list errors and │
  │      explain blockers                  │
  │ 3. Run: pnpm type-check:tsgo           │
  │ 4. Run: pnpm test                      │
  │ 5. Test functionality manually         │
  │ 6. PASS? → Next extraction             │
  │    FAIL? → Fix before continuing       │
  └────────────────────────────────────────┘
```

### Step 5: Verify

After refactoring:

```bash
# Re-run refactor command to verify improvements
pnpm refactor-component <path>

# If complexity < 25 and lines < 200, you'll see:
# ✅ COMPONENT IS WELL-STRUCTURED

# For detailed metrics:
pnpm analyze-component <path> --json

# Target metrics:
# - complexity < 50
# - lineCount < 300
# - maxComplexity < 30
```

## Common Mistakes to Avoid

### ❌ Over-Engineering

```typescript
// ❌ Too many tiny hooks
const useButtonText = () => useState('Click')
const useButtonDisabled = () => useState(false)
const useButtonLoading = () => useState(false)

// ✅ Cohesive hook with related state
function useButtonState() {
  const [text, setText] = useState('Click')
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  return { text, setText, disabled, setDisabled, loading, setLoading }
}
```

### ❌ Breaking Existing Patterns

- Follow existing directory structures
- Maintain naming conventions
- Preserve export patterns for compatibility

### ❌ Premature Abstraction

- Only extract when there's clear complexity benefit
- Don't create abstractions for single-use code
- Keep refactored code in the same domain area

## References

### Dify Codebase Examples

- **Hook extraction**: `web/app/components/app/configuration/hooks/`
- **Component splitting**: `web/app/components/app/configuration/`
- **Service hooks**: `web/service/use-*.ts`
- **Workflow patterns**: `web/app/components/workflow/hooks/`
- **Form patterns**: `web/app/components/base/form/`

### Related Skills

- `frontend-testing` - For testing refactored components
- `web/docs/test.md` - Testing specification
