# Supabase 与 GitHub 密钥轮换手册

## 1. 适用范围

本手册用于 DealPilot V2 的 Supabase CLI PAT、数据库密码、`service_role`、浏览器 publishable key 和生产 smoke 账号轮换。轮换顺序固定为“独立环境验证 → canary → production → 撤销旧凭据 → 验证旧凭据失效”。

不得在 Issue、PR、workflow summary、命令历史、截图或演练记录中写入密钥原文。记录只保留 secret 名称、环境、供应商侧 ID/指纹或末 4 位、创建/撤销时间和操作者。

## 2. 凭据清单与边界

| 凭据                                         | GitHub 位置               | 使用方                    | 影响                                                               |
| -------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`                      | 仓库 secret               | Supabase CLI 部署         | 账号级 PAT，preview/canary/production 共用，不能依赖它实现项目隔离 |
| `PREVIEW_SUPABASE_DB_PASSWORD`               | `cloud-preview`           | Preview migration/link    | 仅 Preview 数据库                                                  |
| `CANARY_SUPABASE_DB_PASSWORD`                | `cloud-canary`            | Canary migration/link     | 仅 Canary 数据库                                                   |
| `SUPABASE_DB_PASSWORD`                       | `cloud-production`        | Production migration/link | 仅生产数据库；浏览器运行时不使用                                   |
| `SUPABASE_SERVICE_ROLE_KEY`                  | `cloud-production`        | 受控运维 Edge 调度        | 可绕过 RLS，最高敏感级别，禁止进入 Web 构建                        |
| `PREVIEW_VITE_SB_PUBLISHABLE_KEY`            | 仓库 secret               | Preview Web 构建          | 公共客户端键，不授予 `service_role`                                |
| `CANARY_VITE_SB_PUBLISHABLE_KEY`             | `cloud-canary`            | Canary Web 构建           | 公共客户端键                                                       |
| `VITE_SB_PUBLISHABLE_KEY`                    | 仓库及 `cloud-production` | 监控和生产 Web 构建       | 公共客户端键；虽非机密，仍需受控变更                               |
| `PREVIEW_E2E_*`                              | `cloud-preview`           | 两账号托管 E2E            | 只允许合成数据                                                     |
| `CLOUD_SMOKE_EMAIL` / `CLOUD_SMOKE_PASSWORD` | `cloud-production`        | 发布后认证 smoke          | 只读稳定合成 Customer，不得复用个人账号                            |
| `CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON`         | `cloud-production`        | 发布后认证 smoke          | 合成基线，不含密钥或真实客户数据                                   |

`*_SUPABASE_PROJECT_REF`、`*_VITE_SUPABASE_URL` 是目标标识而非密码。变更它们属于项目切换，必须走独立迁移/发布评审，不能夹带在普通密钥轮换中。

## 3. 通用前置条件

1. 建立变更或演练记录，写明原因、范围、负责人、审批人、维护窗口、失败回退和旧凭据撤销截止时间。
2. 确认 Preview、Canary、Production project ref 互不相同，当前 CI 和生产监控健康。
3. 从供应商控制台创建替代凭据；能并存时保留短暂双钥窗口，不能并存时安排维护窗口。
4. 使用 GitHub Environment secret 承载环境专用值；不要把生产值降级为仓库级 secret。更新操作不得回显值。
5. 先在 Preview/Canary 使用同类型新凭据验证。Canary 通过不代表可以跳过 `cloud-production` 审批。
6. 生产切换后观察至少一个完整发布 smoke 和一个计划监控周期，再撤销旧凭据。
7. 使用供应商审计记录或受控失败请求证明旧凭据已经失效；只记录 HTTP/CLI 失败结论，不记录旧值。

如果轮换由泄漏触发，跳过正常观察窗口，先撤销/隔离并按 `security-incident-response.md` 处置。可用性恢复服从安全隔离，不得为了 canary 顺序继续保留已泄漏凭据。

## 4. Supabase CLI PAT

`SUPABASE_ACCESS_TOKEN` 是账号级部署 PAT。由于当前三个通道共用该 secret，替换时需要证明新 PAT 能访问所有目标，但部署仍必须依靠不同 project ref 和数据库密码隔离。

1. 在 Supabase 账号创建新 PAT，使用独立名称和到期/复查日期。
2. 在受控终端用新 PAT列出或检查 Preview、Canary、Production 项目权限，不执行 migration。
3. 更新仓库 secret `SUPABASE_ACCESS_TOKEN`。
4. 从待发布 SHA 依次运行 Preview 和 `Deploy WebCloud` 的 canary；核对 link 目标和 artifact。
5. 经 `cloud-production` 审批后运行 production 发布，确认 migration、Edge、Web 和认证 smoke 通过。
6. 在 Supabase 撤销旧 PAT。
7. 使用旧 PAT 做一次只读身份/项目列表请求，确认返回未认证或无权；清除终端变量和临时认证文件。

## 5. 数据库密码

数据库密码通常不能双密码并存。应用运行时通过 Supabase API，不直接使用该密码，因此轮换主要短暂影响 CLI link/migration，而不应中断现有 Web 会话。

1. 先在 Canary 项目重置数据库密码，立即更新 `cloud-canary` 的 `CANARY_SUPABASE_DB_PASSWORD`。
2. 运行 canary 发布，确认 `supabase link`、`db push` 和后续 smoke 全部通过。
3. 用旧 Canary 密码发起受控连接，确认认证失败。
4. 为生产确定维护窗口和审批；在 Supabase 重置生产数据库密码后，立即更新 `cloud-production` 的 `SUPABASE_DB_PASSWORD`。
5. 从 `main` 运行 production 发布。不得通过回退数据库密码或反向 migration 处理失败；修正 secret 或向前恢复。
6. 用旧生产密码发起受控连接并确认失败，核对应用、监控和定时任务没有使用数据库直连密码。
7. Preview 密码按相同步骤单独轮换，不能复制 Canary 或生产密码。

## 6. `service_role`

`SUPABASE_SERVICE_ROLE_KEY` 可绕过 RLS，只允许存在于受保护的 `cloud-production` 环境和供应商密钥存储中。浏览器、PWA、扩展、artifact 和日志中出现该值均按 P0 事件处理。

Supabase 项目的 legacy `service_role` JWT 可能与 JWT signing secret、用户会话或其他 API key 联动。执行前必须在当前 Supabase 控制台确认轮换机制和影响范围；不能把“在 GitHub 中改一个值”当作供应商侧轮换。

1. 在独立 Canary 项目完整演练供应商支持的轮换流程，验证 gateway JWT 校验、角色识别和受控运维函数。
2. 确认生产轮换是否支持新旧 key 并存。若不支持，安排维护窗口，并准备 publishable key、用户会话和 Edge redeploy 的联动方案。
3. 在供应商侧生成/启用新凭据，更新 `cloud-production` 的 `SUPABASE_SERVICE_ROLE_KEY`。
4. 手动运行 Customer 清理或数据保留工作流，验证响应包络、计数和审计证据；不得用真实客户内容做探针。
5. 运行生产公开监控，并执行两个受控账号的 RLS 与 Customer 抽样核对。
6. 撤销旧 `service_role`；用旧 key 对受保护 Edge/RPC 发起受控请求，确认 `401/403` 或无执行权限。
7. 检查 GitHub Actions、Supabase Edge/数据库日志和构建 artifact，确认没有密钥原文。

如果供应商轮换同时更新 JWT signing key 或废止旧用户 token，必须提前通知受影响用户重新登录，并把会话失效验证纳入记录。

## 7. Publishable key

Publishable/anon key会出现在浏览器中，不依赖保密性保护数据；真正授权仍由用户 JWT、RLS 和 RPC 权限完成。它仍应轮换，以撤销旧客户端入口和验证 RLS 不依赖 key 保密。

1. 在对应 Supabase 项目创建新 publishable key；支持并存时保留旧 key 到新 Web 传播完成。
2. 先更新 Preview/Canary secret 并发布，验证登录、匿名拒绝、Customer 读取和 Storage 权限。
3. 更新仓库监控使用的 `VITE_SB_PUBLISHABLE_KEY` 与 `cloud-production` 同名 secret，确保两处值一致。
4. 发布 production Web/PWA，核对 `release.json`，完成认证 smoke，并等待 service worker 更新观察窗口。
5. 撤销旧 key；用旧 key 请求 Auth health/PostgREST，确认被拒绝，再验证新 key 的计划监控通过。
6. 若旧 PWA 缓存仍使用旧 key，按正常前向发布修复，不临时放宽 RLS 或恢复旧 `service_role`。

## 8. Smoke 与 E2E 账号

Smoke/E2E 账号不是员工账号，只能包含合成数据，并使用与其他账号不复用的随机密码。

1. 在 Preview 创建两套替代 E2E 账号，准备双账号隔离数据，更新 `PREVIEW_E2E_ALPHA_*` 和 `PREVIEW_E2E_BETA_*` 后运行 Hosted E2E。
2. 在 Canary 创建替代测试账号，手工完成登录、Customer 关联详情、写入和隔离验收。
3. 在 Production 创建替代 smoke 账号和唯一稳定 Customer fixture，计算准确的 `CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON`。
4. 同一变更窗口更新 `CLOUD_SMOKE_EMAIL`、`CLOUD_SMOKE_PASSWORD` 和期望 JSON，运行 production 发布的认证 smoke。
5. 禁用旧账号并撤销 refresh token/会话；验证旧密码和旧 refresh token 均不能换取有效会话。
6. 通过受控管理员流程清理旧合成账号及其数据，保留操作完成状态。自助删号功能保持关闭。

## 9. 完成与失败处理

轮换完成需要：新凭据在 Canary 和 Production 均通过指定用例；旧凭据已在供应商侧撤销并实测失效；没有明文泄漏；监控、清理任务和发布流程正常；记录包含审批、时间线、证据链接和下一次轮换日期。

若生产切换失败但旧凭据未泄漏且仍有效，可以在审批下暂时恢复旧应用配置，再修复前进；不得回退 PostgreSQL migration。若旧凭据疑似泄漏，不允许恢复使用，必须保持隔离并启动安全事件响应。

GitHub secret、workflow 和自动测试不能完成外部合规判断。轮换是否满足供应商合同、访问控制、人员离职和法定审计要求，必须由有权限的责任人签字。
