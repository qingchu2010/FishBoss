# FishBoss

> **AI 开发平台** — 本项目仍处于**积极开发**状态，部分功能正在迭代中。

AI Agent 编排平台，支持对话管理、智能体、工作流、工具调用和 MCP (Model Context Protocol)。

## 功能特性

- **对话管理** - 创建、编辑、删除 AI 对话会话
- **智能体 (Agents)** - 配置和管理 AI 智能体，支持多种供应商
- **工作流** - 可视化编排 AI 工作流程
- **工具系统** - 集成 Bash、Glob、Grep、Read、Write 等开发工具
- **MCP 支持** - 连接 MCP 服务器扩展功能
- **多供应商** - 支持 OpenAI、Anthropic、Ollama、MiniMax 等 AI 模型供应商
- **技能系统** - 导入导出 AI 技能配置

## 技术栈

### 后端
- **Fastify** - 高性能 Web 框架
- **TypeScript** - 类型安全
- **Zod** - 数据验证
- **argon2** - 密码哈希

### 前端
- **Vue 3** - 渐进式前端框架
- **TypeScript** - 类型安全
- **Pinia** - 状态管理
- **Vite** - 构建工具

## 项目结构

```
fishboss/
├── src/                    # 后端源码
│   ├── server/             # Fastify 服务器和路由
│   ├── modules/            # 业务模块
│   ├── storage/           # 存储路径管理
│   └── utils/              # 工具函数
├── frontend/               # 前端源码
│   └── src/
│       ├── views/          # 页面视图
│       ├── components/     # Vue 组件
│       ├── stores/         # Pinia 状态
│       └── services/       # API 服务
├── dist/                   # 构建产物
└── docs/                     # 项目文档
```

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 安装依赖

```bash
pnpm install
pnpm --dir frontend install
```

### 配置

创建 `.env` 文件：

```env
SERVER_SECRET=your-secret-key
PORT=6577
HOST=0.0.0.0
```

### 开发

```bash
# 启动后端 (端口 6577)
pnpm dev

# 启动前端 (端口 6500)
pnpm dev:frontend

# 并行启动前后端
pnpm dev:all
```

### 构建

```bash
# 构建后端
pnpm build

# 构建前端
pnpm --dir frontend build
```

### 测试

```bash
pnpm test
```

## 数据存储

所有数据存储在 `~/.fishboss/` 目录：

- `config/` - 配置文件
- `data/` - 数据文件
- `auth/sessions/` - 会话管理
- `logs/` - 运行日志
- `media/` - 媒体文件
- `providers/` - AI 供应商配置
- `mcp/` - MCP 服务器配置
- `skills/` - 技能数据

## API

前端通过 `/api/*` 调用后端 API，认证使用 Bearer Token。

主要端点：

| 域 | 路径 | 说明 |
|---|---|---|
| system | `/api/system` | 系统信息 |
| auth | `/api/auth` | 认证 |
| conversations | `/api/conversations` | 对话管理 |
| agents | `/api/agents` | 智能体管理 |
| workflows | `/api/workflows` | 工作流 |
| providers | `/api/providers` | 供应商管理 |
| mcp | `/api/mcp` | MCP 服务器 |
| skills | `/api/skills` | 技能管理 |

## 许可证

MIT
