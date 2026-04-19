# FishBoss 管理员认证二轮审查修复单

更新时间：2026-04-12

本文档用于记录“管理员认证重构 + 第一轮补丁修复”之后，代码审查中仍然发现的剩余问题。

适用前提：
- 当前认证方案已经切换为“管理员账号 + Argon2id + HttpOnly Cookie 会话”
- 当前文档不是重做认证方案，而是继续做补丁修复
- 本轮优先级高于文案美化和一般性重构

相关文档：
- [管理员认证改造方案](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-redesign.md>)
- [管理员认证实施细则](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-implementation-spec.md>)
- [管理员认证第一轮补丁修复单](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-followup-fixes.md>)

## 1. 本轮结论

当前实现的主流程可用，`pnpm test` 已通过，但仍有一个需要优先修复的安全问题，以及两个需要收口的实现问题：

1. `P0`：`TRUST_PROXY=true` 仍可被伪造 `X-Forwarded-For` 绕过 localhost bootstrap 保护
2. `P1`：全量 `/api/auth/*` 仍绕过全局鉴权中间件，未来新增 auth 子路由容易默认暴露
3. `P2`：`/api/auth/logout` 在 session 已失效时不会清理浏览器 cookie
4. `P2`：`.env.example` 与实际认证方案仍不一致，容易误导部署

---

## 2. P0 修复：TRUST_PROXY 可被伪造请求绕过

### 2.1 当前问题

当前代码路径：
- `src/server/config/index.ts`
- `src/server/bootstrap/index.ts`
- `src/modules/auth/routes.ts`
- `src/modules/auth/service.ts`

当前实现特点：
- `TRUST_PROXY` 被解析成布尔值
- 之后直接传给 Fastify `trustProxy`
- bootstrap 的 localhost 判定直接依赖 `request.ip`

现状风险：
- 当 `TRUST_PROXY=true` 时，Fastify 会信任代理链
- 当前代码没有限制“谁才是可信代理”
- 远端客户端如果能直接访问应用，就可以自己带 `X-Forwarded-For`
- 从而把 `request.ip` 伪造成 `127.0.0.1`

这意味着：
- “仅 localhost 可 bootstrap” 在 `TRUST_PROXY=true` 下并不成立
- 攻击者可绕过初始化保护，抢先创建管理员

### 2.2 已确认复现

本地已复现以下场景：

- `TRUST_PROXY=true`
- 实际直连来源：`198.51.100.23`
- 请求头：`X-Forwarded-For: 127.0.0.1`
- 请求：`POST /api/auth/bootstrap`
- 实际结果：返回 `201`

这说明当前问题不是理论风险，而是实际可利用漏洞。

### 2.3 必须修复的方向

本轮不要继续把 `TRUST_PROXY=true` 原样传给 Fastify。

最小可接受修复：
- 把 `TRUST_PROXY=true` 映射为只信任本机代理，而不是无条件信任所有代理
- 例如映射为 loopback 级别信任，或仅信任 `127.0.0.1` / `::1`

更完整的修复：
- 让 `TRUST_PROXY` 支持安全值，而不是只有布尔值
- 允许：
  - `false`
  - `loopback`
  - 明确的 IP / CIDR allowlist
- 禁止“裸 `true` = 信任所有代理链”这种配置语义

### 2.4 行为要求

修复后必须满足：

1. 默认情况下，本机 bootstrap 成功
2. 默认情况下，非本机 bootstrap 返回 `403`
3. 当启用代理信任时，只有来自可信代理的转发头才参与客户端 IP 解析
4. 远端直连请求即使伪造 `X-Forwarded-For: 127.0.0.1`，也必须返回 `403`

### 2.5 必须补的测试

至少新增以下测试：

1. `TRUST_PROXY=true`，`remoteAddress=198.51.100.23`，`X-Forwarded-For=127.0.0.1`，bootstrap 必须返回 `403`
2. `TRUST_PROXY=true`，可信本机代理转发远端 IP，bootstrap 必须返回 `403`
3. 修复后的配置解析逻辑必须有单测或注入测试覆盖

---

## 3. P1 修复：/api/auth 路由绕过范围过大

### 3.1 当前问题

当前代码路径：
- `src/server/bootstrap/index.ts`
- `src/modules/auth/routes.ts`

当前实现把整个 `/api/auth` 前缀排除在全局 auth middleware 之外。

现状风险：
- 当前 `logout` / `me` / `change-password` 是靠各自路由内部手动校验 session
- 这对现有代码还能工作
- 但以后如果新增 `/api/auth/*` 子路由，开发者很容易忘记手动校验
- 一旦忘记，就会出现“新 auth 路由默认公开”的问题

### 3.2 必须修复的方向

不要再排除整个 `/api/auth` 前缀。

建议收窄为精确排除公开路由：
- `/api/auth/status`
- `/api/auth/login`
- `/api/auth/bootstrap`
- `/api/auth/logout`

其余需要登录态的 auth 路由：
- `/api/auth/me`
- `/api/auth/change-password`

应交给全局 auth middleware 保护。

### 3.3 实现要求

修复后应做到：
- `me` 和 `change-password` 不再依赖“每个路由自己记得校验”
- 路由层优先复用中间件注入的 `request.sessionUser` / `request.sessionId`
- 后续新增 `/api/auth/*` 路由时，默认不会因为前缀排除而暴露

### 3.4 必须补的测试

至少新增以下测试：

1. `/api/auth/me` 在无 cookie 时经全局中间件返回 `401`
2. `/api/auth/change-password` 在无 cookie 时经全局中间件返回 `401`
3. `/api/auth/status` / `/api/auth/login` / `/api/auth/bootstrap` 仍保持公开可访问

---

## 4. P2 修复：logout 对失效 cookie 不做清理

### 4.1 当前问题

当前代码路径：
- `src/modules/auth/routes.ts`
- `src/modules/auth/service.ts`
- `src/modules/auth/session.ts`

当前行为：
- `/api/auth/logout` 先校验 session
- 只有校验通过才会 `clearSessionCookie`
- 如果浏览器带的是失效 cookie，接口返回 `401`，但不会下发清 cookie 响应

这会导致：
- 坏 cookie 一直留在浏览器
- 用户会持续遇到“看起来像已登录但实际上 session 已坏”的残留状态

### 4.2 建议修复

推荐把 logout 做成幂等接口：

- 只要请求命中了 `/api/auth/logout`
- 无论 session 是否存在
- 都执行浏览器 cookie 清理
- 最终返回 `200 { success: true }`

如果仍保留失败态，也至少要保证：
- session 无效时仍调用 `clearSessionCookie`

### 4.3 必须补的测试

至少新增以下测试：

1. 带失效 `fishboss_session` 调用 `/api/auth/logout` 时，响应里应包含清 cookie
2. 若采用幂等语义，则断言返回 `200`

---

## 5. P2 修复：环境示例与实际方案不一致

### 5.1 当前问题

当前文件：
- `.env.example`

当前内容仍把 `SERVER_SECRET` 描述为“前后端握手共享密钥”，这已经不符合现状。

此外还缺失或未说明：
- `BOOTSTRAP_TOKEN`
- `AUTH_BOOTSTRAP_LOCALHOST_ONLY`
- `TRUST_PROXY`
- 会话相关超时配置

### 5.2 必须修复的方向

`.env.example` 必须同步到当前方案：

- 明确 `SERVER_SECRET` 现在用于现有数据加密，不再是登录共享密钥
- 增加 bootstrap 相关环境变量说明
- 增加代理信任配置说明
- 不允许继续出现“shared secret handshake login”之类旧认证描述

---

## 6. 本轮实施顺序

按以下顺序修：

1. 先修 `TRUST_PROXY` 信任模型
2. 再收窄 `/api/auth` 中间件排除范围
3. 再把 logout 改成能清理失效 cookie
4. 最后补 `.env.example`
5. 补测试
6. 跑完整验证

---

## 7. 本轮验收标准

只有满足以下条件，本轮才算完成：

1. 无法再通过伪造 `X-Forwarded-For: 127.0.0.1` 绕过 bootstrap localhost 保护
2. `/api/auth` 不再整段绕过全局鉴权
3. logout 在失效 cookie 场景下也能清 cookie
4. `.env.example` 已与当前认证方案对齐
5. `pnpm typecheck`
6. `pnpm --dir frontend typecheck`
7. `pnpm build`
8. `pnpm --dir frontend build`
9. `pnpm test`

---

## 8. 给执行模型的约束

本轮请严格按本文档修补丁，不要：

- 重做认证方案
- 恢复 shared secret 登录
- 用“运维正确配置代理即可”替代代码层修复
- 只补文档不补逻辑
- 只补逻辑不补测试
