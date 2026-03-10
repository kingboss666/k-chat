# 组件拆分模式

本文提供在 Next.js 项目中，将大组件拆分为更小、更聚焦组件的详细指南。

## 何时拆分组件

当你识别到以下信号时，应考虑拆分组件：

1. **多个 UI 分区**：视觉区域清晰、耦合度低、可独立组合
1. **条件渲染块过大**：存在大量 `{condition && <JSX />}` 或三元渲染分支
1. **重复渲染模式**：相似结构出现多次
1. **超过 300 行**：组件超出可维护范围
1. **弹窗聚集**：一个组件内渲染多个 Modal/Dialog

## 拆分策略

### 策略 1：按页面分区拆分

先识别视觉分区，再将每个分区独立成组件。

```typescript
// ❌ 拆分前：单体组件（500+ 行）
const SettingsPage = () => {
  return (
    <div>
      {/* Header 区 - 50 行 */}
      <div className="header">
        <h1>{t('settings.title')}</h1>
        <div className="actions">
          {isAdvancedMode && <Badge>Advanced</Badge>}
          <ParameterModal />
          <PublishButton />
        </div>
      </div>

      {/* Form 区 - 200 行 */}
      <div className="config">
        <ConfigForm />
      </div>

      {/* Debug 区 - 150 行 */}
      <div className="debug">
        <DebugPanel />
      </div>

      {/* Modals 区 - 100 行 */}
      {showHistory && <HistoryModal />}
      {showConfirm && <ConfirmModal />}
    </div>
  )
}

// ✅ 拆分后：按职责拆分
// settings/
//   ├── index.tsx                  (仅编排)
//   ├── settings-header.tsx
//   ├── settings-content.tsx
//   ├── settings-debug.tsx
//   └── settings-modals.tsx
```

```typescript
// settings-header.tsx
interface SettingsHeaderProps {
  isAdvancedMode: boolean
  onPublish: () => void
}

const SettingsHeader: FC<SettingsHeaderProps> = ({
  isAdvancedMode,
  onPublish,
}) => {
  return (
    <div className="header">
      <h1>Settings</h1>
      <div className="actions">
        {isAdvancedMode && <Badge>Advanced</Badge>}
        <PublishButton onPublish={onPublish} />
      </div>
    </div>
  )
}

// index.tsx（只做 orchestration）
const SettingsPage = () => {
  const { config, setConfig } = useSettingsConfig()
  const { activeModal, closeModal } = useModalState()

  return (
    <div>
      <SettingsHeader
        isAdvancedMode={config.isAdvancedMode}
        onPublish={handlePublish}
      />
      <SettingsContent config={config} onConfigChange={setConfig} />
      {!isMobile && <SettingsDebug onSetting={handleSetting} />}
      <SettingsModals activeModal={activeModal} onClose={closeModal} />
    </div>
  )
}
```

### 策略 2：提取条件渲染分支

将大型条件渲染块提取成“视图组件”。

```typescript
// ❌ 拆分前：条件块过大
const ProfileCard = () => {
  return (
    <div>
      {expand ? (
        <div className="expanded">{/* 100 行展开态 */}</div>
      ) : (
        <div className="collapsed">{/* 50 行收起态 */}</div>
      )}
    </div>
  )
}

// ✅ 拆分后：展开/收起组件独立
const ProfileExpanded: FC<ProfileViewProps> = ({ profile, onAction }) => {
  return <div className="expanded">{/* 展开态视图 */}</div>
}

const ProfileCollapsed: FC<ProfileViewProps> = ({ profile, onAction }) => {
  return <div className="collapsed">{/* 收起态视图 */}</div>
}

const ProfileCard = () => {
  return (
    <div>
      {expand
        ? <ProfileExpanded profile={profile} onAction={handleAction} />
        : <ProfileCollapsed profile={profile} onAction={handleAction} />}
    </div>
  )
}
```

### 策略 3：提取弹窗管理器

将多个弹窗及其触发逻辑整合为 Modal Manager 组件。

```typescript
// ❌ 拆分前：父组件内管理多个弹窗
const UserPage = () => {
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showShare, setShowShare] = useState(false)

  const handleEdit = async (data: EditPayload) => {}
  const handleDelete = async () => {}

  return (
    <div>
      {/* 主内容 */}
      {showEdit && <EditModal onConfirm={handleEdit} onClose={() => setShowEdit(false)} />}
      {showDelete && <DeleteConfirm onConfirm={handleDelete} onClose={() => setShowDelete(false)} />}
      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
    </div>
  )
}
```

```typescript
// ✅ 拆分后：Modal Manager
type ModalType = 'edit' | 'delete' | 'share' | null

interface UserModalsProps {
  activeModal: ModalType
  onClose: () => void
  onSuccess: () => void
}

const UserModals: FC<UserModalsProps> = ({
  activeModal,
  onClose,
  onSuccess,
}) => {
  const handleEdit = async (data: EditPayload) => {}
  const handleDelete = async () => {}

  return (
    <>
      {activeModal === 'edit' && (
        <EditModal onConfirm={handleEdit} onClose={onClose} />
      )}
      {activeModal === 'delete' && (
        <DeleteConfirm onConfirm={handleDelete} onClose={onClose} />
      )}
      {activeModal === 'share' && <ShareModal onClose={onClose} />}
    </>
  )
}

const UserPage = () => {
  const { activeModal, openModal, closeModal } = useModalState()

  return (
    <div>
      <button onClick={() => openModal('edit')}>Edit</button>
      <UserModals
        activeModal={activeModal}
        onClose={closeModal}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
```

### 策略 4：提取列表项组件

把重复的列表项渲染从 `map` 内联逻辑中拆出来。

```typescript
// ❌ 拆分前：map 内联渲染复杂
const OperationsList = () => {
  return (
    <div>
      {operations.map(op => (
        <div key={op.id} className="operation-item">
          <span>{op.icon}</span>
          <span>{op.title}</span>
          <span>{op.description}</span>
          <button onClick={() => op.onClick()}>{op.actionLabel}</button>
          {op.badge && <Badge>{op.badge}</Badge>}
        </div>
      ))}
    </div>
  )
}

// ✅ 拆分后：提取 OperationItem
interface OperationItemProps {
  operation: Operation
  onAction: (id: string) => void
}

const OperationItem: FC<OperationItemProps> = ({ operation, onAction }) => {
  return (
    <div className="operation-item">
      <span>{operation.icon}</span>
      <span>{operation.title}</span>
      <span>{operation.description}</span>
      <button onClick={() => onAction(operation.id)}>{operation.actionLabel}</button>
      {operation.badge && <Badge>{operation.badge}</Badge>}
    </div>
  )
}

const OperationsList = () => {
  const handleAction = useCallback((id: string) => {
    const target = operations.find(item => item.id === id)
    if (!target) return
    target.onClick()
  }, [operations])

  return (
    <div>
      {operations.map(op => (
        <OperationItem
          key={op.id}
          operation={op}
          onAction={handleAction}
        />
      ))}
    </div>
  )
}
```

## 目录结构模式

### 模式 A：扁平结构（简单组件）

适用于仅有 2-3 个子组件的场景：

```
component-name/
  ├── index.tsx           # 主组件
  ├── sub-component-a.tsx
  ├── sub-component-b.tsx
  └── types.ts            # 共享类型
```

### 模式 B：嵌套结构（复杂组件）

适用于子组件较多、含 Hook 与工具函数的场景：

```
component-name/
  ├── index.tsx           # 编排层
  ├── types.ts
  ├── hooks/
  │   ├── use-feature-a.ts
  │   └── use-feature-b.ts
  ├── components/
  │   ├── header/
  │   │   └── index.tsx
  │   ├── content/
  │   │   └── index.tsx
  │   └── modals/
  │       └── index.tsx
  └── utils/
      └── helpers.ts
```

### 模式 C：Next.js 功能域结构（推荐）

适用于 App Router 项目的页面级重构：

```
src/app/(group)/feature/
  ├── page.tsx
  ├── loading.tsx
  ├── error.tsx
  ├── _components/
  │   ├── feature-header.tsx
  │   ├── feature-content.tsx
  │   └── feature-modals.tsx
  ├── hooks/
  │   └── use-feature-state.ts
  └── types.ts
```

## Props 设计

### 最小化 Props 原则

只传子组件真正需要的数据：

```typescript
// ❌ 不推荐：传整个大对象
<ConfigHeader appDetail={appDetail} modelConfig={modelConfig} />

// ✅ 推荐：只传必要字段
<ConfigHeader
  appName={appDetail.name}
  isAdvancedMode={modelConfig.isAdvanced}
  onPublish={handlePublish}
/>
```

### 回调 Props 模式

父子通信使用回调函数，职责明确：

```typescript
// Parent
const Parent = () => {
  const [value, setValue] = useState('')

  return (
    <Child
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
    />
  )
}

// Child
interface ChildProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

const Child: FC<ChildProps> = ({ value, onChange, onSubmit }) => {
  return (
    <div>
      <input value={value} onChange={event => onChange(event.target.value)} />
      <button onClick={onSubmit}>Submit</button>
    </div>
  )
}
```

### Render Props 模式（提升灵活性）

当子组件需要父级上下文时可使用：

```typescript
interface ListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  renderEmpty?: () => React.ReactNode
}

function List<T>({ items, renderItem, renderEmpty }: ListProps<T>) {
  if (items.length === 0 && renderEmpty)
    return <>{renderEmpty()}</>

  return (
    <div>
      {items.map((item, index) => renderItem(item, index))}
    </div>
  )
}

// Usage
<List
  items={operations}
  renderItem={(op, index) => <OperationItem key={index} operation={op} />}
  renderEmpty={() => <EmptyState message="No operations" />}
/>
```
# Component Splitting Patterns

This document provides detailed guidance on splitting large components into smaller, focused components in Dify.

## When to Split Components

Split a component when you identify:

1. **Multiple UI sections** - Distinct visual areas with minimal coupling that can be composed independently
1. **Conditional rendering blocks** - Large `{condition && <JSX />}` blocks
1. **Repeated patterns** - Similar UI structures used multiple times
1. **300+ lines** - Component exceeds manageable size
1. **Modal clusters** - Multiple modals rendered in one component

## Splitting Strategies

### Strategy 1: Section-Based Splitting

Identify visual sections and extract each as a component.

```typescript
// ❌ Before: Monolithic component (500+ lines)
const ConfigurationPage = () => {
  return (
    <div>
      {/* Header Section - 50 lines */}
      <div className="header">
        <h1>{t('configuration.title')}</h1>
        <div className="actions">
          {isAdvancedMode && <Badge>Advanced</Badge>}
          <ModelParameterModal ... />
          <AppPublisher ... />
        </div>
      </div>

      {/* Config Section - 200 lines */}
      <div className="config">
        <Config />
      </div>

      {/* Debug Section - 150 lines */}
      <div className="debug">
        <Debug ... />
      </div>

      {/* Modals Section - 100 lines */}
      {showSelectDataSet && <SelectDataSet ... />}
      {showHistoryModal && <EditHistoryModal ... />}
      {showUseGPT4Confirm && <Confirm ... />}
    </div>
  )
}

// ✅ After: Split into focused components
// configuration/
//   ├── index.tsx              (orchestration)
//   ├── configuration-header.tsx
//   ├── configuration-content.tsx
//   ├── configuration-debug.tsx
//   └── configuration-modals.tsx

// configuration-header.tsx
interface ConfigurationHeaderProps {
  isAdvancedMode: boolean
  onPublish: () => void
}

const ConfigurationHeader: FC<ConfigurationHeaderProps> = ({
  isAdvancedMode,
  onPublish,
}) => {
  const { t } = useTranslation()

  return (
    <div className="header">
      <h1>{t('configuration.title')}</h1>
      <div className="actions">
        {isAdvancedMode && <Badge>Advanced</Badge>}
        <ModelParameterModal ... />
        <AppPublisher onPublish={onPublish} />
      </div>
    </div>
  )
}

// index.tsx (orchestration only)
const ConfigurationPage = () => {
  const { modelConfig, setModelConfig } = useModelConfig()
  const { activeModal, openModal, closeModal } = useModalState()

  return (
    <div>
      <ConfigurationHeader
        isAdvancedMode={isAdvancedMode}
        onPublish={handlePublish}
      />
      <ConfigurationContent
        modelConfig={modelConfig}
        onConfigChange={setModelConfig}
      />
      {!isMobile && (
        <ConfigurationDebug
          inputs={inputs}
          onSetting={handleSetting}
        />
      )}
      <ConfigurationModals
        activeModal={activeModal}
        onClose={closeModal}
      />
    </div>
  )
}
```

### Strategy 2: Conditional Block Extraction

Extract large conditional rendering blocks.

```typescript
// ❌ Before: Large conditional blocks
const AppInfo = () => {
  return (
    <div>
      {expand ? (
        <div className="expanded">
          {/* 100 lines of expanded view */}
        </div>
      ) : (
        <div className="collapsed">
          {/* 50 lines of collapsed view */}
        </div>
      )}
    </div>
  )
}

// ✅ After: Separate view components
const AppInfoExpanded: FC<AppInfoViewProps> = ({ appDetail, onAction }) => {
  return (
    <div className="expanded">
      {/* Clean, focused expanded view */}
    </div>
  )
}

const AppInfoCollapsed: FC<AppInfoViewProps> = ({ appDetail, onAction }) => {
  return (
    <div className="collapsed">
      {/* Clean, focused collapsed view */}
    </div>
  )
}

const AppInfo = () => {
  return (
    <div>
      {expand
        ? <AppInfoExpanded appDetail={appDetail} onAction={handleAction} />
        : <AppInfoCollapsed appDetail={appDetail} onAction={handleAction} />
      }
    </div>
  )
}
```

### Strategy 3: Modal Extraction

Extract modals with their trigger logic.

```typescript
// ❌ Before: Multiple modals in one component
const AppInfo = () => {
  const [showEdit, setShowEdit] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showSwitch, setShowSwitch] = useState(false)

  const onEdit = async (data) => { /* 20 lines */ }
  const onDuplicate = async (data) => { /* 20 lines */ }
  const onDelete = async () => { /* 15 lines */ }

  return (
    <div>
      {/* Main content */}

      {showEdit && <EditModal onConfirm={onEdit} onClose={() => setShowEdit(false)} />}
      {showDuplicate && <DuplicateModal onConfirm={onDuplicate} onClose={() => setShowDuplicate(false)} />}
      {showDelete && <DeleteConfirm onConfirm={onDelete} onClose={() => setShowDelete(false)} />}
      {showSwitch && <SwitchModal ... />}
    </div>
  )
}

// ✅ After: Modal manager component
// app-info-modals.tsx
type ModalType = 'edit' | 'duplicate' | 'delete' | 'switch' | null

interface AppInfoModalsProps {
  appDetail: AppDetail
  activeModal: ModalType
  onClose: () => void
  onSuccess: () => void
}

const AppInfoModals: FC<AppInfoModalsProps> = ({
  appDetail,
  activeModal,
  onClose,
  onSuccess,
}) => {
  const handleEdit = async (data) => { /* logic */ }
  const handleDuplicate = async (data) => { /* logic */ }
  const handleDelete = async () => { /* logic */ }

  return (
    <>
      {activeModal === 'edit' && (
        <EditModal
          appDetail={appDetail}
          onConfirm={handleEdit}
          onClose={onClose}
        />
      )}
      {activeModal === 'duplicate' && (
        <DuplicateModal
          appDetail={appDetail}
          onConfirm={handleDuplicate}
          onClose={onClose}
        />
      )}
      {activeModal === 'delete' && (
        <DeleteConfirm
          onConfirm={handleDelete}
          onClose={onClose}
        />
      )}
      {activeModal === 'switch' && (
        <SwitchModal
          appDetail={appDetail}
          onClose={onClose}
        />
      )}
    </>
  )
}

// Parent component
const AppInfo = () => {
  const { activeModal, openModal, closeModal } = useModalState()

  return (
    <div>
      {/* Main content with openModal triggers */}
      <Button onClick={() => openModal('edit')}>Edit</Button>

      <AppInfoModals
        appDetail={appDetail}
        activeModal={activeModal}
        onClose={closeModal}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
```

### Strategy 4: List Item Extraction

Extract repeated item rendering.

```typescript
// ❌ Before: Inline item rendering
const OperationsList = () => {
  return (
    <div>
      {operations.map(op => (
        <div key={op.id} className="operation-item">
          <span className="icon">{op.icon}</span>
          <span className="title">{op.title}</span>
          <span className="description">{op.description}</span>
          <button onClick={() => op.onClick()}>
            {op.actionLabel}
          </button>
          {op.badge && <Badge>{op.badge}</Badge>}
          {/* More complex rendering... */}
        </div>
      ))}
    </div>
  )
}

// ✅ After: Extracted item component
interface OperationItemProps {
  operation: Operation
  onAction: (id: string) => void
}

const OperationItem: FC<OperationItemProps> = ({ operation, onAction }) => {
  return (
    <div className="operation-item">
      <span className="icon">{operation.icon}</span>
      <span className="title">{operation.title}</span>
      <span className="description">{operation.description}</span>
      <button onClick={() => onAction(operation.id)}>
        {operation.actionLabel}
      </button>
      {operation.badge && <Badge>{operation.badge}</Badge>}
    </div>
  )
}

const OperationsList = () => {
  const handleAction = useCallback((id: string) => {
    const op = operations.find(o => o.id === id)
    op?.onClick()
  }, [operations])

  return (
    <div>
      {operations.map(op => (
        <OperationItem
          key={op.id}
          operation={op}
          onAction={handleAction}
        />
      ))}
    </div>
  )
}
```

## Directory Structure Patterns

### Pattern A: Flat Structure (Simple Components)

For components with 2-3 sub-components:

```
component-name/
  ├── index.tsx           # Main component
  ├── sub-component-a.tsx
  ├── sub-component-b.tsx
  └── types.ts            # Shared types
```

### Pattern B: Nested Structure (Complex Components)

For components with many sub-components:

```
component-name/
  ├── index.tsx           # Main orchestration
  ├── types.ts            # Shared types
  ├── hooks/
  │   ├── use-feature-a.ts
  │   └── use-feature-b.ts
  ├── components/
  │   ├── header/
  │   │   └── index.tsx
  │   ├── content/
  │   │   └── index.tsx
  │   └── modals/
  │       └── index.tsx
  └── utils/
      └── helpers.ts
```

### Pattern C: Feature-Based Structure (Dify Standard)

Following Dify's existing patterns:

```
configuration/
  ├── index.tsx           # Main page component
  ├── base/               # Base/shared components
  │   ├── feature-panel/
  │   ├── group-name/
  │   └── operation-btn/
  ├── config/             # Config section
  │   ├── index.tsx
  │   ├── agent/
  │   └── automatic/
  ├── dataset-config/     # Dataset section
  │   ├── index.tsx
  │   ├── card-item/
  │   └── params-config/
  ├── debug/              # Debug section
  │   ├── index.tsx
  │   └── hooks.tsx
  └── hooks/              # Shared hooks
      └── use-advanced-prompt-config.ts
```

## Props Design

### Minimal Props Principle

Pass only what's needed:

```typescript
// ❌ Bad: Passing entire objects when only some fields needed
<ConfigHeader appDetail={appDetail} modelConfig={modelConfig} />

// ✅ Good: Destructure to minimum required
<ConfigHeader
  appName={appDetail.name}
  isAdvancedMode={modelConfig.isAdvanced}
  onPublish={handlePublish}
/>
```

### Callback Props Pattern

Use callbacks for child-to-parent communication:

```typescript
// Parent
const Parent = () => {
  const [value, setValue] = useState('')

  return (
    <Child
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
    />
  )
}

// Child
interface ChildProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

const Child: FC<ChildProps> = ({ value, onChange, onSubmit }) => {
  return (
    <div>
      <input value={value} onChange={e => onChange(e.target.value)} />
      <button onClick={onSubmit}>Submit</button>
    </div>
  )
}
```

### Render Props for Flexibility

When sub-components need parent context:

```typescript
interface ListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  renderEmpty?: () => React.ReactNode
}

function List<T>({ items, renderItem, renderEmpty }: ListProps<T>) {
  if (items.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>
  }

  return (
    <div>
      {items.map((item, index) => renderItem(item, index))}
    </div>
  )
}

// Usage
<List
  items={operations}
  renderItem={(op, i) => <OperationItem key={i} operation={op} />}
  renderEmpty={() => <EmptyState message="No operations" />}
/>
```
