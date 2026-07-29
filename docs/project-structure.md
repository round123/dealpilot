# DealPilot Monorepo 目录结构

> 基于 pnpm workspaces + Turborepo 的 Monorepo 结构，技术栈已锁定。
> 4 个 package：web（工作台前端）、extension（WXT 插件）、agent（Bun 后端）、shared（共享类型/Zod schema）。

## 顶层结构

```text
dealpilot/
├─ package.json                  # 根 package.json，pnpm workspace 配置
├─ pnpm-workspace.yaml           # workspace 包声明
├─ turbo.json                    # Turborepo 任务编排
├─ tsconfig.base.json            # 共享 TS 基础配置
├─ .gitignore
├─ .npmrc                        # pnpm 配置
├─ apps/                         # 应用包
│  ├─ web/                       # 工作台前端（React + Vite）
│  ├─ extension/                 # 浏览器插件（WXT）
│  └─ agent/                     # 本地后端（Bun + Hono + Drizzle）
├─ packages/
│  └─ shared/                    # 共享类型、Zod schema、常量
├─ scripts/                      # 跨包脚本（发布、签名等）
└─ docs/                         # 项目文档
```

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".output/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

根 package.json 关键脚本：

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test"
  }
}
```

---

## 1. packages/shared - 共享包

共享 Zod schema、TypeScript 类型、常量和工具函数。被 web、extension、agent 三个包同时引用。

```text
packages/shared/
├─ package.json
├─ tsconfig.json                 # extends 根 tsconfig.base.json
├─ src/
│  ├─ index.ts                   # 统一导出
│  ├─ schemas/                   # Zod schema 定义（前后端共享）
│  │  ├─ customer.ts             # CustomerCreate / CustomerUpdate / Customer
│  │  ├─ contact.ts              # ContactCreate / ContactUpdate
│  │  ├─ social-account.ts       # SocialAccountCreate
│  │  ├─ follow-up.ts           # FollowUpCreate / FollowUpUpdate
│  │  ├─ reminder.ts            # ReminderCreate / ReminderStatusUpdate
│  │  ├─ project.ts             # ProjectCreate / ProjectUpdate
│  │  ├─ risk.ts                # RiskCreate / RiskUpdate
│  │  ├─ milestone.ts           # MilestoneCreate
│  │  ├─ match.ts               # MatchResolve / MatchBind / MatchUnbind
│  │  ├─ import.ts              # ImportCommitRequest
│  │  ├─ settings.ts            # SettingsUpdate
│  │  ├─ backup.ts              # BackupCreateRequest
│  │  └─ common.ts              # Cursor 分页、ErrorResponse 等通用 schema
│  ├─ types/                    # 纯类型定义（从 Zod 推导）
│  │  ├─ api.ts                  # API 请求/响应类型（z.infer）
│  │  ├─ enums.ts                # 枚举常量（grade、stage、status 等）
│  │  └─ index.ts
│  ├─ constants/                # 共享常量
│  │  ├─ api-paths.ts           # API 路径常量
│  │  ├─ platforms.ts           # WhatsApp / Telegram 标识
│  │  └─ config.ts              # 默认分页、限流等
│  └─ utils/                    # 纯函数工具
│     ├─ format.ts              # 日期、金额、手机号标准化
│     ├─ id.ts                  # UUID 生成
│     └─ normalize.ts           # 邮箱小写、E.164 标准化
└─ dist/                        # 构建产物（tsup 输出 ESM + CJS）
```

### package.json

```json
{
  "name": "@dealpilot/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "latest"
  },
  "devDependencies": {
    "tsup": "latest",
    "typescript": "^5.0.0"
  }
}
```

### Zod schema 前后端同时使用方式

**后端（agent）**：Hono 中间件直接使用 Zod schema 校验请求体，校验通过后 `z.infer` 得到类型安全的数据。

```ts
// agent/src/routes/customers.ts
import { z } from "zod";
import { CustomerCreateSchema } from "@dealpilot/shared";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();
app.post("/customers", zValidator("json", CustomerCreateSchema), (c) => {
  const body = c.req.valid("json"); // 类型安全，已校验
  // ...
});
```

**前端（web）**：React Hook Form + Zod resolver 使用同一份 schema 做表单校验，TanStack Query 的 mutation 使用 `z.infer` 得到请求体类型。

```ts
// web/src/features/customers/customer-form.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerCreateSchema } from "@dealpilot/shared";

const { register, handleSubmit } = useForm<z.infer<typeof CustomerCreateSchema>>({
  resolver: zodResolver(CustomerCreateSchema),
});
```

**插件（extension）**：Content Script 标记跟进时，使用 `FollowUpCreateSchema` 校验本地数据再 POST。

```ts
// extension/entrypoints/content/index.tsx
import { FollowUpCreateSchema } from "@dealpilot/shared";
const payload = FollowUpCreateSchema.parse(rawMessageData);
```

---

## 2. apps/web - 工作台前端

React 18 + Vite + TanStack Router/Query/Table + Tailwind + Radix UI + Lucide React。

```text
apps/web/
├─ package.json
├─ tsconfig.json                 # extends 根 tsconfig.base.json
├─ vite.config.ts                # Vite 配置，引用 shared 包
├─ tailwind.config.ts            # Tailwind 配置，引用 design-tokens
├─ postcss.config.js
├─ index.html                    # Vite 入口
├─ public/
│  └─ favicon.ico
└─ src/
   ├─ main.tsx                   # React 入口
   ├─ App.tsx                    # 根组件 + TanStack Router
   ├─ router.ts                  # TanStack Router 路由定义
   ├─ styles/
   │  └─ globals.css             # Tailwind 指令 + design-tokens 引用
   ├─ lib/
   │  ├─ api-client.ts           # 封装 fetch，注入 Bearer Token（sessionStorage）
   │  ├─ query-client.ts         # TanStack Query 客户端配置
   │  └─ format.ts               # 调用 shared 的格式化工具
   ├─ features/                  # 按业务功能组织
   │  ├─ customers/
   │  │  ├─ api.ts               # TanStack Query hooks（list/detail/mutate）
   │  │  ├─ components/
   │  │  │  ├─ customer-table.tsx      # TanStack Table 客户列表
   │  │  │  ├─ customer-form.tsx       # 新建/编辑表单（RHF + Zod）
   │  │  │  ├─ customer-detail.tsx      # 档案详情
   │  │  │  └─ customer-merge.tsx       # 合并客户
   │  │  └─ routes/
   │  │     ├─ customers.tsx            # /customers 列表页
   │  │     ├─ customer-detail.tsx      # /customers/:id
   │  │     └─ customer-import.tsx     # /customers/import
   │  ├─ projects/
   │  │  ├─ api.ts
   │  │  ├─ components/
   │  │  │  ├─ project-table.tsx
   │  │  │  ├─ project-form.tsx
   │  │  │  ├─ project-detail.tsx
   │  │  │  ├─ risk-list.tsx
   │  │  │  └─ milestone-list.tsx
   │  │  └─ routes/
   │  │     ├─ projects.tsx
   │  │     └─ project-detail.tsx
   │  ├─ follow-ups/
   │  │  ├─ api.ts
   │  │  └─ components/
   │  │     └─ follow-up-timeline.tsx   # 跟进时间线
   │  ├─ reminders/
   │  │  ├─ api.ts
   │  │  ├─ components/
   │  │  │  └─ reminder-list.tsx
   │  │  └─ routes/
   │  │     └─ reminders.tsx            # /reminders
   │  ├─ imports/
   │  │  ├─ api.ts
   │  │  ├─ components/
   │  │  │  ├─ file-upload.tsx
   │  │  │  ├─ field-mapping.tsx
   │  │  │  ├─ import-preview.tsx
   │  │  │  └─ import-result.tsx
   │  │  └─ hooks/
   │  │     └─ use-import-job.ts
   │  ├─ backups/
   │  │  ├─ api.ts
   │  │  ├─ components/
   │  │  │  ├─ backup-create.tsx
   │  │  │  └─ backup-restore.tsx
   │  │  └─ routes/
   │  │     └─ backup.tsx              # /settings/backup
   │  ├─ settings/
   │  │  ├─ api.ts
   │  │  └─ routes/
   │  │     └─ settings.tsx            # /settings
   │  └─ dashboard/
   │     ├─ api.ts
   │     └─ routes/
   │        └─ dashboard.tsx           # /
   ├─ components/                # 通用 UI 组件
   │  ├─ ui/                    # Radix UI 封装（button, dialog, dropdown...）
   │  ├─ data-table.tsx         # TanStack Table 通用封装
   │  ├─ error-boundary.tsx
   │  └─ pagination.tsx         # 游标分页组件
   └─ stores/
      └─ ui-store.ts            # Zustand 临时 UI 状态
```

### package.json

```json
{
  "name": "@dealpilot/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --max-warnings 0"
  },
  "dependencies": {
    "@dealpilot/shared": "workspace:*",
    "@tanstack/react-query": "latest",
    "@tanstack/react-router": "latest",
    "@tanstack/react-table": "latest",
    "@hookform/resolvers": "latest",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-select": "latest",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-hook-form": "latest",
    "tailwindcss": "latest",
    "lucide-react": "latest",
    "zustand": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "latest",
    "autoprefixer": "latest",
    "postcss": "latest",
    "typescript": "^5.0.0",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

### vite.config.ts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dealpilot/shared": resolve(__dirname, "../../packages/shared/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
```

---

## 3. apps/extension - 浏览器插件

WXT + React 18 + Tailwind + Radix UI + Lucide React + TanStack Query。

```text
apps/extension/
├─ package.json
├─ tsconfig.json                 # extends 根 tsconfig.base.json
├─ wxt.config.ts                 # WXT 配置（manifest、跨浏览器构建）
├─ tailwind.config.ts
├─ postcss.config.js
├─ entrypoints/
│  ├─ background.ts             # MV3 Service Worker（消息桥、token 管理）
│  ├─ popup/
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  └─ App.tsx                # Popup 根组件（前5条待办 + 新建客户入口）
│  └─ content/
│     ├─ index.tsx              # Content Script 入口，挂载 Shadow DOM
│     ├─ App.tsx                # 浮窗根组件
│     ├─ shadow-root.ts         # Shadow DOM 隔离逻辑
│     └─ components/
│        ├─ customer-card.tsx   # 客户档案摘要
│        ├─ follow-up-marker.tsx # 标记跟进按钮
│        ├─ reminder-set.tsx     # 设置提醒
│        └─ platform-adapter.tsx # WhatsApp/Telegram DOM 适配
├─ src/
│  ├─ lib/
│  │  ├─ api-client.ts          # 封装 fetch，token 来自 Service Worker
│  │  ├─ native-messaging.ts    # Native Messaging Bootstrap
│  │  └─ platform-detect.ts     # 检测 WhatsApp/Telegram 页面
│  ├─ stores/
│  │  └─ extension-store.ts     # Zustand 临时状态
│  └─ assets/
│     └─ icons/                 # 插件图标
└─ public/
   └─ icon/
      ├─ 16.png
      ├─ 48.png
      └─ 128.png
```

### wxt.config.ts

```ts
import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "DealPilot",
    description: "外贸经理工作台助手",
    permissions: ["nativeMessaging", "storage", "activeTab"],
    host_permissions: [
      "https://web.whatsapp.com/*",
      "https://web.telegram.org/*",
    ],
    action: {
      default_popup: "popup/index.html",
    },
    content_scripts: [
      {
        matches: ["https://web.whatsapp.com/*", "https://web.telegram.org/*"],
        js: ["content/index.js"],
      },
    ],
  },
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        "@dealpilot/shared": resolve(__dirname, "../../packages/shared/src"),
      },
    },
  }),
});
```

### package.json

```json
{
  "name": "@dealpilot/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "@dealpilot/shared": "workspace:*",
    "@tanstack/react-query": "latest",
    "@radix-ui/react-dialog": "latest",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tailwindcss": "latest",
    "lucide-react": "latest",
    "zustand": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "latest",
    "@wxt-dev/module-react": "latest",
    "typescript": "^5.0.0",
    "wxt": "latest"
  }
}
```

---

## 4. apps/agent - 本地后端

Bun 1.3+ + Hono + Zod + Drizzle ORM。打包为 `dealpilot-agent.exe`。

```text
apps/agent/
├─ package.json
├─ tsconfig.json                 # extends 根 tsconfig.base.json
├─ drizzle.config.ts             # Drizzle Kit 迁移配置
├─ migrations/                   # Drizzle 生成的 SQL 迁移
│  └─ 0000_initial.sql
├─ src/
│  ├─ index.ts                   # Agent 入口（单实例锁、启动 HTTP 服务器）
│  ├─ server.ts                  # Hono app 装配
│  ├─ config/
│  │  ├─ env.ts                  # 端口、数据目录、token 配置
│  │  └─ constants.ts            # 应用版本、API 版本
│  ├─ db/
│  │  ├─ client.ts               # SQLite 连接（bun:sqlite 或 better-sqlite3）
│  │  ├─ schema.ts               # 引用 db-schema.ts（Drizzle 表定义）
│  │  └─ migrate.ts              # 迁移执行器
│  ├─ middleware/
│  │  ├─ auth.ts                 # Bearer Token 校验
│  │  ├─ origin-guard.ts         # Origin 白名单（只允许 127.0.0.1）
│  │  ├─ idempotency.ts          # Idempotency-Key 幂等
│  │  ├─ error-handler.ts        # 统一错误封装
│  │  └─ request-id.ts          # 请求追踪 ID
│  ├─ routes/                    # 按 Spec §5 API 端点组织
│  │  ├─ health.ts               # GET /health
│  │  ├─ customers.ts            # 客户 CRUD + merge + restore
│  │  ├─ contacts.ts            # 联系人 CRUD
│  │  ├─ social-accounts.ts     # 社媒账号
│  │  ├─ matches.ts             # 会话身份匹配 + bind/unbind
│  │  ├─ follow-ups.ts          # 跟进记录
│  │  ├─ reminders.ts           # 提醒 + popup
│  │  ├─ projects.ts            # 项目 + stage 切换
│  │  ├─ risks.ts               # 风险
│  │  ├─ milestones.ts          # 里程碑
│  │  ├─ imports.ts             # Excel/CSV 解析 + commit + errors
│  │  ├─ exports.ts             # Excel 导出
│  │  ├─ backups.ts             # 备份 + 校验 + 恢复
│  │  ├─ settings.ts            # 设置
│  │  └─ stats.ts               # 本地指标
│  ├─ services/                  # 领域服务
│  │  ├─ customer-service.ts     # 客户合并、软删除、恢复
│  │  ├─ match-service.ts        # 标准化、候选匹配
│  │  ├─ follow-up-service.ts
│  │  ├─ reminder-service.ts     # 状态流转、去重
│  │  ├─ project-service.ts
│  │  ├─ import-service.ts       # SheetJS/PapaParse 解析、事务导入
│  │  ├─ export-service.ts       # Excel 导出
│  │  └─ backup-service.ts       # SQLite 快照、Argon2id + AES-256-GCM
│  ├─ scheduler/
│  │  ├─ index.ts                # 提醒调度器入口
│  │  ├─ reminder-scheduler.ts   # 扫描到期提醒、补发、标记逾期
│  │  ├─ milestone-scheduler.ts  # 未完成里程碑到期前3天生成提醒
│  │  ├─ risk-scheduler.ts       # 风险连续7天未处理提升优先级
│  │  └─ cleanup-scheduler.ts    # 软删除30天后永久删除
│  ├─ platform/                  # 系统集成
│  │  ├─ tray.ts                 # node-systray 托盘
│  │  ├─ notifier.ts             # node-notifier 系统通知
│  │  ├─ browser-launch.ts       # 自动打开默认浏览器
│  │  ├─ native-messaging-host.ts # NM Host（4字节长度前缀 JSON 协议）
│  │  └─ single-instance.ts     # 单实例锁
│  ├─ utils/
│  │  ├─ crypto.ts               # Bun.password.hash (Argon2id) + AES-256-GCM
│  │  ├─ idempotency-store.ts    # 幂等键存储
│  │  └─ logger.ts                # 本地滚动日志，字段白名单
│  └─ types/
│     └─ env.d.ts
└─ tests/                        # bun:test
   ├─ routes/
   │  ├─ customers.test.ts
   │  ├─ matches.test.ts
   │  └─ ...
   ├─ services/
   │  ├─ merge.test.ts
   │  └─ ...
   └─ integration/
      └─ import-to-reminder.test.ts
```

### package.json

```json
{
  "name": "@dealpilot/agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build --compile --target=bun-windows-x64 src/index.ts --outfile dist/dealpilot-agent.exe",
    "start": "bun src/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/db/migrate.ts",
    "type-check": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@dealpilot/shared": "workspace:*",
    "hono": "latest",
    "@hono/zod-validator": "latest",
    "drizzle-orm": "latest",
    "zod": "latest",
    "xlsx": "latest",
    "papaparse": "latest",
    "node-systray": "latest",
    "node-notifier": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest",
    "@types/node-notifier": "latest",
    "typescript": "^5.0.0"
  }
}
```

### drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DEALPILOT_DB_PATH || "./data/dealpilot.db",
  },
});
```

---

## 共享包引用方式总结

| 引用方 | 引用方式 | 用途 |
|--------|---------|------|
| apps/web | `import { CustomerCreateSchema } from "@dealpilot/shared"` | 表单校验（RHF + zodResolver）、API 类型 |
| apps/extension | `import { FollowUpCreateSchema } from "@dealpilot/shared"` | Content Script 标记数据校验 |
| apps/agent | `import { CustomerCreateSchema } from "@dealpilot/shared"` | Hono `zValidator` 请求体校验 |

所有引用通过 pnpm workspace 协议 `"@dealpilot/shared": "workspace:*"`，无需发布到 npm。Vite 和 WXT 的 `resolve.alias` 指向 `packages/shared/src`，开发时直接走源码实现 HMR；生产构建时由 tsup 产出 `dist/` 供打包消费。

---

## 构建链

1. `pnpm install` 在根目录安装所有 workspace 依赖并建立符号链接
2. `pnpm dev` 并行启动 web（Vite dev server）、extension（WXT dev）、agent（Bun --hot）
3. `pnpm build` 按 Turborepo 依赖图编排：shared 先构建，再并行构建 web/extension/agent
4. agent 包的 `build` 脚本执行 `bun build --compile --target=bun-windows-x64`，将前端静态资源 + 后端代码 + 依赖打进单个 `dealpilot-agent.exe`
5. NSIS 安装包打包（CI 阶段）将 `dealpilot-agent.exe` + `sqlcipher.dll` + Native Messaging manifest 组装为 `DealPilot-Setup.exe`

## tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

各包 `tsconfig.json` 继承根配置并补充各自路径别名。
