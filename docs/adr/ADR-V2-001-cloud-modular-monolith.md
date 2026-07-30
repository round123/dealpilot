# ADR-V2-001：云端模块化单体与 PostgreSQL 单一事实源

> 状态：Superseded
> 日期：2026-07-30
> 决策人：DealPilot 项目负责人
> 取代：V1 “SQLite 是永久唯一业务数据源”的架构决策
> 被取代于：`ADR-V2-002-atomic-crm-personal-cloud.md`

> 说明：PostgreSQL 在迁移确认后成为唯一事实源、Agent 收敛为本机能力桥接等结论继续有效；NestJS、Drizzle PostgreSQL、Keycloak、workspace 和 OpenAPI 生成客户端等结论已由 ADR-V2-002 取代。

## Context

V1 面向单人 Windows 本地使用，Bun Agent 同时承载业务 HTTP API、SQLite 主数据库和本机能力。V2 需要账号、workspace、多设备访问、数据恢复、Web/PWA/mobile 和浏览器扩展共用契约。继续以每台设备的 SQLite 为主数据源会引入多主冲突，无法提供清晰的租户隔离、权限撤销和跨设备一致性。

当前 TypeScript 代码已经形成 `routes -> services -> repositories -> db/platform` 的务实三层。主要风险在身份、租户、迁移和产品边界，不在语言性能，因此不同时更换语言、ORM 和业务模型。

## Decision

1. 新建 NestJS 云端 API，采用按业务模块组织的模块化单体，不拆微服务。
2. PostgreSQL 成为用户确认迁移后的业务数据唯一事实源；SQLite 仅作为迁移来源和只读迁移快照，不建立长期双向同步。
3. 保留 Drizzle ORM，但云端使用 PostgreSQL schema 和独立 migration。
4. 模块内部保持 Controller、Service、Repository 三层；Controller 不访问 ORM，Service 不依赖 HTTP，Repository 不反向依赖上层。
5. 跨模块能力通过目标模块导出的应用服务或查询服务调用，不直接查询其他模块的表。
6. REST + OpenAPI 是跨端公共契约；生成客户端和运行时解析器是 Web、PWA、mobile 和 extension 的唯一网络边界。
7. 身份使用 Keycloak OIDC。OIDC 只证明主体，workspace 成员关系和角色由应用数据库授权。
8. 本地 Agent 保留 Bun/Hono，只负责设备配对、迁移、托盘、通知和 Native Messaging，不再承担云端业务 API 或主数据库职责。
9. 本地开发使用容器化 PostgreSQL 和 Keycloak；Cloud Beta 的生产首选区域为新加坡，真实数据上线前受独立生产发布门约束。

## Dependency Rules

```text
controller -> application service -> repository port
                                  -> exported module service
repository adapter -> Drizzle/PostgreSQL
```

- 应用服务可以依赖抽象 Repository port，不依赖 Drizzle 实现。
- Repository adapter 负责持久化映射，不泄露数据库 row type 给 Controller 或其他模块。
- 组合页面由应用服务编排模块导出的查询服务；不得建立跨模块 Repository 依赖。
- Windows、Keycloak、PostgreSQL、对象存储和消息队列代码位于适配器或基础设施边界。

## Consequences

### Positive

- 云端只有一个主数据源，避免双写和冲突合并协议。
- TypeScript、Drizzle 和现有业务规则可以渐进迁移。
- 模块边界可以先在单体内验证，将来只有在观测数据支持时才拆服务。
- OIDC、租户授权和本机能力职责清晰，可分别测试和运维。

### Negative

- V1 的“不上传客户数据”承诺必须由新的隐私告知和明确同意取代。
- SQLite 到 PostgreSQL 需要一次性、可校验的迁移工具。
- NestJS 与现有 Hono API 会在迁移期并存，需要兼容窗口和行为对照测试。
- 自托管 Keycloak 增加补丁、备份、密钥轮换和可用性责任。

## Rejected Alternatives

- **SQLite 与 PostgreSQL 长期双主**：需要冲突、顺序、重试和部分失败协议，超出第一阶段范围。
- **直接把现有 Bun/Hono Agent 部署为云 API**：会继续混合 Windows 平台能力和云端业务职责，也缺少约定统一的身份与模块基础设施。
- **立即拆微服务**：当前团队规模和负载没有证明其收益，反而增加部署和数据一致性成本。
- **改用 GoFrame 或 Spring Boot**：不能消除身份、租户和迁移风险，并会扩大迁移面。
- **自行实现账号密码体系**：安全与合规成本不可接受，标准 OIDC 服务已经覆盖所需能力。

## Validation

该决策在 P3 Customer 纵向切片通过后复核。只有当本地/云端行为等价、租户双层隔离、生成客户端契约和上一兼容云端 API 回滚全部通过，才允许批量迁移其他领域或启动移动端工作。
