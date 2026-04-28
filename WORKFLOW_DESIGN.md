# FishBoss 工作流设计方案

## 目标

FishBoss 工作流用于把模型、智能体、工具、平台消息和人工审批编排成可追踪、可恢复、可审计的后端任务。前端只负责配置、查看和触发，所有执行逻辑、状态推进、数据存储和外部调用都在后端完成。

## 核心原则

1. 后端优先：工作流定义、运行实例、节点状态、日志和产物全部由后端管理。
2. 可恢复：每次节点完成后持久化快照，服务重启后可以从最后稳定状态继续。
3. 可审计：每个节点输入、输出、错误、耗时、重试次数和触发来源都写入运行记录。
4. 可组合：智能体、工具、平台消息、条件分支、人工审批都作为节点类型处理。
5. 渠道隔离：对话台、QQ、OneBot、其他平台消息使用独立 conversationClass，不互相污染聊天记录。

## 数据模型

### WorkflowDefinition

工作流静态定义，存储在 `~/.fishboss/workflows/definitions/`。

字段：
- `id`：工作流 ID
- `name`：名称
- `description`：说明
- `version`：版本号
- `enabled`：是否启用
- `trigger`：触发器配置
- `nodes`：节点列表
- `edges`：节点连线
- `variables`：默认变量
- `createdAt` / `updatedAt`

### WorkflowRun

单次执行实例，存储在 `~/.fishboss/workflows/runs/`。

字段：
- `id`：运行 ID
- `workflowId`：定义 ID
- `workflowVersion`：运行时定义版本
- `status`：`queued`、`running`、`waiting`、`succeeded`、`failed`、`cancelled`
- `triggerSource`：`manual`、`schedule`、`chat-console`、`qq`、`onebot`、`api`
- `triggerPayload`：触发输入
- `context`：运行上下文变量
- `nodeStates`：节点状态表
- `startedAt` / `finishedAt` / `updatedAt`

### WorkflowNodeState

字段：
- `nodeId`
- `status`：`pending`、`running`、`waiting`、`succeeded`、`failed`、`skipped`
- `input`
- `output`
- `error`
- `attempt`
- `startedAt` / `finishedAt`

## 节点类型

### start

入口节点，标准化触发输入并写入运行上下文。

### agent

调用指定智能体。节点输入提供用户消息、上下文变量、模型覆盖项和工具权限覆盖项。输出包含回复文本、toolCalls、usage 和消息引用。

### tool

执行后端工具注册表中的工具。必须记录工具名、输入、输出摘要、错误和产物 ID。

### condition

根据表达式或字段匹配选择分支。表达式只允许访问当前运行上下文和前置节点输出，不允许执行任意代码。

### transform

对数据做结构化映射，例如提取字段、拼接文本、过滤数组。优先使用 JSON schema 映射，不使用字符串拼接作为主要机制。

### humanApproval

暂停运行并等待人工确认。状态为 `waiting`，前端通过审批接口提交结果后继续执行。

### platformSend

向 QQ、OneBot 或其他平台发送消息。平台消息写入数据库消息线程，不写入对话台会话。

### databaseWrite

写入数据库引用、消息线程或运行产物。用于长期记忆、平台聊天归档和业务记录。

### end

终止节点，汇总运行结果并标记最终状态。

## 触发器

### manual

前端点击运行，后端创建 `WorkflowRun`。

### schedule

后端 job registry 定时创建运行实例。

### platformMessage

外部平台消息进入后端后，先写入数据库消息线程，再按平台配置匹配工作流。匹配条件包括 `conversationClass`、`platformId`、`targetId`、`senderId`、关键词和消息类型。

### api

外部系统调用后端 API 触发。必须经过认证和限流。

## 执行流程

1. Trigger 创建 `WorkflowRun`，状态为 `queued`。
2. Runner 加载工作流定义并校验版本。
3. Runner 按 DAG 拓扑寻找可运行节点。
4. 节点执行前写入 `running` 状态。
5. 节点成功后写入输出并推进下游节点。
6. 节点失败时按重试策略处理，超过上限则运行失败。
7. 遇到人工审批节点时运行进入 `waiting`。
8. 所有终止路径完成后写入最终状态和摘要。

## 错误和重试

每个节点可以配置：
- `timeoutMs`
- `retry.maxAttempts`
- `retry.backoffMs`
- `retry.retryOn`

不可重试错误包括认证失败、配置缺失、Schema 校验失败和人工拒绝。

## API 设计

建议后端接口：
- `GET /api/workflows`：定义列表
- `POST /api/workflows`：创建定义
- `GET /api/workflows/:id`：定义详情
- `PATCH /api/workflows/:id`：更新定义
- `POST /api/workflows/:id/run`：手动运行
- `GET /api/workflows/runs`：运行列表
- `GET /api/workflows/runs/:runId`：运行详情
- `POST /api/workflows/runs/:runId/cancel`：取消运行
- `POST /api/workflows/runs/:runId/approve`：提交人工审批

## 前端设计

前端只做四件事：
- 编辑工作流定义
- 展示运行状态和节点日志
- 手动触发运行
- 处理人工审批

前端不得直接执行工具、模型调用、平台发送或数据库写入。

## 第一阶段落地范围

1. 完成 WorkflowDefinition 和 WorkflowRun 的 Repository。
2. 支持 `manual` 触发、`agent`、`tool`、`condition`、`databaseWrite`、`end` 节点。
3. 运行状态可查询，节点错误可追踪。
4. 平台消息只进入数据库消息线程，不进入对话台列表。

## 第二阶段扩展

1. 增加可视化 DAG 编辑器。
2. 增加人工审批节点。
3. 增加定时触发器。
4. 增加运行回放和节点级重跑。
5. 增加模板市场和导入导出。
