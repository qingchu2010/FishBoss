# FishBoss 管理员认证补丁修复单

更新时间：2026-04-12

本文件用于修正“管理员认证重构第一版”中已经发现的实现偏差。

适用前提：

- 当前代码已经切换到“管理员账号 + Argon2id + HttpOnly Cookie 会话”
- 不需要重新设计认证方案
- 本轮目标是补丁修复，不是再次重构架构

配套文档：

- [管理员认证改造方案](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-redesign.md>)
- [管理员认证实施细则](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-implementation-spec.md>)

## 1. 本轮目标

本轮只修以下 4 类确认问题：

1. 前端把所有 `401` 都误判为“会话过期”
2. bootstrap 的 localhost 保护在代理场景下不可靠
3. 已禁用管理员的已有会话不会失效
4. auth 路由没有实现专门限流

补充清理项：

5. 删除或替换残留的 shared secret 文案
6. 修正流式请求错误解析与会话失效提示

## 2. 固定原则

本轮修复必须遵守：

- 不恢复 shared secret 登录
- 不恢复前端 token 本地存储
- 不改回 Bearer token 鉴权
- 不重写现有页面结构
- 只在当前认证实现上做补丁修复

## 3. P0 修复：401 误判会话过期

## 3.1 当前问题

前端全局 HTTP 拦截器现在对所有 `401` 都调用未授权处理。

问题文件：

- `frontend/src/services/http.ts`
- `frontend/src/stores/auth.ts`
- `frontend/src/components/AuthGate.vue`

当前错误行为：

- `POST /api/auth/bootstrap` 因 bootstrap token 缺失或错误返回 `401` 时，前端会把状态直接切到 `unauthenticated`
- `POST /api/auth/login` 因用户名或密码错误返回 `401` 时，前端会把它当成“会话过期”
- `POST /api/auth/change-password` 因旧密码错误返回 `401` 时，前端会错误触发全局登出式回退

这会导致：

- 初始化页被错误切换成登录页
- 普通登录失败被错误显示成会话失效
- 改密码失败会污染全局认证状态

## 3.2 必须实现的修复

### 后端要求

后端继续保持当前错误码风格：

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_BOOTSTRAP_TOKEN_REQUIRED`
- `AUTH_BOOTSTRAP_TOKEN_INVALID`
- `AUTH_SESSION_MISSING`
- `AUTH_SESSION_IDLE_EXPIRED`
- `AUTH_SESSION_ABSOLUTE_EXPIRED`
- `AUTH_USER_AGENT_MISMATCH`

### 前端要求

全局 `401` 拦截器只能在以下错误码时触发“会话失效回退”：

- `AUTH_SESSION_MISSING`
- `AUTH_SESSION_INVALID`
- `AUTH_SESSION_IDLE_EXPIRED`
- `AUTH_SESSION_ABSOLUTE_EXPIRED`
- `AUTH_USER_AGENT_MISMATCH`
- `AUTH_ACCOUNT_DISABLED`

以下错误码绝不能触发全局会话回退：

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_BOOTSTRAP_TOKEN_REQUIRED`
- `AUTH_BOOTSTRAP_TOKEN_INVALID`
- `BAD_REQUEST`

## 3.3 实现方式

推荐修改：

- `frontend/src/services/http.ts`

新增一个判断函数，例如：

- `isSessionAuthError(code: string): boolean`

拦截器逻辑改为：

1. 读取 `error.response?.data?.error?.code`
2. 只有当错误码属于“会话类错误”时，才调用 `authUnauthorizedHandler`
3. 其他 `401` 继续原样抛给调用方处理

## 3.4 行为验收

必须满足：

1. bootstrap token 错误时，页面仍停留在初始化页
2. 登录密码错误时，页面仍停留在登录页
3. 修改密码时旧密码错误，不会把用户踢回登录页
4. 业务接口因 session 过期返回 `401` 时，前端才切回登录页

## 4. P1 修复：bootstrap localhost 保护补强

## 4.1 当前问题

当前实现只用 `request.ip` 做 localhost 判断。

问题文件：

- `src/modules/auth/routes.ts`
- `src/modules/auth/service.ts`
- `src/server/bootstrap/index.ts`

这在以下场景下不稳：

- 部署在反向代理后
- Fastify 未开启 `trustProxy`
- `request.ip` 可能拿到代理地址而不是实际客户端地址

## 4.2 必须实现的修复

新增服务端配置：

- `TRUST_PROXY`

要求：

- `TRUST_PROXY=false` 时，按直连模式处理
- `TRUST_PROXY=true` 时，允许 Fastify 信任代理头来解析客户端 IP

Fastify 初始化时必须接入：

- `trustProxy`

## 4.3 localhost 判断规则

保留以下本机地址视为 localhost：

- `127.0.0.1`
- `::1`
- `::ffff:127.0.0.1`

实现要求：

- bootstrap 的“是否本机”判断必须基于 Fastify 最终解析后的客户端 IP
- 不能手工直接读取 `x-forwarded-for` 头并自己拼逻辑
- 交给 Fastify + `trustProxy` 统一处理

## 4.4 行为验收

必须满足：

1. 默认配置下，本机 bootstrap 成功
2. 默认配置下，非本机 bootstrap 返回 `403`
3. `BOOTSTRAP_TOKEN` 缺失时，本机请求返回 `401`
4. `TRUST_PROXY=true` 且代理转发远端 IP 时，远端 bootstrap 仍被拒绝

## 5. P1 修复：已禁用管理员会话必须失效

## 5.1 当前问题

当前代码只在登录时检查 `admin.disabled`，已建立的会话不会因为账号被禁用而失效。

问题文件：

- `src/modules/auth/service.ts`
- `src/server/middleware/auth.ts`

## 5.2 必须实现的修复

以下链路都必须检查管理员状态：

- `validateSession`
- `getStatusWithSession`
- `me`
- `changePassword`
- 全局 auth middleware

建议统一做法：

1. `validateSession` 中读取管理员信息
2. 若管理员不存在或 `disabled=true`
3. 删除当前 session
4. 返回：
   - `AUTH_ACCOUNT_DISABLED`
   或
   - `AUTH_SESSION_INVALID`

推荐统一使用：

- `AUTH_ACCOUNT_DISABLED`

## 5.3 行为验收

必须满足：

1. 管理员被禁用后，已有 session 访问 `/api/auth/me` 返回 `401`
2. 管理员被禁用后，业务接口访问返回 `401`
3. 前端收到该错误后退回登录页

## 6. P1 修复：auth 路由专门限流

## 6.1 当前问题

目前只有全局 rate limit，没有对 auth 敏感接口做单独限流。

问题文件：

- `src/modules/auth/routes.ts`
- `src/server/bootstrap/index.ts`

## 6.2 必须实现的限流策略

至少实现以下独立限流：

### `POST /api/auth/login`

- `max: 5`
- `timeWindow: 1 minute`

### `POST /api/auth/bootstrap`

- `max: 3`
- `timeWindow: 10 minutes`

### `POST /api/auth/change-password`

- `max: 5`
- `timeWindow: 10 minutes`

## 6.3 错误返回

auth 限流命中时，返回：

```json
{
  "error": {
    "code": "AUTH_RATE_LIMITED",
    "message": "Too many authentication attempts"
  }
}
```

状态码：

- `429`

## 6.4 实现要求

优先使用现有 `@fastify/rate-limit`

要求：

- 不要重新引入另一套路由限流库
- route 级别配置即可
- auth 路由的限流错误要走统一错误格式

## 7. P2 清理：残留 shared secret 文案

## 7.1 当前问题

i18n 中还残留旧共享密钥文案。

问题文件：

- `frontend/src/i18n/zh.ts`
- `frontend/src/i18n/en.ts`

残留内容包括但不限于：

- backend authentication
- shared secret
- save & authenticate
- handshake authentication

## 7.2 必须实现的修复

要求：

- 删除不再使用的 shared secret 文案
- 或改成管理员账号登录语义
- 不允许设置页继续出现旧认证方式提示

## 8. P2 清理：流式错误解析与提示

## 8.1 当前问题

流式请求错误解析还在按旧扁平错误结构处理。

问题文件：

- `frontend/src/services/http.ts`
- `frontend/src/services/conversations.ts`

当前问题表现：

- 后端返回 `{ error: { code, message } }` 时，前端可能把整个对象当字符串
- 会话失效后的流式错误提示不稳定

## 8.2 必须实现的修复

要求：

- 对流式错误响应优先读取 `error.message`
- 若命中会话类错误码，调用统一未授权处理
- 不要把 `[object Object]` 展示给用户

## 9. 具体文件清单

本轮预计至少改这些文件：

- `src/server/bootstrap/index.ts`
- `src/modules/auth/routes.ts`
- `src/modules/auth/service.ts`
- `src/server/middleware/auth.ts`
- `frontend/src/services/http.ts`
- `frontend/src/stores/auth.ts`
- `frontend/src/services/conversations.ts`
- `frontend/src/i18n/zh.ts`
- `frontend/src/i18n/en.ts`
- `src/modules/auth/index.test.ts`

如有必要，可增补：

- `src/server/config/index.ts`

## 10. 测试补充要求

本轮必须新增测试，至少覆盖：

1. bootstrap token 错误时前端不回退到登录态
2. 登录密码错误时不触发全局 sessionExpired 逻辑
3. change-password 旧密码错误时保持已登录状态
4. 管理员被禁用后，已有 session 失效
5. bootstrap 非 localhost 被拒绝
6. auth 路由限流返回 `429 + AUTH_RATE_LIMITED`

如果当前测试框架不方便做完整前端集成测试，至少要：

- 为前端 auth store 补单元测试
- 为后端 auth route 补注入测试

## 11. 实施顺序

必须按以下顺序修：

1. 修前端 `401` 分类处理
2. 修后端 disabled session 校验
3. 修 bootstrap localhost / proxy 配置
4. 加 auth route 限流
5. 清理残留文案
6. 修流式错误解析
7. 补测试
8. 跑 `typecheck / build / test`

## 12. 交付标准

只有满足以下条件才算本轮完成：

- bootstrap token 错误不会把界面切到登录页
- 登录失败不会被误判成 session 过期
- 已禁用管理员的旧会话会立即失效
- bootstrap 本机保护在代理场景下有明确可靠行为
- login/bootstrap/change-password 有独立限流
- 不再出现 shared secret 残留文案
- `pnpm typecheck`
- `pnpm --dir frontend typecheck`
- `pnpm build`
- `pnpm --dir frontend build`
- `pnpm test`

## 13. 给执行模型的约束

请严格按本文件做补丁，不要：

- 回退第一版认证改造
- 改变认证方案
- 把问题绕过去
- 只更新文案不修逻辑
- 只修逻辑不补测试
