# DealPilot PostgreSQL 数据字典 V2.1

> 状态：当前云端数据库实现基线
> 日期：2026-08-03
> 产品需求：[DealPilot PRD V2.1](./DealPilot_PRD_V2.1_WebCloud.md)
> 系统架构：[DealPilot 系统架构设计 V2.1](./DealPilot_系统架构设计_V2.1_WebCloud.md)
> 数据库事实源：[`supabase/migrations`](../supabase/migrations/)

## 1. 范围与使用规则

本文记录 V2 WebCloud 当前 PostgreSQL、RLS、RPC 和 Storage 的实际实现，供开发、测试、安全审计、schema 核对和故障恢复使用。字段、约束或权限与本文不一致时，以仓库中按文件名顺序执行后的 PostgreSQL migration 为准，并应在同一变更中更新本文。

本版本共包含 12 个枚举、20 张 `public` 表、2 个视图、16 个认证用户可执行 RPC、4 个仅后台服务可执行 RPC，以及 5 个不可由客户端直接执行的内部函数。V2 是个人云 CRM，不包含 workspace、成员或角色表；数据隔离键为账号身份 `auth.uid()`。

## 2. 敏感级别

| 级别      | 定义                                             | 典型数据                                              | 处理要求                                                                    |
| --------- | ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| S3 高敏感 | 可直接识别个人、还原沟通内容或大批量恢复业务数据 | 联系方式、消息正文、附件、完整云备份和删除快照 | 必须由 RLS/RPC 隔离；不得写日志、前端持久缓存或测试夹具；导出需显式用户动作 |
| S2 敏感   | 客户、项目、提醒、配置等非公开业务数据           | Customer、项目金额、提醒、用户设置、导入结果          | 仅当前账号可访问；日志只能记录 ID、计数或不可逆摘要                         |
| S1 内部   | 单独泄露影响较低的控制或分类数据                 | 标签、状态、计数、校验摘要、队列状态                  | 仍受账号隔离；可用于受控运维指标                                            |
| S0 公开   | 可匿名公开的数据                                 | 当前没有用户业务表属于此级                            | 不适用                                                                      |

表级等级取该表字段的最高级别；视图继承所有源表中的最高级别。字段表中的等级用于精细化日志、导出和脱敏判断。

## 3. 公共安全与关系规则

- `profiles` 通过 `id = auth.uid()` 隔离；其余业务和运维表通过 `owner_user_id = auth.uid()` 隔离。
- 20 张表全部启用并强制 RLS。普通业务表允许认证用户在 owner policy 内读写；`backup_snapshots` 和 `import_jobs` 仅允许认证用户读取，写入必须走 RPC。
- `customer_purge_jobs` 不允许客户端直接访问。
- 关键父子关系使用 `(owner_user_id, parent_id)` 复合外键，防止伪造 ID 形成跨账号引用；多数业务外键为 `DEFERRABLE INITIALLY DEFERRED`，支持事务内合并、恢复和批量导入。
- `anon` 对 `public` schema 的表、序列和函数无业务权限。客户端只能持有公开 anon key 和用户会话，严禁持有 `service_role`。
- 所有 `SECURITY DEFINER` 函数固定 `search_path = ''`，并在函数内使用带 schema 的对象名。
- RPC 成功值统一包含 `{ "data": ... }`；失败由数据库/PostgREST/Edge 层转换为统一 API 错误。
- Deal 创建/更新 RPC 的业务失败使用 `PT404/PT409/PT422` 对应不存在、并发冲突和校验失败；API Client 分别归一化为 `NOT_FOUND/CONFLICT/VALIDATION_ERROR`。

## 4. 枚举字典

| 枚举                        | 允许值                                                                                  | 用途                                  |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| `customer_grade`            | `A`, `B`, `C`                                                                           | Customer 分级                         |
| `customer_status`           | `active`, `inactive`                                                                    | Customer 业务状态，不等同于软删除状态 |
| `deal_stage`                | `lead`, `qualified`, `proposal`, `negotiation`, `closed_won`, `closed_lost`, `archived` | 项目销售阶段                          |
| `deal_grade`                | `S`, `A`, `B`, `C`                                                                      | 项目分级                              |
| `follow_up_type`            | `call`, `email`, `chat`, `visit`, `note`, `message`                                     | 跟进类型                              |
| `message_direction`         | `inbound`, `outbound`                                                                   | 消息方向                              |
| `reminder_type`             | `fixed_time`, `waiting_reply`, `paused`                                                 | 提醒类型                              |
| `reminder_status`           | `pending`, `completed`, `snoozed`, `ignored`, `overdue`, `replied`                      | 提醒状态                              |
| `reminder_priority`         | `low`, `normal`, `high`, `urgent`                                                       | 提醒优先级                            |
| `risk_severity`             | `low`, `medium`, `high`, `critical`                                                     | 风险严重度                            |
| `risk_status`               | `open`, `handling`, `resolved`, `ignored`                                               | 风险状态                              |
| `customer_purge_job_status` | `pending`, `processing`, `retry`, `completed`, `cancelled`                              | Customer 物理清理队列状态             |

## 5. 表字典

### 5.1 `profiles`（S2）

账号级用户设置。`auth.users` 新增后由触发器自动创建；账号删除时级联删除。

| 字段           | PostgreSQL 类型 | 空值/默认     | 约束/关系                                                 | 含义     | 级别 |
| -------------- | --------------- | ------------- | --------------------------------------------------------- | -------- | ---- |
| `id`           | `uuid`          | 非空          | PK；FK → `auth.users.id`，删除级联；RLS 等于 `auth.uid()` | 用户 ID  | S2   |
| `display_name` | `text`          | 可空          |                                                           | 显示名称 | S2   |
| `locale`       | `text`          | 非空，`zh-CN` |                                                           | 界面语言 | S1   |
| `theme`        | `text`          | 非空，`light` | `light/dark/system`                                       | 界面主题 | S1   |
| `created_at`   | `timestamptz`   | 非空，`now()` |                                                           | 创建时间 | S1   |
| `updated_at`   | `timestamptz`   | 非空，`now()` | 更新触发器维护                                            | 更新时间 | S1   |

### 5.2 `social_accounts`（S3）

| 字段                    | PostgreSQL 类型 | 空值/默认          | 约束/关系                                                     | 含义          | 级别 |
| ----------------------- | --------------- | ------------------ | ------------------------------------------------------------- | ------------- | ---- |
| `id`                    | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键                                       | 社媒账号 ID   | S1   |
| `owner_user_id`         | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`                                            | 所属账号      | S2   |
| `company_id`            | `uuid`          | 非空               | 复合 FK → `companies`，删除级联                               | 所属 Customer | S2   |
| `contact_id`            | `uuid`          | 可空               | `(owner, company, contact)` FK → `contacts`；联系人删除时置空 | 绑定联系人    | S2   |
| `platform`              | `text`          | 非空               | 去空格后非空；与规范化标识在 owner 内唯一                     | 平台          | S1   |
| `raw_identifier`        | `text`          | 非空               | 去空格后非空                                                  | 原始账号标识  | S3   |
| `normalized_identifier` | `text`          | 非空               | 去空格后非空；与平台在 owner 内唯一                           | 规范化标识    | S3   |
| `manually_bound`        | `boolean`       | 非空，`false`      |                                                               | 是否人工绑定  | S1   |
| `created_at`            | `timestamptz`   | 非空，`now()`      |                                                               | 创建时间      | S1   |
| `updated_at`            | `timestamptz`   | 非空，`now()`      | 更新触发器维护                                                | 更新时间      | S1   |

### 5.3 `follow_ups`（S3）

| 字段                | PostgreSQL 类型     | 空值/默认          | 约束/关系                                             | 含义         | 级别 |
| ------------------- | ------------------- | ------------------ | ----------------------------------------------------- | ------------ | ---- |
| `id`                | `uuid`              | 非空，随机 UUID    | PK；与 owner 构成唯一键                               | 跟进 ID      | S1   |
| `owner_user_id`     | `uuid`              | 非空，`auth.uid()` | FK → `profiles.id`                                    | 所属账号     | S2   |
| `company_id`        | `uuid`              | 非空               | 复合 FK → `companies`，删除级联                       | Customer     | S2   |
| `deal_id`           | `uuid`              | 可空               | `(owner, company, deal)` FK → `deals`；项目删除时置空 | 关联项目     | S2   |
| `type`              | `follow_up_type`    | 非空               | `message` 时正文和方向必须存在                        | 跟进类型     | S1   |
| `note`              | `text`              | 可空               |                                                       | 跟进备注     | S3   |
| `message_body`      | `text`              | 可空               | 消息类型时非空                                        | 单条消息正文 | S3   |
| `message_direction` | `message_direction` | 可空               | 消息类型时非空                                        | 消息方向     | S2   |
| `occurred_at`       | `timestamptz`       | 非空               |                                                       | 发生时间     | S2   |
| `created_at`        | `timestamptz`       | 非空，`now()`      |                                                       | 创建时间     | S1   |
| `updated_at`        | `timestamptz`       | 非空，`now()`      | 更新触发器维护                                        | 更新时间     | S1   |

### 5.4 `reminders`（S2）

客户端不能写 `deletion_event_id`。状态变更应优先调用幂等 RPC；删除 Customer 时由事务写入删除标记。

| 字段                | PostgreSQL 类型     | 空值/默认          | 约束/关系                                             | 含义                         | 级别 |
| ------------------- | ------------------- | ------------------ | ----------------------------------------------------- | ---------------------------- | ---- |
| `id`                | `uuid`              | 非空，随机 UUID    | PK；与 owner 构成唯一键                               | 提醒 ID                      | S1   |
| `owner_user_id`     | `uuid`              | 非空，`auth.uid()` | FK → `profiles.id`                                    | 所属账号                     | S2   |
| `company_id`        | `uuid`              | 非空               | 复合 FK → `companies`，删除级联                       | Customer                     | S2   |
| `deal_id`           | `uuid`              | 可空               | `(owner, company, deal)` FK → `deals`；项目删除时置空 | 关联项目                     | S2   |
| `type`              | `reminder_type`     | 非空               |                                                       | 提醒类型                     | S1   |
| `status`            | `reminder_status`   | 非空，`pending`    |                                                       | 当前状态                     | S1   |
| `due_at`            | `timestamptz`       | 非空               |                                                       | 到期时间                     | S2   |
| `priority`          | `reminder_priority` | 非空，`normal`     |                                                       | 优先级                       | S1   |
| `last_notified_at`  | `timestamptz`       | 可空               |                                                       | 最近通知时间                 | S2   |
| `snooze_until`      | `timestamptz`       | 可空               |                                                       | 稍后提醒时间                 | S2   |
| `resolution`        | `text`              | 可空               |                                                       | 处理说明                     | S2   |
| `deletion_event_id` | `uuid`              | 可空               | 复合 FK → `audit_events`，删除事件删除时置空          | Customer 删除联动的 CAS 标记 | S1   |
| `created_at`        | `timestamptz`       | 非空，`now()`      |                                                       | 创建时间                     | S1   |
| `updated_at`        | `timestamptz`       | 非空，`now()`      | 更新触发器维护                                        | 更新时间                     | S1   |

### 5.5 `deal_risks`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                   | 含义     | 级别 |
| --------------- | --------------- | ------------------ | --------------------------- | -------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键     | 风险 ID  | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`          | 所属账号 | S2   |
| `deal_id`       | `uuid`          | 非空               | 复合 FK → `deals`，删除级联 | 项目     | S2   |
| `description`   | `text`          | 非空               | 去空格后非空                | 风险描述 | S2   |
| `severity`      | `risk_severity` | 非空               |                             | 严重度   | S1   |
| `status`        | `risk_status`   | 非空，`open`       |                             | 状态     | S1   |
| `handled_at`    | `timestamptz`   | 可空               |                             | 处理时间 | S2   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                             | 创建时间 | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护              | 更新时间 | S1   |

### 5.6 `deal_milestones`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                   | 含义       | 级别 |
| --------------- | --------------- | ------------------ | --------------------------- | ---------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键     | 里程碑 ID  | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`          | 所属账号   | S2   |
| `deal_id`       | `uuid`          | 非空               | 复合 FK → `deals`，删除级联 | 项目       | S2   |
| `name`          | `text`          | 非空               | 去空格后非空                | 里程碑名称 | S2   |
| `due_date`      | `date`          | 非空               |                             | 到期日期   | S2   |
| `completed`     | `boolean`       | 非空，`false`      |                             | 是否完成   | S1   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                             | 创建时间   | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护              | 更新时间   | S1   |

### 5.7 `audit_events`（S3）

认证用户只读；业务事务和受控 RPC 写入。`metadata` 可能包含提醒状态或删除快照，不得直接记录到应用日志。

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                        | 含义                | 级别 |
| --------------- | --------------- | ------------------ | -------------------------------- | ------------------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键          | 审计事件 ID         | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`               | 所属账号            | S2   |
| `event_type`    | `text`          | 非空               | 去空格后非空                     | 事件类型            | S1   |
| `entity_type`   | `text`          | 可空               |                                  | 实体类型            | S1   |
| `entity_id`     | `uuid`          | 可空               | 非强外键，允许保留已删除实体历史 | 实体 ID             | S2   |
| `metadata`      | `jsonb`         | 非空，`{}`         | 必须是 JSON 对象                 | 事件元数据/删除快照 | S3   |
| `occurred_at`   | `timestamptz`   | 非空，`now()`      |                                  | 发生时间            | S2   |

### 5.8 `customer_purge_jobs`（S2）

后台物理清理队列。故意不引用 Customer，使其在 Customer 级联删除后仍保留 Storage 路径和重试历史；但通过 owner 外键在账号删除时级联删除。

| 字段              | PostgreSQL 类型             | 空值/默认       | 约束/关系                    | 含义                    | 级别 |
| ----------------- | --------------------------- | --------------- | ---------------------------- | ----------------------- | ---- |
| `id`              | `uuid`                      | 非空，随机 UUID | PK                           | 清理任务 ID             | S1   |
| `owner_user_id`   | `uuid`                      | 非空            | FK → `profiles.id`，删除级联 | 所属账号                | S2   |
| `customer_id`     | `uuid`                      | 非空            | 全表唯一；无 Customer FK     | 待清理 Customer         | S2   |
| `cutoff`          | `timestamptz`               | 非空            |                              | 过期判定时间            | S1   |
| `object_paths`    | `text[]`                    | 非空，空数组    |                              | 待删除 Storage 对象路径 | S3   |
| `status`          | `customer_purge_job_status` | 非空，`pending` |                              | 队列状态                | S1   |
| `attempt_count`   | `integer`                   | 非空，`0`       | 不得小于 0                   | 尝试次数                | S1   |
| `next_attempt_at` | `timestamptz`               | 非空，`now()`   |                              | 下次尝试时间            | S1   |
| `claimed_at`      | `timestamptz`               | 可空            | 超过 15 分钟可重新领取       | 领取时间                | S1   |
| `last_error`      | `text`                      | 可空            | 最长由 RPC 截断到 2000 字符  | 最近错误                | S2   |
| `completed_at`    | `timestamptz`               | 可空            |                              | 完成时间                | S1   |
| `created_at`      | `timestamptz`               | 非空，`now()`   |                              | 创建时间                | S1   |
| `updated_at`      | `timestamptz`               | 非空，`now()`   | 更新触发器维护               | 更新时间                | S1   |

### 5.9 `backup_snapshots`（S3）

数据库关系数据的账号级快照。认证用户只读；创建、导出和恢复必须走 RPC。

| 字段             | PostgreSQL 类型 | 空值/默认          | 约束/关系                    | 含义             | 级别 |
| ---------------- | --------------- | ------------------ | ---------------------------- | ---------------- | ---- |
| `id`             | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键      | 快照 ID          | S1   |
| `owner_user_id`  | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`，删除级联 | 所属账号         | S2   |
| `schema_version` | `integer`       | 非空，`1`          | 大于 0                       | 快照 schema 版本 | S1   |
| `label`          | `text`          | 可空               | 长度 1-200                   | 用户标签         | S2   |
| `checksum`       | `text`          | 非空               | 64 位小写十六进制            | payload 摘要     | S1   |
| `row_counts`     | `jsonb`         | 非空               | 必须是 JSON 对象             | 分表行数         | S1   |
| `payload`        | `jsonb`         | 非空               | 必须是 JSON 对象             | 完整关系数据快照 | S3   |
| `created_at`     | `timestamptz`   | 非空，`now()`      |                              | 创建时间         | S1   |

### 5.10 `import_jobs`（S2）

浏览器完成预览和字段映射后，由事务 RPC 创建的 Customer 导入幂等记录。认证用户只读。

| 字段              | PostgreSQL 类型 | 空值/默认     | 约束/关系                    | 含义               | 级别 |
| ----------------- | --------------- | ------------- | ---------------------------- | ------------------ | ---- |
| `id`              | `uuid`          | 非空          | PK                           | 导入任务 ID        | S1   |
| `owner_user_id`   | `uuid`          | 非空          | FK → `profiles.id`，删除级联 | 所属账号           | S2   |
| `idempotency_key` | `text`          | 非空          | 去空格后非空；owner 内唯一   | 幂等键             | S1   |
| `payload_hash`    | `text`          | 非空          | 64 位小写十六进制            | 导入载荷摘要       | S1   |
| `status`          | `text`          | 非空          | `processing/completed`       | 状态               | S1   |
| `row_count`       | `integer`       | 非空          | 0-1000                       | 输入行数           | S1   |
| `result`          | `jsonb`         | 可空          | 非空时必须是 JSON 对象       | 创建/跳过/错误结果 | S2   |
| `created_at`      | `timestamptz`   | 非空，`now()` |                              | 创建时间           | S1   |
| `completed_at`    | `timestamptz`   | 可空          |                              | 完成时间           | S1   |

### 5.11 `companies`（S2，Customer 主表）

| 字段             | PostgreSQL 类型   | 空值/默认          | 约束/关系                            | 含义                              | 级别 |
| ---------------- | ----------------- | ------------------ | ------------------------------------ | --------------------------------- | ---- |
| `id`             | `uuid`            | 非空，随机 UUID    | PK；与 owner 构成唯一键              | Customer ID                       | S1   |
| `owner_user_id`  | `uuid`            | 非空，`auth.uid()` | FK → `profiles.id`，删除级联；RLS 键 | 所属账号                          | S2   |
| `name`           | `text`            | 非空               | 去空格后不得为空                     | Customer 名称                     | S2   |
| `company`        | `text`            | 可空               |                                      | V1 兼容的公司字段，与记录名称不同 | S2   |
| `sector`         | `text`            | 可空               |                                      | 行业                              | S2   |
| `size`           | `smallint`        | 可空               | 不得小于 0                           | 规模                              | S2   |
| `linkedin_url`   | `text`            | 可空               |                                      | LinkedIn 地址                     | S3   |
| `website`        | `text`            | 可空               |                                      | 网站                              | S2   |
| `phone_number`   | `text`            | 可空               |                                      | 公司电话                          | S3   |
| `address`        | `text`            | 可空               |                                      | 地址                              | S3   |
| `zipcode`        | `text`            | 可空               |                                      | 邮编                              | S2   |
| `city`           | `text`            | 可空               |                                      | 城市                              | S2   |
| `state_abbr`     | `text`            | 可空               |                                      | 州/省缩写                         | S2   |
| `country`        | `text`            | 可空               |                                      | 国家/地区                         | S2   |
| `description`    | `text`            | 可空               |                                      | 业务描述                          | S2   |
| `revenue`        | `text`            | 可空               |                                      | 营收描述                          | S2   |
| `tax_identifier` | `text`            | 可空               |                                      | 税务标识                          | S3   |
| `logo`           | `jsonb`           | 可空               |                                      | Logo 元数据/Storage 路径          | S2   |
| `context_links`  | `text[]`          | 非空，空数组       |                                      | 上下文链接                        | S2   |
| `source`         | `text`            | 可空               |                                      | 客户来源                          | S2   |
| `grade`          | `customer_grade`  | 非空，`B`          |                                      | 客户分级                          | S1   |
| `status`         | `customer_status` | 非空，`active`     |                                      | 客户业务状态                      | S1   |
| `deleted_at`     | `timestamptz`     | 可空               | 非空表示软删除                       | 删除时间                          | S1   |
| `created_at`     | `timestamptz`     | 非空，`now()`      |                                      | 创建时间                          | S1   |
| `updated_at`     | `timestamptz`     | 非空，`now()`      | 更新触发器维护                       | 更新时间                          | S1   |

### 5.12 `tags`（S1）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                          | 含义     | 级别 |
| --------------- | --------------- | ------------------ | ---------------------------------- | -------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键            | 标签 ID  | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`，删除级联       | 所属账号 | S2   |
| `name`          | `text`          | 非空               | 去空格后非空；同账号忽略大小写唯一 | 标签名   | S1   |
| `color`         | `text`          | 非空               |                                    | 颜色值   | S1   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                    | 创建时间 | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护                     | 更新时间 | S1   |

### 5.13 `contacts`（S3）

| 字段             | PostgreSQL 类型 | 空值/默认          | 约束/关系                        | 含义                    | 级别 |
| ---------------- | --------------- | ------------------ | -------------------------------- | ----------------------- | ---- |
| `id`             | `uuid`          | 非空，随机 UUID    | PK；与 owner、company 构成唯一键 | 联系人 ID               | S1   |
| `owner_user_id`  | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`，删除级联     | 所属账号                | S2   |
| `company_id`     | `uuid`          | 非空               | 复合 FK → `companies`，删除级联  | 所属 Customer           | S2   |
| `first_name`     | `text`          | 可空               | 姓名字段至少一个非空             | 名                      | S3   |
| `last_name`      | `text`          | 可空               | 姓名字段至少一个非空             | 姓                      | S3   |
| `name`           | `text`          | 可空               | 姓名字段至少一个非空             | 完整姓名                | S3   |
| `gender`         | `text`          | 可空               |                                  | 性别                    | S3   |
| `title`          | `text`          | 可空               |                                  | 职位                    | S2   |
| `background`     | `text`          | 可空               |                                  | 背景信息                | S3   |
| `avatar`         | `jsonb`         | 可空               |                                  | 头像元数据/Storage 路径 | S3   |
| `first_seen`     | `timestamptz`   | 可空               |                                  | 首次接触时间            | S2   |
| `last_seen`      | `timestamptz`   | 可空               |                                  | 最近接触时间            | S2   |
| `has_newsletter` | `boolean`       | 非空，`false`      |                                  | 是否订阅通讯            | S2   |
| `status`         | `text`          | 可空               |                                  | 联系人状态              | S2   |
| `linkedin_url`   | `text`          | 可空               |                                  | LinkedIn 地址           | S3   |
| `email_jsonb`    | `jsonb`         | 非空，`[]`         | 必须是 JSON 数组                 | 邮箱列表                | S3   |
| `phone_jsonb`    | `jsonb`         | 非空，`[]`         | 必须是 JSON 数组                 | 电话列表                | S3   |
| `created_at`     | `timestamptz`   | 非空，`now()`      |                                  | 创建时间                | S1   |
| `updated_at`     | `timestamptz`   | 非空，`now()`      | 更新触发器维护                   | 更新时间                | S1   |

### 5.14 `contact_tags`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                          | 含义     | 级别 |
| --------------- | --------------- | ------------------ | ---------------------------------- | -------- | ---- |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | PK；FK → `profiles.id`             | 所属账号 | S2   |
| `contact_id`    | `uuid`          | 非空               | PK；复合 FK → `contacts`，删除级联 | 联系人   | S2   |
| `tag_id`        | `uuid`          | 非空               | PK；复合 FK → `tags`，删除级联     | 标签     | S1   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                    | 绑定时间 | S1   |

### 5.15 `contact_notes`（S3）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                      | 含义            | 级别 |
| --------------- | --------------- | ------------------ | ------------------------------ | --------------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键        | 笔记 ID         | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`             | 所属账号        | S2   |
| `contact_id`    | `uuid`          | 非空               | 复合 FK → `contacts`，删除级联 | 联系人          | S2   |
| `text`          | `text`          | 可空               |                                | 笔记正文        | S3   |
| `date`          | `timestamptz`   | 非空，`now()`      |                                | 业务时间        | S2   |
| `status`        | `text`          | 可空               |                                | 笔记状态        | S1   |
| `attachments`   | `jsonb`         | 非空，`[]`         | 必须是 JSON 数组               | 附件元数据/路径 | S3   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                | 创建时间        | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护                 | 更新时间        | S1   |

### 5.16 `deals`（S2）

| 字段                    | PostgreSQL 类型 | 空值/默认          | 约束/关系                        | 含义          | 级别 |
| ----------------------- | --------------- | ------------------ | -------------------------------- | ------------- | ---- |
| `id`                    | `uuid`          | 非空，随机 UUID    | PK；与 owner、company 构成唯一键 | 项目 ID       | S1   |
| `owner_user_id`         | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`               | 所属账号      | S2   |
| `company_id`            | `uuid`          | 非空               | 复合 FK → `companies`，删除级联  | 所属 Customer | S2   |
| `name`                  | `text`          | 非空               | 去空格后非空                     | 项目名称      | S2   |
| `category`              | `text`          | 可空               |                                  | 类别          | S2   |
| `stage`                 | `deal_stage`    | 非空，`lead`       |                                  | 销售阶段      | S1   |
| `grade`                 | `deal_grade`    | 非空，`C`          |                                  | 项目分级      | S1   |
| `description`           | `text`          | 可空               |                                  | 项目描述      | S2   |
| `currency`              | `char(3)`       | 非空，`USD`        | 必须为大写                       | 币种          | S1   |
| `amount`                | `numeric(18,2)` | 可空               | 不得小于 0                       | 金额          | S2   |
| `probability`           | `smallint`      | 可空               | 0-100                            | 成交概率      | S2   |
| `expected_closing_date` | `date`          | 可空               |                                  | 预计关闭日期  | S2   |
| `closed_reason`         | `text`          | 可空               |                                  | 关闭原因      | S2   |
| `archived_at`           | `timestamptz`   | 可空               |                                  | 归档时间      | S1   |
| `sort_index`            | `smallint`      | 可空               | API/UI 映射为 `index`            | 看板排序      | S1   |
| `created_at`            | `timestamptz`   | 非空，`now()`      |                                  | 创建时间      | S1   |
| `updated_at`            | `timestamptz`   | 非空，`now()`      | 更新触发器维护                   | 更新时间      | S1   |

### 5.17 `deal_contacts`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                          | 含义     | 级别 |
| --------------- | --------------- | ------------------ | ---------------------------------- | -------- | ---- |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | PK；FK → `profiles.id`             | 所属账号 | S2   |
| `deal_id`       | `uuid`          | 非空               | PK；复合 FK → `deals`，删除级联    | 项目     | S2   |
| `contact_id`    | `uuid`          | 非空               | PK；复合 FK → `contacts`，删除级联 | 联系人   | S2   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                    | 绑定时间 | S1   |

### 5.18 `deal_notes`（S3）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                   | 含义            | 级别 |
| --------------- | --------------- | ------------------ | --------------------------- | --------------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键     | 笔记 ID         | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`          | 所属账号        | S2   |
| `deal_id`       | `uuid`          | 非空               | 复合 FK → `deals`，删除级联 | 项目            | S2   |
| `type`          | `text`          | 可空               |                             | 笔记类型        | S1   |
| `text`          | `text`          | 可空               |                             | 笔记正文        | S3   |
| `date`          | `timestamptz`   | 非空，`now()`      |                             | 业务时间        | S2   |
| `attachments`   | `jsonb`         | 非空，`[]`         | 必须是 JSON 数组            | 附件元数据/路径 | S3   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                             | 创建时间        | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护              | 更新时间        | S1   |

### 5.19 `tasks`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                      | 含义     | 级别 |
| --------------- | --------------- | ------------------ | ------------------------------ | -------- | ---- |
| `id`            | `uuid`          | 非空，随机 UUID    | PK；与 owner 构成唯一键        | 任务 ID  | S1   |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | FK → `profiles.id`             | 所属账号 | S2   |
| `contact_id`    | `uuid`          | 非空               | 复合 FK → `contacts`，删除级联 | 联系人   | S2   |
| `type`          | `text`          | 可空               |                                | 任务类型 | S1   |
| `text`          | `text`          | 可空               |                                | 任务内容 | S2   |
| `due_date`      | `timestamptz`   | 可空               |                                | 到期时间 | S2   |
| `done_date`     | `timestamptz`   | 可空               |                                | 完成时间 | S1   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                | 创建时间 | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护                 | 更新时间 | S1   |

### 5.20 `configuration`（S2）

| 字段            | PostgreSQL 类型 | 空值/默认          | 约束/关系                        | 含义     | 级别 |
| --------------- | --------------- | ------------------ | -------------------------------- | -------- | ---- |
| `owner_user_id` | `uuid`          | 非空，`auth.uid()` | PK；FK → `profiles.id`，删除级联 | 所属账号 | S2   |
| `config`        | `jsonb`         | 非空，`{}`         | 必须是 JSON 对象                 | 应用配置 | S2   |
| `created_at`    | `timestamptz`   | 非空，`now()`      |                                  | 创建时间 | S1   |
| `updated_at`    | `timestamptz`   | 非空，`now()`      | 更新触发器维护                   | 更新时间 | S1   |

## 6. 视图

| 视图                | 等级 | 内容与安全语义                                                                                                                                                                                                      |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies_summary` | S3   | `security_invoker`；继承 `companies` RLS。包含 Customer 全字段，增加 `sales_id = owner_user_id`、由名称/旧公司字段/国家拼接的 `search_text`、`nb_contacts`、`nb_deals`；过滤 `deleted_at is not null` 的 Customer。 |
| `contacts_summary`  | S3   | `security_invoker`；继承源表 RLS。包含联系人全字段，增加 `sales_id = owner_user_id`、`company_name`、标签 UUID 数组、未完成任务数、邮箱/电话搜索文本；仅连接未软删除 Customer。                                     |

## 7. 函数与 RPC

### 7.1 认证用户公开 RPC

| 函数                                              | 核心语义                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `soft_delete_customer(uuid)`                      | 锁定活动 Customer，写入软删除时间，将开放提醒置为忽略，并把原提醒状态写入审计快照。                                   |
| `restore_customer(uuid)`                          | 仅在 30 天窗口内恢复；只还原由对应删除事件改变且之后未被用户命令覆盖的提醒。                                          |
| `merge_customers(uuid, uuid, jsonb)`              | 在单事务中解析字段冲突、迁移全部关联并删除来源 Customer。                                                             |
| `get_customer_detail(uuid)`                       | 返回 Customer、联系人、社媒账号、项目、最近最多 10 条跟进和开放提醒。                                                 |
| `create_backup_snapshot(text)`                    | 在数据库事务中创建当前账号关系数据快照。                                                                              |
| `restore_backup_snapshot(uuid)`                   | 从账号内已存快照恢复关系数据。                                                                                        |
| `export_backup_snapshot(uuid)`                    | 导出可移植备份载荷。                                                                                                  |
| `restore_backup_payload(jsonb, text, jsonb)`      | 校验 schema、摘要和行数后恢复外部备份载荷。                                                                           |
| `commit_customer_import(uuid, text, text, jsonb)` | 以任务 ID、幂等键和 payload hash 原子提交最多 1000 行 Customer 导入。                                                 |
| `create_follow_up_idempotent(...)`                | 以调用方提供的幂等键创建跟进，重试返回原结果。                                                                        |
| `list_customers_cursor(...)`                      | Customer 结构化过滤和稳定游标分页；排序字段限 `name/created_at/updated_at/grade`，limit 为 1-100，搜索最长 200 字符。 |
| `update_reminder_status_idempotent(...)`          | 最终定义来自 `20260802000600`；通过期望旧状态/更新时间防并发覆盖，并支持幂等重试。                                    |
| `merge_contacts(uuid, uuid)`                      | 在同一账号、同一 Customer 内合并联系人及其标签、任务、笔记、项目和社媒关联。                                          |
| `get_dashboard_summary()`                         | 返回当前账号的 Dashboard 聚合摘要。                                                                                   |
| `update_deal_with_contacts(...)`                  | 字段白名单和 `updated_at` CAS；单事务更新项目及联系人；`NULL` 不改关联，空数组清空。                                  |
| `create_deal_with_contacts(...)`                  | 字段白名单与账号级关联校验；单事务创建项目及联系人关联，失败不残留项目。                                              |

### 7.2 仅 `service_role` 的后台 RPC

| 函数                                            | 核心语义                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `purge_expired_customers(timestamptz, integer)` | 将超过软删除窗口的 Customer 放入 durable 清理队列；默认 cutoff 为当前时间前 30 天。 |
| `claim_customer_purge_jobs(integer)`            | 使用 `FOR UPDATE SKIP LOCKED` 领取任务；处理超过 15 分钟的任务可重新领取。          |
| `complete_customer_purge_job(uuid)`             | 复核 Customer 仍已过期及 Storage 路径快照未变化，再级联物理删除 Customer。          |
| `fail_customer_purge_job(uuid, text)`           | 记录失败并按指数退避重试，最大等待 3600 秒。                                        |

### 7.3 内部函数，禁止客户端直接执行

`set_updated_at`、`handle_new_auth_user`、`clear_reminder_deletion_marker`、`collect_customer_storage_paths`、`backup_payload_row_counts` 仅供触发器或受控 RPC 内部调用。

## 8. Storage

| 对象       | 配置                                                                |
| ---------- | ------------------------------------------------------------------- |
| Bucket     | `attachments`                                                       |
| 公开性     | 私有                                                                |
| 单文件上限 | 50 MiB（52,428,800 字节）                                           |
| 路径规则   | 对象名第一段必须严格等于 `auth.uid()`                               |
| 操作策略   | 认证用户的 `SELECT/INSERT/UPDATE/DELETE` 均校验 bucket 和第一段路径 |
| 敏感级别   | S3                                                                  |

业务记录只保存对象路径和元数据。数据库备份 payload 不包含 Storage 对象本体；Customer 清理和账号删除由受限 Edge Function 删除对应对象。

## 9. 保留、删除与备份语义

- Customer 软删除后 30 天内可恢复；默认物理清理 cutoff 为 `now() - interval '30 days'`。
- 删除事务保存开放提醒的 `status/resolution` 快照。恢复采用 `deletion_event_id` 作为比较并交换标记，只恢复仍由该删除动作控制的提醒，避免覆盖删除后的用户操作。
- `customer_purge_jobs` 不引用 Customer，因此 Customer 级联删除后仍可保留清理结果和重试历史；账号删除时通过 owner 外键级联删除。
- PostgreSQL 始终是唯一业务事实源，当前 schema 不包含 SQLite 导入会话或暂存表。
- `audit_events`、`backup_snapshots` 和 `import_jobs` 当前没有自动 TTL。上线前必须通过隐私/容量评审确定保留期，不能把“暂无 TTL”理解为允许无限期保留。
- 关系数据备份不包含 Auth 凭据、Storage 对象、`customer_purge_jobs` 或 `backup_snapshots` 自身。恢复对象和数据库必须分别演练。
- 当前数据库在删除 `auth.users` 后立即级联删除 `profiles` 及 owner 数据；当前 Edge 实现同样为立即删除。PRD 所述“账号删除 30 天撤销期”尚未由数据库实现。

## 10. API wire/domain 映射

- `companies_summary.sales_id` 和 `contacts_summary.sales_id` 均为 `owner_user_id` 的 Atomic CRM 兼容别名，不是另一套权限模型。
- `deals.sort_index` 在 Atomic UI 适配层映射为领域字段 `index`。
- `contacts.email_jsonb` 和 `contacts.phone_jsonb` 是 JSON 数组；`packages/api-client` 必须在网络边界运行时解析，业务组件不得使用原始 JSON。
- Customer detail 的 `recent_follow_ups` 最多 10 条，`open_reminders` 仅含 `pending/snoozed/overdue`。
- 数据库 RPC 成功响应为 `{ data }`。业务组件只能通过 `packages/api-client` 访问，不得直接调用 Supabase、`fetch` 或手写 wire type。

## 11. 已知实现差距

| 项目           | 当前实现                                                      | 目标/后续动作                                               |
| -------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 账号删除撤销期 | 删除 Auth 用户后立即级联清除数据库数据，Edge 同步删除 Storage | 按 PRD 实现 30 天可撤销账号删除，或在发布决策中明确调整 PRD |
| 运维表 TTL     | 审计、备份和导入任务无自动 TTL                                | 完成隐私、合规和容量评审后增加保留策略                      |
| Storage 备份   | DB 快照不包含对象本体                                         | 建立独立对象备份/恢复和核对流程                             |
| 云端验收       | schema migration、RLS、RPC、Storage 策略已有静态实现          | 仍需在受控 Supabase 项目执行双账号隔离、备份恢复和回滚门禁  |

## 12. Schema migration 事实源

[`supabase/migrations`](../supabase/migrations/) 按文件名顺序构成 schema 事实源。fresh schema 只包含本文列出的 12 个枚举、20 张表、2 个视图和函数集合；安全门禁同时验证已退役的本地数据导入对象不存在。已部署环境通过最后的前向 retirement migration 收敛到同一结构，不执行反向 migration 或数据库重置。
