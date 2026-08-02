# DealPilot PRD V2.1：Web 与云端优先

> 状态：当前产品需求基线，取代 V1 本地桌面方案
> 日期：2026-08-01
> 产品形态：Web/PWA + 云端模块化单体 + PostgreSQL；浏览器扩展作为后续入口
> 关联架构：[云端个人 CRM 重构计划](./cloud-multiplatform-refactor-plan.md)
> 关联决策：[ADR-V2-002](./adr/ADR-V2-002-atomic-crm-personal-cloud.md)
> 数据字典：[PostgreSQL 数据字典 V2.1](./DealPilot_PostgreSQL_数据字典_V2.1.md)

## 1. 文档关系与决策

本文件是当前唯一有效的产品需求文档。`外贸经理个人工作台_PRD_V1.5.md` 和
`外贸经理个人工作台_系统架构设计_V1.3.md` 仅作为历史本地行为和迁移来源，不再作为
当前产品入口、后端或发布验收依据。

核心决策：

1. 所有业务后端能力按云端实现，使用 Supabase/PostgreSQL、RLS、RPC/Edge Functions 和统一 API 客户端。
2. PostgreSQL 是唯一业务事实源。开发和生产均使用托管 Supabase/PostgreSQL 项目；开发项目不是另一套业务架构。
3. Web 工作台是首要产品界面，PWA 复用同一 Web 应用；不建设桌面壳、托盘或安装器作为产品入口。
4. SQLite/Agent 只用于旧 V1 数据读取、预检、一次性迁移和取证，不参与云端业务读写，不与 PostgreSQL 长期双写。
5. 首版是个人云 CRM：每个账号拥有自己的业务数据。不建设团队 workspace、成员、角色、邀请或企业 SSO。
6. 用户确认迁移后，PostgreSQL 永久成为唯一事实源，不提供云端回写 SQLite 的运行模式。

当前实现口径（2026-08-01）：Web/PWA、统一 API 客户端、Customer 与业务域界面、
导入/导出、加密云备份、V1 一次性迁移、浏览器扩展及发布/回滚自动化已完成静态实现和
本地门禁。托管 Supabase 的空库 migration、双账号隔离、真实 Auth、外部平台 DOM、
迁移确认与生产回滚演练仍是发布前验收项；在这些证据产生前不得宣称云端发布完成。

## 2. 分阶段运行形态

### 2.1 云端开发与验收

开发阶段直接使用受控的 Supabase 开发项目，Web/PWA 与生产使用同一套云端运行模型：

- PostgreSQL、Auth、Storage、Realtime（如需要）和 Edge Functions 均运行在 Supabase 开发项目。
- Web/PWA 通过 `packages/api-client` 访问开发项目 URL；本机只运行 Vite 开发服务器，不运行第二套业务数据库。
- 使用开发项目中的测试账号和合成数据，不导入真实客户资料。
- RLS、复合外键、RPC、Storage 策略、备份恢复和迁移测试在开发项目和 CI 门禁中执行。
- 不要求 Docker、Supabase CLI、`exe`、NSIS、托盘、开机自启或 Windows 系统通知。

### 2.2 云端发布

- Web/PWA 部署到静态托管或边缘平台。
- PostgreSQL、Auth、Storage、Edge Functions 使用受控云环境。
- OIDC/Supabase Auth 令牌只证明用户身份；业务查询通过 RLS 和服务端授权限制到当前用户数据。
- 所有客户端继续使用同一个类型化 API 客户端，不能直接在组件中调用 Supabase 或 `fetch`。
- 生产发布前完成隐私、跨境数据、备份恢复、账号删除和安全事件流程评审。

## 3. 用户与核心流程

目标用户是以 WhatsApp Web/Telegram Web 为主要沟通渠道的个人外贸经理。

核心流程：

1. 用户在 Web 注册或登录个人账号。
2. 用户在 Web 导入客户资料并处理重复候选。
3. 用户维护客户、联系人、社媒账号、项目、跟进、提醒、风险和里程碑。
4. 用户在 Web 查看 Dashboard、客户详情、项目详情和提醒列表。
5. 后续扩展接入 WhatsApp/Telegram 会话匹配、人工绑定和单条消息跟进。
6. 用户可以导出数据、创建云端备份或发起本地 V1 数据迁移。

浏览器关闭时不要求 Windows 系统通知或托盘驻留；再次打开 Web 后必须显示已到期和逾期状态。提醒触达首版只包括 Web/PWA 待办和已接入的浏览器扩展 popup。

## 4. 功能范围

### P0 Customer

- 客户列表、搜索、筛选、排序和游标分页。
- 创建、详情、更新、软删除、30 天内恢复和期满清理。
- 详情包含联系人、社媒账号、项目、最近跟进和未完成提醒摘要。
- 合并客户时迁移联系人、社媒账号、项目、跟进、提醒和关联状态；冲突必须显式选择。
- 删除、恢复和合并必须是数据库事务；失败不得产生部分写入。

### P0 业务域

- 联系人和社媒账号维护。
- 项目阶段、金额、币种、概率、分级、关闭原因。
- 项目风险和里程碑；风险和里程碑状态由用户维护。
- 跟进记录：手动记录和用户主动选择的单条社媒消息；保存失败保留输入并允许重试。
- 提醒：固定时间、等待客户回复、暂不跟进；不自动监听新消息。
- 提醒完成、稍后、忽略和手动确认收到回复；状态更新幂等。
- Popup/Dashboard 按逾期、风险、项目/客户分级和到期时间排序。

### P0 导入与数据管理

- CSV/XLSX 字段映射、预览、逐行错误、重复候选和提交结果。
- 1000 行导入和 1000 客户/10000 跟进验收基线。
- 导出客户、联系人、项目、跟进和提醒。
- 加密导出文件的完整性、兼容性和原子恢复校验。
- V1 SQLite 迁移预检、幂等重试、核对报告和用户确认；确认后只保留只读取证快照。

### P1 浏览器扩展

- 仅在用户主动进入支持的平台会话时读取当前会话身份。
- 唯一匹配显示客户摘要；多匹配必须人工确认；无稳定标识允许人工绑定。
- 群组、频道和无法识别场景明确显示不支持。
- 用户主动标记单条消息后才读取正文，不自动发送、修改、删除或批量抓取消息。
- 开发通过配置连接 Supabase 开发项目/API；正式配对方式、商店发布和平台合规另设发布门。

## 5. 后端与数据架构

### 5.1 模块化单体

业务模块保持务实三层：Controller/Edge adapter -> Application service -> Repository/SQL adapter。
跨模块只能调用导出的应用服务或查询服务，不直接查询其他模块 Repository。

模块边界：Identity/Profile、Customer、Engagement、Project、Reminder、Import/Export、Backup/Migration、Audit。

### 5.2 数据安全

- 所有业务表带 `owner_user_id`，RLS 使用 `auth.uid()` 授权。
- 父子表使用 `(owner_user_id, id)` 复合约束，禁止跨用户引用。
- 运行角色不得绕过 RLS；migration 使用独立高权限角色。
- 成功响应统一为 `{ data }`；失败响应统一为 `{ error: { code, message, fields?, request_id } }`；`204` 无响应体。
- 日志不得记录访问令牌、密码、完整消息正文或不必要的客户敏感字段。

## 6. 明确不做

- 不做 `dealpilot-agent.exe`、NSIS 安装包、桌面快捷方式或桌面壳。
- 首版不做 Capacitor 或原生移动应用；手机使用响应式 Web/PWA。
- 不做系统托盘、开机自启、Explorer 重启恢复、Windows 系统通知或浏览器关闭后的通知承诺。
- 不把 Agent/SQLite 作为正式业务后端，不做 PostgreSQL 与 SQLite 长期双写。
- 不做团队 workspace、成员角色、邀请、共享客户或企业 SSO。
- 不做自动发消息、自动监听新消息、微信/邮件推送、AI 功能和 ERP/财务系统。

## 7. 验收门槛

### 云端开发门槛

- Supabase 开发项目从空库执行 migration，并通过 RLS、复合外键、Storage 和 RPC 隔离测试。
- Web Customer 全行为 E2E、关联详情、合并/删除/恢复和提醒联动通过。
- API 客户端契约测试覆盖成功包络、字段错误、非 JSON 错误、网络/取消、过期会话和无法解析的 2xx。
- 导入、备份恢复和 SQLite 迁移测试通过；确认前中断不得修改 SQLite 原库。
- `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

### 云端发布门槛

- 真实 Auth/OIDC、账号删除、数据导出、备份恢复和密钥轮换演练通过。
- 两个真实测试账号的 RLS、父子引用、Storage、RPC 和 Edge 隔离矩阵通过。
- 隐私政策、跨境处理、供应商和数据保留评审通过。
- 灰度发布、旧 API 兼容回滚和迁移确认后 PostgreSQL 唯一事实源演练通过。

## 8. 迁移与回滚语义

- 用户确认迁移前：SQLite 仍是旧本地数据源，迁移失败或放弃不得修改原库。
- 用户确认迁移后：PostgreSQL 成为唯一事实源；SQLite 只读保留用于核对、取证和重新迁移。
- 云端发布回滚使用旧 API 版本和向后兼容 migration；不能通过切回 SQLite 作为云端回滚。
- 迁移快照由用户在本机管理，不等同于云端备份。

## 9. 版本关系

- V1.5 PRD/架构：历史本地桌面方案，仅供行为和迁移参考。
- V2 G0：云端个人 CRM 决策背景。
- V2.1：当前 Web/Cloud 产品需求和验收基线。
