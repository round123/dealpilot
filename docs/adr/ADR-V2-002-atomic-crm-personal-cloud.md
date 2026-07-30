# ADR-V2-002：采用 Atomic CRM 构建个人云版本

> 状态：Accepted
> 日期：2026-07-30
> 决策人：DealPilot 项目负责人
> 取代：`ADR-V2-001-cloud-modular-monolith.md` 中的 NestJS、Drizzle PostgreSQL、Keycloak、workspace 和 OpenAPI 客户端决策

## Context

DealPilot V1 已实现 React/Vite Web、Bun/Hono Agent、WXT 扩展和 SQLite 业务模型。原 V2 方案计划从空白 NestJS API 开始重建认证、PostgreSQL、多端契约和 CRM 领域。调研后确认 Atomic CRM 已以 MIT 许可证提供 React/Vite、Supabase/PostgreSQL、认证、联系人、公司、任务、交易、活动、导入导出、联系人合并和 PWA，能够减少基础 CRM 的重复实现。

产品范围同时收敛为个人云 CRM。首版用户需要账号、跨设备访问和云端恢复，不需要 workspace、团队成员、角色、邀请或企业 SSO。公共云仍必须隔离不同账号的数据。

Atomic CRM 不能原样上线：其当前业务表没有个人所有权字段，RLS 策略大量允许所有 authenticated 用户访问；联系人合并由前端编排多个请求；Customer 软删除、恢复和提醒联动也不满足 DealPilot 行为。

## Decision

1. 使用固定 commit 的 Atomic CRM 作为 V2 Web/PWA 和 Supabase/PostgreSQL 基线，保留上游来源与 MIT 许可证。
2. 在现有 monorepo 中新增 `apps/cloud`，P3 Customer 门槛前完整保留 `apps/web` 作为 V1 行为基线和确认前回退路径。
3. 使用 Supabase Auth 管理个人账号。首版支持邮箱注册、验证、登录、密码重置和会话，不部署 Keycloak。
4. 不建设 workspace、成员关系或角色。所有云端业务表包含 `owner_user_id`，通过 `auth.uid()` RLS、用户内唯一约束和复合外键实现账号隔离。
5. 普通 CRUD 使用受 RLS 保护的 PostgREST；跨表关键操作使用原子 PostgreSQL RPC，文件和长流程使用 Edge Functions 编排。
6. 新增 `packages/api-client` 作为 Web/PWA/mobile/extension 的唯一云端网络边界，包装 Supabase Auth、PostgREST、RPC 和 Edge Functions，并负责运行时解析、取消和错误归一化。
7. Atomic React Admin DataProvider 必须依赖该客户端适配器；业务组件不得直接调用 `fetch` 或 Supabase SDK。
8. Customer 合并、软删除、恢复、提醒状态联动和迁移提交必须在数据库事务内完成。
9. 现有 Agent 保留 SQLite 迁移、托盘、通知和 Native Messaging；用户确认迁移后不再承担主业务 API 或主数据库职责。
10. PostgreSQL 在用户确认迁移后永久成为唯一事实源，不建设回写 SQLite 的同步链路。

## Dependency Rules

```text
React feature / React Admin resource
              -> packages/api-client
                    -> Supabase Auth adapter
                    -> PostgREST adapter
                    -> RPC adapter
                    -> Edge Function adapter

PostgreSQL constraints + RLS + transaction functions
              -> enforce ownership and consistency
```

- 业务组件不导入 `@supabase/supabase-js`。
- Wire JSON 在客户端边界以 `unknown` 接收并解析为领域类型。
- 纯业务规则不依赖 React、Supabase SDK 或数据库连接，可使用内存数据做单元测试。
- 数据库事务函数默认使用调用者权限并受 RLS 约束；确需 `SECURITY DEFINER` 时必须固定 `search_path`、验证 `auth.uid()`、最小化授权并单独审计。
- `service_role` 只存在于受控服务端环境，不得进入浏览器、扩展、移动端或 Agent 构建产物。

## Consequences

### Positive

- 复用成熟 CRM UI、PWA、认证接入、普通 CRUD、导入导出和测试资产。
- 保持 React/Vite/TypeScript 技术连续性，避免同时维护自建 NestJS API。
- PostgreSQL、migration 和标准 SQL 仍掌握在仓库中，可限制 Supabase 平台绑定。
- 个人所有权模型显著低于团队 workspace/角色系统的复杂度。

### Negative

- 必须系统性重写 Atomic 的 RLS，不能依赖其默认安全策略。
- Atomic 与 V1 数据模型不同，需要明确映射和行为对照。
- Supabase/PostgREST 与原计划 OpenAPI 包络不同，需要自有客户端适配层稳定调用语义。
- 上游升级可能与 DealPilot 的 schema、认证和业务事务改造冲突。
- 本地开发依赖 Docker Desktop 和 Supabase CLI。

## Rejected Alternatives

- **继续从零建设 NestJS API**：技术上可行，但会重复实现 Atomic 已具备的认证、CRM UI、CRUD、导入和 PWA，不能满足当前优先级。
- **Atomic CRM 原样部署**：默认 authenticated 全表访问和非原子合并不满足公共云安全与数据一致性要求。
- **每名用户部署独立 Atomic/Supabase 实例**：隔离简单，但部署、升级、备份和成本随用户线性增长，不适合 Cloud Beta。
- **保留 workspace 作为隐藏租户**：未来兼容性更强，但当前没有团队需求，会增加表、授权、UI 和测试范围。
- **废弃 V1 仓库直接在 Atomic 仓库重写**：会丢失 Agent、扩展、迁移源、领域逻辑和行为测试，并放大一次性切换风险。

## Validation

本决策在 P3 Customer 纵向切片后复核。只有在两用户隔离矩阵、Customer 行为等价、原子合并/删除/恢复、唯一客户端边界、SQLite 迁移预演和应用版本回滚全部通过后，才允许批量迁移其他领域或启动移动端。
