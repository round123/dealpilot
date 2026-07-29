# Spec - 外贸经理个人工作台 (DealPilot) v1.0

> 生成日期：2026-07-29
> 基于：PRD v1.5 + 系统架构设计 v1.3
> 状态：已确认（基于用户已确认的 PRD 和架构文档自动生成）

---

## 1. 产品定义

- **一句话描述**：把分散的客户信息和跟进任务放回 WhatsApp / Telegram 工作现场，减少查找、记录和记忆成本
- **目标用户**：以 WhatsApp Web / Telegram Web 为主要沟通渠道的 ToB 外贸经理，个人工作区使用
- **核心问题**：客户散落多处查找慢、跟进节奏依赖记忆易错过、缺少统一优先级精力失焦、跟进结果无可复盘数据

---

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | RICE 评分 |
|--------|------|-------------|-----------|
| P0 | 客户导入与档案管理 | 1000 行合法模板可完成预览和导入；错误行不影响合法行；重复候选按规则处理；支持搜索/筛选/排序/新建/编辑/合并/软删除/30天恢复 | 9 |
| P0 | 客户识别与档案浮窗 | 进入一对一对话后按匹配规则识别客户；唯一命中显示档案；多候选需用户确认；未命中提供新建或绑定入口；群组/频道显示"不支持" | 9 |
| P0 | 跟进记录 | 用户可标记单条消息或手动填写记录；含时间/类型/备注/消息正文/客户/可选项目；保存失败保留内容可重试；重复提交不产生重复记录 | 8 |
| P0 | 跟进提醒 | 支持固定时间/等待客户回复/暂不跟进三种类型；Agent 运行时到期5分钟内触达系统通知；未运行时启动后补发并标记逾期；状态流转均由用户手动或时间到期触发 | 9 |
| P0 | 插件 popup 待办 | 展示前5条待办，按逾期/高风险/分级/到期时间排序；点击客户优先打开对应会话 | 7 |
| P0 | 客户分级 | A/B/C 三级用户手动设置；用于客户名下未关联项目的待办排序 | 6 |
| P0 | 项目管理 | 新建/编辑/归档/关闭；含名称/关联客户/币种/金额/成交概率/预计成交日/阶段/分级/失单原因；阶段用户手动切换 | 7 |
| P0 | 项目风险与里程碑 | 风险含说明/严重度/状态/处理日期；里程碑含名称/日期/完成状态；未完成里程碑到期前3天自动生成提醒；高风险项目进 popup 排序 | 5 |
| P1 | Excel 导出 | 客户/联系人/项目/跟进/提醒导出为明文 Excel，导出前提示妥善保管 | 4 |
| P1 | 加密备份与恢复 | 全部业务数据导出为受密码保护备份文件；恢复前校验完整性和兼容性；恢复失败不覆盖当前数据 | 5 |
| P1 | 安装与一键启动 | 单个 DealPilot-Setup.exe 安装包；双击 dealpilot-agent.exe 自动打开浏览器到工作台 URL | 5 |
| P1 | 插件商店配对 | 安装后引导用户从 Chrome Web Store / Edge Add-ons 安装插件；通过 Native Messaging 自动发现并配对 Agent | 4 |

---

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| AI 画像/AI 话术/AI 摘要/AI 行动建议 | V1 不做 AI，V2 独立 PRD | V2.0 |
| 自动收发消息 | 合规风险，PRD 明确禁止 | 不做 |
| 多人协作和复杂权限 | V1 是个人工作台 | V2.0+ |
| ERP/财务系统/移动 App | 超出 V1 范围 | 不做 |
| 微信/邮件提醒 | PRD 明确不包含 | 不做 |
| LinkedIn/Facebook 等其他平台 | V1 只支持 WhatsApp + Telegram | V2.0+ |
| 云端业务数据存储/账号登录/跨设备同步 | 本地优先架构，数据只存本机 | 不做 |
| 为 V2 预装向量数据库或 AI 字段 | V2 才评估，V1 不预装 | V2.0 |
| macOS / Linux 支持 | V1 只支持 Windows | V1.5+ |
| 自动监听新消息并流转"等待客户回复"状态 | PRD V1.4 明确：系统不自动监听，用户手动确认 | 不做 |

---

## 4. 技术架构（锁定 — 含版本锚定）

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 本地后端运行时 | Bun | 1.3+ | build --compile 全栈打包成熟；内置 SQLite 和 Argon2id；启动快 |
| HTTP 框架 | Hono | latest（Bun 原生运行） | 在 Bun 上原生运行，轻量极速 |
| 数据校验 | Zod | latest | 与前端共享 Schema，类型全栈直通 |
| ORM / 迁移 | Drizzle ORM + drizzle-kit | latest | 2025 下载量超 Prisma，SQL-first，5KB bundle |
| 数据库 | bun:sqlite 或 better-sqlite3 + SQLCipher | G1 Spike 验证 | 本地唯一事实源和文件加密；bun:sqlite 优先，不兼容则回退 |
| Excel / CSV | SheetJS (xlsx) + PapaParse | latest | 解析、预览、错误报告和导出 |
| 密码派生 / 加密 | Bun.password.hash (Argon2id) + node:crypto (AES-256-GCM) | 内置 | 备份密码派生和加密归档；Bun 内置不需要额外依赖 |
| 后端测试 | bun:test | 内置 | 领域、数据库和 API 测试 |
| 工作台前端 | React + TypeScript | 18 + 5 | 工作台 UI |
| 工作台构建 | Vite | latest | 官方推荐组合，构建静态资源由 Agent 托管 |
| 工作台路由 | TanStack Router | latest | 工作台路由和类型约束 |
| 工作台状态 | TanStack Query + Zustand | latest | API 缓存 + 临时 UI 状态 |
| 工作台表单 | React Hook Form + Zod | latest | 与后端共享 Schema |
| 工作台样式 | Tailwind CSS + Radix UI + Lucide React | latest | 可访问基础组件和统一图标 |
| 工作台表格 | TanStack Table | latest | 客户、项目和导入预览列表 |
| 插件框架 | WXT | latest | Vite-native，跨浏览器构建，框架无关，维护活跃 |
| 插件 UI | React + TypeScript | 18 + 5 | 浮窗和 popup |
| 插件隔离 | Shadow DOM | - | 防止宿主页样式污染 |
| 系统托盘 | node-systray | latest | 进程驻留，Bun 兼容性 G1 验证 |
| 系统通知 | node-notifier | latest | Toast 通知，Bun 兼容性 G1 验证 |
| 安装包 | NSIS (或 Inno Setup) | - | 单个 DealPilot-Setup.exe |
| Agent 打包 | bun build --compile | - | 单文件 dealpilot-agent.exe，内嵌前端+后端 |
| Monorepo | pnpm workspaces + Turborepo | - | 工作台、插件、后端和共享类型包，统一 Vite 构建链 |
| CI | GitHub Actions Windows Runner | - | 构建、测试、签名和生成发布物 |
| 图标库 | Lucide React | latest | SVG 统一描边，可矢量缩放，语义明确，全项目统一不混用 |

---

## 5. API 端点清单（锁定——开发时以此为唯一依据）

> 架构师在 Phase 2 必须同时产出 `openapi.yaml`（OpenAPI 3.0），前端据此生成 TS 类型，后端据此实现。

| Method | Path | 功能 | 认证 | 请求体 | 响应体 |
|--------|------|------|------|--------|--------|
| GET | /api/v1/health | Agent、API 和数据库版本 | 无（本地回环） | - | `{ agent_version, api_version, db_schema_version }` |
| GET | /api/v1/customers | 客户列表（游标分页、搜索、筛选、排序） | Bearer Token | query: `cursor, limit, search, grade, status, sort` | `{ items: Customer[], next_cursor }` |
| POST | /api/v1/customers | 新建客户 | Bearer Token | `CustomerCreate` | `Customer` |
| GET | /api/v1/customers/:id | 客户档案详情 | Bearer Token | - | `CustomerDetail`（含联系人、社媒、跟进时间线、项目、未完成提醒） |
| PUT | /api/v1/customers/:id | 编辑客户 | Bearer Token | `CustomerUpdate` | `Customer` |
| DELETE | /api/v1/customers/:id | 软删除客户（30天可恢复） | Bearer Token | - | 204 |
| POST | /api/v1/customers/:id/restore | 恢复已删除客户 | Bearer Token | - | `Customer` |
| POST | /api/v1/customers/merge | 合并客户（跟进/项目/提醒/社媒迁移） | Bearer Token + Idempotency-Key | `{ source_id, target_id, field_resolutions }` | `Customer` |
| GET | /api/v1/customers/:id/contacts | 联系人列表 | Bearer Token | - | `Contact[]` |
| POST | /api/v1/customers/:id/contacts | 新建联系人 | Bearer Token | `ContactCreate` | `Contact` |
| PUT | /api/v1/contacts/:id | 编辑联系人 | Bearer Token | `ContactUpdate` | `Contact` |
| DELETE | /api/v1/contacts/:id | 删除联系人 | Bearer Token | - | 204 |
| GET | /api/v1/customers/:id/social-accounts | 社媒账号列表 | Bearer Token | - | `SocialAccount[]` |
| POST | /api/v1/customers/:id/social-accounts | 添加社媒账号 | Bearer Token | `SocialAccountCreate` | `SocialAccount` |
| DELETE | /api/v1/social-accounts/:id | 删除社媒账号 | Bearer Token | - | 204 |
| POST | /api/v1/matches/resolve | 会话身份匹配 | Bearer Token | `{ platform, raw_identifier }` | `{ status: 'unique'|'multiple'|'none', candidates?: Customer[], customer?: Customer }` |
| POST | /api/v1/matches/bind | 人工绑定会话到客户 | Bearer Token + Idempotency-Key | `{ platform, raw_identifier, customer_id }` | `Binding` |
| DELETE | /api/v1/matches/bind | 解绑 | Bearer Token | `{ platform, raw_identifier }` | 204 |
| GET | /api/v1/follow-ups | 跟进记录列表（按客户筛选，游标分页） | Bearer Token | query: `customer_id, project_id, cursor, limit` | `{ items: FollowUp[], next_cursor }` |
| POST | /api/v1/follow-ups | 新建跟进记录 | Bearer Token + Idempotency-Key | `FollowUpCreate` | `FollowUp` |
| PUT | /api/v1/follow-ups/:id | 编辑跟进记录 | Bearer Token | `FollowUpUpdate` | `FollowUp` |
| DELETE | /api/v1/follow-ups/:id | 删除跟进记录 | Bearer Token | - | 204 |
| GET | /api/v1/reminders | 提醒列表（待办，按排序规则） | Bearer Token | query: `status, cursor, limit, sort_by` | `{ items: Reminder[], next_cursor }` |
| POST | /api/v1/reminders | 新建提醒 | Bearer Token + Idempotency-Key | `ReminderCreate` | `Reminder` |
| PUT | /api/v1/reminders/:id | 更新提醒状态（完成/稍后/忽略/已收到回复） | Bearer Token | `ReminderStatusUpdate` | `Reminder` |
| GET | /api/v1/reminders/popup | popup 前5条待办 | Bearer Token | - | `Reminder[]` |
| GET | /api/v1/projects | 项目列表 | Bearer Token | query: `customer_id, stage, grade, cursor, limit` | `{ items: Project[], next_cursor }` |
| POST | /api/v1/projects | 新建项目 | Bearer Token | `ProjectCreate` | `Project` |
| GET | /api/v1/projects/:id | 项目详情 | Bearer Token | - | `ProjectDetail`（含风险和里程碑） |
| PUT | /api/v1/projects/:id | 编辑项目 | Bearer Token | `ProjectUpdate` | `Project` |
| PUT | /api/v1/projects/:id/stage | 切换项目阶段 | Bearer Token | `{ stage }` | `Project` |
| DELETE | /api/v1/projects/:id | 归档/关闭项目 | Bearer Token | `{ reason }` | 204 |
| POST | /api/v1/projects/:id/risks | 添加风险 | Bearer Token | `RiskCreate` | `Risk` |
| PUT | /api/v1/risks/:id | 更新风险状态 | Bearer Token | `RiskUpdate` | `Risk` |
| POST | /api/v1/projects/:id/milestones | 添加里程碑 | Bearer Token | `MilestoneCreate` | `Milestone` |
| PUT | /api/v1/milestones/:id | 更新里程碑完成状态 | Bearer Token | `{ completed }` | `Milestone` |
| POST | /api/v1/imports/parse | 解析 Excel/CSV 并预览 | Bearer Token | multipart: `file` | `{ job_id, total_rows, valid_rows, errors, duplicate_candidates, preview }` |
| POST | /api/v1/imports/:job_id/commit | 确认提交导入 | Bearer Token + Idempotency-Key | `{ job_id, resolutions }` | `{ success, failed, skipped, duplicates }` |
| GET | /api/v1/imports/:job_id/errors | 下载错误报告 | Bearer Token | - | CSV |
| POST | /api/v1/exports/customers | 导出客户 Excel | Bearer Token | `{ filters }` | 文件下载 |
| POST | /api/v1/backups/create | 创建加密备份 | Bearer Token | `{ password }` | 文件下载 |
| POST | /api/v1/backups/validate | 校验备份完整性和兼容性 | Bearer Token | multipart: `file, password` | `{ valid, schema_version, app_version, integrity_ok }` |
| POST | /api/v1/backups/restore | 恢复备份（全局互斥锁） | Bearer Token | multipart: `file, password` | `{ success, rows_restored }` |
| GET | /api/v1/settings | 本地设置 | Bearer Token | - | `Settings` |
| PUT | /api/v1/settings | 更新设置 | Bearer Token | `SettingsUpdate` | `Settings` |
| GET | /api/v1/stats | 本地使用指标（不上报） | Bearer Token | - | `{ total_customers, total_followups, total_reminders, completion_rate, ... }` |

---

## 6. 数据库表清单（锁定）

| 表名 | 核心字段 | 索引 | 关联 |
|------|----------|------|------|
| customers | id (UUID PK), name, company, country, source, grade (A/B/C), status, deleted_at | idx_grade, idx_status, idx_deleted_at | has many contacts, social_accounts, projects, follow_ups, reminders |
| contacts | id (UUID PK), customer_id (FK), name, title, email, phone, created_at | idx_customer_id, idx_email (nocase), idx_phone | belongs to customer |
| social_accounts | id (UUID PK), customer_id (FK), contact_id (FK nullable), platform, raw_identifier, normalized_identifier, manually_bound, created_at | idx_platform_normalized (unique), idx_customer_id | belongs to customer, optionally belongs to contact |
| projects | id (UUID PK), customer_id (FK), name, currency, amount, probability, expected_close_date, stage, grade (S/A/B/C), closed_reason, created_at, updated_at | idx_customer_id, idx_stage, idx_grade | belongs to customer; has many follow_ups, reminders, risks, milestones |
| follow_ups | id (UUID PK), customer_id (FK), project_id (FK nullable), type, note, message_body, message_direction, occurred_at, created_at | idx_customer_id, idx_project_id, idx_occurred_at | belongs to customer, optionally belongs to project |
| reminders | id (UUID PK), customer_id (FK), project_id (FK nullable), type, status, due_at, priority, last_notified_at, snooze_until, resolution, created_at, updated_at | idx_status, idx_due_at, idx_customer_id, idx_project_id, idx_priority | belongs to customer, optionally belongs to project |
| risks | id (UUID PK), project_id (FK), description, severity, status, handled_at, created_at | idx_project_id, idx_status, idx_severity | belongs to project |
| milestones | id (UUID PK), project_id (FK), name, date, completed, created_at | idx_project_id, idx_date, idx_completed | belongs to project |
| import_jobs | id (UUID PK), file_name, total_rows, valid_rows, failed_rows, duplicate_count, status, created_at | idx_status, idx_created_at | - |
| local_events | id (UUID PK), event_type, entity_type, entity_id, metadata, occurred_at | idx_event_type, idx_occurred_at | - |
| settings | id (PK=1), last_backup_at, auto_start, minimize_to_tray, ... | - | - |

**SQLite 约束**：
- 启用外键约束、WAL 模式和 busy_timeout
- Agent 是唯一写入者，所有跨实体操作使用事务
- 主键使用客户端生成 UUID，支持幂等重试
- 时间统一以 UTC 存储，界面按本机时区展示
- 手机号按 E.164 标准化；邮箱忽略大小写；平台账号保存原值和标准化值
- 软删除保留 deleted_at，30 天后由清理任务永久删除
- Schema 使用单调递增版本，升级前自动创建恢复点

---

## 7. 页面清单（锁定）

### 7.1 工作台页面（浏览器加载，Vite + React）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 工作台首页/仪表盘 | `/` | 今日待办摘要、逾期提醒、快捷操作、备份提醒 | GET /reminders, GET /stats | 浅色 |
| 客户列表 | `/customers` | 搜索栏、筛选器、表格、批量操作、新建按钮 | GET /customers | 浅色 |
| 客户档案 | `/customers/:id` | 基础信息、联系人、社媒账号、跟进时间线、关联项目、未完成提醒 | GET /customers/:id | 浅色 |
| 客户导入 | `/customers/import` | 文件上传、字段映射、预览、冲突处理、导入结果 | POST /imports/parse, POST /imports/:id/commit | 浅色 |
| 项目列表 | `/projects` | 筛选器、表格、新建按钮 | GET /projects | 浅色 |
| 项目详情 | `/projects/:id` | 基础信息、阶段切换、风险列表、里程碑列表、关联待办 | GET /projects/:id | 浅色 |
| 待办列表 | `/reminders` | 全部待办、按状态筛选、批量处理 | GET /reminders | 浅色 |
| 备份与恢复 | `/settings/backup` | 创建备份、恢复备份、备份历史 | POST /backups/create, POST /backups/restore | 浅色 |
| 设置 | `/settings` | 通用设置、开机自启、托盘、数据位置 | GET/PUT /settings | 浅色 |

### 7.2 插件页面（WXT + React）

| 页面 | 触发 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| Content Script 浮窗 | 进入 WhatsApp/Telegram 一对一会话 | 客户档案摘要、最近跟进、未完成提醒、标记按钮、新建跟进、设置提醒 | POST /matches/resolve, GET /follow-ups, POST /reminders | Shadow DOM 隔离 |
| Popup | 点击插件图标 | 前5条待办、排序展示、点击跳转会话 | GET /reminders/popup | 浅色 |
| Popup - 新建客户 | popup 内入口 | 快速新建客户表单 | POST /customers | 浅色 |

---

## 8. 设计 Token（锁定）

> 设计师在 Phase 2 必须同时产出 `design-tokens.json` + `design-tokens.css`，前端通过 import 引用。

- **主色**：由设计师在 Phase 2 选定（对标 Linear/Notion 风格，浅色为主）
- **字体**：Inter + Noto Sans SC
- **图标库**：Lucide React（架构师锁定，全项目统一不混用，尺寸 16px 行内 / 20px 按钮内 / 24px 独立图标）
- **主题**：浅色（V1 不做深色模式）
- **对标品牌**：Linear / Notion（由设计师在 Phase 2 确认）
- **页面隔离**：插件浮窗使用 Shadow DOM，与宿主页面样式完全隔离
- **响应式断点**：最低 1366x768，桌面优先

**P0 规则约束**：
- 禁止 emoji 作为功能图标，全部使用 Lucide React SVG 图标
- 禁止紫色到粉色渐变主视觉
- 禁止空洞占位文案（"Welcome to" / "Lorem ipsum"）
- 禁止硬编码颜色值（例外 `#fff` `#000`），全部通过 Design Token 引用

---

## 9. 验收标准（锁定——QA 测试时以此为唯一依据）

> 使用 EARS 格式（While/When/If/Where + 系统 + 必须/应该 + 行为）。

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 客户导入 | When 用户上传合法 1000 行 Excel/CSV，系统**必须**完成字段映射预览和导入，P95 <= 30 秒 | P0 |
| AC-02 | 客户导入 | If 某行格式错误，系统**必须**跳过该行并继续导入合法行，且提供错误原因 | P0 |
| AC-03 | 客户导入 | When 导入产生重复候选，系统**必须**展示候选并等待用户选择合并/跳过/新建，不得静默覆盖 | P0 |
| AC-04 | 客户档案 | When 用户搜索客户，系统**必须**在 P95 <= 1 秒内返回匹配结果 | P0 |
| AC-05 | 客户档案 | When 用户软删除客户，系统**必须**取消未完成提醒并解除插件匹配；When 30 天内恢复，系统**必须**恢复全部关联数据 | P0 |
| AC-06 | 客户合并 | When 用户合并客户，系统**必须**将跟进、项目、提醒和社媒绑定迁移到保留客户，不得丢失数据 | P0 |
| AC-07 | 客户识别 | When 用户进入 WhatsApp/Telegram 一对一会话，插件**必须**按匹配规则识别客户，P95 <= 1 秒 | P0 |
| AC-08 | 客户识别 | If 匹配到多个客户，系统**必须**停止自动匹配并展示候选供用户确认 | P0 |
| AC-09 | 客户识别 | If 无法取得稳定标识，系统**必须**允许用户人工绑定到客户 | P0 |
| AC-10 | 客户识别 | Where 群组/频道/无法识别场景，系统**必须**显示"不支持自动识别"，不得静默消失 | P0 |
| AC-11 | 跟进记录 | When 用户标记单条消息，系统**必须**读取该条消息正文并保存为跟进记录，含时间/类型/方向 | P0 |
| AC-12 | 跟进记录 | If 保存失败，系统**必须**保留当前编辑内容并允许重试，重复提交不得产生重复记录 | P0 |
| AC-13 | 提醒触达 | While Agent 运行时，到期提醒**必须**在 5 分钟内通过系统通知触达，无论浏览器是否打开 | P0 |
| AC-14 | 提醒触达 | When Agent 启动后，系统**必须**扫描已到期未处理提醒并补发通知，标记为逾期 | P0 |
| AC-15 | 提醒状态 | When 用户完成/稍后/忽略提醒，系统**必须**原子更新状态；同一提醒同一状态只保留一条通知 | P0 |
| AC-16 | 提醒状态 | When 提醒连续逾期 3 天，系统**必须**自动提升排序权重，但不改变提醒状态 | P0 |
| AC-17 | "等待回复" | When 用户标记"等待客户回复"，系统**不得**自动监听新消息；When 用户手动确认"已收到回复"，状态**必须**流转为"待处理" | P0 |
| AC-18 | Popup 排序 | When popup 展示待办，系统**必须**按逾期/高风险/分级(S/A/B/C 项目, A/B/C 客户)/到期时间排序 | P0 |
| AC-19 | 项目管理 | When 用户切换项目阶段，系统**必须**记录变更，不自动推进阶段 | P0 |
| AC-20 | 里程碑提醒 | When 未完成里程碑到期前 3 天，系统**必须**自动生成提醒（属于提醒生成，非状态流转） | P0 |
| AC-21 | 风险升级 | When 风险连续 7 天未处理，系统**必须**自动提升优先级（仅排序权重，不改变状态） | P0 |
| AC-22 | 加密备份 | When 用户创建加密备份，系统**必须**使用 Argon2id 派生密钥 + AES-256-GCM 加密 | P1 |
| AC-23 | 备份恢复 | When 恢复备份，系统**必须**先校验完整性和兼容性；If 密码错误或文件损坏，**不得**覆盖当前数据 | P1 |
| AC-24 | 数据安全 | Where 业务数据、消息正文和使用行为，系统**不得**发送到产品服务器 | P0 |
| AC-25 | 安装启动 | When 用户双击 dealpilot-agent.exe，系统**必须**启动 HTTP 服务器并自动打开浏览器到工作台，P95 <= 5 秒 | P1 |
| AC-26 | 插件配对 | When 用户安装插件后，插件**必须**通过 Native Messaging 自动发现并配对 Agent | P1 |
| AC-27 | 离线可用 | Where 除 WhatsApp/Telegram 页面外，系统**必须**在断网时正常使用全部本地功能 | P0 |
| AC-28 | 数据一致性 | If 事务失败，系统**不得**产生半完成对象；If 恢复失败，**不得**覆盖当前数据库 | P0 |

---

## 10. 边界与约束

- V1 只支持 Windows 10/11
- 浏览器：Chrome / Edge 最新两个版本
- 最低分辨率：1366 x 768
- 数据规模基线：10,000 客户 / 100,000 跟进 / 10,000 项目
- 验收基线：1,000 客户 / 10,000 跟进 / 1,000 行导入
- 并发用户：1（本地 Agent 单实例）
- API 只监听 127.0.0.1，禁止 0.0.0.0
- API 版本化 /api/v1
- 写请求支持 Idempotency-Key
- 列表使用游标分页
- 恢复操作全局互斥锁
- 插件不保存完整业务数据（不形成 IndexedDB 与后端双写）
- Content Script 不持有 API 令牌
- 日志不记录消息正文、邮箱和完整手机号
- V1 不支持 macOS/Linux（通过平台适配层预留）

---

## 11. 内嵌已知坑（从项目记忆拉取）

> 项目尚未开始开发，暂无 pitfalls.jsonl。以下为基于技术栈的预判坑。

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| better-sqlite3 在 Bun 下可能不兼容 | bun + better-sqlite3 | Bun 的 npm 兼容层对 C++ 原生模块支持不完整 | G1 Spike S6 验证；如不兼容改用 bun:sqlite 或 bun:ffi |
| node-systray 在 Bun 下可能不兼容 | bun + node-systray | 同上 | G1 Spike S7 验证；如不兼容改用 bun:ffi 调用 Shell_NotifyIcon |
| WXT 与 Bun 运行时兼容性未知 | wxt + bun | WXT 基于 Vite，Vite 与 Bun 的兼容性需验证 | 开发时用 pnpm + Node 开发，仅打包时用 Bun build --compile |
| SQLCipher 在 bun:sqlite 上不支持扩展 | bun:sqlite + sqlcipher | bun:sqlite 可能不支持 loadExtension | 验证后回退 better-sqlite3 |
| Native Messaging Host 需要处理 stdio 二进制协议 | nm-host + bun | NM 协议使用 4 字节长度前缀的 JSON | 参考架构文档 §8 的 NM 实现 |

---

## 12. 端到端验证步骤（Spec 锁定的最后一项）

```bash
# 前置条件：G1 Spike 全部通过，Agent 可运行

# 1. 启动 Agent
./dealpilot-agent.exe
# 断言：HTTP 服务器在 127.0.0.1:port 启动
# 断言：浏览器自动打开到 http://127.0.0.1:port/?token=xxx
# 断言：工作台 UI 加载成功，URL 中 token 已清除

# 2. 导入客户
curl -X POST http://127.0.0.1:port/api/v1/imports/parse \
  -H "Authorization: Bearer {token}" \
  -F "file=@test_customers.xlsx"
# 断言：返回 job_id + 预览结果

curl -X POST http://127.0.0.1:port/api/v1/imports/{job_id}/commit \
  -H "Authorization: Bearer {token}" \
  -H "Idempotency-Key: {uuid}" \
  -d '{"resolutions": []}'
# 断言：返回 success/failed/skipped/duplicates

# 3. 创建提醒
curl -X POST http://127.0.0.1:port/api/v1/reminders \
  -H "Authorization: Bearer {token}" \
  -H "Idempotency-Key: {uuid}" \
  -d '{"customer_id": "{id}", "type": "fixed_time", "due_at": "2026-07-29T11:00:00Z"}'
# 断言：返回 201 + Reminder

# 4. 验证提醒触达（到期后）
# 断言：Windows 系统通知出现
# 断言：插件 popup 角标更新

# 5. 安全验证
curl http://127.0.0.1:port/api/v1/customers
# 断言：返回 401（无 token）

curl -H "Origin: https://evil.com" http://127.0.0.1:port/api/v1/customers
# 断言：返回 403（Origin 校验拒绝）

# 6. 备份与恢复
curl -X POST http://127.0.0.1:port/api/v1/backups/create \
  -H "Authorization: Bearer {token}" \
  -d '{"password": "test123"}'
# 断言：返回加密备份文件

# 7. 构建验证
pnpm run build
# 断言：lint 通过、type-check 通过、test 通过
# 断言：bun build --compile 生成 dealpilot-agent.exe
```

---

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-07-29 | Spec V1.0 初始生成 | 基于 PRD V1.5 + 架构 V1.3 自动生成 | 全部 |
