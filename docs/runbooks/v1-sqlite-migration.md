# V1 SQLite 一次性迁移手册

## 适用范围

本手册用于把 DealPilot V1 的 SQLite 数据一次性迁移到当前 WebCloud 的 PostgreSQL。迁移工具只读取 V1 数据库并创建一致性快照，不会修改源 SQLite、`-wal` 或 `-shm` 文件。

迁移确认前，可以在 Web 中放弃任务并继续保留 V1 SQLite。用户确认后，PostgreSQL 永久成为唯一事实源，不支持切回 SQLite 写入，也不建设 PostgreSQL 到 SQLite 的反向同步。

## 准备工作

1. 在仓库根目录执行 `pnpm install`，并确认本机可以运行 `pnpm` 和 `bun`。
2. 关闭旧版 DealPilot V1，避免提取期间数据库或 WAL/SHM 文件继续变化。
3. 找到 V1 数据库。Windows 安装版默认路径为：

   ```text
   %LOCALAPPDATA%\DealPilot\data\dealpilot.db
   ```

4. 准备一个独立输出目录。不要把输出目录放在 V1 数据目录内，也不要覆盖原数据库。
5. 登录当前 Web/PWA，并确认准备迁入的 PostgreSQL 账号尚无 CRM 业务数据。

## 生成迁移文件

在仓库根目录执行：

```powershell
pnpm migration:v1 -- "$env:LOCALAPPDATA\DealPilot\data\dealpilot.db" "D:\DealPilot-Migration"
```

也可以传入其他 V1 SQLite 绝对路径：

```powershell
pnpm migration:v1 -- "D:\旧版数据\dealpilot.db" "D:\DealPilot-Migration"
```

成功后，命令会输出 JSON 结果，并在输出目录生成两个文件：

| 文件                              | 用途                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `dealpilot-v1-<摘要>.snapshot.db` | 提取时创建的只读 SQLite 一致性快照，仅用于迁移核对和取证 |
| `dealpilot-v1-<摘要>.bundle.json` | 包含分类数据、数量、摘要和幂等键的迁移包，用于上传到 Web |

输出中的 `bundle_path`、`snapshot_path`、`bundle_sha256` 和 `idempotency_key` 应妥善留存。同一份源快照重复生成和上传时，幂等键用于安全重试。

如果提取失败，输出目录会生成 `dealpilot-v1-migration-errors.json`。先按其中的 `issues` 修复源数据或文件占用问题，再重新执行命令。失败提取不会修改原 SQLite。

## 上传、核对和确认

1. 打开 Web/PWA，进入“设置 / 云端数据”。
2. 在“迁移 V1 本地数据”区域选择 `dealpilot-v1-<摘要>.bundle.json`。
3. 点击“上传并核对”。页面会按数据集合上传，并比较记录数量和 SHA-256 摘要。
4. 核对未通过时不要确认。修复问题后，使用同一迁移包重试。
5. 核对通过后，检查客户、联系人、社媒账号、项目、跟进、提醒、风险、里程碑、审计记录和删除快照的数量。
6. 确认无误后点击“确认迁移”，并按页面要求输入“确认迁移”。正式数据会在一个 PostgreSQL 事务中写入。

不要上传 `.snapshot.db`；Web 只接收 `.bundle.json`。

## 确认前放弃

在点击最终“确认迁移”前，可以点击“放弃迁移”。系统会清理 PostgreSQL 中的暂存数据，不会修改 V1 SQLite 或生成的快照。之后可以修复问题并使用同一迁移包重新开始。

如果上传中断，可以重新选择同一迁移包继续。不要手工编辑 `.bundle.json`，否则摘要校验会失败。

## 确认后的数据边界

确认成功后：

- PostgreSQL 永久成为唯一业务事实源，Web/PWA 只读写 PostgreSQL。
- 不再回到 V1 SQLite 写模式，也不执行云端到 SQLite 的反向同步。
- `.snapshot.db` 和原 V1 SQLite 只能用于数量核对、审计取证或在全新空账号中重新迁移。
- 应用发布回滚只能部署上一兼容版本继续读取当前 PostgreSQL，不能用 SQLite 快照覆盖 PostgreSQL。

将快照和迁移包视为敏感业务数据，存放在访问受控的位置。核对与取证保留期结束后，按组织的数据保留策略处理，不要通过公共网盘或聊天工具传输。

## 验收清单

- 提取命令成功退出，源 `dealpilot.db` 的修改时间和内容未变化。
- 输出目录同时存在 `.snapshot.db` 和 `.bundle.json`，命令输出路径与实际文件一致。
- Web 核对结果无数量或摘要差异。
- 确认前放弃会清理暂存数据，原 SQLite 保持不变。
- 确认后 Customer 及其关联数据可在 Web 中读取，PostgreSQL 是唯一事实源。
