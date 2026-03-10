# 复杂度降低模式

本文提供在 Next.js React 组件中降低认知复杂度（Cognitive Complexity）的常用模式。

## 理解复杂度

### SonarJS 认知复杂度

`pnpm analyze-component` 通常基于 SonarJS 的认知复杂度指标：

- **Total Complexity**：文件内所有函数复杂度之和
- **Max Complexity**：单个函数的最高复杂度

### 哪些写法会抬高复杂度

| 模式 | 复杂度影响 |
|------|------------|
| `if/else` | 每个分支 +1 |
| 嵌套条件 | 每嵌套一层 +1 |
| `switch/case` | 每个 case +1 |
| `for/while/do` | 每个循环 +1 |
| `&&`/`||` 链 | 每个操作符 +1 |
| 回调嵌套 | 每嵌套一层 +1 |
| `try/catch` | 每个 catch +1 |
| 三元表达式嵌套 | 每层 +1 |

## 模式 1：用查表替代分支树

**重构前**（复杂度约 15）：

```typescript
const Template = useMemo(() => {
  if (pageMode === 'chat') {
    switch (locale) {
      case 'zh-CN':
        return <ChatTemplateZh />
      case 'ja-JP':
        return <ChatTemplateJa />
      default:
        return <ChatTemplateEn />
    }
  }

  if (pageMode === 'workflow') {
    switch (locale) {
      case 'zh-CN':
        return <WorkflowTemplateZh />
      case 'ja-JP':
        return <WorkflowTemplateJa />
      default:
        return <WorkflowTemplateEn />
    }
  }

  return null
}, [pageMode, locale])
```

**重构后**（复杂度约 3）：

```typescript
const TEMPLATE_MAP: Record<string, Record<string, React.FC>> = {
  chat: {
    'zh-CN': ChatTemplateZh,
    'ja-JP': ChatTemplateJa,
    default: ChatTemplateEn,
  },
  workflow: {
    'zh-CN': WorkflowTemplateZh,
    'ja-JP': WorkflowTemplateJa,
    default: WorkflowTemplateEn,
  },
}

const Template = useMemo(() => {
  if (!pageMode) return null

  const templates = TEMPLATE_MAP[pageMode]
  if (!templates) return null

  const TemplateComponent = templates[locale] ?? templates.default
  return <TemplateComponent />
}, [pageMode, locale])
```

## 模式 2：使用提前返回（Early Return）

**重构前**（复杂度约 10）：

```typescript
function handleSubmit() {
  if (isValid) {
    if (hasChanges) {
      if (isConnected) {
        submitData()
      }
      else {
        showConnectionError()
      }
    }
    else {
      showNoChangesMessage()
    }
  }
  else {
    showValidationError()
  }
}
```

**重构后**（复杂度约 4）：

```typescript
function handleSubmit() {
  if (!isValid) {
    showValidationError()
    return
  }

  if (!hasChanges) {
    showNoChangesMessage()
    return
  }

  if (!isConnected) {
    showConnectionError()
    return
  }

  submitData()
}
```

## 模式 3：提取复杂条件为具名函数

**重构前**（复杂度高）：

```typescript
const canPublish = (() => {
  if (mode !== 'completion') {
    if (!isAdvancedMode)
      return true
    if (modelMode === 'completion') {
      if (!status.hasHistory || !status.hasQuery)
        return false
      return true
    }
    return true
  }
  return !isPromptEmpty
})()
```

**重构后**（复杂度更低）：

```typescript
const canPublishInCompletionMode = () => !isPromptEmpty

function canPublishInChatMode() {
  if (!isAdvancedMode)
    return true
  if (modelMode !== 'completion')
    return true
  return status.hasHistory && status.hasQuery
}

const canPublish = mode === 'completion'
  ? canPublishInCompletionMode()
  : canPublishInChatMode()
```

## 模式 4：替换链式三元表达式

**重构前**（复杂度约 5）：

```typescript
const statusText = isRunning
  ? t('status.running')
  : isPublished
    ? t('status.inactive')
    : isDraft
      ? t('status.draft')
      : t('status.notConfigured')
```

**重构后**（复杂度约 2）：

```typescript
function getStatusText() {
  if (isRunning)
    return t('status.running')
  if (isPublished)
    return t('status.inactive')
  if (isDraft)
    return t('status.draft')
  return t('status.notConfigured')
}

const statusText = getStatusText()
```

也可以使用查表：

```typescript
const STATUS_TEXT_MAP = {
  running: 'status.running',
  inactive: 'status.inactive',
  draft: 'status.draft',
  notConfigured: 'status.notConfigured',
} as const

function getStatusKey(): keyof typeof STATUS_TEXT_MAP {
  if (isRunning)
    return 'running'
  if (isPublished)
    return 'inactive'
  if (isDraft)
    return 'draft'
  return 'notConfigured'
}

const statusText = t(STATUS_TEXT_MAP[getStatusKey()])
```

## 模式 5：扁平化嵌套循环

**重构前**（复杂度高）：

```typescript
function processData(items: Item[]) {
  const results: ProcessedItem[] = []

  for (const item of items) {
    if (item.isValid) {
      for (const child of item.children) {
        if (child.isActive) {
          for (const prop of child.properties) {
            if (prop.value !== null) {
              results.push({
                itemId: item.id,
                childId: child.id,
                propValue: prop.value,
              })
            }
          }
        }
      }
    }
  }

  return results
}
```

**重构后**（复杂度更低）：

```typescript
function processData(items: Item[]) {
  return items
    .filter(item => item.isValid)
    .flatMap(item =>
      item.children
        .filter(child => child.isActive)
        .flatMap(child =>
          child.properties
            .filter(prop => prop.value !== null)
            .map(prop => ({
              itemId: item.id,
              childId: child.id,
              propValue: prop.value,
            })),
        ),
    )
}
```

## 模式 6：提取事件处理逻辑

**重构前**（组件内复杂度高）：

```typescript
const Component = () => {
  const handleSelect = (data: DataSet[]) => {
    if (isEqual(data.map(item => item.id), dataSets.map(item => item.id))) {
      hideSelector()
      return
    }

    notifyChanged()
    let nextDataSets = data

    if (data.find(item => !item.name)) {
      const normalized = produce(data, (draft) => {
        data.forEach((item, index) => {
          if (!item.name) {
            const existing = dataSets.find(current => current.id === item.id)
            if (existing)
              draft[index] = existing
          }
        })
      })
      setDataSets(normalized)
      nextDataSets = normalized
    }
    else {
      setDataSets(data)
    }

    hideSelector()
    // 40+ 行其他处理...
  }

  return <div>...</div>
}
```

**重构后**（复杂度更低）：

```typescript
const useDatasetSelection = (
  dataSets: DataSet[],
  setDataSets: React.Dispatch<React.SetStateAction<DataSet[]>>,
) => {
  const normalizeSelection = (data: DataSet[]) => {
    const hasUnloadedItem = data.some(item => !item.name)
    if (!hasUnloadedItem) return data

    return produce(data, (draft) => {
      data.forEach((item, index) => {
        if (!item.name) {
          const existing = dataSets.find(current => current.id === item.id)
          if (existing) {
            draft[index] = existing
          }
        }
      })
    })
  }

  const hasSelectionChanged = (nextData: DataSet[]) => {
    return !isEqual(
      nextData.map(item => item.id),
      dataSets.map(item => item.id),
    )
  }

  return { normalizeSelection, hasSelectionChanged }
}

const Component = () => {
  const { normalizeSelection, hasSelectionChanged } = useDatasetSelection(dataSets, setDataSets)

  const handleSelect = (data: DataSet[]) => {
    if (!hasSelectionChanged(data)) {
      hideSelector()
      return
    }

    notifyChanged()
    const normalized = normalizeSelection(data)
    setDataSets(normalized)
    hideSelector()
  }

  return <div>...</div>
}
```

## 模式 7：降低布尔表达式复杂度

**重构前**（复杂度约 8）：

```typescript
const toggleDisabled = hasNoPermission
  || isDraft
  || missingStartNode
  || triggerModeDisabled
  || (isAdvancedApp && !workflowGraph)
  || (isBasicApp && !basicConfig.updatedAt)
```

**重构后**（复杂度约 3）：

```typescript
function isAppReady() {
  if (isAdvancedApp)
    return Boolean(workflowGraph)
  return Boolean(basicConfig.updatedAt)
}

function hasRequiredPermission() {
  return isWorkspaceEditor && !hasNoPermission
}

function canToggle() {
  if (!hasRequiredPermission())
    return false
  if (!isAppReady())
    return false
  if (missingStartNode)
    return false
  if (triggerModeDisabled)
    return false
  return true
}

const toggleDisabled = !canToggle()
```

## 模式 8：拆分 useMemo/useCallback 关注点

**重构前**（复杂度高、重复计算多）：

```typescript
const payload = useMemo(() => {
  let parameters: Parameter[] = []
  let outputParameters: OutputParameter[] = []

  if (!published) {
    parameters = (inputs || []).map(item => ({
      name: item.variable,
      description: '',
      form: 'llm',
      required: item.required,
      type: item.type,
    }))
    outputParameters = (outputs || []).map(item => ({
      name: item.variable,
      description: '',
      type: item.valueType,
    }))
  }
  else if (detail?.tool) {
    parameters = (inputs || []).map(item => ({
      // 复杂转换...
    }))
    outputParameters = (outputs || []).map(item => ({
      // 复杂转换...
    }))
  }

  return {
    icon: detail?.icon || icon,
    label: detail?.label || name,
    parameters,
    outputParameters,
  }
}, [detail, published, icon, name, inputs, outputs])
```

**重构后**（职责拆分更清晰）：

```typescript
function useParameterTransform(inputs: InputVar[], detail?: ToolDetail, published?: boolean) {
  return useMemo(() => {
    if (!published) {
      return inputs.map(item => ({
        name: item.variable,
        description: '',
        form: 'llm',
        required: item.required,
        type: item.type,
      }))
    }

    if (!detail?.tool)
      return []

    return inputs.map(item => ({
      name: item.variable,
      required: item.required,
      type: item.type === 'paragraph' ? 'string' : item.type,
      description: detail.tool.parameters.find(parameter => parameter.name === item.variable)?.description || '',
      form: detail.tool.parameters.find(parameter => parameter.name === item.variable)?.form || 'llm',
    }))
  }, [inputs, detail, published])
}

const parameters = useParameterTransform(inputs, detail, published)
const outputParameters = useOutputTransform(outputs, detail, published)

const payload = useMemo(() => {
  return {
    icon: detail?.icon || icon,
    label: detail?.label || name,
    parameters,
    outputParameters,
  }
}, [detail, icon, name, parameters, outputParameters])
```

## 重构后的目标指标

| 指标 | 目标值 |
|------|--------|
| Total Complexity | < 50 |
| Max Function Complexity | < 30 |
| Function Length | < 30 行 |
| Nesting Depth | ≤ 3 层 |
| Conditional Chains | ≤ 3 个条件 |
