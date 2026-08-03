# DealPilot 基于 Atomic CRM 的个人云改造计划

> 状态：V1 运行时代码已退役；Supabase 开发项目持续部署验收中
> 日期：2026-08-03
> 目标版本：V2
> V1 基线：`codex/pragmatic-three-layer`
> 产品决策：`docs/DealPilot_PRD_V2.1_WebCloud.md`
> 当前架构决策：`docs/adr/ADR-V2-002-atomic-crm-personal-cloud.md`

## 1. 决策摘要

DealPilot V2 采用 [Atomic CRM](https://github.com/marmelab/atomic-crm) 作为云端 Web/PWA 和 PostgreSQL 数据模型的开源基线，不再新建 NestJS 云端 API。Atomic CRM 使用 MIT 许可证，技术栈为 React、Vite、Supabase/PostgreSQL、React Admin、TanStack Query、Zod 和 PWA，与 DealPilot 现有 React/Vite/TypeScript 工具链相近，并已提供联系人、公司、任务、提醒、笔记、交易、导入导出、联系人合并和活动历史等能力。

V2 是个人云 CRM，不提供团队 workspace、成员、角色和邀请。每个账号只能访问自己的业务数据；同一账号可在 Web、PWA 和浏览器扩展访问同一份 PostgreSQL 数据。这里取消的是团队型多租户产品结构，不取消公共云中不同用户之间必须具备的数据隔离。

“云端优先”在当前阶段落实为直接连接受控 Supabase 开发项目。开发者电脑只运行 Web/PWA 的 Vite 服务，不再维护本地 PostgreSQL 或本地 Supabase 业务运行模式。代码、migration、RLS、RPC、Storage 和 Auth 契约只允许有一套；开发和生产只替换部署地址、密钥与环境配置，不保留 SQLite 业务运行分支。

现有 DealPilot 的代码资产处理：

- `apps/cloud` 是当前唯一 Web/PWA 产品入口，直接使用 Supabase 开发或生产项目。
- `apps/web`、`apps/agent`、本地业务 API、EXE/NSIS、托盘和 Native Messaging 已从当前工作树删除；历史实现只保存在 `v1-local-final` tag。
- `packages/migration` 是唯一保留的 SQLite 能力，只读生成一致性快照和迁移 bundle，不承担业务 API。
- CI 执行 V1 runtime retirement gate，阻止旧入口、旧包名和 Agent 网络配置重新进入生产树。
- 用户确认迁移后，PostgreSQL 永久成为该账号的唯一业务事实源；SQLite 仅保留为只读迁移快照。

## 2. 目标与非目标

### 2.1 目标

- 复用 Atomic CRM 的现代 Web/PWA、联系人、公司、任务、交易、活动、导入导出和响应式能力。
- 使用 Supabase Auth 管理注册、登录、邮箱验证、密码重置和会话，不在 DealPilot 中存储密码。
- 使用 PostgreSQL RLS 和数据库约束实现严格的按用户数据隔离。
- 保持 Customer 列表、搜索、创建、详情、更新、软删除、恢复和合并与 V1 行为等价。
- Customer 详情继续包含联系人、社媒账号、项目/商机、跟进和提醒摘要。
- 保留 DealPilot 的项目、风险、里程碑、跟进、提醒和平台账号匹配能力。
- Web/PWA 和浏览器扩展通过同一个类型化客户端访问云端。
- 迁移工具只负责 SQLite 读取、预检、分批导入和快照取证；不进入业务运行时。
- 迁移可预检、可重试、可核对，确认前可撤销；确认后不建设 PostgreSQL 到 SQLite 的反向同步。

### 2.2 非目标

- V2 首版不支持团队、共享客户、成员角色、workspace 切换或企业 SSO。
- 不引入 NestJS、Keycloak、Drizzle PostgreSQL、微服务、Kubernetes 或长期双写。
- 不把 Atomic CRM 原样上线；其默认全员共享数据策略必须先改造。
- 不强制所有普通 CRUD 都经过自建代理 API；PostgREST 可作为受 RLS 保护的传输层。
- P3 前不批量迁移其他领域；首版不建设 Capacitor 或原生移动应用。
- 不追求与 Atomic CRM 上游持续无冲突同步；只按固定版本评估并选择性吸收上游更新。

## 3. 代码资产处理

| 资产                  | 处理方式     | 说明                                                                     |
| --------------------- | ------------ | ------------------------------------------------------------------------ |
| `apps/cloud`          | 新增         | 引入固定 commit 的 Atomic CRM 派生应用，承载 V2 Web/PWA                  |
| `apps/extension`      | 保留并改造   | 保留页面识别、匹配和快捷录入；由本地 API 切换到云端客户端                |
| `packages/shared`     | 选择性保留   | 业务枚举、Zod schema、格式化、迁移类型和纯业务规则继续复用               |
| `packages/api-client` | 新增         | 包装 Supabase Auth、PostgREST、RPC、Edge Functions、运行时解析和统一错误 |
| `packages/migration`  | 独立保留     | 只读 SQLite 快照和迁移 bundle；不依赖 V1 Web/Agent，不提供业务 API       |
| `supabase/`           | 新增         | schema、migration、RLS、数据库函数、Edge Functions、Storage 和本地配置   |
| V1 历史实现           | Git tag 保留 | 仅在 `v1-local-final` 中取证；当前工作树不保留可运行副本                  |

目标目录：

```text
apps/
  cloud/                 # Atomic CRM 派生的 V2 Web/PWA
  extension/             # WXT 浏览器扩展
packages/
  api-client/            # 唯一云端网络边界
  migration/             # SQLite 只读提取、快照和迁移 bundle
  shared/                # 纯业务类型、schema、枚举和工具
supabase/
  migrations/            # PostgreSQL schema、约束、RLS、函数
  functions/             # 迁移、设备配对、账号删除等编排
  tests/                 # 数据库和安全集成测试
```

Atomic CRM 上游代码进入仓库时必须记录仓库 URL、commit SHA、引入日期和 MIT 许可证，并保留版权声明。升级只允许从一个固定 commit 升到另一个固定 commit，先生成差异报告，再运行全部门禁。

## 4. 目标架构

```mermaid
flowchart LR
    WEB["Atomic-derived Web / PWA"] --> CLIENT["packages/api-client"]
    EXT["WXT Extension"] --> CLIENT
    MIG["SQLite migration / evidence tool"] --> CLIENT
    MIG --> SNAP["Read-only SQLite snapshot"]
    CLIENT --> AUTH["Supabase Auth"]
    CLIENT --> REST["PostgREST + RLS"]
    CLIENT --> RPC["Transactional PostgreSQL RPC"]
    CLIENT --> EDGE["Supabase Edge Functions"]
    REST --> PG[(PostgreSQL)]
    RPC --> PG
    EDGE --> PG
    EDGE --> STORAGE["Supabase Storage"]
```

### 4.1 职责边界

- React 页面只负责呈现和交互，通过 React Admin resource、TanStack Query hook 或 feature service 调用 `packages/api-client`。
- `packages/api-client` 是唯一允许直接依赖 `@supabase/supabase-js` 的业务网络层；`apps/cloud` 通过 ESLint 禁止业务代码直接导入 Supabase SDK 或调用全局 `fetch`，Gravatar、favicon、头像和 blob-source 等非业务媒体流集中到精确放行的非 React helper。
- 普通单表 CRUD 使用 PostgREST，但必须在客户端边界完成 Zod 解析和错误归一化。
- 合并、软删除、恢复、迁移提交和账号删除等跨表操作必须通过单个 PostgreSQL RPC 或 Edge Function 触发，并在一个数据库事务内完成。
- 纯业务规则继续放在可单元测试的 TypeScript 函数中；数据库一致性规则由约束、RLS、trigger 和事务函数兜底。
- Edge Function 负责身份校验、文件/批次编排和外部系统调用，不承载可以由数据库事务可靠完成的核心关系更新。
- 客户端永远不能获得 Supabase `service_role` 密钥。

### 4.2 网络契约

Atomic CRM 原生 DataProvider 和 PostgREST 不统一使用 `{ data }` 包络，因此 V2 将公共契约定义在 `packages/api-client` 的返回边界，而不是强制重写所有 PostgREST 响应：

- 调用者只获得已解析的领域对象或统一的 `ApiError`，不会看到 PostgREST/Supabase 原始响应。
- DealPilot 自有 RPC 和 Edge Function 的业务响应使用 `{ data }` / `{ error: { code, message, fields?, request_id } }`；PostgREST、Supabase Auth/Storage 等原生错误不强制符合该 wire envelope。
- PostgREST 的数据、计数和错误由适配器转换成同样的调用者语义。
- 网络 JSON 以 `unknown` 接收，使用 Zod 解析后才进入组件和缓存。
- `ApiError` 覆盖服务端错误、字段错误、RLS 拒绝、未认证、网络错误、取消和无法解析的成功响应；所有归一化后的 `ApiError` 都有稳定、非空的 `requestId`，优先使用服务端错误 body 中的 `request_id`，其次使用 `x-request-id` 响应 header，均缺失时由客户端生成。
- `AbortSignal` 必须从查询层传到请求边界。
- ESLint 禁止 `apps/cloud/src` 业务代码绕过 `packages/api-client`/DataProvider 直接访问网络；原始 `fetch` 只允许出现在明确列入 override 的非业务媒体 helper，不设置目录级或全局例外。

## 5. 身份与个人数据隔离

### 5.1 账号模型

- Supabase `auth.users` 是登录身份事实源。
- Atomic CRM 的 `sales` 表改造成用户资料表或由新的 `profiles` 表替代，一名 `auth.users` 用户只能拥有一个资料记录。
- V2 首版支持邮箱注册、邮箱验证、登录、密码重置和登出。
- Atomic CRM 的首位用户自动管理员、用户邀请和共享销售团队管理在个人版中禁用。
- 社交登录和外部 OIDC 作为后续可选项，不阻塞 P3；不在首版部署 Keycloak。

### 5.2 行级隔离

每张云端业务表必须包含：

```sql
owner_user_id uuid not null default auth.uid()
```

规则如下：

- SELECT/UPDATE/DELETE RLS：`owner_user_id = (select auth.uid())`。
- INSERT RLS：`owner_user_id = (select auth.uid())`；客户端不能替其他用户写入。
- 父表建立 `(owner_user_id, id)` 唯一约束。
- 子表使用 `(owner_user_id, parent_id)` 复合外键，数据库直接拒绝跨用户父子引用。
- 全局唯一值改为用户内唯一，例如社媒账号唯一约束为 `(owner_user_id, platform, normalized_identifier)`。
- RLS 未取得用户上下文时必须返回零行或拒绝写入，不能退化为全表访问。
- migration 使用独立高权限连接；浏览器、扩展和 Agent 只使用匿名 key + 用户会话。
- 后台任务若必须使用 `service_role`，必须显式携带目标 `owner_user_id`、验证任务所有权并写审计记录。

### 5.3 数据隔离验收

至少使用两个真实 Supabase 测试用户验证：

- 用户 A 无法列表、详情、更新、删除、导出或通过 RPC 访问用户 B 的数据。
- 伪造 `owner_user_id` 的 INSERT/UPDATE 被 RLS 拒绝。
- 跨用户父子 ID 即使已知也被复合外键拒绝。
- 删除或失效的会话不能继续访问 PostgREST、RPC、Storage 或 Edge Function。
- 直接 SQL 以 authenticated 角色执行时仍受 RLS 约束。
- Storage 对象路径按用户隔离，策略验证路径首段与 `auth.uid()` 一致。
- 构建产物和前端环境变量中不存在 `service_role`。

## 6. 数据模型与迁移映射

### 6.1 Atomic CRM 基线改造

| Atomic CRM 资源         | V2 用途              | 必要改造                                                       |
| ----------------------- | -------------------- | -------------------------------------------------------------- |
| `companies`             | DealPilot 客户主记录 | 增加 grade、status、source、country、deleted_at、owner_user_id |
| `contacts`              | 客户下的联系人       | 保留多邮箱/电话能力，增加 owner_user_id 和复合外键             |
| `contact_notes`         | 普通客户笔记         | 与跟进记录区分，增加 owner_user_id                             |
| `deals`                 | DealPilot 项目/商机  | 增加 probability、grade、closed_reason 和 owner_user_id        |
| `deal_notes`            | 项目笔记             | 增加 owner_user_id                                             |
| `tasks`                 | 通用待办 UI 基础     | 不直接替代 DealPilot 丰富提醒；通过适配器复用部分 UI           |
| `sales`                 | 当前用户资料         | 移除共享团队和管理员语义，或迁移为 `profiles`                  |
| `tags`、`configuration` | 用户标签和个人配置   | 增加 owner_user_id；configuration 不再是全局单行               |
| activity log view       | 活动展示             | 合并客户创建、笔记和 DealPilot 跟进事件，但不作为唯一事实表    |

### 6.2 V1 迁移分类

| V1 表             | V2 目标                 | 迁移规则                                                                          |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `customers`       | `companies`             | 完整迁移；名称、公司、国家、来源、等级、状态和软删除状态保真                      |
| `contacts`        | `contacts`              | 关联到迁移后的 company；邮箱和电话转换为 Atomic JSONB 结构                        |
| `social_accounts` | 新 `social_accounts`    | 完整迁移；唯一约束改为用户内唯一                                                  |
| `projects`        | `deals`                 | 阶段、金额、币种、概率、等级、预计关闭日和关闭原因完整映射                        |
| `follow_ups`      | 新 `follow_ups`         | 保留类型、备注、消息正文/方向、发生时间及 customer/deal 引用                      |
| `reminders`       | 新 `reminders`          | 保留完整状态机、优先级、站内提醒、稍后提醒和解决结果；不迁移 Windows 系统通知配置 |
| `risks`           | 新 `deal_risks`         | 关联迁移后的 deal，完整迁移                                                       |
| `milestones`      | 新 `deal_milestones`    | 关联迁移后的 deal，完整迁移                                                       |
| `import_jobs`     | 不迁移历史              | 云端仅为新导入和 V1 迁移创建任务                                                  |
| `local_events`    | `audit_events`/删除快照 | 不原样复制，只转换恢复和审计需要的记录                                            |
| `settings`        | `profiles/preferences`  | locale/theme 和产品设置上云；不再迁移托盘、开机启动或本地通知设置                 |

迁移顺序为：profile/preferences -> companies -> contacts -> social_accounts -> deals -> follow_ups -> deal_risks/deal_milestones -> reminders。每一批记录旧 ID、新 ID、数量、摘要和幂等键。

## 7. Customer 硬门槛

P3 不是完成 Atomic CRM 的 contacts CRUD，而是完成 V1 Customer 行为等价闭环。必须同时实现：

- 列表、搜索、过滤、分页、创建和详情。
- 更新、软删除、30 天内恢复和期满清理。
- 合并时按用户选择解决字段冲突，并重新关联联系人、社媒账号、项目/商机、跟进和提醒。
- 详情包含联系人、社媒账号、项目/商机、最近跟进和未完成提醒摘要。
- 删除客户时，将 pending/snoozed/overdue 提醒置为 ignored，并保存可恢复状态快照。
- 恢复客户时，只恢复由该次删除动作改变且此后未被其他操作覆盖的提醒状态。
- 合并、删除和恢复均在单个数据库事务内完成，失败时不允许部分更新。
- Web 云端页面使用 `packages/api-client`/DataProvider 适配器，不直接操作 Supabase。
- V1 与 V2 对同一组固定数据执行行为对照，输出差异报告。

P3 全部门禁通过前，不归档 V1 迁移夹具、不批量迁移其余领域；当前业务开发统一以 `apps/cloud` 和 Supabase 开发项目为准。原生移动端不在首版范围内。

## 8. 分阶段实施

| 阶段                  | 主要工作                                                                                         | 退出条件                                                                            |    预估 |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------: |
| G0A 决策修订          | 固定 Atomic CRM 方向；取消 NestJS/Keycloak/workspace；更新 PRD、ADR 和计划                       | 文档无相互冲突的已接受决策                                                          |  1-2 天 |
| P1 Atomic Cloud 基线  | 固定上游 commit；引入 `apps/cloud`；接入 pnpm/Turbo；连接 Supabase 开发项目；保留许可证；建立 CI | Atomic 登录、联系人、公司、任务和交易在开发项目可用合成数据运行；构建和测试通过     |  3-4 天 |
| P2 个人账号与隔离     | 改造 profile；禁用团队管理；所有业务表增加 owner_user_id、RLS、复合约束和 Storage 策略           | 两用户隔离矩阵、直接 RLS 查询和跨用户父子引用测试全部通过                           |  5-8 天 |
| P3 Customer 纵向切片  | 数据模型映射；类型化客户端；完整 Customer 行为；原子合并/删除/恢复；关联详情；V1/V2 对照 E2E     | 第 7 节全部通过并签字确认                                                           | 8-12 天 |
| P4 DealPilot 领域补齐 | 项目/商机、风险、里程碑、跟进、提醒、Dashboard、导入导出；复用 Atomic UI                         | V1 适用业务验收项在 V2 全部通过                                                     | 7-10 天 |
| P5 SQLite 一次性迁移  | 快照、预检、分批迁移、幂等、校验、确认；Agent 收敛为迁移工具；V1 Web 归档                        | 确认前可撤销；确认后 PostgreSQL 为唯一事实源；迁移演练通过；不保留 SQLite 运行模式  |  5-7 天 |
| P6 扩展与 PWA          | 扩展云端登录、会话匹配与单条消息跟进；PWA 安装、更新和离线应用壳                                | Web/PWA/扩展共用客户端；PWA 安装与离线应用壳、扩展核心流程通过                       |  3-5 天 |
| P7 灰度发布与 V1 退役 | 监控、限流、备份恢复、账号删除、隐私告知、试点和回滚演练；删除 V1 活动运行代码                   | 生产发布门全部通过；试点迁移成功；只在 `v1-local-final` Git 标签和迁移夹具中保留 V1 |  3-4 天 |

单人全职预计约 8-13 个开发周，规划基准为 10 周。该估算不包含真实用户试点等待、浏览器扩展商店审核、跨境数据合规和上游重大升级。Supabase 开发项目或邮件测试服务不可用期间，P1/P2 数据库门禁不能验收。

### 8.1 当前实施进度（2026-08-03）

| 阶段 | 状态 | 当前证据 | 剩余退出条件 |
| --- | --- | --- | --- |
| G0A | 已完成 | PRD、ADR、Atomic 基线和 `v1-local-final` tag 已建立 | 无 |
| P1-P4 | 代码与 CI 门禁已通过 | Web/PWA、API Client、业务域、RLS/RPC/Storage、真实 Supabase provider E2E 已进入 CI | 托管 Supabase、真实邮件 Auth 和产品签字验收 |
| P5 | 工具完成，演练待验 | 独立 `packages/migration` 只读快照/分类/bundle，云端暂存、核对、确认和放弃 RPC | 托管 Supabase 上执行真实 V1 迁移确认演练 |
| P6 | PWA 完成，扩展待发布验收 | PWA 安装/离线壳和扩展自动化测试通过 | WhatsApp/Telegram 真实 DOM 与商店合规 |
| P7 | 旧运行时退役完成，发布待验 | `apps/web`、`apps/agent`、安装器、Agent provider 已删除并有 CI 退役门禁 | canary、生产回滚、账号删除、备份恢复和合规评审 |

### 8.2 2026-08-01 历史实施快照

| 阶段 | 状态                       | 已完成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 尚未满足的退出条件                                                                                                                                                                                                                |
| ---- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0A  | 已完成                     | PRD、Atomic 个人云 ADR、V1 最终标签和独立改造分支已建立                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 无                                                                                                                                                                                                                                |
| P1   | 代码基线完成，CI 通过       | 固定并引入 Atomic CRM；保留 MIT 和来源；接入 pnpm/Turbo；Cloud、V1 与 API 客户端可构建和测试；增加隔离的合成数据 `dev:demo` 和 GitHub Actions 质量/数据库门禁                                                                                                                                                                                                                                                                                                                                                                                            | Supabase 开发项目、Auth、Storage 和邮件流程尚未完成托管环境验收                                                                                                                               |
| P2   | 本地运行门禁通过，托管验收待验 | 个人 profile、团队入口移除、19 张表的 owner 隔离、RLS、复合外键、私有 Storage、双用户 SQL 测试和临时 Supabase CI 验证已通过                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 托管 Supabase migration、RLS、复合外键、Storage 和 RPC 隔离矩阵仍需在开发项目复核                                                                                                                                    |
| P3   | 本地运行门禁通过，托管验收待验 | 单例 `packages/api-client`/React Admin DataProvider、严格 Customer 契约、结构化服务端过滤与稳定多字段排序、Customer 字段/表单/响应式列表、五类关联详情、删除/恢复/回收站/六字段合并 UI，以及合并/软删除/恢复 RPC 和提醒快照/CAS 已建立；Customer 操作已通过端口隔离 Cloud 与测试适配器，`dev:demo` 仅用于隔离 UI 回归；固定 Customer 行为夹具及纯 TypeScript V1/V2 对照基线已入库；Supabase 双用户 browser、REST、RPC、Edge、复合外键和 Storage E2E 已在 CI 临时 Supabase 执行通过；30 天清理的 durable queue、受限 RPC、Edge Function 和授权测试已静态完成 | 托管 Supabase 迁移确认、真实 Auth/PKCE 邮件流程、V1 与 Supabase 同 seed 差异报告，以及确认后旧 V2 API 继续读取 PostgreSQL 的回滚演练未通过 |
| P4   | 本地运行门禁通过，托管验收待验 | 中文 Dashboard、Customer、项目、跟进、提醒、风险、里程碑、导入导出和备份恢复已接入 Atomic 前端；项目阶段契约、Storage owner 路径、联系人合并和非 Customer wire schema 缺口均已修复；类型检查、lint、测试、构建和临时 Supabase 门禁已通过                                                                                                                                                                                                                                                                                                                                                                         | 托管 Supabase 的真实 Auth、双账号隔离、迁移确认和回滚演练尚未完成；旧 Agent/SQLite 证据只作为迁移基线                                                                                                   |

2026-08-01 增量实施记录：

- P3 已补 owner-scoped 稳定游标、前后翻页适配和写后游标失效；临时 Supabase CI 的 browser/REST/RPC/Edge/FK/Storage E2E 已通过，覆盖创建、更新、搜索、筛选、排序、分页、关联详情、合并、删除/恢复与提醒联动。
- P4 已补提醒状态服务端幂等、CSV/XLSX 云端事务导入、加密云备份和原子恢复；项目阶段契约、Storage owner 路径、联系人合并及非 Customer wire schema 缺口均已修复，本地和临时 Supabase 运行门禁通过，托管开发项目验收待完成。
- P5 的 SQLite 只读快照、11 表分类、预检、分批上传、核对、确认和放弃已静态实现；托管 Supabase 迁移演练仍未完成。
- P6 的 PWA manifest、Service Worker 和离线应用壳已通过 Chromium 门禁；PWA 不承诺离线业务写入，扩展真实平台 DOM 与商店合规仍待验收。
- P7 的 preview/canary/production 发布顺序、向前兼容 migration 检查、应用版本回滚、release marker/smoke 和每日清理 workflow 已实现；当前分支的 GitHub CI 已通过，真实 canary 与生产回滚演练仍未完成。

2026-07-31 已记录的历史本地验收证据（不替代 Web/Cloud 门禁）：

- Cloud demo E2E 为 4/4，通过桌面和移动视口的 Customer 及全领域合成数据流程。
- 真实 Agent/SQLite E2E 为 5/5，通过旧本地迁移源的桌面/移动流程；该证据只用于行为基线和迁移核对。
- Agent 提醒 AC-13～17 的服务、调度器和临时 SQLite 集成测试通过；覆盖精确 5 分钟窗口、启动立即补扫、`last_notified_at` 去重、稍后到期重入、单项失败隔离、3 天逾期排序权重和手动 `replied -> pending`。
- Extension 为 38/38 测试、102 项断言；Content Script 只通过 Background 白名单 RPC，生产 bundle/source 的 token、Authorization、storage 和直接 `fetch` 扫描均为 0 命中。popup 与 Content 均可完成、稍后、忽略提醒，等待回复提醒可手动确认已收到回复。
- Agent 为 54/54 测试、240 项断言；这些测试只证明旧 SQLite 迁移源和转换工具行为，不证明云端后端完成。
- Cloud `type-check`、`lint`、构建和 demo E2E 已通过；这些结果是前端和合成数据证据，不用于宣告 Supabase/PostgreSQL 阶段完成。
- 1000 行导入性能和编译 Agent 启动数据保留为历史基线，不再作为当前 Web/Cloud 发布指标。

功能审计口径：当前产品只接受 Atomic Web/PWA + Supabase 开发/生产项目的云端实现。`dev:demo` 仅用于隔离的 UI 回归；Agent/SQLite 仅作为迁移输入和历史行为基线。旧 `apps/web` 不再作为产品入口。

以上历史证据不能替代托管 Supabase 开发项目的事务、用户隔离、Auth、Storage、RPC 和迁移回滚验收。双用户 browser、REST、RPC、Edge、复合外键和 Storage runner 已在 GitHub CI 的临时 Supabase 通过；托管开发项目和迁移回滚仍待验收，因此 P3 仍未通过。

P3 剩余硬门槛必须逐项产生可复核证据：

1. 在 Supabase 开发项目执行真实 migration，并在 PostgreSQL/Auth/Storage 上通过 RLS、复合外键、Storage 策略、Customer RPC 和 30 天清理队列/Edge Function 测试。
2. 使用真实邮件测试服务通过注册、邮箱验证、PKCE 回调、登录、密码重置、会话刷新和登出流程。
3. V1 API 与 Supabase 使用同一固定 Customer seed 执行完整行为对照，并输出无未解释差异的报告；纯 TypeScript fixture 只定义裁判数据和预期。
4. 在 Supabase 开发项目使用两个真实测试用户执行已就绪的 browser、PostgREST、RPC、Storage、Edge Function 和复合外键隔离 E2E，包括伪造 owner 与跨用户父子引用，并在远端 CI 复现结果。
5. 在用户确认迁移后的语义下，部署上一兼容 V2 API 并证明其继续读取 PostgreSQL；不得把切回 SQLite 或旧快照视为回滚成功。

阶段状态只由退出条件决定。代码存在、SQL 能被解析或单元测试通过，均不能替代 Supabase 开发项目、浏览器 E2E 和回滚演练。

## 9. 测试与质量门禁

### 9.1 每阶段通用门禁

- `lint`、`type-check`、单元测试、构建和相关 E2E 全部通过。
- 数据库 migration 可从空库重复执行，并可从上一个发布版本向前升级。
- 所有网络响应在边界解析；组件不存在直接 `fetch`/Supabase 查询。
- 关键业务规则有不依赖网络和数据库的单元测试。
- RLS、复合外键、数据库函数和触发器使用 Supabase 开发项目或 CI 临时数据库做集成测试。
- 日志不得记录访问令牌、密码、完整消息正文或不必要的客户敏感字段。

### 9.2 客户端契约测试

- 正常 PostgREST 列表、详情、分页和计数。
- RPC/Edge Function 的成功包络、字段错误和业务冲突。
- PostgREST JSON/非 JSON 错误、401、403/RLS、404 和 409。
- 网络失败、请求取消、过期会话、刷新失败和无法解析的成功响应。
- Zod schema 漂移必须产生 `INVALID_RESPONSE`，不能把未知结构放入缓存。

### 9.3 Customer 行为对照

- `packages/api-client/test/fixtures/customer-behavior.ts` 固定确定性的 Customer、联系人、社媒账号、项目/商机、跟进、提醒、时间和 ID，关键期望不得由被测业务规则反向生成。
- 纯 TypeScript 对照基线同时通过 V1 公共 schema 与 V2 严格 schema，覆盖列表/搜索/过滤/分页、创建默认值、五类详情摘要、六字段更新/合并、软删除、恢复和提醒状态联动。
- 该基线用于约束后续 runner，不表示 V1 与 Supabase 已实际等价。P3 只接受两个真实运行端使用同一 seed 产生的输出与差异报告。

### 9.4 迁移测试

- 使用当前 11 张表的合成夹具验证数量、关联、摘要和时间字段。
- 重复提交、断点重试、乱序批次、部分失败和最终确认均幂等。
- 确认前失败或中止不得修改原 SQLite，必须释放迁移锁并恢复本地写入。
- 确认时再次比较快照指纹；指纹变化必须阻止确认。
- `import_jobs` 不迁移，`local_events` 只产生预期的审计/恢复转换结果。
- 迁移后抽样运行 Customer、项目、跟进和提醒业务对照。

## 10. 发布、回滚与数据保留

1. Cloud Beta 默认关闭；尚未迁移的 V1 用户通过独立只读迁移工具提取旧 SQLite，不能把旧本地模式作为 V2 产品入口或长期运行后端。
2. 用户显式登录并同意云端存储后才能创建迁移任务。
3. 迁移期间暂停本地写入并创建 SQLite 一致性快照。
4. 用户确认前可放弃迁移并清理未确认的云端暂存数据；迁移工具不得修改 SQLite 源文件。
5. 用户确认后 PostgreSQL 永久成为唯一事实源，本地数据库进入只读快照状态。
6. 发布回滚通过部署上一兼容应用版本完成；migration 必须向后兼容，不以切回 SQLite 或降级数据库作为成功条件。
7. 本地快照至少保留 30 天，仅用于核对、取证和重新迁移。
8. 客户软删除保留 30 天；账号关闭提供 30 天撤销期，之后按发布前确认的删除 SLA 清理主库、Storage 和备份。
9. 上游 Atomic CRM 升级与 DealPilot 发布分开执行，不在故障回滚时同时升级上游。
10. `apps/web`、`apps/agent`、安装器、Native Messaging 和 Cloud Agent provider 已删除；历史实现只保留在 `v1-local-final` 标签中，CI 退役门禁禁止其回流。

30 天 Customer 期满清理当前已静态实现为 durable queue + Edge Function：数据库只负责排队、租约、重试状态和最终关系删除，Edge Function 负责 replay-safe Storage 删除；队列保留操作证据且浏览器角色不可访问。该实现必须在 Supabase 开发项目中验证 service-role 授权、Cron/Vault 调用、租约回收、失败重试、路径变化重排队、Storage 删除和最终级联后，才能计为 P3 已通过。

必须分别演练：迁移确认前撤销；确认后回滚到上一 V2 应用版本继续读取 PostgreSQL；账号删除；数据库和 Storage 备份恢复。

## 11. 主要风险

| 风险                             | 影响                        | 控制措施                                                                                |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| Atomic 默认 RLS `using (true)`   | 公共云用户数据泄露          | P2 前禁止处理真实数据；逐表替换策略并运行双用户隔离矩阵                                 |
| Atomic 合并由前端多请求编排      | 部分更新和数据丢失          | 改为单个 PostgreSQL 事务函数，前端只发一个命令                                          |
| Atomic 模型与 V1 Customer 不同   | 字段或关联语义丢失          | 明确映射表、固定夹具、V1/V2 行为对照和迁移摘要                                          |
| Supabase 调用散落组件            | 难以解析、测试和更换后端    | 唯一 api-client/DataProvider 边界和 ESLint 限制                                         |
| `service_role` 泄漏              | 绕过全部 RLS                | 仅服务端 secret；构建产物扫描；客户端只用 anon key + session                            |
| Atomic 上游快速变化              | 合并冲突和回归              | 固定 commit、保留来源记录、按版本升级、P3 期间冻结上游                                  |
| React 18/19、Tailwind 3/4 并存   | 依赖和样式冲突              | `apps/cloud` 独立 package，P3 前不强制升级 V1 应用                                      |
| Supabase 平台绑定                | 迁移成本                    | PostgreSQL schema/migration 入库；业务事务使用标准 SQL；对象接口集中在适配器            |
| Supabase 开发项目不可用          | 无法验证 Auth/RLS/Functions | 恢复开发项目或切换到 CI 的临时 Supabase 环境；不得使用真实生产数据替代测试数据          |
| Vite 构建存在 chunk size warning | 首屏加载和缓存粒度可能劣化  | 记录当前 warning，后续按路由和重依赖拆包；必须用构建产物与 E2E 验证，不能仅隐藏阈值告警 |

## 12. 完成定义

V2 完成必须同时满足：

1. 用户可以注册、验证、登录、重置密码和删除账号。
2. 两个不同用户在同一 Supabase 项目中无法以任何受支持入口访问彼此数据。
3. Customer、项目/商机、跟进、提醒、风险和里程碑达到 V1 行为等价。
4. Web、PWA 和浏览器扩展使用同一类型化云端客户端；移动浏览器复用响应式 Web/PWA。
5. 迁移工具退出或不存在不影响云端业务；它只负责一次性 SQLite 迁移、快照读取和取证。
6. SQLite 迁移可校验、可重试，确认前可撤销，确认后 PostgreSQL 永久为事实源。
7. 备份恢复、账号删除、日志脱敏、依赖扫描和部署回滚演练通过。
8. Atomic CRM 许可证、上游来源、改造说明、部署手册和 [PostgreSQL 数据字典 V2.1](./DealPilot_PostgreSQL_数据字典_V2.1.md) 完整。
9. 活动代码树中不存在第二套 V1 CRM；仅保留 V2 Cloud、扩展、独立迁移工具和 V1 Git 标签。

## 13. 首批 12 个可执行任务

1. 更新 G0 PRD；新增 Atomic CRM ADR；将 NestJS ADR 标记为 Superseded。
2. 给当前 V1 提交建立不可变基线标签，并创建独立的 Atomic 改造分支。
3. Fork Atomic CRM，记录固定 commit、MIT 许可证和上游同步策略。
4. 配置并验证 Supabase 开发项目和邮件测试服务。
5. 将 Atomic CRM 引入 `apps/cloud`，接入 pnpm/Turborepo，确保 V1 应用仍能独立构建。
6. 建立 V1 到 Atomic/V2 的完整字段、状态和关联映射测试夹具。
7. 将 `sales` 改造成个人 profile，完成注册、验证、登录、重置和登出流程。
8. 为全部 Atomic 业务表增加 `owner_user_id`、用户内唯一约束、复合外键、RLS 和 Storage 策略。
9. 创建 `packages/api-client` 和 React Admin DataProvider 适配器，统一解析、错误和取消，禁止散落 Supabase 调用。
10. 实现 Customer 扩展字段、社媒账号、跟进、提醒摘要及相关详情查询。
11. 将合并、软删除、恢复和提醒联动实现为原子数据库命令，并完成安全/失败回滚测试。
12. 切换 V2 Customer 页面并运行 V1/V2 行为对照、两用户隔离、契约和回滚 E2E，签字确认 P3 硬门槛。

第 12 项通过前，不开始其余领域批量迁移或生产 Cloud Beta；原生移动端不在首版范围内。
