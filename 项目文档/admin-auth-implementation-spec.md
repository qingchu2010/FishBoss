# FishBoss 管理员认证实施细则

更新时间：2026-04-12

本文件是 [admin-auth-redesign.md](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-redesign.md>) 的施工版补充，用来减少实现歧义。

当前实现的后续补丁修复见：

- [管理员认证补丁修复单](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-followup-fixes.md>)

适用范围：

- 后端认证模块重构
- 前端登录门控重构
- 初始化页与登录页实现

## 1. 已锁定的实现决策

以下决策在本次改造中视为固定，不再由实现方自行发挥。

### 1.1 认证模式

- 废弃共享密钥握手登录
- 废弃前端保存 Bearer Token
- 使用“管理员账号 + 密码 + 服务端会话 Cookie”
- 不引入 JWT

### 1.2 会话模式

- 会话载体：随机 `sessionId`
- 客户端保存方式：`HttpOnly Cookie`
- 服务端保存方式：本地文件会话仓储
- Cookie 名称：`fishboss_session`

### 1.3 会话过期规则

- 空闲过期：7 天
- 绝对过期：30 天
- 登录成功后创建新会话
- bootstrap 成功后创建新会话
- 修改密码后当前会话保留，其他会话全部失效

### 1.4 bootstrap 规则

- 系统未初始化时才允许 bootstrap
- 默认只允许来自 `localhost` 的 bootstrap
- 如果设置了 `BOOTSTRAP_TOKEN`，则 bootstrap 请求必须提供该值
- 一旦管理员创建成功，bootstrap 永久关闭

### 1.5 前端门控

- 应用启动后第一请求固定为 `GET /api/auth/status`
- 只有 `authenticated=true` 才允许渲染主 GUI
- 未认证时不允许请求业务面板接口
- 删除当前每 30 秒的认证心跳

## 2. 依赖变更

后端新增依赖：

- `argon2`
- `@fastify/cookie`

安装命令：

```bash
pnpm add argon2 @fastify/cookie
```

前端无需新增认证依赖，继续使用现有 `axios`。

## 3. 环境变量规范

新增环境变量：

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `BOOTSTRAP_TOKEN` | 空 | 首次初始化附加口令，非空时 bootstrap 必须校验 |
| `AUTH_IDLE_TIMEOUT_DAYS` | `7` | 空闲过期天数 |
| `AUTH_ABSOLUTE_TIMEOUT_DAYS` | `30` | 绝对过期天数 |
| `AUTH_COOKIE_NAME` | `fishboss_session` | 会话 Cookie 名称 |
| `AUTH_BOOTSTRAP_LOCALHOST_ONLY` | `true` | 是否限制 bootstrap 只能本机调用 |

现有环境变量变化：

- `SERVER_SECRET` 不再用于前端登录
- 不再向前端暴露“共享密钥已配置”概念

## 4. 存储模型

## 4.1 目录

固定存储位置：

```text
~/.fishboss/auth/
├── admin.json
└── sessions/
    ├── <sha256(sessionId)>.json
    └── ...
```

## 4.2 admin.json 结构

```json
{
  "id": "admin_01",
  "username": "admin",
  "displayName": "FishBoss Admin",
  "passwordHash": "$argon2id$...",
  "disabled": false,
  "createdAt": "2026-04-12T12:00:00.000Z",
  "updatedAt": "2026-04-12T12:00:00.000Z",
  "passwordChangedAt": "2026-04-12T12:00:00.000Z"
}
```

字段要求：

- `username` 全局唯一
- `displayName` 用于前端展示
- `passwordHash` 只能保存 Argon2id 结果
- 禁止保存明文密码或可逆密文

## 4.3 session 文件结构

```json
{
  "sessionIdHash": "sha256(...)",
  "userId": "admin_01",
  "username": "admin",
  "createdAt": "2026-04-12T12:00:00.000Z",
  "lastSeenAt": "2026-04-12T12:00:00.000Z",
  "idleExpiresAt": "2026-04-19T12:00:00.000Z",
  "absoluteExpiresAt": "2026-05-12T12:00:00.000Z",
  "userAgentHash": "sha256(...)",
  "lastIp": "127.0.0.1"
}
```

固定要求：

- 文件名使用 `sha256(sessionId)`
- 文件内容中不保存原始 `sessionId`
- `userAgentHash` 必须保存
- `lastIp` 允许为空字符串，但字段保留

## 5. API 契约

统一返回约定：

- 成功：直接返回业务 JSON
- 失败：返回

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

后端 auth 路由不要再返回旧的扁平 `{ "error": "..." }` 结构。

## 5.1 `GET /api/auth/status`

- 鉴权：否
- 用途：应用启动首个接口

成功返回：

```json
{
  "setupRequired": false,
  "authenticated": true,
  "user": {
    "id": "admin_01",
    "username": "admin",
    "displayName": "FishBoss Admin"
  }
}
```

未登录时：

```json
{
  "setupRequired": false,
  "authenticated": false,
  "user": null
}
```

未初始化时：

```json
{
  "setupRequired": true,
  "authenticated": false,
  "user": null
}
```

状态码：

- `200`

## 5.2 `POST /api/auth/bootstrap`

- 鉴权：否
- 前提：仅系统未初始化时可用

请求体：

```json
{
  "username": "admin",
  "displayName": "FishBoss Admin",
  "password": "strong-password",
  "confirmPassword": "strong-password",
  "bootstrapToken": "optional"
}
```

约束：

- `username`: `3-32` 字符，只允许 `a-z A-Z 0-9 _ -`
- `displayName`: `1-64`
- `password`: `8-128`
- `confirmPassword` 必须与 `password` 一致

成功返回：

```json
{
  "user": {
    "id": "admin_01",
    "username": "admin",
    "displayName": "FishBoss Admin"
  }
}
```

状态码：

- `201` 创建成功
- `400` 参数错误
- `401` bootstrap token 不正确
- `403` 非本机 bootstrap 被拒绝
- `409` 已初始化

Cookie 行为：

- 成功时必须同时设置 `fishboss_session`

## 5.3 `POST /api/auth/login`

- 鉴权：否

请求体：

```json
{
  "username": "admin",
  "password": "strong-password"
}
```

成功返回：

```json
{
  "user": {
    "id": "admin_01",
    "username": "admin",
    "displayName": "FishBoss Admin"
  }
}
```

状态码：

- `200`
- `400`
- `401`
- `423` 账号被禁用
- `429` 登录限流

Cookie 行为：

- 成功时设置新的 `fishboss_session`

## 5.4 `POST /api/auth/logout`

- 鉴权：是

请求体：

- 空对象或无 body

成功返回：

```json
{
  "success": true
}
```

状态码：

- `200`
- `401`

Cookie 行为：

- 必须清除 `fishboss_session`

## 5.5 `GET /api/auth/me`

- 鉴权：是

成功返回：

```json
{
  "user": {
    "id": "admin_01",
    "username": "admin",
    "displayName": "FishBoss Admin"
  }
}
```

状态码：

- `200`
- `401`

## 5.6 `POST /api/auth/change-password`

- 鉴权：是

请求体：

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password",
  "confirmPassword": "new-password"
}
```

成功返回：

```json
{
  "success": true
}
```

状态码：

- `200`
- `400`
- `401`

副作用：

- 更新 `passwordHash`
- 更新 `passwordChangedAt`
- 删除除当前会话之外的所有旧会话

## 6. 错误码清单

固定错误码：

- `AUTH_SETUP_REQUIRED`
- `AUTH_ALREADY_INITIALIZED`
- `AUTH_BOOTSTRAP_FORBIDDEN`
- `AUTH_BOOTSTRAP_TOKEN_REQUIRED`
- `AUTH_BOOTSTRAP_TOKEN_INVALID`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCOUNT_DISABLED`
- `AUTH_SESSION_MISSING`
- `AUTH_SESSION_INVALID`
- `AUTH_SESSION_IDLE_EXPIRED`
- `AUTH_SESSION_ABSOLUTE_EXPIRED`
- `AUTH_USER_AGENT_MISMATCH`
- `AUTH_PASSWORD_CONFIRM_MISMATCH`
- `AUTH_PASSWORD_POLICY_VIOLATION`
- `AUTH_RATE_LIMITED`

## 7. 会话规则

## 7.1 创建规则

- bootstrap 成功创建会话
- login 成功创建会话
- 每次 login 都创建新会话，不复用旧 session id

## 7.2 刷新规则

会话续期规则固定如下：

- `GET /api/auth/status` 不刷新 `lastSeenAt`
- `GET /api/auth/me` 刷新 `lastSeenAt`
- 任何成功的已鉴权业务请求都刷新 `lastSeenAt`
- 登录失败不刷新任何会话
- 401 请求不刷新任何会话

刷新方式：

- 更新 `lastSeenAt`
- 重新计算 `idleExpiresAt = now + 7d`
- `absoluteExpiresAt` 不变

## 7.3 失效规则

以下情况必须立即失效：

- session 文件不存在
- 当前时间超过 `idleExpiresAt`
- 当前时间超过 `absoluteExpiresAt`
- `userAgentHash` 不匹配
- 用户被禁用

以下情况必须清理 session 文件：

- logout
- 会话过期
- 修改密码后被踢掉的其他会话

## 7.4 User-Agent 校验

固定策略：

- 创建会话时保存 `sha256(user-agent)`
- 后续请求校验一致
- 不一致时返回 `401` 和 `AUTH_USER_AGENT_MISMATCH`

## 8. Cookie 规范

固定 Cookie 选项：

- `httpOnly: true`
- `sameSite: 'strict'`
- `path: '/'`
- `secure: process.env.NODE_ENV === 'production'`

实现要求：

- 后端统一通过 `@fastify/cookie` 设置和读取
- 前端不再自行读取 Cookie

前端 HTTP 客户端要求：

- `axios` 配置 `withCredentials: true`
- `fetch` 明确设置 `credentials: 'include'`

## 9. 后端文件级改造清单

## 9.1 删除或重写

以下文件必须重构：

- `src/modules/auth/index.ts`
- `src/server/middleware/auth.ts`

以下旧能力必须删除：

- `/api/auth/handshake`
- `/api/auth/verify`
- `/api/auth/revoke`
- `Bearer <SERVER_SECRET>` 直接放行

## 9.2 新增文件

后端新增：

- `src/modules/auth/schema.ts`
- `src/modules/auth/repository.ts`
- `src/modules/auth/service.ts`
- `src/modules/auth/routes.ts`
- `src/modules/auth/session.ts`
- `src/modules/auth/password.ts`

建议职责：

- `schema.ts`: zod 请求/响应 schema
- `repository.ts`: 管理员和会话文件读写
- `service.ts`: bootstrap/login/logout/change-password/status/me 业务逻辑
- `routes.ts`: 路由注册
- `session.ts`: session 创建、哈希、cookie 设置
- `password.ts`: Argon2id hash/verify

## 9.3 调整文件

- `src/bootstrap.ts`
- `src/server/bootstrap/index.ts`
- `src/server/config/index.ts`
- `src/server/middleware/index.ts`

调整目标：

- 注册 cookie 插件
- 注入新的 auth 路由
- 替换旧鉴权中间件逻辑
- 读取新增环境变量

## 10. 前端文件级改造清单

## 10.1 删除旧行为

以下文件必须改造：

- `frontend/src/services/auth.ts`
- `frontend/src/services/http.ts`
- `frontend/src/stores/auth.ts`
- `frontend/src/App.vue`
- `frontend/src/views/SettingsView.vue`

必须删除：

- shared secret 输入与保存
- localStorage 中的 `auth_token`
- localStorage 中的 `fishboss_shared_secret`
- 启动后自动 handshake
- 30 秒 `verify` 心跳

## 10.2 新增文件

前端新增：

- `frontend/src/views/AuthBootstrapView.vue`
- `frontend/src/views/AuthLoginView.vue`
- `frontend/src/components/AuthGate.vue`

可选新增：

- `frontend/src/components/auth/AuthShell.vue`
- `frontend/src/components/auth/AuthCard.vue`

## 10.3 auth store 新结构

`frontend/src/stores/auth.ts` 应改为维护：

- `status: 'checking' | 'setup_required' | 'unauthenticated' | 'authenticated'`
- `user`
- `isSubmitting`
- `authError`
- `sessionExpired`

固定方法：

- `initialize()`
- `refreshStatus()`
- `bootstrap(payload)`
- `login(payload)`
- `logout()`
- `fetchMe()`
- `handleUnauthorized()`

禁止保留：

- `token`
- `sharedSecret`
- `handshake`
- `verify`

## 10.4 auth service 新接口

`frontend/src/services/auth.ts` 固定暴露：

- `status()`
- `bootstrap(data)`
- `login(data)`
- `logout()`
- `me()`
- `changePassword(data)`

## 10.5 HTTP 客户端改造

`frontend/src/services/http.ts` 固定要求：

- 删除 `Authorization` 头注入逻辑
- 删除 token 读写逻辑
- `axios.create({ withCredentials: true })`
- `fetch(..., { credentials: 'include' })`
- `401` 时调用 auth store 的未授权处理

## 10.6 Router 与 App 改造

固定方案：

- 不新增 `/login` 独立路由
- 不新增 `/bootstrap` 独立路由
- 顶层由 `AuthGate` 决定展示认证页还是主界面

`App.vue` 固定行为：

- 启动后调用 `authStore.initialize()`
- `authenticated` 时渲染 `AppLayout + RouterView`
- 其他状态渲染 `AuthGate`

## 11. UI 实施要求

这是视觉约束，不允许做成默认后台模板感。

### 11.1 共通风格

- 不使用普通白底登录框
- 使用深海蓝、冷青、石墨灰的控制台氛围
- 背景有柔和渐变与低对比纹理
- 卡片边界清晰但不过度发光
- 移动端和桌面端均可用

### 11.2 初始化页

- 采用左右分栏
- 左侧展示 FishBoss 启动引导与安全说明
- 右侧为初始化表单
- 表单卡片需要明显的层级和品牌感

### 11.3 登录页

- 单卡片居中
- 顶部品牌 Logo + 标题
- 中部登录表单
- 底部显示后端状态与会话提示

### 11.4 样式要求

- 必须使用 `scoped`
- 必须使用 CSS 变量
- 新增颜色变量写入 `frontend/src/css/variables.css`
- 不要在组件里硬编码一组临时颜色

## 12. 测试清单

## 12.1 后端测试

至少新增以下测试：

1. 未初始化时 `GET /api/auth/status` 返回 `setupRequired=true`
2. bootstrap 成功后生成 `admin.json`
3. bootstrap 成功后设置 session cookie
4. bootstrap 第二次调用返回 `409`
5. login 成功返回 `200` 且设置 session cookie
6. login 错误密码返回 `401`
7. 未登录访问业务接口返回 `401`
8. 使用有效 cookie 访问业务接口成功
9. idle 过期会话返回 `401`
10. absolute 过期会话返回 `401`
11. logout 后会话失效
12. change-password 后旧会话被踢掉
13. `userAgent` 不匹配返回 `401`

## 12.2 前端测试

至少验证以下流程：

1. 首次启动显示初始化页
2. 初始化成功后进入 GUI
3. 已初始化但未登录时显示登录页
4. 登录成功后进入 GUI
5. 刷新页面后，若 cookie 仍有效，直接进入 GUI
6. 会话过期后退回登录页
7. 登出后退回登录页
8. 浏览器本地存储中不存在认证 token 和共享密钥

## 13. 分步实施顺序

执行顺序固定为：

1. 后端引入 `argon2` 与 `@fastify/cookie`
2. 后端 auth 模块拆分为 schema/repository/service/routes
3. 后端会话中间件替换旧 token 中间件
4. 后端 auth 路由改为 bootstrap/login/logout/me/status/change-password
5. 前端 http 客户端改为 Cookie 模式
6. 前端 auth store 改为状态机
7. 前端加 `AuthGate`
8. 前端实现初始化页
9. 前端实现登录页
10. 删除旧 shared secret UI 与逻辑

## 14. 非目标

本阶段不做：

- 多用户系统
- RBAC 权限模型
- 二步验证
- JWT
- 第三方 OAuth 登录
- 数据库迁移到 SQL

## 15. 交付完成标准

只有同时满足以下条件才算完成：

- 旧共享密钥流程全部删除
- 旧 token 本地存储逻辑全部删除
- 认证完全基于管理员账号和 Cookie 会话
- 认证页 UI 完整可用且风格统一
- 前后端类型检查通过
- 关键 auth 流程测试通过
