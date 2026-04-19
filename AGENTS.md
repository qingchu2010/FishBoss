# FishBoss 开发规范

## 1. 架构概述

FishBoss 采用**后端优先**架构：**后端处理所有业务逻辑和数据，前端仅负责操作后端**。

```
┌─────────────────────────────────────────────────────┐
│                   FishBoss                          │
│                                                     │
│  ┌─────────────────┐    ┌────────────────────────┐ │
│  │   Frontend      │───▶│   Backend (Fastify)    │ │
│  │   (Vue 3)       │◀───│   端口 6577            │ │
│  │   端口 6500      │    │                        │ │
│  └─────────────────┘    │  · 所有业务逻辑          │ │
│         Vite Proxy     │  · 所有数据存储           │ │
│         /api/*         │  · AI 编排                │ │
│                        │  · 工具执行               │ │
│                        │  · SSE 实时通信           │ │
│                        └────────────────────────┘ │
│                                       │             │
│                                       ▼             │
│                               ~/.fishboss/          │
│                               (持久化存储)          │
└─────────────────────────────────────────────────────┘
```

**前端职责**：纯 UI 层，通过 REST API 与后端通信，不处理任何业务逻辑。  
**后端职责**：处理所有业务逻辑、数据存储、AI 调用、工具执行、工作流编排。

---

## 2. 项目结构

### 2.1 根目录

```
fishboss/
├── src/                        # 后端源码
├── dist/                       # 后端构建产物
├── frontend/                    # 前端源码
│   ├── src/
│   │   ├── views/             # 页面视图
│   │   ├── components/        # Vue 组件
│   │   ├── stores/            # Pinia 状态管理
│   │   ├── services/          # API 服务层（调用后端）
│   │   ├── composables/       # Vue Composables
│   │   ├── router/            # 路由配置
│   │   ├── i18n/              # 国际化（中/英）
│   │   ├── css/               # CSS 样式
│   │   ├── config/            # 前端配置
│   │   └── App.vue / main.ts
│   └── dist/                  # 前端构建产物
├── scripts/
│   └── dev-all.mjs            # 并行启动前后端脚本
├── package.json               # 后端依赖（pnpm）
└── tsconfig.json
```

### 2.2 后端结构（src/）

```
src/
├── bootstrap.ts               # 入口：启动服务器，注册所有路由
├── index.ts                  # 公共导出
│
├── server/                    # Fastify 服务器
│   ├── bootstrap/             # Fastify 实例初始化
│   ├── config/                # 服务器配置（端口、CORS、限流）
│   ├── domains/               # 路由域（注册到 /api/*）
│   │   ├── index.ts           # 统一导出
│   │   ├── http-register.ts   # 通用 CRUD 注册辅助
│   │   ├── conversations/     # 对话管理
│   │   ├── agents/            # 智能体管理
│   │   ├── workflows/         # 工作流
│   │   ├── providers/         # 模型供应商
│   │   ├── mcp.ts             # MCP 服务器
│   │   ├── skills.ts          # 技能
│   │   ├── platform.ts        # 平台接入
│   │   ├── group.ts           # 群组策略
│   │   ├── media.ts           # 媒体库
│   │   └── tools/             # 工具注册表
│   ├── middleware/            # 中间件
│   │   └── auth.ts            # 请求认证中间件
│   ├── logging/               # 日志
│   ├── errors/                # 错误处理
│   ├── jobs/                  # 任务调度
│   ├── persistence/           # 持久化
│   ├── sse/                   # SSE 实时通信
│   └── validation/            # 请求验证
│
├── modules/                   # 业务模块（Repository + Service + Routes）
│   ├── auth/                  # 认证（握手 + Token 管理）
│   ├── logs/                  # 日志查询
│   ├── system/                # 系统信息
│   ├── frontend-config/       # 前端配置持久化
│   ├── conversations/         # 对话业务
│   ├── agents/                # 智能体业务
│   ├── workflows/             # 工作流业务
│   ├── providers/             # 供应商业务
│   ├── mcp/                   # MCP 业务
│   ├── skills/                # 技能业务
│   ├── platform/              # 平台业务
│   ├── group/                 # 群组业务
│   └── media/                 # 媒体业务
│
├── storage/                   # 存储路径管理
│   ├── paths.ts               # 路径解析（~/.fishboss）
│   ├── dirs.ts                # 子目录枚举
│   └── index.ts
│
├── types/                     # 共享类型定义
│   ├── agent.ts
│   ├── conversation.ts
│   ├── provider.ts
│   ├── tool.ts
│   ├── workflow.ts
│   ├── mcp.ts
│   ├── skill.ts
│   └── index.ts
│
├── config/                    # 前端配置读写（~/.fishboss/config/）
│   ├── index.ts
│   └── repository.ts
│
├── prompts/                   # Prompts 存储（~/.fishboss/prompts/）
│   └── index.ts
│
└── utils/                     # 工具函数
    ├── async.ts
    ├── string.ts
    └── index.ts
```

### 2.3 后端存储（~/.fishboss/）

```
~/.fishboss/
├── config/                   # 配置文件
├── data/                     # 数据文件
├── auth/
│   └── sessions/             # Token 会话（哈希文件名）
├── logs/                     # 运行日志
├── media/                    # 媒体文件
├── prompts/                  # Prompts 文件
├── workflows/                # 工作流数据
├── providers/                # 供应商配置
├── mcp/                      # MCP 服务器配置
├── skills/                   # 技能数据
└── frontend-config/          # 前端配置（主题、语言、共享密钥）
```

---

## 3. 开发环境

### 3.1 包管理

- **必须使用 pnpm**，禁止使用 npm/yarn
- 后端：`pnpm add <pkg>` / `pnpm add -D <pkg>`
- 前端：`pnpm --dir frontend add <pkg>`

### 3.2 开发命令

```bash
# 后端独立开发（端口 6577）
pnpm dev

# 前端独立开发（端口 6500，代理到 6577）
pnpm --dir frontend dev

# 并行启动前后端（推荐）
pnpm dev:all

# 构建
pnpm build          # 后端
pnpm --dir frontend build   # 前端

# 类型检查
pnpm typecheck
pnpm --dir frontend typecheck

# 测试
pnpm test
```

### 3.3 环境变量

**后端（.env 或环境变量）**：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_SECRET` | （必填） | 前后端握手共享密钥 |
| `PORT` | `6577` | 后端端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `FISHBOSS_ROOT` | `~/.fishboss` | 存储根目录 |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173,http://localhost:6500` | CORS 白名单 |
| `RATE_LIMIT_ENABLED` | `true` | 启用限流 |
| `RATE_LIMIT_MAX` | `100` | 最大请求数 |

---

## 4. API 设计

### 4.1 前端 → 后端 通信

前端通过 Axios 调用后端 API，认证方式为 **Bearer Token**。

```
API_BASE = '/api'    # Vite 代理到 http://localhost:6577
```

所有 API 响应格式统一，认证状态由 `authStore.isAuthenticated` 反映。

### 4.2 后端路由（/api/*）

| 域 | 路径 | 说明 |
|----|------|------|
| system | `/api/system` | 系统信息 |
| auth | `/api/auth` | 握手/Token/状态 |
| logs | `/api/logs` | 日志查询 |
| frontend-config | `/api/frontend-config` | 前端配置持久化 |
| conversations | `/api/conversations` | 对话 CRUD |
| agents | `/api/agents` | 智能体 CRUD |
| workflows | `/api/workflows` | 工作流 CRUD |
| providers | `/api/providers` | 供应商 CRUD + `/metadata` |
| mcp | `/api/mcp` | MCP 服务器管理 |
| skills | `/api/skills` | 技能 CRUD + 导入导出 |
| platform | `/api/platform` | 平台接入 |
| group | `/api/group` | 群组策略 |
| media | `/api/media` | 媒体库 |

### 4.3 认证流程

```
前端                          后端
  │                             │
  │  1. 用户输入共享密钥          │
  │────────────────────────────▶│
  │                             │  2. 验证共享密钥
  │                             │  3. 生成随机 Token（TTL 15min）
  │                             │  4. Session 存到 ~/.fishboss/auth/sessions/
  │◀────────────────────────────│
  │  返回 Token                   │
  │                             │
  │  后续请求携带 Bearer Token    │
  │────────────────────────────▶│
  │                             │  5. 中间件验证 Token
  │                             │
```

---

## 5. 代码规范

### 5.1 通用（前后端通用）

- **禁止添加任何注释**（业务注释例外）
- **禁止** `as any` / `@ts-ignore` / `@ts-expect-error`
- **禁止**空 `catch` 块
- **必须**使用 `console.log` / `console.error` 记录关键操作

### 5.2 后端（TypeScript）

- 模块结构：**Repository → Service → Routes**
- 每个域有独立文件夹：`modules/<domain>/{repository,service,routes,schema}.ts`
- Domain Routes 统一注册到 `bootstrap.ts`
- 使用 **Zod** 做请求/响应 Schema 验证
- 存储路径统一通过 `storage/paths.ts` 获取，禁止硬编码路径

### 5.3 前端（Vue 3 + TypeScript）

- **组件**：PascalCase 命名，`*.vue` 文件
- **样式**：必须使用 `scoped`，必须使用 CSS 变量，禁止硬编码颜色/尺寸
- **图标**：必须使用 `lucide-vue-next`，禁止手写 SVG，禁止 emoji
- **状态管理**：Pinia Store，按域划分（`stores/`）
- **API 调用**：统一通过 `services/` 层，禁止在组件内直接用 axios
- **i18n**：所有用户可见文本必须用 `t('key')`，key 必须同时添加到 `zh.ts` 和 `en.ts`

---

## 6. CSS 规范（前端）

CSS 文件分类在 `frontend/src/css/`：

| 文件 | 说明 |
|------|------|
| `variables.css` | CSS 变量定义 |
| `base.css` | 基础重置 |
| `components.css` | 按钮等通用组件 |
| `forms.css` | 表单元素 |
| `card.css` | 卡片样式 |
| `utilities.css` | 工具类 |
| `modal.css` | 模态框 |
| `main.css` | 入口文件 |

---

## 7. 提交前检查

```bash
# 后端
pnpm typecheck
pnpm build

# 前端
pnpm --dir frontend typecheck
pnpm --dir frontend build

# 测试
pnpm test
```

全部通过方可提交。

---

## 8. 前后端职责划分（铁律）

| 场景 | 后端还是前端处理？ |
|------|------------------|
| 业务逻辑 | 后端 |
| 数据存储 | 后端（~/.fishboss） |
| AI 模型调用 | 后端 |
| 供应商管理 | 后端（Provider CRUD + 协议识别） |
| 供应商预设列表 | **后端**（`GET /providers/metadata`），前端只展示 |
| 智能体编排 | 后端 |
| 对话管理 | 后端 |
| 工作流执行 | 后端 |
| MCP 服务器管理 | 后端 |
| 技能管理 | 后端 |
| UI 布局/交互 | 前端 |
| 主题切换 | 前端（后端持久化配置值） |
| 语言切换 | 前端（后端持久化配置值） |
| 前端配置持久化 | **后端**（`GET/PATCH /api/frontend-config`） |

> ⚠️ **重要**：供应商类型（OpenAI/Anthropic/Ollama 等）和预设列表**必须从后端获取**，禁止在前端硬编码。前端通过 `GET /providers/metadata` 获取类型元数据和预设。



*其他*
1.下拉框必须要用全局样式