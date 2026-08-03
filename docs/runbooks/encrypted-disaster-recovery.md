# WebCloud 免费异地备份与恢复手册

## 能力边界

本方案是 Supabase Free 没有 PITR 时的最低灾备门禁。生产 `main` 每日导出 `public` 关系数据和 Auth 持久身份数据，并下载私有 `attachments` 对象；所有内容先在 runner 临时目录生成，再用 age X25519 公钥整体加密。GitHub Artifact 只上传 `.tar.age` 密文，请求保留 35 天。

它不是 Supabase 平台快照，也不保证恢复内部服务状态。Auth session、refresh token、OTP/flow state、MFA challenge 和 Auth audit log不会备份，恢复后用户需重新登录。`auth.users` 的密码哈希、身份资料及 `auth.identities` 的供应商元数据仍是高敏数据；私钥泄露按 P0 事件处理。

当前实现没有证明 Supabase 托管环境允许恢复每一种 Auth 字段，也没有证明 OAuth 身份、MFA secret 或内部 schema 可完整移植。首次真实数据上线前，必须在独立 canary 项目验证登录、密码重置、OAuth（若启用）及附件下载。不能用“工作流成功”替代业务证据。

## 免费方案限制

- GitHub 公开仓库目前可使用 Actions/Artifact 免费额度，但每日全量备份会持续占用存储和网络配额，数据增长后可能产生费用或被限额；不能承诺永久免费。仓库 Actions retention 设置必须允许至少 35 天。
- RPO 目标为 24 小时；定时任务延迟、项目暂停或 GitHub 故障会放大 RPO。
- 小数据集演练 RTO 目标为 4 小时，不是 SLA；Auth/Storage 限流和远程 reset 会影响恢复时间。
- 数据接近 Artifact、runner 磁盘或 60 分钟时限时，必须迁移到专用对象存储和托管备份。
- Artifact 仍依赖 GitHub。每月至少复制一份密文到受控离线介质，只记录校验和和保管人。

## 首次配置

在离线设备执行 `age-keygen`。私钥只进入加密介质或密码库，不提交仓库、不放 GitHub Secrets、不粘贴到 workflow input。把 `age1...` 公钥配置为 `cloud-production-ops` 环境变量 `BACKUP_AGE_RECIPIENT`。

创建 `cloud-production-ops`：仅允许 `main` deployment branch且不配置 reviewer，否则 schedule 会等待审批。配置 Secrets `SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`、`VITE_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，并保证 `SUPABASE_ACCESS_TOKEN` 可用。它只服务无人值守备份，不复用生产发布审批。

恢复使用一次性自托管 Linux runner，标签为 `dealpilot-dr`。把离线私钥只读挂载到 workspace 和 runner temp 之外，权限 `0400` 或 `0600`。在目标环境设置 `AGE_IDENTITY_FILE` 为该绝对路径，完成后注销 runner 并卸载私钥。

恢复环境还需配置：

- Preview：`PREVIEW_SUPABASE_SERVICE_ROLE_KEY`、`PREVIEW_DATABASE_URL`。
- Canary：`CANARY_SUPABASE_SERVICE_ROLE_KEY`、`CANARY_DATABASE_URL`。
- Production：`SUPABASE_SERVICE_ROLE_KEY`、`PRODUCTION_DATABASE_URL`。
- Variables：`PRODUCTION_SUPABASE_PROJECT_REF`、`DR_RESTORE_ALLOWED=true`、`AGE_IDENTITY_FILE`。

数据库 URL 必须 percent-encode 密码并包含对应 project ref。preview/canary 必须是专用破坏性恢复项目。`cloud-production` 必须保留 required reviewers；`DR_RESTORE_ALLOWED` 仅在演练或事故窗口开启。

## 每日备份

`.github/workflows/backup-cloud.yml` 每日运行，也可从 `main` 手动触发。成功要求：配置完整且 project ref/URL 匹配；关系导出和附件下载全部成功；对象及外层 manifest 摘要通过；age 密文非空；Artifact 路径只指向一个 `.tar.age`。

任一步失败都不会上传明文 dump。不得添加上传 `$RUNNER_TEMP`、调试 dump 或 Storage 目录的失败诊断。连续两次定时失败按生产事件处理。35 天 TTL 是 GitHub 删除请求，不是加密擦除证明。

## Preview/Canary 演练

1. 建立审批记录，写明 backup run ID、artifact、目标、执行人和数据访问授权。
2. 启动临时 `dealpilot-dr` runner并挂载私钥，确认目标 `DR_RESTORE_ALLOWED=true` 且不是 production。
3. 从 `main` 运行 `Restore WebCloud encrypted backup`，输入 HTTPS 审批 URL和确认词 `RESTORE TEST ENVIRONMENT`。
4. 工作流先通过 GitHub API 验证 run 属于本仓库的 `backup-cloud.yml`、分支为 `main` 且结论成功，并校验 artifact 名中的 run ID；age 本身不认证发送者，不能跳过该检查。随后用当前 `main` migrations reset 目标，再替换 Auth identities、关系数据和 attachments。checksum、SQL 或对象上传任一步失败即停止。
5. 受控验证登录/重置密码、Customer 关联详情和附件 SHA-256。姓名、邮箱、文件名、JWT 及查询结果不得进入日志/issue。
6. 记录 RPO/RTO 和偏差，销毁测试数据并注销 runner。

至少每月演练一次。只验证解密不算恢复成功。

## 生产恢复

生产恢复是破坏性数据操作，不是发布回滚。执行前必须冻结写入并确认恢复点后的数据损失范围，同时满足：

- `cloud-production` reviewer 审批，临时打开 `DR_RESTORE_ALLOWED`。
- HTTPS incident/双人审批记录和确认词 `RESTORE PRODUCTION FROM ENCRYPTED BACKUP`。
- 临时自托管 runner 挂载离线私钥；GitHub 不保存私钥。
- 当前 `main` 已在 canary 恢复同一备份成功。恢复先应用当前向前 schema，再导入 data-only dump；不执行反向 migration。
- 已保存事故后数据库和 Storage 的独立加密取证副本。

完成后轮换数据库密码、service-role key 及受影响 OAuth secret，强制用户重新登录。若 Auth 导入受 Supabase 托管限制失败，停止并通过 Supabase 支持或 Admin API 重建账号，不得跳错后宣称成功。

## 上线门禁状态

完成以下证据前，状态只能是“实现完成、灾备未验收”：至少一次成功定时密文 Artifact；仓库允许 35 天 retention；离线私钥双人保管；canary 完成 Auth/关系/附件全链路恢复；最大预估数据量的 RPO/RTO 测量；生产审批和临时开关演练。

缺少任一项时，不得把 Supabase Free + GitHub Artifact 描述为已验证生产备份。
