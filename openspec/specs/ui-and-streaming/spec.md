# ui-and-streaming 规格说明

## 目的

定义 K-Chat UI 的聊天界面行为、流式交互模型以及 Token 使用统计的可见性。

## 要求

### Requirement: 流式聊天交互

UI SHALL 支持发送消息、接收流式助手回复，并允许在回复进行中中止生成。

#### Scenario: 用户在空闲状态下提交消息

- **WHEN** 输入框非空，且当前没有进行中的回复
- **THEN** UI 允许提交，并启动流式请求流程

#### Scenario: 用户停止生成

- **WHEN** 回复正在流式输出
- **THEN** 主操作按钮切换为中止动作，并在用户请求时取消生成

### Requirement: 消息列表连续性

UI SHALL 以有序消息列表的形式保留对话内容，并根据角色进行渲染。

#### Scenario: 聊天过程中消息发生更新

- **WHEN** 用户消息和助手消息被追加或更新
- **THEN** 消息列表会按顺序反映这些变化，而不会丢失已有会话状态

### Requirement: 推理预览展开能力

当助手消息包含推理内容时，UI SHALL 允许用户切换该推理预览的展开与收起。

#### Scenario: 某条助手消息包含推理内容

- **WHEN** 用户切换该消息的推理区域
- **THEN** UI 只会展开或收起该条消息对应的推理预览

### Requirement: 错误可见性

UI SHALL 把请求级失败展示给用户。

#### Scenario: 发送或流式请求失败

- **WHEN** 聊天 Hook 上报错误
- **THEN** 界面会在聊天面板中渲染一个可见的错误提示

### Requirement: Token 使用统计可见性

UI SHALL 支持查看聊天交互中的 Token 使用统计。

#### Scenario: Token 统计数据可用

- **WHEN** 聊天流程产出了 Token 使用统计
- **THEN** Token 面板可以按需展示这些信息
