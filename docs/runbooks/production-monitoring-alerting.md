# WebCloud 生产监控与告警手册

## 1. 适用范围

本手册用于 DealPilot V2 Web/PWA、Supabase Auth、PostgREST 和受保护 Edge Functions 的生产健康监控、GitHub Issue 告警处置与恢复确认。

当前自动监控是公网合成探针，不是完整可观测性平台。它不替代 Supabase 数据库/鉴权日志、GitHub Pages 状态、备份恢复演练、安全事件响应或人工业务验收。处理真实用户数据前，仍须完成 PRD 要求的外部隐私、跨境、供应商和安全事件通知评审。

## 2. 自动监控基线

`.github/workflows/monitor-production.yml` 每小时第 7、22、37、52 分钟（UTC）计划运行，也允许手动触发。GitHub Actions 的计划任务是尽力调度，可能延迟；仓库长时间无活动、Actions 被禁用或平台故障时，不能保证准点执行。

工作流使用仓库级 `VITE_SUPABASE_URL` 和 `VITE_SB_PUBLISHABLE_KEY`，只携带公开客户端配置，不读取数据库密码、`service_role` 或生产 smoke 账号。它需要：

- `contents: read`：检出当前默认分支代码并执行 `scripts/cloud-smoke.mjs`；
- `issues: write`：创建、评论和关闭健康告警 Issue；
- `CLOUD_WEB_URL=https://round123.github.io/dealpilot/`；
- `RELEASE_SHA=${{ github.sha }}`，用于校验线上 `release.json` 与当前监控工作流所在提交一致。

自动探针覆盖：

| 信号                    | 成功条件                                               | 主要发现范围                         |
| ----------------------- | ------------------------------------------------------ | ------------------------------------ |
| Web release marker      | `release.json` 可读取且 SHA 等于预期                   | Pages 不可用、陈旧部署、发布身份错误 |
| Supabase Auth health    | `/auth/v1/health` 返回 2xx                             | Auth 网关或项目不可用                |
| PostgREST 匿名防线      | 匿名读取 `companies` 返回 `401/403` 且错误码为 `42501` | RLS/权限意外放开、API 行为漂移       |
| Customer 清理 Edge 防线 | 未认证调用 `purge-expired-customers` 返回 `401/403`    | 受保护运维函数意外公开、Edge 不可用  |

每个检查最多重试 12 次、间隔 5 秒。全部通过才算本轮成功。

以下内容当前不在计划探针内：真实账号登录、邮件验证和密码重置投递、Customer 写路径、Storage 上传/下载、定时清理是否实际处理数据、数据库容量/连接数/慢查询、备份可恢复性以及第三方供应商状态。发布工作流的认证 smoke 和定期人工演练必须继续保留。

## 3. GitHub Issue 告警语义

任一检查失败时，工作流查找标题完全等于 `[monitor] DealPilot production health check failed` 的开放 Issue：

- 不存在时创建一个 Issue，记录失败 workflow URL 和 commit；
- 已存在时保持原 Issue 开放，避免每 15 分钟重复建单；
- 后续检查成功时，在该 Issue 留下恢复 workflow URL 并自动关闭。

自动关闭只表示公网探针恢复，不表示根因已经确认、数据完整性已经证明、事件已经复盘或外部通知义务已经履行。若故障达到安全事件或真实用户影响级别，应另建事件记录，并在监控 Issue 中互相链接。

应用回滚期间，线上可能暂时运行早于 `main` 的兼容 SHA；此时 release marker 告警是预期信号，必须保持事件记录开放，直到恢复前进后探针再次通过。不得为消除告警而修改 marker、关闭监控或回退 PostgreSQL。

## 4. 值班与分级

当前团队规模较小时，同一人可以兼任事件指挥、技术处置和沟通，但必须在记录中分别写明责任。以下是内部响应目标，不是对外 SLA：

| 等级 | 示例                                                | 首次确认目标 | 处理要求                                         |
| ---- | --------------------------------------------------- | ------------ | ------------------------------------------------ |
| P0   | 数据跨账号暴露、`service_role` 泄漏、生产写入被破坏 | 15 分钟      | 立即隔离，启动安全事件手册，暂停发布和高风险写入 |
| P1   | 登录或核心 Customer 路径全面不可用、持续数据错误    | 30 分钟      | 建立事件记录，确定回滚或恢复前进负责人           |
| P2   | 部分功能失败、计划清理失败但核心读取可用            | 4 小时       | 当日定位，保留重试和数据核对证据                 |
| P3   | 单次瞬态失败、无用户影响且下一轮自动恢复            | 1 个工作日   | 核对运行记录和平台状态，必要时建立改进项         |

任何疑似越权、凭据泄漏、审计日志缺失或数据完整性问题至少按 P1 处理；确认存在未授权访问后升为 P0。

## 5. 告警处置

1. 打开告警 Issue 中的 workflow URL，记录失败步骤、首次失败时间、commit 和请求 ID。不要把 token、密码、完整响应体或客户字段粘贴到 Issue。
2. 检查 GitHub Actions、GitHub Pages 和 Supabase 官方状态；再查看对应 Supabase Auth、PostgREST、Edge 与数据库日志。
3. 从 `main` 手动运行 `Monitor WebCloud production` 复现。不要连续重跑掩盖稳定故障。
4. 按失败信号缩小范围：
   - release marker：核对 Pages deployment、`release.json`、当前 `main` SHA 和是否存在受控回滚；
   - Auth health：检查项目状态、Auth 配置和供应商事件，不尝试重置用户密码；
   - 匿名防线：立即按 P0/P1 处理，使用两个受控账号验证 RLS，并检查最近 migration；
   - Edge 防线：检查函数部署、gateway JWT 验证和函数日志，禁止用公开访问作为临时绕过。
5. 判断是否需要暂停生产发布、禁用注册、撤销凭据或执行兼容应用回滚。涉及安全的数据层修复只能使用向前 migration。
6. 修复后先运行针对性验证，再手动运行监控工作流。等待下一次计划运行通过，证明计划调度也恢复。
7. 核对自动关闭评论；将根因、用户影响、数据核对、修复 SHA 和后续任务写入事件或演练记录。

## 6. 恢复条件

关闭生产事件至少需要：

- 连续一次手动和一次计划监控运行通过；
- 当前线上 `release.json` 与预期生产 SHA 一致；
- Auth、PostgREST 匿名拒绝和受保护 Edge 拒绝均符合基线；
- 若涉及登录或业务数据，发布工作流的认证 Customer smoke 或等价人工用例通过；
- 若涉及写入、RLS、Storage 或数据清理，完成两个账号隔离与数量/摘要核对；
- 所有临时权限、调试日志和应急凭据已撤销；
- 安全事件所需的外部审批、通知决定和复盘责任人已记录。

## 7. 日常检查与演练

- 每周确认计划工作流最近一次成功、告警 Issue 没有被静默关闭、仓库 Actions 仍启用。
- 每月手动制造无数据风险的失败条件或在独立环境验证“失败建单、重复失败不重复建单、恢复自动关闭”。
- 每季度联合执行应用回滚/恢复前进、密钥轮换和安全事件桌面演练。
- 使用 `docs/runbooks/operational-drill-record-template.md` 保存范围、证据、审批和未完成项。

GitHub workflow、Issue 和自动测试只能提供技术证据。隐私、跨境、供应商、通知义务和真实用户试点批准必须由有权限的责任人或外部专业人员签字，不能由代码、CI 绿灯或自动关闭 Issue 代替。
