# WebCloud 发布与回滚手册

## 1. 适用范围

本手册用于 DealPilot V2 Web/PWA、Supabase migration 和 Edge Functions 的 preview、灰度、生产发布及应用版本回滚。

生产 PostgreSQL 从账号创建起永久是唯一事实源。发布回滚只允许重新部署上一兼容版本的 Edge Functions 和 Web/PWA；禁止执行数据库 `reset`、`down`、旧 migration 反向回退或切换到本地数据库。云备份恢复是独立的受控数据操作，不作为应用版本回滚手段。

## 2. GitHub 环境

仓库需要配置三个发布环境：

| 环境               | 用途                                                       | 必需保护                               |
| ------------------ | ---------------------------------------------------------- | -------------------------------------- |
| `cloud-preview`    | `codex/**` 分支的独立 Supabase preview 项目和 Web 构建产物 | 不允许使用生产 project ref             |
| `cloud-canary`     | 手动灰度演练的独立 Supabase 项目和 Web 构建产物            | 至少一名审批人                         |
| `cloud-production` | 生产 migration、Edge、发布后 smoke 及回滚                  | 至少一名审批人，生产 secret 仅放此环境 |

GitHub Pages 环境只用于生产 Web。远端审计于 2026-08-01 发现 `github-pages` branch policy 同时允许 `main` 和 `codex/atomic-personal-cloud`；工作流已额外限制只有从 `main` 发起的 production 才能部署 Pages。合并本变更后应删除旧的 `codex/atomic-personal-cloud` Pages policy，只保留 `main`。

Preview 和 canary 不部署 GitHub Pages，因为公开 Pages 的 PR preview 仍不可用。工作流会部署到各自独立 Supabase 项目、在本地启动构建产物完成 smoke，并上传保留 7 天的 Web artifact。

仓库或对应环境需提供：

- 仓库共享部署凭据：`SUPABASE_ACCESS_TOKEN`。这是 Supabase CLI 使用的账号级 PAT，preview、canary 和 production 共用；不要再为各发布通道创建带前缀的 access token secret。
- Production：`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`、`VITE_SUPABASE_URL`、`VITE_SB_PUBLISHABLE_KEY`，以及回滚业务 smoke 使用的 `CLOUD_SMOKE_EMAIL`、`CLOUD_SMOKE_PASSWORD`、`CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON`。
- Preview：`PREVIEW_SUPABASE_DB_PASSWORD`、`PREVIEW_SUPABASE_PROJECT_REF`、`PREVIEW_VITE_SUPABASE_URL`、`PREVIEW_VITE_SB_PUBLISHABLE_KEY`。
- Canary：`CANARY_SUPABASE_DB_PASSWORD`、`CANARY_SUPABASE_PROJECT_REF`、`CANARY_VITE_SUPABASE_URL`、`CANARY_VITE_SB_PUBLISHABLE_KEY`。

Supabase PAT 不能按单个项目收窄权限，因此项目隔离不依赖 PAT。工作流按发布通道选择独立的 project ref 和数据库密码，并用 `PRODUCTION_SUPABASE_PROJECT_REF` 变量校验 preview/canary 目标不得等于 production；任何目标变量缺失也会在 link 或 migration 前失败。

生产 smoke 账号只用于读取一条稳定的合成 Customer，不得使用真实客户数据。`CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON` 固定该账号可见的活动 Customer 总数和样本关联摘要，例如：

```json
{"id":"00000000-0000-4000-8000-000000000001","name":"Release Smoke Customer","active_customer_count":1,"contacts":1,"social_accounts":1,"deals":1,"recent_follow_ups":1,"open_reminders":1}
```

## 3. Migration 兼容门禁

普通 CI 和部署只接受向前、向后兼容的 additive migration。静态门禁至少阻止：

- `DROP TABLE`、`DROP COLUMN`、`DROP FUNCTION`、`DROP TYPE`；
- 表、列、约束、类型或值的 `RENAME`；
- `ALTER COLUMN ... TYPE` 或 `SET DATA TYPE`。

需要删除旧结构时使用 expand/contract：先发布新结构与双读兼容应用，完成回填和观察，再在后续独立发布清理。异常清理必须在语句前四行内写明：

```sql
-- dealpilot:allow-destructive-migration approval=https://github.com/round123/dealpilot/pull/123 reason=two-release compatibility window completed
```

自动发布仍会失败。审批人确认备份、兼容窗口和恢复前进方案后，从 `main` 手动运行 `Deploy WebCloud`，选择 `production` 并把相同 URL 填入 `migration_approval`。GitHub `cloud-production` 环境审批是第二道门。

## 4. Preview 与灰度

### Preview

1. 推送 `codex/**` 分支；工作流自动选择 `preview`。
2. 确认 migration 只应用到 `PREVIEW_SUPABASE_PROJECT_REF`。
3. 下载 `cloud-preview-<SHA>` artifact，核对 `release.json` 的 SHA。
4. 保存 workflow URL、artifact 名称、Supabase project ref 后 6 位及 smoke 摘要。

### Canary

1. 从待发布 commit 手动运行 `Deploy WebCloud`，选择 `canary`。
2. 审批 `cloud-canary` 环境。
3. 使用测试账号执行登录、Customer 关键路径、导入、加密备份/恢复和双账号隔离。
4. 记录 release SHA、测试账号、用例结果、数据库/Edge 日志链接和批准人。

Canary 不分流生产用户；它是在独立、生产等价环境执行的人工灰度门。未通过时停止，不进入 production。

## 5. 生产发布

`main` push 自动执行，或从 `main` 手动选择 `production`：

1. 迁移兼容门禁。
2. `supabase db push` 向前应用 migration。
3. 部署当前 Edge Functions。
4. 构建并部署 GitHub Pages Web/PWA，同时写入 `release.json`。
5. 对 Web release SHA、Supabase Auth、PostgREST 和未登录 Edge 拒绝执行 smoke。

任何一步失败都停止后续步骤。数据库 migration 已成功但应用发布失败时，不回退数据库；修复应用或执行下面的兼容应用版本回滚。

发布证据至少保留：workflow URL、release SHA、Pages URL、migration/Edge/Web 各步骤结果、smoke 摘要和审批记录。

## 6. 应用版本回滚

### 前置确认

1. 选择已经在当前 PostgreSQL schema 上验证过的旧 V2 commit/tag。
2. 确认该 commit 位于 `main` 历史且早于当前 `main`。
3. 在 canary 或等价环境证明旧 Edge/Web 可读取当前 PostgreSQL。
4. 创建 incident/审批记录，写明旧 release SHA、影响、观察指标和恢复前进负责人。

### 执行

从 `main` 手动运行 `Roll back WebCloud application`：

- `release_ref`：已验证 tag 或 commit；
- `verified_sha`：对应的完整 40 位小写 SHA；
- `approval_evidence`：HTTPS incident/审批 URL；
- `confirmation`：`ROLLBACK V2 APP ONLY`。

工作流验证 ref/SHA 和 `main` 祖先关系，然后只从该 SHA 部署 Edge Functions 与 Web/PWA。它不会 link 数据库，也不会执行 migration。最后用旧应用的 `release.json` 对照 SHA，验证它仍连接当前生产 Auth/PostgREST，未登录 Edge 请求继续被拒绝，并用受控账号核对活动 Customer 总数及 Customer 关联摘要。

### 成功条件

- Pages 返回目标旧 SHA；
- Auth 和 PostgREST 健康；
- Edge 未登录访问返回 `401` 或 `403`；
- 使用受控测试账号完成登录和 Customer 读取；
- 当前 PostgreSQL 数据数量与抽样摘要未变化；
- 没有本地数据库写入、数据库降级或快照覆盖动作。

## 7. 恢复前进

回滚只是恢复应用可用性，不是最终状态：

1. 从当前 `main` 修复问题，保持现有 PostgreSQL schema 向后兼容。
2. 在 preview 和 canary 重放失败场景及回归用例。
3. 以新 SHA 正常走 migration → Edge → Web → smoke。
4. 核对新 release SHA、业务指标和错误率后关闭 incident。
5. 将回滚 SHA、修复 SHA、时间线、数据核对结果和后续门禁改进写入演练记录。

每季度至少演练一次“上一兼容 V2 应用继续读取当前 PostgreSQL”。不得把数据库快照覆盖、反向 migration 或本地数据源切换作为演练成功证据。
