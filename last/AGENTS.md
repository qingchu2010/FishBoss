# FishBoss 开发规范

## 1. 开发环境

- 必须使用 pnpm，禁止使用 npm/yarn
- pnpm install / pnpm add / pnpm add -D
- pnpm dev / pnpm build / pnpm preview

## 2. 代码规范

- 禁止添加任何注释
- 禁止 as any / @ts-ignore / @ts-expect-error
- 禁止空 catch 块
- 组件使用 PascalCase 命名
- style 必须使用 scoped
- 必须使用 CSS 变量，禁止硬编码颜色/尺寸
- 写log

## 3. 图标

- 必须使用 lucide-vue-next 图标库
- 禁止自己绘制 SVG 图标
- 禁止使用 emoji 代替图标

## 4. CSS 文件分类

- variables.css - 变量定义
- base.css - 基础重置
- components.css - 按钮等通用组件
- forms.css - 表单元素
- card.css - 卡片
- utilities.css - 工具类
- modal.css - 模态框
- main.css - 入口文件

## 5. 项目结构

- src/components/ - Vue 组件
- src/views/ - 页面视图
- src/stores/ - Pinia 状态
- src/router/ - 路由配置
- src/css/ - CSS 样式
- App.vue / main.ts

## 6. 提交前检查

- pnpm build 构建成功
- 无 TypeScript 错误
- 无 as any 或 @ts-ignore

## 7. i18n 国际化

- 所有用户可见文本必须使用 i18n，必须在 `src/i18n/zh.ts` 中添加对应中文翻译
- 新增页面、组件、按钮、提示文案等，必须同步添加中文翻译
- 使用 `t('key')` 或 `t('key', { params })` 函数调用翻译
