# DealPilot V2.1 Monorepo 目录结构

> 状态：当前有效
> 日期：2026-08-03

当前工作树只包含 WebCloud、浏览器扩展、共享契约、API Client 和 Supabase/PostgreSQL。V1 Web、Agent、SQLite 业务运行时、SQLite 数据迁移包、EXE/NSIS、托盘和 Native Messaging 已退役；历史源代码仅保存在 `v1-local-final` Git tag。

## 顶层结构

```text
dealpilot/
├─ apps/
│  ├─ cloud/                 # React/Vite Web/PWA，唯一主界面
│  └─ extension/             # WXT 浏览器扩展，访问同一云端 API
├─ packages/
│  ├─ api-client/            # Auth/PostgREST/RPC/Edge 唯一网络边界
│  └─ shared/                # 共享 schema、枚举和纯业务规则
├─ supabase/
│  ├─ migrations/            # PostgreSQL schema、约束、RLS 和 RPC
│  ├─ functions/             # 受控 Edge Functions
│  └─ tests/                 # 数据库安全、事务和规模门禁
├─ scripts/                  # 发布、回滚、审计和退役门禁
├─ docs/                     # 当前 PRD、架构、数据字典和 runbook
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

## Workspace 白名单

`pnpm-workspace.yaml` 使用显式清单，不使用 `apps/*` 或 `packages/*` 通配符：

```yaml
packages:
  - "apps/cloud"
  - "apps/extension"
  - "packages/api-client"
  - "packages/shared"
```

这使新增运行时必须经过显式架构审查，不能通过创建目录自动进入构建图。

## 依赖方向

```text
apps/cloud ───────┐
                  ├─> packages/api-client ─> Supabase/PostgreSQL
apps/extension ───┘

apps/cloud ─────────> packages/shared
packages/api-client ─> packages/shared
```

- `apps/cloud` 和 `apps/extension` 不得直接拥有第二套业务传输层。
- 业务 wire JSON 只在 `packages/api-client` 边界解析。
- PostgreSQL migration、RLS、复合外键和事务 RPC 是云端一致性事实源。

## 关键命令

```bash
pnpm dev
pnpm type-check
pnpm lint
pnpm test
pnpm build
pnpm audit:v2
pnpm audit:retirement
```

## 退役约束

`scripts/check-v1-retirement.mjs` 和 CI 共同禁止以下内容重新进入当前工作树：

- `apps/web`、`apps/agent`
- Agent provider、本地 SQLite 业务页和本地业务 API
- `dealpilot-agent.exe`、NSIS、安装器与 Native Messaging host
- V1 OpenAPI 和 Drizzle schema 作为当前契约

需要查看历史实现时使用 `git show v1-local-final:<path>`，不得把历史目录复制回 V2 workspace。
