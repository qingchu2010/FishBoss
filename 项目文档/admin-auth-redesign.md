# FishBoss 管理员认证改造方案

更新时间：2026-04-12

配套施工细则见：

- [管理员认证实施细则](</C:/Users/QINGC/Desktop/Project/fishboss/docs/admin-auth-implementation-spec.md>)

## 1. 目标

将现有的“共享密钥握手 + 前端本地持久化 token”方案替换为：

- 首次初始化管理员账号
- 用户名 + 密码登录
- 后端维护会话
- 前端未登录时不进入 GUI
- 会话空闲 7 天过期
- 降低 token 被窃取后的利用面

本方案同时解决以下现存问题：

- `SERVER_SECRET` 被直接当成 Bearer Token 使用
- 前端持久化共享密钥
- 前端持久化认证 token
- 前端在未完成认证前就开始进入应用流程

## 2. 核心原则

### 2.1 认证边界只在后端

- 前端“卡在登录页”只是交互表现，不是安全边界
- 真正的访问控制必须全部由后端鉴权中间件负责
- 所有 `/api/*` 业务接口在未认证时都应返回 `401`

### 2.2 共享密钥方案废弃

- 删除基于 `SERVER_SECRET` 的前端握手登录流程
- `SERVER_SECRET` 不再作为前端可输入凭证
- 后续如需保留环境级引导口令，仅用于首次 bootstrap，不用于日常 API 鉴权

### 2.3 不把会话 token 暴露给前端 JavaScript

- 登录成功后由后端签发会话 Cookie
- Cookie 必须是 `HttpOnly`
- 前端 JS 不读取、也不保存 session token
- 不使用 `localStorage` 持久化认证态

### 2.4 密码只存 Argon2id 哈希

- 不存明文密码
- 不做“重复加密 10 次”
- 直接使用 Argon2id 的标准密码哈希结果
- 哈希字符串中包含参数和随机盐

## 3. 总体流程

### 3.1 首次访问

1. 前端启动后先请求 `GET /api/auth/status`
2. 后端返回 `setupRequired=true`
3. 前端展示“初始化管理员”页面，而不是主界面
4. 用户输入管理员名称、登录名、密码
5. 前端提交到 `POST /api/auth/bootstrap`
6. 后端创建管理员账号并立即建立会话
7. 后端写入会话 Cookie
8. 前端重新请求 `GET /api/auth/me`
9. 成功后进入 GUI

### 3.2 后续登录

1. 前端启动后先请求 `GET /api/auth/status`
2. 如果 `setupRequired=false` 且 `authenticated=false`
3. 前端展示登录页
4. 用户输入用户名和密码
5. 前端提交到 `POST /api/auth/login`
6. 后端校验 Argon2id 密码哈希
7. 成功后写入会话 Cookie
8. 前端请求 `GET /api/auth/me`
9. 成功后进入 GUI

### 3.3 会话续期与过期

- 会话空闲超时：7 天
- 建议增加绝对超时：30 天
- 只有真实业务请求才刷新 `lastSeenAt`
- 不使用心跳接口给会话续命
- 会话过期后，后端返回 `401`
- 前端收到 `401` 后退回登录页

## 4. 首次初始化的安全要求

“未配置管理员时，任何人都能创建第一个管理员”是高风险点，必须限制。

### 4.1 必须增加 bootstrap 保护

推荐二选一：

- 方案 A：只允许 `localhost` 访问 `POST /api/auth/bootstrap`
- 方案 B：要求额外的 `BOOTSTRAP_TOKEN` 环境变量

建议默认实现：

- 开发环境允许 `localhost`
- 非开发环境要求 `BOOTSTRAP_TOKEN`

### 4.2 bootstrap 的约束

- 只允许在“尚未创建管理员”时调用
- 一旦管理员创建成功，接口自动失效
- 再次调用返回 `409`

## 5. 后端设计

## 5.1 新的认证模型

认证状态分为三类：

- `setup_required`
- `unauthenticated`
- `authenticated`

后端不再暴露“共享密钥是否配置”给前端作为登录方式。

## 5.2 存储结构

建议在 `~/.fishboss/auth/` 下新增：

```text
~/.fishboss/auth/
├── admin.json
└── sessions/
    ├── <session-hash>.json
    └── ...
```

### 5.2.1 管理员文件

`admin.json`

建议字段：

```json
{
  "id": "admin_...",
  "username": "admin",
  "displayName": "FishBoss Admin",
  "passwordHash": "$argon2id$...",
  "createdAt": "2026-04-12T12:00:00.000Z",
  "updatedAt": "2026-04-12T12:00:00.000Z",
  "passwordChangedAt": "2026-04-12T12:00:00.000Z",
  "disabled": false
}
```

### 5.2.2 会话文件

`sessions/<session-hash>.json`

建议字段：

```json
{
  "sessionIdHash": "sha256(...)",
  "userId": "admin_...",
  "username": "admin",
  "createdAt": "2026-04-12T12:00:00.000Z",
  "lastSeenAt": "2026-04-12T12:00:00.000Z",
  "idleExpiresAt": "2026-04-19T12:00:00.000Z",
  "absoluteExpiresAt": "2026-05-12T12:00:00.000Z",
  "userAgentHash": "sha256(...)",
  "lastIp": "127.0.0.1"
}
```

说明：

- 文件名不使用原始 session id
- 只保存 `sessionIdHash`
- `userAgentHash` 和 `lastIp` 用于会话绑定校验和审计

## 5.3 密码哈希

使用：

- `Argon2id`

建议：

- 使用成熟库默认安全参数，或显式设置合理的 `timeCost`、`memoryCost`、`parallelism`
- 不自行设计“多次加密”流程

校验流程：

- 登录时读取 `passwordHash`
- 调用 Argon2 校验方法
- 成功才创建会话

## 5.4 会话机制

### 5.4.1 会话 ID

- 登录成功后生成高熵随机 session id
- 原始 session id 只通过 Cookie 发给浏览器
- 后端文件中只存其哈希值

### 5.4.2 Cookie 配置

建议 Cookie：

- 名称：`fishboss_session`
- `HttpOnly=true`
- `SameSite=Strict`
- `Secure=true`，开发环境可按本地情况放宽
- `Path=/`

### 5.4.3 防 token 被窃取的措施

本方案的核心措施：

- token 不进入前端 JS
- 不写入 `localStorage`
- 不写入 `sessionStorage`
- 会话文件只存哈希
- 绑定 `userAgentHash`
- 可选校验 `lastIp`
- 空闲过期 7 天
- 绝对过期 30 天
- 登出时立即删除服务端 session

补充措施：

- 对写操作接口校验 `Origin`
- 记录登录、登出、登录失败日志
- 登录接口加限流

## 5.5 后端接口设计

### 5.5.1 `GET /api/auth/status`

用途：

- 前端启动后的首个接口
- 决定是进入“初始化页”“登录页”还是主界面

返回建议：

```json
{
  "setupRequired": true,
  "authenticated": false,
  "user": null
}
```

或：

```json
{
  "setupRequired": false,
  "authenticated": true,
  "user": {
    "id": "admin_...",
    "username": "admin",
    "displayName": "FishBoss Admin"
  }
}
```

### 5.5.2 `POST /api/auth/bootstrap`

用途：

- 首次创建管理员并建立会话

请求建议：

```json
{
  "username": "admin",
  "displayName": "FishBoss Admin",
  "password": "strong-password",
  "bootstrapToken": "optional-when-required"
}
```

行为：

- 检查当前是否尚未初始化
- 校验 bootstrap 限制
- 生成 Argon2id 哈希
- 保存管理员信息
- 创建会话
- 写入 Cookie

返回建议：

- `201`
- 返回当前用户基础信息

### 5.5.3 `POST /api/auth/login`

请求建议：

```json
{
  "username": "admin",
  "password": "strong-password"
}
```

行为：

- 校验用户名和密码
- 创建新会话
- 写入 Cookie
- 可选择撤销旧会话，或允许多会话并存

返回建议：

- `200`
- 返回当前用户基础信息

### 5.5.4 `POST /api/auth/logout`

行为：

- 删除当前服务端 session
- 清除 Cookie

### 5.5.5 `GET /api/auth/me`

用途：

- 返回当前已登录用户
- 作为前端进入 GUI 前的最终确认接口

### 5.5.6 `POST /api/auth/change-password`

请求建议：

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

行为：

- 校验旧密码
- 更新 `passwordHash`
- 更新 `passwordChangedAt`
- 可选择让其他旧会话失效

## 5.6 中间件改造

现有中间件需要改为：

- 从 Cookie 读取 `fishboss_session`
- 校验 session 是否存在
- 校验是否超过 `idleExpiresAt`
- 校验是否超过 `absoluteExpiresAt`
- 校验 `userAgentHash`
- 成功后在 request 上挂载当前用户

现有逻辑必须删除：

- 允许 `Bearer <SERVER_SECRET>` 直接通过
- 前端共享密钥握手
- 基于前端提交 token 的 `/verify` 和 `/revoke` 模式

## 5.7 速率限制与审计

### 5.7.1 登录限流

- `POST /api/auth/login`
- `POST /api/auth/bootstrap`
- `POST /api/auth/change-password`

建议策略：

- 按 IP 和用户名组合限流
- 连续失败达到阈值后短时锁定

### 5.7.2 审计日志

记录：

- bootstrap 成功
- 登录成功
- 登录失败
- 登出
- 密码修改
- 会话过期

日志中禁止记录：

- 明文密码
- Cookie 值
- 原始 session id

## 6. 前端设计

## 6.1 前端状态机

前端应用启动后只允许处于以下状态之一：

- `checking`
- `setup_required`
- `unauthenticated`
- `authenticated`

流程：

1. 应用启动
2. 请求 `/api/auth/status`
3. 根据结果切换页面
4. 只有 `authenticated` 状态才挂载主 GUI

## 6.2 路由与 GUI 门控

建议增加一个顶层 `AuthGate`：

- `checking` 时显示全屏加载页
- `setup_required` 时显示初始化页
- `unauthenticated` 时显示登录页
- `authenticated` 时才渲染 `AppLayout`

关键要求：

- 未认证时不加载业务列表
- 未认证时不请求面板数据
- `401` 统一退回登录态

## 6.3 前端不再做的事情

必须删除：

- 保存共享密钥到 `localStorage`
- 保存认证 token 到 `localStorage`
- 启动后自动用共享密钥握手

## 6.4 登录与初始化页面的 UI 方向

页面目标：

- 安全感
- 专业感
- 克制但不单调

建议视觉方向：

- 保留现有控制台风格的深色壳层
- 使用墨蓝 + 冷青绿色强调色
- 背景加入低对比度径向渐变和细微网格纹理
- 表单卡片使用更明确的层次和玻璃质感边界
- 进入动画使用轻微淡入和上浮，不做花哨弹跳

### 6.4.1 初始化页

布局建议：

- 左侧为 FishBoss 安全引导说明
- 右侧为初始化表单卡片

表单字段：

- 显示名称
- 用户名
- 密码
- 确认密码
- Bootstrap Token，仅在后端要求时显示

文案重点：

- “这是首次初始化，只允许执行一次”
- “密码仅保存为 Argon2id 哈希”
- “初始化完成后将直接进入管理界面”

### 6.4.2 登录页

布局建议：

- 单屏居中
- 上方品牌区
- 下方登录卡片

卡片内容：

- 用户名
- 密码
- 登录按钮
- 登录错误提示
- 会话过期提示

辅助信息：

- 后端在线状态
- 当前认证模式为“管理员账户”

### 6.4.3 交互细节

- 提交中按钮进入 loading 状态
- 错误提示贴近字段区域，不使用全屏弹窗
- 登录成功后淡出到主界面
- 会话过期后显示“会话已过期，请重新登录”

## 7. 与现有代码的改造关系

## 7.1 后端

需要重做或新增：

- `src/modules/auth/`
- `src/server/middleware/auth.ts`
- `src/server/bootstrap/index.ts`

需要新增的内容：

- 管理员仓储
- 会话仓储
- Argon2 密码服务
- Cookie 会话中间件
- `me/logout/change-password/bootstrap/login/status` 路由

需要删除的旧行为：

- 共享密钥握手
- token verify/revoke 的前端提交模型
- `Bearer <SERVER_SECRET>` 直通

## 7.2 前端

需要重做或新增：

- `frontend/src/stores/auth.ts`
- `frontend/src/services/auth.ts`
- `frontend/src/App.vue`
- 新增登录页
- 新增初始化页

需要删除的旧行为：

- 共享密钥输入页逻辑
- 本地存储共享密钥
- 本地存储 auth token
- 启动后自动 handshake

## 8. 兼容与迁移

建议迁移顺序：

1. 后端先支持新认证模型
2. 前端切到 `status -> bootstrap/login -> me` 流程
3. 删除旧共享密钥 UI
4. 删除旧握手接口

迁移期建议：

- 不保留旧的 secret Bearer 兼容模式
- 避免双轨认证长期共存

## 9. 实施顺序

建议按以下顺序开发：

1. 后端管理员与会话数据结构
2. 后端认证接口与 Cookie 会话
3. 后端鉴权中间件切换
4. 前端 `AuthGate`
5. 初始化页 UI
6. 登录页 UI
7. 登出、修改密码、401 回退
8. 删除旧共享密钥逻辑

## 10. 验收标准

满足以下条件才算完成：

- 未初始化时只能进入初始化页
- 初始化成功后可直接进入 GUI
- 未登录时所有业务接口返回 `401`
- 前端刷新后如果 Cookie 仍有效，可继续使用
- 前端本地存储中不存在共享密钥和认证 token
- 7 天无操作后会话失效
- 登出后当前会话立即失效
- 修改密码后旧会话策略符合预期
- 登录页和初始化页在桌面端、移动端都可正常使用

## 11. 当前结论

这套方案可以作为 FishBoss 新的认证规范落地，优先级高于继续修补现有共享密钥模型。

核心判断：

- 用户名密码 + 服务端会话 是正确方向
- 首次 bootstrap 必须做额外保护
- token 不应暴露给前端 JS
- 前端 GUI 必须由认证状态门控
