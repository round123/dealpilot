# 受控管理员账号清理手册

## 适用范围

DealPilot 不提供自助删号。Web、PWA 和 API Client 不得出现账号删除入口，
`delete-account` Edge Function 必须持续固定返回 `404 FEATURE_DISABLED`。
只有在身份核验、数据主体请求或已批准的运维工单完成后，管理员才能使用
GitHub Actions 的 `Controlled administrator account cleanup` 人工工作流。

该操作永久删除目标账号的附件、Auth 用户及其 PostgreSQL 业务数据，不能撤销。
不得用它处理 Customer 软删除，也不得绕过 `cloud-production` 环境审批。

## 前置条件

1. 工单记录目标用户 UUID、请求依据、身份核验结果、影响范围和审批人。
2. 工单或审批记录必须有可访问的 HTTPS URL；不要把邮箱、令牌或客户内容写入 URL。
3. 由另一名获授权人员复核 UUID。禁止用邮箱模糊匹配目标账号。
4. 确认工作流从 `main` 分支发起，`cloud-production` 环境启用了 required reviewer，
   且 `SUPABASE_SERVICE_ROLE_KEY` 只保存在该环境。
5. 为工单选择稳定的幂等键，例如 `acct-cleanup-INC1234`。同一次请求的所有重试
   必须复用完全相同的键、目标 UUID、审批 URL 和操作者。

## 执行

在 GitHub Actions 中选择 `Controlled administrator account cleanup`，输入：

- `target_user_id`：已复核的 Supabase Auth UUID。
- `idempotency_key`：本次清理的稳定工单键。
- `approval_url`：HTTPS 工单或审批证据地址。
- `confirmation`：逐字输入 `PERMANENTLY DELETE DEALPILOT ACCOUNT`。

提交后由 `cloud-production` reviewer 再次核对输入并批准。工作流不会输出 service
role key、邮箱或附件路径。成功条件是函数返回持久任务的 `completed` 状态；仅看到
HTTP 2xx、Auth 用户消失或部分附件删除均不构成成功。

## 失败与重试

失败时先用工作流摘要中的 request ID 检查 Edge Function 日志。数据库只保存脱敏
错误代码，不保存第三方原始错误文本。修复依赖问题后，从 `main` 重新运行工作流，
复用原 `idempotency_key`、UUID、审批 URL 和操作者。任务会从 `retry` 状态继续。

每次最多快照并删除 1000 个附件对象。若账号对象更多，函数会保守失败为
`STORAGE_BATCH_REMAINING`，且不会提前删除 Auth 用户；修复依赖后可以立即重复受控执行。
任务不设置自动退避或后台重试，必须由管理员再次审批运行，直到全部清理。
Storage 删除、Auth 硬删除、级联验证任一步不完整时都不会写入 `completed`。

若 Auth 用户已在上一次尝试中成功删除、但完成状态尚未落库，重试仍会检查
profile 和附件均已清空后完成，不会误报。不得手工把任务状态改为 `completed`。

## 证据与保留

保存工作流 URL、request ID、幂等键、审批 URL、操作者、开始/完成时间和结果。
`admin_account_cleanup_jobs` 在账号删除后继续保留上述最小审计字段、尝试次数、
脱敏错误代码和附件删除数量；完成记录满 180 天后由数据库保留任务自动清理。
未完成的 `pending/processing/retry` 记录不会被 TTL 删除，必须调查至完成。

## 定期检查

每季度抽查：

1. `delete-account` 仍返回 `404 FEATURE_DISABLED`，Web 无删号入口。
2. 普通登录用户和 `anon` 无法访问任务表或管理 RPC。
3. 工作流只能从 `main` 运行并需要 `cloud-production` 审批。
4. 失败演练确实进入 `retry`，且使用同一幂等键可完成重试。
