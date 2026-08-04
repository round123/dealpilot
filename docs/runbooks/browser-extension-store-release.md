# DealPilot 浏览器扩展商店发布清单

本清单适用于 Chrome Web Store 和 Microsoft Edge Add-ons 的候选包准备与人工提交。GitHub 工作流只构建、验证并保存候选 ZIP，**不代表已经上传商店、提交审核或审核通过**。商店后台的实时字段和尺寸要求高于本文；如后台要求变化，应先更新清单和素材再提交。

## 1. 候选包与版本

- [ ] 从 `main` 成功 CI 自动触发的 `Package Browser Extension`，或经 `cloud-production` 环境审批的 main 手动运行中，下载两个独立 artifact：`dealpilot-extension-chrome-<SHA>`、`dealpilot-extension-edge-<SHA>`。
- [ ] 核对 artifact 的提交 SHA 是计划发布的 SHA，不使用本机临时包或其他运行的产物。
- [ ] 核对 `apps/extension/package.json`、Chrome ZIP 文件名、Edge ZIP 文件名及两份 ZIP 内 `manifest.json.version` 完全一致。
- [ ] 保存两个 ZIP 的 SHA-256、工作流 URL、提交 SHA、版本号和验证人；不要在实际提交前填写商店提交 ID 或审核结论。
- [ ] 分别在当前 Chrome、Edge 中以开发者模式加载对应解压包，完成登录、WhatsApp/Telegram 客户识别、跟进标记和提醒操作冒烟测试。

## 2. 中文商店信息与素材

- [ ] 名称使用 `DealPilot`；简短说明、详细说明、功能列表和版本说明以中文为主，不承诺尚未上线的能力。
- [ ] 填写公开可访问的官网、支持联系方式和隐私政策 URL；无登录状态下也必须能打开隐私政策。
- [ ] Chrome 截图准备 1 至 5 张，使用 `1280 x 800` 或 `640 x 400` PNG/JPEG；画面只使用测试数据并遮蔽账号、客户、消息和令牌。
- [ ] Edge 截图最多 6 张，使用 `1280 x 800` 或 `640 x 480` PNG/JPEG；与实际 Edge 版本界面一致。
- [ ] Chrome 使用包内 `128 x 128` 图标；如后台要求宣传图，再单独准备 `440 x 280` 小宣传图，不能拉伸应用图标充数。
- [ ] Edge 商店 Logo 使用 1:1 PNG，建议 `300 x 300`、不得低于 `128 x 128`；如后台要求宣传图，按后台当次规格另行导出。
- [ ] 截图展示实际页面集成、客户摘要、跟进或提醒操作，不使用误导性合成界面，不出现第三方商标暗示官方合作。

参考规格：[Chrome 商店图片要求](https://developer.chrome.com/docs/webstore/images)；[Microsoft Edge 扩展发布要求](https://learn.microsoft.com/microsoft-edge/extensions/publish/publish-extension)。

## 3. 权限和数据使用申报

提交前逐项对照最终 ZIP 内 Manifest，不复制旧版本申报：

| 权限或 Host | 必要用途 | 申报要点 |
| --- | --- | --- |
| `storage` | 在扩展私有存储中保存 Supabase 登录会话，并限制 Content Script 读取 | 仅用于登录状态和核心功能，不用于广告或跨产品画像 |
| `alarms` | 定时刷新待办提醒角标 | 只执行提醒刷新，不在浏览器关闭后提供系统级通知 |
| `https://web.whatsapp.com/*` | 在 WhatsApp Web 当前会话中显示 CRM 浮窗、识别会话并由用户标记消息 | 只在支持站点运行，不申请 `<all_urls>` |
| `https://web.telegram.org/*` | 在 Telegram Web 当前会话中显示 CRM 浮窗、识别会话并由用户标记消息 | 只在支持站点运行，不申请 `<all_urls>` |
| 生产 Supabase HTTPS Origin | 登录并读取或写入用户自己的 Customer、跟进和提醒数据 | 只使用公开 publishable key 和用户会话，禁止嵌入 service-role/secret key |

- [ ] 在两个商店如实申报处理账号信息、客户/联系人资料、消息内容（仅用户主动标记时）、网站内容/会话标识和产品交互数据的实际范围。
- [ ] 说明数据传输到 DealPilot 的 Supabase 云端以提供 CRM 功能，并与已发布隐私政策中的供应商、跨境处理、保留和删除规则一致。
- [ ] 确认隐私申报覆盖身份验证令牌的本地存储；令牌不得进入 Content Script、日志、URL、截图或商店素材。
- [ ] 声明不出售数据、不用于定向广告、信用评估或与核心功能无关的分析；若实际行为变化，必须先更新产品和隐私政策，不能只改商店表单。
- [ ] 确认最终包仅有 `storage`、`alarms` 两项权限，Host 和 Content Script matches 没有通配到其他站点，CSP 不允许远程代码。

## 4. 人工审批和提交

- [ ] 发布人把版本、SHA、两个 checksum、冒烟结果、listing 预览、隐私政策 URL 和权限/数据申报交给审批人。
- [ ] 审批人确认 Chrome 与 Edge 使用各自 artifact，版本与 release notes 一致，并明确批准“上传候选包”和“提交审核”两个动作。
- [ ] 发布人登录对应开发者后台，上传 ZIP 后再次核对后台解析出的版本、权限和 Host；后台新增警告时停止提交并回到代码或清单修正。
- [ ] 只有实际点击提交后，才记录商店、提交 ID、提交时间、发布人、审批人和后台状态；审核通过后再记录上架 URL 和生效时间。
- [ ] 任一商店拒审时保留原候选包和拒审原文，修复后提升版本并重新生成两个候选包，不覆盖或重命名旧 ZIP 冒充新版本。

## 5. 发布记录模板

| 字段 | 值 |
| --- | --- |
| Release SHA / 版本 | 待填写 |
| Chrome artifact / SHA-256 | 待填写 |
| Edge artifact / SHA-256 | 待填写 |
| 冒烟测试记录 | 待填写 |
| 权限与数据申报复核人 | 待填写 |
| Chrome 提交 ID / 状态 | 未提交 |
| Edge 提交 ID / 状态 | 未提交 |
| 人工审批记录 | 待填写 |
