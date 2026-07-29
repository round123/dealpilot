# G1 本地架构 Spike 详细方案 V1.0

> **承接**：[外贸经理个人工作台_系统架构设计_V1.3.md](./外贸经理个人工作台_系统架构设计_V1.3.md) §21
>
> **目的**：把架构文档中一句话描述的 9 条 G1 验证项，扩展为可执行、可验收、可降级的工程方案。G1 是 V1 业务实现的前置门禁——任何一项失败，都意味着 V1 范围或排期需要重新评估。
>
> **时间盒**：建议总时长 2 周（10 个工作日），每项独立时间盒见下文。多项可并行。
>
> **总原则**：每项产出 = 可运行原型 + 通过/失败判定 + 失败降级方案。无降级方案的风险项不得进入 V1 排期。
>
> **运行时**：V1.3 已决策使用 Bun（`bun build --compile`）。Spike 验证围绕 Bun 展开，Node SEA 不再是主选方案。

---

## 0. 验证项一览与依赖关系

| 编号 | 验证项 | 时间盒 | 依赖 | 阻塞性 |
|------|--------|--------|------|--------|
| S1 | NSIS 安装与卸载（无运行时环境） | 1.5 天 | 无 | 🔴 阻断 V1 |
| S2 | Bun `build --compile` 打包与单实例启动 | 1.5 天 | 无 | 🔴 阻断 V1 |
| S3 | 自动打开浏览器并加载工作台 | 0.5 天 | S2 | 🟡 影响 UX |
| S4 | Native Messaging Agent 发现与认证 | 2 天 | S2 | 🔴 阻断插件端 |
| S5 | 回环绑定与跨域防护 | 1 天 | S2 | 🔴 安全阻断 |
| S6 | `bun:sqlite` / `better-sqlite3` + SQLCipher 编译与运行 | 2 天 | S2 | 🔴 阻断 V1 |
| S7 | node-systray 托盘稳定性（Bun 兼容性） | 1 天 | S2 | 🟡 影响 UX |
| S8 | node-notifier 系统通知（Bun 兼容性） | 0.5 天 | 无 | 🟡 影响提醒 |
| S9 | 加密备份与全新环境恢复 | 1.5 天 | S6 | 🔴 阻断数据安全 |
| S10 | Bun `build --compile` 性能与资源占用 | 0.5 天 | S2 | 🟡 影响验收 |

并行策略：S2、S6、S8 可并行启动；S3、S4、S5、S7、S10 等 S2 完成后启动；S9 等 S6 完成后启动。

---

## S1. NSIS 安装与卸载（无运行时环境）

### 验证目标

证明最终用户无需预装 Python / Node / Bun / Rust / 任何 SDK，即可在全新 Windows 10/11 用户账户下完成安装、启动、卸载全流程。

### 验证步骤

1. 准备一台全新 Windows 11 虚拟机（VMware/Hyper-V 均可），仅含系统自带软件，不安装 Node、Python、Rust、Git、Visual Studio
2. 创建一个非管理员的全新用户账户（模拟普通办公用户）
3. 用 NSIS 打包一个最小 `DealPilot-Setup.exe`，内含：
   - `app\dealpilot-agent.exe`（Bun `build --compile` 单文件，可只输出 "hello"）
   - `app\web\index.html`（占位页面）
   - Native Messaging Manifest 模板
   - 卸载器
4. 该用户双击 `DealPilot-Setup.exe`，按默认选项完成安装
5. 验证安装目录文件齐全
6. 双击桌面快捷方式启动 `dealpilot-agent.exe`，验证进程可启动
7. 通过控制面板"程序与功能"卸载，验证卸载干净（安装目录、注册表项、快捷方式全部清除）

### 通过判据

- [ ] 全流程零依赖错误（不提示缺少 dll、运行时、SDK）
- [ ] 安装、启动、卸载三步均可在非管理员账户下完成
- [ ] 卸载后无残留文件和注册表项
- [ ] 安装包体积 ≤ 50MB（含 Bun 编译 exe + 静态资源占位）

### 失败判据

- 任一步骤提示缺少运行时依赖
- 卸载残留文件或注册表
- 非管理员账户被 UAC 阻断

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| Bun `build --compile` 在某些 Windows 构建上启动失败 | 改用 Node SEA（Node 25.5+）或 `@vercel/ncc` 预打包 + Bun `--compile` 仅封装 JS 层 |
| NSIS 打包流程过于复杂 | 改用 Inno Setup，社区模板更成熟 |
| 体积超标 | 排查 Bun 是否打入了无用模块；使用 `--minify` 选项 |

### 输出物

- 可安装的 `DealPilot-Setup.exe`（最小版本）
- 安装/卸载录屏
- 体积测量报告

---

## S2. Bun `build --compile` 打包与单实例启动

### 验证目标

证明 Bun `build --compile` 能产出可独立运行的 `dealpilot-agent.exe`，支持单实例锁，第二次启动时激活已有实例而非创建新进程。同时验证前端静态资源可内嵌于单文件中。

### 验证步骤

1. 用 `bun build --compile ./agent.ts --outfile dealpilot-agent.exe` 生成单文件 exe
2. 验证前端静态资源可内嵌：写一个最小 `index.html`，在 `agent.ts` 中 `import index from "./index.html"`，用 `Bun.serve()` 托管，编译后验证 exe 内可访问该页面
3. 写一个最小 Agent：启动 HTTP 服务器（`Bun.serve`，端口随机或固定 48321）、写一个锁文件到 `%LOCALAPPDATA%\DealPilot\agent.lock`（含 PID）
3. 第一次启动：创建锁文件、监听端口、日志输出 PID
4. 第二次启动：检测到锁文件存在且 PID 存活，向前一实例发激活信号后自身退出
5. 强杀第一个实例（任务管理器结束进程），第三次启动：检测到锁文件存在但 PID 已死，清理锁文件后正常启动

### 通过判据

- [ ] Bun `build --compile` 生成的 exe 可在无 Bun 环境的机器上运行（依赖 S1 验证）
- [ ] 内嵌的前端静态资源可正常通过 `Bun.serve()` 访问
- [ ] 单实例锁正确，二次启动不会启动第二个监听进程
- [ ] 进程异常退出后，锁文件可被新实例自动清理
- [ ] 启动时间 ≤ 2 秒（冷启动，不含浏览器自启）

### 失败判据

- Bun `build --compile` 生成的 exe 在目标机器上启动失败
- 内嵌静态资源无法访问
- 单实例锁不可靠（出现两个监听同一端口的进程）
- 锁文件死锁（前一进程异常退出后新进程无法启动）

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| Bun `build --compile` 不稳定 | 改用 Node SEA（Node 25.5+，已简化构建命令）；或 `@vercel/ncc` 预打包后用 Bun 仅封装 |
| 前端资源无法内嵌 | 改为外部静态资源目录，Agent 通过 `Bun.serve` 从磁盘读取；需额外处理版本同步 |
| 锁文件方案不可靠 | 改用 Windows 互斥量（Mutex）API，通过 `bun:ffi` 调用 |
| Bun exe 体积过大 | 使用 `--minify` 选项；排查是否打入了不必要的依赖 |

### 输出物

- `dealpilot-agent.exe`（Bun `build --compile` 最小可运行版本，含单实例锁 + 内嵌前端）
- 启动时间测量报告

---

## S3. 自动打开浏览器并加载工作台

### 验证目标

证明 Agent 启动后能自动打开默认浏览器到 `http://127.0.0.1:{port}/?token={oneTimeToken}`，浏览器加载静态工作台页面。

### 验证步骤

1. Agent 启动后生成一次性 token（32 字节随机）
2. 调用 Windows `start` 命令或 `open` 等价物打开默认浏览器到带 token 的 URL
3. 浏览器加载 `index.html`，前端 JS 读取 URL 中的 token，存入 `sessionStorage`
4. 前端用该 token 调 `GET /api/v1/health`，返回成功后清掉 URL 中的 token（用 `history.replaceState`）
5. 后续 API 请求从 `sessionStorage` 取 token，放 `Authorization: Bearer` 头
6. 关闭浏览器标签后再次双击 Agent 桌面图标：Agent 检测到已运行，重新生成 token 并再次打开浏览器

### 通过判据

- [ ] 双击 Agent 后 ≤ 3 秒浏览器自动打开并加载工作台
- [ ] token 只在 URL 中出现一次，加载完成后 URL 不再包含 token
- [ ] 关闭标签后重新双击图标可重新打开工作台（用新 token）
- [ ] 直接访问 `http://127.0.0.1:{port}/`（不带 token）被拒绝

### 失败判据

- 浏览器未自动打开
- token 残留在浏览器历史记录中
- 无 token 访问未被拒绝

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| `start` 命令在某些环境失效 | 改用 `node-open` 或 `open` npm 包，封装跨平台逻辑 |
| token 残留历史 | 改用 `postMessage` 在新开标签和 Agent 间握手，token 不进 URL；但实现复杂度上升 |
| 默认浏览器是 IE | 检测并提示用户复制 URL 到 Chrome/Edge |

### 输出物

- 自动开浏览器 + token 流程录屏
- token 残留扫描报告（检查 `history`、`localStorage`、`sessionStorage`）

---

## S4. Native Messaging Agent 发现与认证

### 验证目标

证明 Chrome/Edge 扩展能通过 Native Messaging 协议发现本机 Agent，并完成配对拿到 API 令牌。这是插件端能否工作的前置条件。

### 验证步骤

1. 用 WXT 初始化一个最小 Manifest V3 扩展项目（`pnpm create wxt`），包含 `nativeMessaging` 权限
2. 编写 Agent 的 Native Messaging Host 部分：
   - 注册 NM Host Manifest 到 Windows 注册表 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dealpilot.agent`
   - Manifest 指向 `dealpilot-agent.exe` 的 NM 入口模式（或独立 `nm-host.exe`）
3. Agent 启动时同时监听 NM stdio 和 HTTP 端口
4. 扩展 Service Worker 调 `chrome.runtime.connectNative('com.dealpilot.agent')`
5. Agent 收到 NM 连接后：
   - 校验调用方扩展 ID 是否在白名单
   - 返回 `{ port, apiVersion, pluginToken }`
6. 扩展拿到 token 后调 `GET /api/v1/health` 验证
7. 关闭浏览器，再打开：扩展重新走 NM 流程，拿到新 token

### 通过判据

- [ ] 扩展能成功建立 NM 连接（无"指定原生消息宿主未找到"错误）
- [ ] Agent 能校验扩展 ID，拒绝非白名单扩展
- [ ] 浏览器重启后扩展能自动重新配对
- [ ] NM 通信延迟 ≤ 200ms

### 失败判据

- NM Host 注册失败
- 扩展 ID 校验不生效
- 浏览器重启后无法重新连接

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| NM Host 注册到 HKCU 失败 | 安装包提供"修复插件连接"工具，手动重新注册 |
| Agent 进程作为 NM Host 启动有问题 | 拆出独立 `nm-host.exe`（更小的 Bun 编译），只负责发现 Agent 端口并转发 |
| 用户卸载重装浏览器导致 NM 配置丢失 | Agent 启动时检测并自动重新注册 NM Manifest |

### 输出物

- 最小可运行 WXT 扩展 + Agent NM 模块
- 注册表注册脚本
- 浏览器重启后自动重连录屏

---

## S5. 回环绑定与跨域防护

### 验证目标

证明 Agent 只监听 `127.0.0.1`，普通网页和同浏览器其它标签（无 token）无法调用 API。这是数据安全的前置条件。

### 验证步骤

1. Agent 启动后只 bind `127.0.0.1:{port}`，不 bind `0.0.0.0`
2. 在另一台同网段机器上用 `curl http://{本机IP}:{port}/api/v1/health`，验证连接被拒绝
3. 在本机用 `curl http://127.0.0.1:{port}/api/v1/health`（不带 token），验证返回 401
4. 在本机用 `curl http://127.0.0.1:{port}/api/v1/health`（带正确 token），验证返回 200
5. 在浏览器打开一个普通网页（如 `https://example.com`），用 fetch 调用 `http://127.0.0.1:{port}/api/v1/health`，验证被 CORS 策略拦截
6. 在同一浏览器打开工作台标签（带 token）和另一个普通标签，验证只有工作台标签能调 API
7. 校验 `Host` 头只允许 `127.0.0.1:{port}` 或 `localhost:{port}`，拒绝其它 Host

### 通过判据

- [ ] 局域网其它机器无法访问
- [ ] 无 token 请求被拒
- [ ] 跨域请求被 CORS 拦截
- [ ] 同浏览器非工作台标签无法调 API（即便手动加 token，Origin 校验也拒绝）
- [ ] Host 头校验生效

### 失败判据

- 任一安全检查被绕过

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| CORS 策略不足以拦截 | 在 Agent 层显式校验 `Origin` 头，只允许 `http://127.0.0.1:{port}` |
| 同浏览器其它标签可窃取 token | token 加上 `SameSite=Strict` 和短期失效；工作台标签关闭后 token 立即失效 |
| 局域网可访问 | Windows 防火墙规则显式阻止端口外部访问 |

### 输出物

- 安全测试报告（含所有攻击向量的测试结果）
- 推荐的 CORS / Origin / Host 校验配置

---

## S6. `bun:sqlite` / `better-sqlite3` + SQLCipher 编译与运行

### 验证目标

证明在 Bun 运行时下，SQLite + SQLCipher 加密数据库可创建、读写、关闭后重新打开、跨进程使用。优先验证 `bun:sqlite`（Bun 原生，零编译），如果 `bun:sqlite` 不支持 SQLCipher 扩展，回退验证 `better-sqlite3`（Bun npm 兼容层）。

### 验证步骤

1. **优先验证 `bun:sqlite`**：
   - 用 `bun install` 或直接 `import { Database } from "bun:sqlite"` 导入
   - 检查 `bun:sqlite` 是否支持 SQLCipher 的 `PRAGMA key` 语法
   - 如果支持，执行加密数据库测试脚本（见下方）
   - 如果不支持，跳到步骤 2
2. **回退验证 `better-sqlite3`**：
   - 在 Bun 项目中 `npm install better-sqlite3`
   - 验证 `better-sqlite3` 在 Bun 运行时下能正常加载（Bun 的 npm 兼容层）
   - 如果加载失败，尝试 `better-sqlite3` 的 prebuilt 二进制
3. **加密数据库测试脚本**（两种驱动通用）：
   - 用 SQLCipher `PRAGMA key` 设置密码
   - 创建表 `customers (id INTEGER PRIMARY KEY, name TEXT)`
   - 插入 1000 行测试数据
   - 关闭数据库连接
   - 用错误密码重新打开，验证失败
   - 用正确密码重新打开，验证数据完整
4. 把数据库文件复制到另一台机器，用相同密码打开，验证可读
5. 把带 SQLCipher 的 Agent 打入 `bun build --compile`，验证编译后 exe 内可正常使用 SQLite + 加密
6. 测试数据库迁移：写一个最小 Drizzle 迁移脚本（加列），验证迁移幂等

### 通过判据

- [ ] `bun:sqlite` 或 `better-sqlite3` 在 Bun 运行时下正常加载
- [ ] SQLCipher 加密生效（错误密码无法打开）
- [ ] 数据库文件跨机器可用（证明加密不绑定机器硬件）
- [ ] `bun build --compile` 后的 exe 内可正常使用 SQLite + 加密
- [ ] Drizzle 迁移脚本幂等

### 失败判据

- `bun:sqlite` 和 `better-sqlite3` 在 Bun 上都无法加载
- 加密不生效
- Bun `build --compile` 后的 exe 内无法加载原生模块

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| `bun:sqlite` 不支持 SQLCipher | 回退 `better-sqlite3`（Bun npm 兼容层）；如果 `better-sqlite3` 也无法加载，改用 `bun:ffi` 直接调用 `sqlcipher.dll` |
| `better-sqlite3` 在 Bun 上不兼容 | 改用 `@vscode/sqlite3` 或等待 Bun 官方 SQLCipher 支持 |
| `bun build --compile` 后原生模块不可用 | 把 `.node` 文件放在 exe 外部，运行时动态加载；或用 `bun:ffi` 直接调用 DLL |
| SQLCipher 在某些 Windows 构建上不稳定 | 改用 DPAPI（Windows 数据保护 API）加密整个数据库文件，SQLite 用明文，但文件落盘加密 |

### 输出物

- `bun:sqlite` / `better-sqlite3` + SQLCipher 在 Bun 上的可行性报告（含哪个驱动可用、加载方式）
- 加密数据库测试脚本
- `bun build --compile` 后运行录屏

---

## S7. node-systray 托盘稳定性

### 验证目标

证明 `node-systray` 在 Bun 运行时 + Windows 11 上能稳定显示托盘图标和菜单，支持点击菜单项触发回调，进程长时间运行无内存泄漏或图标消失。Bun 的 npm 兼容层是否能正常加载 `node-systray` 的 C++ 原生模块是关键验证点。

### 验证步骤

1. 在 Bun 项目中 `npm install node-systray`，验证在 Bun 运行时下可正常加载
2. 如果 `node-systray` 无法在 Bun 下运行，尝试 `@trayicon/nodejs` 或用 `bun:ffi` 直接调用 Windows Shell_NotifyIcon API
3. 用可用方案创建托盘图标，含菜单项：打开工作台、查看提醒、退出
2. 点击"打开工作台"：触发 `open` 事件，调 S3 的开浏览器逻辑
3. 点击"退出"：清理资源、关闭数据库、退出进程
4. 让 Agent 运行 24 小时，每小时检查一次：
   - 托盘图标是否还在
   - 内存占用是否持续增长
   - 点击菜单是否仍响应
5. 模拟用户切换 Windows 账户、锁屏、解锁，验证托盘图标恢复
6. 模拟资源管理器重启（`taskkill /f /im explorer.exe` 后重启），验证托盘图标恢复

### 通过判据

- [ ] 托盘图标 24 小时稳定显示
- [ ] 菜单点击回调正常
- [ ] 24 小时内存增长 ≤ 20MB
- [ ] 切换账户、锁屏、资源管理器重启后图标自动恢复

### 失败判据

- 图标消失
- 内存持续增长
- 菜单点击无响应

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| `node-systray` 在 Bun 下不兼容 | 改用 `@trayicon/nodejs`；或用 `bun:ffi` 直接调用 Windows `Shell_NotifyIcon` API |
| 图标在资源管理器重启后消失 | 监听 `TaskbarCreated` Windows 消息，自动重新创建托盘 |
| 内存泄漏 | 定时重启托盘子进程（每 6 小时），不影响主 Agent |
| 所有 Node 托盘库在 Bun 下都不可用 | 回退 Node.js 运行时（仅托盘子进程），主业务仍用 Bun；或用 `bun:ffi` 自行实现 |

### 输出物

- 托盘稳定性测试报告（含 24 小时内存曲线）
- 异常场景恢复录屏

---

## S8. node-notifier 系统通知

### 验证目标

证明 `node-notifier` 在 Bun 运行时下，Chrome 浏览器关闭时仍能通过 Windows 系统通知触达用户。

### 验证步骤

1. 在 Bun 项目中 `npm install node-notifier`，验证在 Bun 运行时下可正常加载
2. 如果 `node-notifier` 无法在 Bun 下运行，尝试用 `bun:ffi` 调用 Windows Toast API
3. Agent 启动后调用可用方案发送一条测试通知
2. 关闭所有 Chrome 窗口，仅保留 Agent 进程
3. Agent 在 5 秒后发送第二条通知，验证能触达
4. 测试通知交互：点击通知后是否可触发回调（如打开工作台）
5. 测试 Windows 专注助手开启时通知是否被抑制（应被抑制，但提醒任务仍落库）
6. 测试系统重启后 Agent 自启动（如启用），验证通知仍可触达

### 通过判据

- [ ] Chrome 关闭后通知仍能触达
- [ ] 通知点击可触发回调
- [ ] 专注助手开启时通知被正确抑制（不报错）
- [ ] 系统重启后通知功能正常

### 失败判据

- Chrome 关闭后通知无法触达
- 通知点击无回调

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| `node-notifier` 在 Bun 下不兼容 | 改用 Windows 原生 Toast API（通过 `bun:ffi` 调用 `user32.dll` 或 PowerShell `New-BurntToastNotification`） |
| 通知点击回调不工作 | 通知里附带 deep link，点击后由系统打开浏览器到工作台对应页面 |
| 专注助手抑制问题 | 不依赖通知作为唯一触达渠道；插件角标和工作台待办列表作为补充 |

### 输出物

- 通知触达测试报告（含 Chrome 关闭场景）
- 通知交互录屏

---

## S9. 加密备份与全新环境恢复

### 验证目标

证明用户可用密码导出加密备份，并在全新安装的环境中完整恢复业务数据。

### 验证步骤

1. 在 Agent A 中创建测试数据：10 个客户、20 个跟进、5 个项目、10 条提醒
2. 用户输入备份密码，Agent 用 `Bun.password.hash`（Argon2id）派生密钥，`node:crypto` AES-256-GCM 加密归档整个数据库
3. 导出 `dealpilot-backup-YYYYMMDD.db.enc` 文件
4. 在另一台全新机器上安装 Agent B（无现有数据库）
5. Agent B 启动后选择"从备份恢复"，输入正确密码
6. 验证恢复后数据完整：客户数、跟进数、项目数、提醒数与原库一致
7. 用错误密码尝试恢复，验证失败且不创建任何文件
8. 用截断的备份文件尝试恢复，验证失败且不覆盖现有数据
9. 用未来版本的备份文件尝试恢复，验证版本校验生效

### 通过判据

- [ ] 加密备份文件可在全新环境恢复
- [ ] 数据完整性 100%（行数、字段值一致）
- [ ] 错误密码、截断文件、版本过新均被拒绝
- [ ] 恢复失败不覆盖现有数据

### 失败判据

- 恢复后数据缺失或损坏
- 错误密码可部分解密
- 恢复失败覆盖现有数据

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| `Bun.password.hash`（Argon2id）在 Windows 上性能不足 | 调低迭代次数（但仍需满足 OWASP 最低建议）；或改用 `node:crypto.scrypt` |
| AES-256-GCM 实现有问题 | 改用 `node:crypto` 内置 AES-256-CBC + HMAC-SHA256（Encrypt-then-MAC） |
| 跨版本备份不兼容 | 备份文件内嵌 schema 版本，恢复时自动执行迁移；不兼容版本明确拒绝并提示用户升级 Agent |

### 输出物

- 加密备份 + 恢复测试脚本
- 数据完整性对比报告
- 异常场景测试报告

---

## S10. Bun `build --compile` 性能与资源占用

### 验证目标

证明 Bun `build --compile` 打包的 Agent 在启动时间、空闲内存、CPU 占用上满足架构 §17 性能目标。

### 验证步骤

1. 用 S2 的 Bun `build --compile` exe，冷启动 10 次，记录每次启动时间（从双击到 HTTP 服务器 ready）
2. 启动后静置 30 分钟，每 5 分钟记录一次内存和 CPU
3. 模拟业务负载：连续 100 次 API 请求（CRUD），记录响应时间和内存变化
4. 模拟提醒负载：同时调度 50 条提醒，记录峰值内存
5. 对比 Bun 1.3.9+ 字节码优化（`--bytecode` 选项）前后的启动时间差异

### 通过判据

- [ ] 冷启动时间 P95 ≤ 2 秒
- [ ] 空闲内存 ≤ 80MB（架构 §17 目标，Bun 预期 30–50MB）
- [ ] 空闲 CPU 接近 0%
- [ ] 100 次 CRUD 请求 P95 ≤ 200ms
- [ ] 50 条提醒并发峰值内存 ≤ 120MB

### 失败判据

- 任一性能指标超出目标 50% 以上

### 降级方案

| 失败场景 | 降级方案 |
|---------|---------|
| Bun `build --compile` 启动慢 | 启用 `--bytecode` 选项（1.3.9+ 支持）；或延迟加载非核心模块 |
| 内存超标 | 排查是否有内存泄漏；限制 SQLite 缓存大小；定时 GC |
| CRUD 慢 | 排查 SQLite 索引；批量化写入 |

### 输出物

- 性能测试报告（含 10 次冷启动数据、内存/CPU 曲线、负载测试数据）
- Bun 字节码优化前后对比报告（如适用）

---

## 总结：G1 退出条件

G1 完成的判定标准：

1. **所有 🔴 阻断项必须通过**（S1、S2、S4、S5、S6、S9）
2. **🟡 影响项至少有降级方案**（S3、S7、S8、S10 可降级，但降级方案必须明确且可实施）
3. **每项都有可运行原型 + 测试报告**
4. **失败项有明确的 V1 范围调整建议**（如 `bun:sqlite` + SQLCipher 不过则改 `better-sqlite3` 或 DPAPI；node-systray 在 Bun 下不可用则改 `bun:ffi`；Bun `build --compile` 不过则回退 Node SEA）

G1 通过后进入 G2（架构骨架）阶段。G1 失败的任一阻断项需重新评审 V1 范围或排期，不得带病进入 V1 业务实现。

---

## 时间安排建议

| 周次 | 任务 |
|------|------|
| 第 1 周（Day 1-5） | S1、S2、S6、S8 并行启动；S2 完成后启动 S3、S5、S7、S10 |
| 第 2 周（Day 6-10） | S4（依赖 S2）、S9（依赖 S6）启动；剩余项收尾、写测试报告、G1 评审 |

**关键路径**：S2 → S4 → S5（约 4.5 天），是 G1 的最长路径。建议优先投入 S2。

---

**文档结束**