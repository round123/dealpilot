# DealPilot PRD V2.1：Web 与云端优先

> 状态：当前产品需求基线，取代 V1 本地桌面方案
> 日期：2026-08-01
> 产品形态：Web/PWA + 云端模块化单体 + PostgreSQL；浏览器扩展作为后续入口
> 关联架构：[云端个人 CRM 重构计划](./cloud-multiplatform-refactor-plan.md)
> 关联决策：[ADR-V2-002](./adr/ADR-V2-002-atomic-crm-personal-cloud.md)
> 数据字典：[PostgreSQL 数据字典 V2.1](./DealPilot_PostgreSQL_数据字典_V2.1.md)

## 1. 文档关系与决策

本文件是当前唯一有效的产品需求文档。`外贸经理个人工作台_PRD_V1.5.md` 和
`外贸经理个人工作台_系统架构设计_V1.3.md` 仅作为历史行为参考，不再作为
当前产品入口、后端或发布验收依据。

核心决策：

1. 所有业务后端能力按云端实现，使用 Supabase/PostgreSQL、RLS、RPC/Edge Functions 和统一 API 客户端。
2. PostgreSQL 是唯一业务事实源。开发和生产均使用托管 Supabase/PostgreSQL 项目；开发项目不是另一套业务架构。
3. Web 工作台是首要产品界面，PWA 复用同一 Web 应用；不建设桌面壳、托盘或安装器作为产品入口。
4. 当前产品不提供 SQLite/Agent、本地数据源或 V1 数据迁移入口；云端账号从注册开始只使用 PostgreSQL。
5. 首版是个人云 CRM：每个账号拥有自己的业务数据。不建设团队 workspace、成员、角色、邀请或企业 SSO。
6. PostgreSQL 从账号创建起就是永久唯一事实源，不提供本地写模式、双写或云端回写 SQLite。

当前实现口径（2026-08-04）：Web/PWA、统一 API 客户端、Customer 与业务域界面、
导入/导出、用户级加密云备份、浏览器扩展候选包及发布/回滚自动化已经通过
CI 和托管 Supabase 验收。旧 `apps/web`、`apps/agent`、EXE/NSIS 和 Cloud Agent provider
已从当前工作树删除；历史实现仅由 `v1-local-final` Git tag 保存，不作为当前产品的数据来源。
当前交付是封闭预览：只保证受控账号登录与会话，不承诺公开注册和密码重置邮件投递；
整项目基础设施灾备、RPO/RTO、扩展商店审核及 WhatsApp/Telegram 真实页面兼容性
不属于 WebCloud 核心发布门，扩展真实平台结果由产品所有者单独 UAT。

## 2. 分阶段运行形态

### 2.1 云端开发与验收

开发阶段直接使用受控的 Supabase 开发项目，Web/PWA 与生产使用同一套云端运行模型：

- PostgreSQL、Auth、Storage、Realtime（如需要）和 Edge Functions 均运行在 Supabase 开发项目。
- Web/PWA 通过 `packages/api-client` 访问开发项目 URL；本机只运行 Vite 开发服务器，不运行第二套业务数据库。
- 使用开发项目中的测试账号和合成数据，不导入真实客户资料。
- RLS、复合外键、RPC、Storage 策略、备份恢复和 PostgreSQL schema migration 测试在开发项目和 CI 门禁中执行。
- 不要求 Docker、Supabase CLI、`exe`、NSIS、托盘、开机自启或 Windows 系统通知。

### 2.2 云端发布

- Web/PWA 部署到静态托管或边缘平台。
- PostgreSQL、Auth、Storage、Edge Functions 使用受控云环境。
- OIDC/Supabase Auth 令牌只证明用户身份；业务查询通过 RLS 和服务端授权限制到当前用户数据。
- 所有客户端继续使用同一个类型化 API 客户端，不能直接在组件中调用 Supabase 或 `fetch`。
- 生产发布前完成隐私、跨境数据、用户级备份恢复、受控管理员数据清理和安全事件流程评审。

## 3. 用户与核心流程

目标用户是以 WhatsApp Web/Telegram Web 为主要沟通渠道的个人外贸经理。

核心流程：

1. 封闭预览用户使用受控个人账号登录；公开自助注册和邮件密码重置另行开放。
2. 用户在 Web 导入客户资料并处理重复候选。
3. 用户维护客户、联系人、社媒账号、项目、跟进、提醒、风险和里程碑。
4. 用户在 Web 查看 Dashboard、客户详情、项目详情和提醒列表。
5. 后续扩展接入 WhatsApp/Telegram 会话匹配、人工绑定和单条消息跟进。
6. 用户可以导出数据、创建云端备份并从云端备份执行受控恢复。

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
- `import_jobs` 记录新的 CSV/XLSX 导入任务和幂等提交结果，不接收旧 SQLite 数据库或迁移包。

### P1 浏览器扩展

- 仅在用户主动进入支持的平台会话时读取当前会话身份。
- 唯一匹配显示客户摘要；多匹配必须人工确认；无稳定标识允许人工绑定。
- 群组、频道和无法识别场景明确显示不支持。
- 用户主动标记单条消息后才读取正文，不自动发送、修改、删除或批量抓取消息。
- 开发通过配置连接 Supabase 开发项目/API；CI 产出 Chrome/Edge 候选包和明确版本的 GitHub Release。
- WhatsApp/Telegram 真实页面兼容性由产品所有者执行 UAT；商店提交、审核和上架不阻塞 WebCloud 核心发布。

## 5. 后端与数据架构

### 5.1 模块化单体

业务模块保持务实三层：Controller/Edge adapter -> Application service -> Repository/SQL adapter。
跨模块只能调用导出的应用服务或查询服务，不直接查询其他模块 Repository。

模块边界：Identity/Profile、Customer、Engagement、Project、Reminder、Import/Export、Backup/Restore、Audit。

### 5.2 数据安全

- 所有业务表带 `owner_user_id`，RLS 使用 `auth.uid()` 授权。
- 父子表使用 `(owner_user_id, id)` 复合约束，禁止跨用户引用。
- 运行角色不得绕过 RLS；migration 使用独立高权限角色。
- 成功响应统一为 `{ data }`；失败响应统一为 `{ error: { code, message, fields?, request_id } }`；`204` 无响应体。
- 日志不得记录访问令牌、密码、完整消息正文或不必要的客户敏感字段。

## 6. 明确不做

- 不做 `dealpilot-agent.exe`、NSIS 安装包、桌面快捷方式或桌面壳。
- 当前工作树不得重新引入 `apps/web`、`apps/agent`、Agent provider 或本地业务 API；CI 必须执行退役门禁。
- 首版不做 Capacitor 或原生移动应用；手机使用响应式 Web/PWA。
- 不做系统托盘、开机自启、Explorer 重启恢复、Windows 系统通知或浏览器关闭后的通知承诺。
- 不提供 SQLite 数据迁移、Agent/SQLite 业务后端、PostgreSQL 与 SQLite 双写或本地回退模式。
- 不做团队 workspace、成员角色、邀请、共享客户或企业 SSO。
- 首版不提供自助删除账号；Web、API Client 和公开 Edge API 均不暴露删号能力。
- 封闭预览不配置自定义 SMTP，不承诺公开注册确认或密码重置邮件的投递额度与 SLA。
- 首版不建设整项目 Supabase 基础设施灾备恢复，也不承诺 Auth、Storage 和 PostgreSQL 的 RPO/RTO；用户级加密云备份恢复仍属于产品能力。
- 浏览器扩展商店提交、审核、上架和真实第三方平台兼容性由产品所有者单独验收，不作为 WebCloud 核心发布阻塞项。
- 不做自动发消息、自动监听新消息、微信/邮件推送、AI 功能和 ERP/财务系统。

## 7. 验收门槛

### 云端开发门槛

- Supabase 开发项目从空库执行 migration，并通过 RLS、复合外键、Storage 和 RPC 隔离测试。
- Web Customer 全行为 E2E、关联详情、合并/删除/恢复和提醒联动通过。
- API 客户端契约测试覆盖成功包络、字段错误、非 JSON 错误、网络/取消、过期会话和无法解析的 2xx。
- CSV/XLSX 导入、数据导出和云备份恢复测试通过；失败或中断不得产生部分业务写入。
- `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

### 云端发布门槛

- 受控账号的真实 Auth/OIDC、数据导出、用户级备份恢复、受控管理员数据清理和密钥轮换演练通过。
- 两个真实测试账号的 RLS、父子引用、Storage、RPC 和 Edge 隔离矩阵通过。
- 隐私政策、跨境处理、供应商和数据保留评审通过。
- 灰度发布、旧 API 兼容回滚和 PostgreSQL 唯一事实源演练通过。

自定义 SMTP、整项目基础设施灾备、扩展真实平台 UAT 和商店分发按第 6 节处理，不计入上述 WebCloud 核心发布门。

## 8. 发布与回滚语义

- PostgreSQL 始终是唯一业务事实源；应用版本回滚不得改变这一事实。
- PostgreSQL schema migration 必须向后兼容；云端发布回滚使用上一兼容 Web/Edge/API 版本继续读取当前数据库。
- 禁止通过数据库 `reset`、反向 migration、本地数据库或旧快照覆盖生产 PostgreSQL。
- 云备份恢复是独立的受控数据操作，必须先校验完整性、版本兼容性和目标账号，再原子提交。

## 9. 版本关系

- V1.5 PRD/架构：历史本地桌面方案，仅供行为参考。
- V2 G0：云端个人 CRM 决策背景。
- V2.1：当前 Web/Cloud 产品需求和验收基线。
