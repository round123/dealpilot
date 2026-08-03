# DealPilot 页面设计提示词（12 页）

> 基于 Spec §7 页面清单 + §8 设计 Token 约束生成。
> 所有页面遵循 P0 绝对规则：禁止 emoji 功能图标（统一 Lucide React）、禁止紫粉渐变、禁止空洞占位文案、禁止硬编码颜色值、禁止千篇一律 Hero。
> 设计 Token 引用统一来自 `design-tokens.json` / `design-tokens.css`。
> 响应式最低 1366x768，桌面优先；V1 只做浅色主题。

---

## 全局 Shell 约定（工作台 9 页共用）

工作台页面统一采用 **左侧固定 Sidebar + 顶部 Header + 主内容区** 三栏布局：

- **Sidebar**（宽 240px，可折叠到 56px，背景 `--color-bg-sidebar`）
  - 顶部 Logo 区：DealPilot 文字标识 + Lucide `Compass` 图标（24px）
  - 导航项（Lucide 图标 20px + 文字，激活态背景 `--color-bg-sidebar-active`，文字 `--color-text-primary`，非激活 `--color-text-secondary`）：
    - 仪表盘 `LayoutDashboard` → `/`
    - 客户 `Users` → `/customers`
    - 项目 `FolderKanban` → `/projects`
    - 待办 `ListTodo` → `/reminders`
    - 设置 `Settings` → `/settings`
  - 底部：当前账号入口和版本信息；不展示本地运行时、进程或设备状态
- **Header**（高 56px，背景 `--color-bg-card`，下边框 `--color-border-default`）
  - 左：面包屑（当前页名 + 父级）
  - 中：全局搜索框（Lucide `Search` 16px + 输入区，placeholder "搜索客户、项目、待办"）
  - 右：快速新建按钮（`Plus` 20px + "新建" 下拉：客户 / 项目 / 提醒）、通知铃铛（`Bell` 20px + 红点角标）
- **Main**（背景 `--color-bg-page`，内容区最大宽 1280px，水平居中，左右内边距 32px，上下 24px）

插件 3 页不使用此 Shell，结构各自定义。

---

## 页面 1: 工作台首页/仪表盘 `/`

**路由**：`/`
**对应 API**：GET /reminders, GET /stats
**主题**：浅色

### 布局结构
- Header（全局 Shell）
- Sidebar（全局 Shell，"仪表盘"激活）
- Main：纵向四段式，无 Hero Banner

### 核心组件
1. **逾期提醒横条**（条件渲染：仅当存在逾期提醒时）
   - 位置：Main 顶部，全宽
   - 背景 `--color-error-light`，左侧 4px 实色边条 `--color-error`，圆角 `--radius-lg`
   - 左：Lucide `AlertTriangle` 20px（`--color-error`）+ 文案 "N 条提醒已逾期"
   - 右：`Button` 组件 "去处理" → 跳转 `/reminders?status=overdue`
2. **今日待办摘要卡片**（主卡片，占第一行）
   - 卡片背景 `--color-bg-card`，圆角 `--radius-xl`，阴影 `--shadow-sm`，内边距 24px
   - 左区（占 1/3）：大数字 "今日待办 N" + 副文案 "已完成 X / 共 Y"，进度条（`--color-primary` 填充 + `--color-gray-100` 轨道）
   - 右区（占 2/3）：前 5 条今日待办列表，每条一行
     - 行结构：客户名（`--color-text-primary` semibold）+ 项目名（`--color-text-tertiary` sm）+ 到期时间（`--color-text-secondary`）+ 状态标签
     - 状态标签：逾期=`--color-error` 实色、今日到期=`--color-warning` 实色、等待回复=`--color-info` 实色，文字 `--color-text-inverse`，圆角 `--radius-full`
   - 空状态：当无今日待办时，展示 "今日无待办" + Lucide `CheckCircle2` 24px（`--color-success`），不展示任何 Welcome 文案
3. **快捷操作区**（第二行，四等分卡片网格）
   - 四张操作卡片，每张：Lucide 图标 24px（`--color-primary`）+ 标题 + 一句描述
     - 导入客户（`Upload`）→ `/customers/import`
     - 新建客户（`UserPlus`）→ `/customers` 打开新建抽屉
     - 新建项目（`FolderPlus`）→ `/projects` 打开新建抽屉
     - 创建备份（`DatabaseBackup`）→ `/settings/backup`
   - 卡片背景 `--color-bg-card`，悬浮 `--shadow-md`，边框 `--color-border-default`，圆角 `--radius-lg`
4. **备份提醒横条**（条件渲染：距离上次备份超过 7 天 或 从未备份）
   - 背景 `--color-warning-light`，Lucide `HardDriveDownload` 20px + "已超过 7 天未创建加密备份，建议立即备份"
   - 右侧 `Button` "立即备份" → `/settings/backup`
5. **本月数据概览**（第三行，三列统计卡片）
   - 客户总数（`Users`）+ 跟进记录数（`MessageSquareText`）+ 提醒完成率（`CheckCircle2`）
   - 数字 2xl bold + 标签 sm tertiary + 较上周变化（箭头 `ArrowUp`/`ArrowDown` 16px + 百分比，正向 `--color-success` 负向 `--color-error`）

### 数据展示方式
摘要卡片 + 统计卡片 + 条件横条，不使用表格

### 交互说明
1. 用户进入 `/`，页面并发请求 `/reminders?status=today` 和 `/stats`
2. 数据加载中显示骨架屏（卡片轮廓 + `--color-gray-100` 闪烁条），不显示 Spinner
3. 逾期横条和备份横条仅在条件满足时出现，避免空占位
4. 点击快捷操作卡跳转对应路由
5. 点击今日待办条目跳转 `/reminders` 并定位该条

### 响应式
- 1366x768：快捷操作 4 列 → 2 列，统计 3 列保持
- 1440px+：全部保持原列数

---

## 页面 2: 客户列表 `/customers`

**路由**：`/customers`
**对应 API**：GET /customers
**主题**：浅色

### 布局结构
- Header（全局 Shell，面包屑 "客户"）
- Sidebar（"客户"激活）
- Main：工具栏 + 表格

### 核心组件
1. **工具栏**（顶部一行）
   - 左：搜索框（宽 320px，Lucide `Search` 16px + 输入，placeholder "按公司、联系人、邮箱、手机号搜索"）
   - 中：筛选器下拉（分级 A/B/C 多选、状态多选、来源多选），筛选激活时显示蓝色 Tag
   - 右：`Button` "导入客户"（`Upload` 16px，次级按钮）+ `Button` "新建客户"（`Plus` 16px，主色按钮）
   - 批量操作栏（条件渲染：选中行 > 0 时浮现在工具栏下方）：已选 N + 合并（`GitMerge`）、导出（`Download`）、删除（`Trash2`），右侧 "取消选择"
2. **客户表格**（TanStack Table）
   - 列：复选框 | 客户名+公司 | 分级（圆点+字母） | 联系人 | 国家 | 来源 | 最近跟进 | 未完成提醒数 | 操作
   - 分级列：圆形 Badge（24px），A=`--color-grade-a`、B=`--color-grade-b`、C=`--color-grade-c`，白字
   - 最近跟进列：相对时间（如 "3 天前"），超 7 天未跟进文字变 `--color-warning`
   - 未完成提醒数列：数字 Badge，0 不显示，>=3 用 `--color-error`
   - 操作列：`MoreHorizontal` 20px 下拉（查看档案、编辑、合并、软删除）
   - 行悬浮背景 `--color-bg-hover`，行点击跳转 `/customers/:id`
   - 表头可排序（客户名、分级、最近跟进），排序图标 `ArrowUp`/`ArrowDown`/`ArrowUpDown` 16px
3. **分页**（底部）
   - 游标分页：上一页 / 下一页 + "显示 1-50 / 共 N"
4. **空状态**（无客户时）
   - 居中 Lucide `Users` 48px（`--color-gray-300`）+ "还没有客户档案" + `Button` "导入客户" + `Button` "新建客户"
   - 禁止 Welcome 文案

### 数据展示方式
表格为主

### 交互说明
1. 输入搜索词后 300ms 防抖触发请求
2. 筛选器变更立即重新请求
3. 行点击进入客户档案
4. 勾选多行后批量操作栏浮现
5. 合并操作打开确认抽屉，展示字段冲突

### 响应式
- 1366x768：表格可横向滚动，冻结首列（复选框+客户名）
- 1440px+：全部列可见

---

## 页面 3: 客户档案 `/customers/:id`

**路由**：`/customers/:id`
**对应 API**：GET /customers/:id
**主题**：浅色

### 布局结构
- Header（面包屑 "客户 / {客户名}"）
- Sidebar（"客户"激活）
- Main：左右两栏
  - 左栏（占 64%）：基础信息卡 + 跟进时间线
  - 右栏（占 36%）：联系人卡 + 社媒账号卡 + 关联项目卡 + 未完成提醒卡

### 核心组件
1. **基础信息卡**（左栏顶部）
   - 顶部行：客户名（2xl bold）+ 公司名（lg secondary）+ 分级 Badge + 状态 Tag
   - 编辑按钮（`Pencil` 16px，右上角）
   - 信息网格（2 列）：国家、来源、创建时间、最近跟进时间
   - 每项：标签（xs tertiary）+ 值（sm primary）
2. **跟进时间线**（左栏主体）
   - 标题 "跟进时间线" + `Button` "新建跟进"（`Plus` 16px）
   - 筛选 Tab：全部 / 邮件 / 通话 / 会话标记 / 备注
   - 时间线组件：左侧竖线（`--color-border-default`），节点圆点按类型着色（会话标记=`--color-primary`、通话=`--color-success`、邮件=`--color-info`、备注=`--color-gray-400`）
   - 每条：时间 + 类型标签 + 备注 + 消息正文引用块（背景 `--color-gray-50`，左侧 3px 边条）+ 关联项目名
   - 无跟进时：Lucide `MessageSquareText` 32px（`--color-gray-300`）+ "暂无跟进记录" + "新建跟进" 按钮
3. **联系人卡**（右栏）
   - 标题 "联系人" + `Plus` 16px
   - 每条：姓名 + 职位 + 邮箱（可点击 `mailto:`）+ 电话
   - 空状态："暂无联系人"
4. **社媒账号卡**（右栏）
   - 标题 "社媒账号" + `Plus` 16px
   - 每条：平台图标（WhatsApp=`MessageCircle`、Telegram=`Send`）+ 账号标识 + 绑定状态（自动匹配/人工绑定 Tag）
   - 空状态："暂无社媒账号"
5. **关联项目卡**（右栏）
   - 标题 "关联项目"
   - 每条：项目名 + 阶段 Tag（按 `--color-stage-*` 着色）+ 金额 + 分级 Badge
   - 点击跳转 `/projects/:id`
   - 空状态："暂无关联项目"
6. **未完成提醒卡**（右栏，条件渲染）
   - 标题 "未完成提醒" + 数量 Badge
   - 每条：类型图标 + 到期时间 + 状态 Tag
   - 逾期条目文字 `--color-error`

### 数据展示方式
卡片 + 时间线 + 列表混合

### 交互说明
1. 进入页面请求 `/customers/:id` 获取完整档案
2. 点击"新建跟进"打开抽屉表单
3. 点击"编辑"进入基础信息编辑模式（行内编辑或抽屉）
4. 时间线条目可展开查看完整消息正文
5. 右栏卡片可折叠/展开（`ChevronDown`/`ChevronUp`）

### 响应式
- 1366x768：左右栏保持，右栏最小宽 320px
- 1440px+：左右栏间距 24px

---

## 页面 4: 客户导入 `/customers/import`

**路由**：`/customers/import`
**对应 API**：POST /imports/parse, POST /imports/:id/commit, GET /imports/:id/errors
**主题**：浅色

### 布局结构
- Header（面包屑 "客户 / 导入客户"）
- Sidebar（"客户"激活）
- Main：步骤式向导（4 步）

### 核心组件
1. **步骤指示器**（顶部）
   - 四步：上传文件 → 字段映射 → 预览与冲突 → 导入结果
   - 当前步 `--color-primary` 实色圆点，已完成步 `--color-success` + `Check` 16px，未到达步 `--color-gray-300`
   - 步骤之间连接线，已完成段 `--color-primary`，未完成段 `--color-border-default`
2. **步骤 1: 上传文件**
   - 拖拽区（虚线边框 `--color-border-strong`，圆角 `--radius-xl`，背景 `--color-gray-50`）
   - Lucide `UploadCloud` 48px（`--color-gray-400`）+ "拖拽 .xlsx 或 .csv 文件到此处，或点击选择文件"
   - 下方：模板下载链接（`Download` 16px + "下载导入模板"）
   - 文件选中后显示文件名 + 大小 + `Button` "下一步"
3. **步骤 2: 字段映射**
   - 表格：左列源字段（Excel 列头）→ 右列目标字段（下拉选择系统字段）
   - 自动匹配的字段高亮 `--color-success-light` 背景
   - 必填字段未映射时行标红 `--color-error-light`
   - 底部 "上一步" + "下一步"（必填未映射时禁用，Tooltip 提示）
4. **步骤 3: 预览与冲突**
   - 顶部统计条：总行数 + 有效行 + 错误行 + 重复候选
   - 三个 Tab：
     - **有效预览**：前 50 行数据表格
     - **错误行**：行号 + 错误原因 + 下载错误报告按钮（`FileDown` 16px）
     - **重复候选**：每条展示新行数据 + 匹配到的现有客户，三个操作按钮（合并 / 跳过 / 保留为新客户）
   - 底部 "上一步" + "确认导入"（主色按钮）
5. **步骤 4: 导入结果**
   - 结果卡片：成功 N 条（`--color-success`）+ 失败 N 条（`--color-error`）+ 跳过 N 条（`--color-warning`）+ 重复合并 N 条（`--color-info`）
   - `Button` "查看客户列表" → `/customers`
   - 失败行可下载详细报告

### 数据展示方式
向导 + 表格 + 统计卡片

### 交互说明
1. 每步操作完成后才解锁下一步
2. 步骤间可回退修改
3. 确认导入时显示进度条（`--color-primary` 填充）
4. 导入完成后不可回退到步骤 3

### 响应式
- 1366x768：映射表和预览表可横向滚动
- 所有步骤保持单列布局

---

## 页面 5: 项目列表 `/projects`

**路由**：`/projects`
**对应 API**：GET /projects
**主题**：浅色

### 布局结构
- Header（面包屑 "项目"）
- Sidebar（"项目"激活）
- Main：工具栏 + 表格

### 核心组件
1. **工具栏**
   - 左：搜索框（宽 280px，placeholder "按项目名、客户名搜索"）
   - 中：筛选器（阶段多选 Tab 式：需求确认 / 方案样品 / 报价 / 谈判 / 成交 / 失单 / 已归档，激活态背景 `--color-primary-light` 文字 `--color-primary`）+ 分级筛选（S/A/B/C 下拉）
   - 右：`Button` "新建项目"（`Plus` 16px，主色）
2. **项目表格**
   - 列：项目名+客户名 | 阶段（Tag 着色） | 分级 Badge | 金额（带币种） | 成交概率 | 预计成交日 | 风险数 | 操作
   - 阶段 Tag：背景为对应 `--color-stage-*` 的 12% 透明度，文字为 `--color-stage-*`，圆角 `--radius-full`
   - 风险数：0 不显示，>=2 用 `--color-error`
   - 操作列：`MoreHorizontal` 下拉（查看详情、编辑、归档、关闭）
   - 行点击跳转 `/projects/:id`
3. **空状态**
   - Lucide `FolderKanban` 48px（`--color-gray-300`）+ "还没有项目" + `Button` "新建项目"

### 数据展示方式
表格

### 交互说明
1. 阶段 Tab 切换立即筛选
2. 新建项目打开抽屉表单（项目名、关联客户、币种、金额、成交概率、预计成交日、阶段、分级）
3. 归档操作二次确认

### 响应式
- 1366x768：表格横向滚动，冻结项目名列
- 1440px+：全部列可见

---

## 页面 6: 项目详情 `/projects/:id`

**路由**：`/projects/:id`
**对应 API**：GET /projects/:id
**主题**：浅色

### 布局结构
- Header（面包屑 "项目 / {项目名}"）
- Sidebar（"项目"激活）
- Main：顶部基础信息 + 下方四区（阶段、风险、里程碑、关联待办）

### 核心组件
1. **基础信息卡**（顶部）
   - 标题行：项目名（2xl bold）+ 客户名链接 + 阶段 Tag + 分级 Badge
   - 编辑按钮（`Pencil` 16px）
   - 信息网格（4 列）：币种+金额、成交概率、预计成交日、加权金额（金额×概率，标注"参考值"）
2. **阶段切换区**（第二行）
   - 横向流程图：需求确认 → 方案/样品 → 报价 → 谈判 → 成交 / 失单（分支）
   - 每个阶段为圆角矩形节点，当前阶段高亮 `--color-primary` 实色白字，已过阶段 `--color-primary-light`，未达阶段 `--color-gray-100`
   - 节点间连接线，已过段 `--color-primary`
   - 点击非当前阶段弹出确认框 "确认切换到 {阶段}？此操作会记录变更历史"
   - 失单分支需填写失单原因（模态框）
3. **风险列表**（左栏，占 50%）
   - 标题 "风险" + `Plus` 16px
   - 每条：严重度图标（高=`AlertOctagon` 红、中=`AlertTriangle` 橙、低=`Info` 蓝）+ 描述 + 状态 Tag（未处理/处理中/已解决）+ 处理日期
   - 连续 7 天未处理的风险显示升级标识（`ArrowUp` 16px + "优先级已提升"）
4. **里程碑列表**（右栏，占 50%）
   - 标题 "里程碑" + `Plus` 16px
   - 每条：`Circle`/`CircleCheck` 20px（未完成/已完成）+ 名称 + 日期
   - 未完成里程碑到期前 3 天显示 `--color-warning` 文字 "即将到期"
   - 点击 `Circle` 切换为已完成（`CircleCheck`，`--color-success`）
5. **关联待办**（底部全宽）
   - 标题 "关联待办"
   - 列表：每条 类型 + 到期时间 + 状态 Tag + 客户名
   - 点击跳转 `/reminders`

### 数据展示方式
流程图 + 卡片列表 + 列表

### 交互说明
1. 阶段切换需二次确认
2. 风险和里程碑支持行内新增
3. 里程碑完成状态点击切换
4. 编辑按钮打开抽屉编辑基础信息

### 响应式
- 1366x768：风险和里程碑上下排列
- 1440px+：左右并列

---

## 页面 7: 待办列表 `/reminders`

**路由**：`/reminders`
**对应 API**：GET /reminders
**主题**：浅色

### 布局结构
- Header（面包屑 "待办"）
- Sidebar（"待办"激活）
- Main：筛选 Tab + 待办列表

### 核心组件
1. **筛选 Tab**（顶部）
   - Tab：全部 / 待处理 / 等待回复 / 已逾期 / 已完成 / 已忽略
   - 每个 Tab 显示数量 Badge
   - 激活态：下边框 2px `--color-primary`，文字 `--color-text-primary` semibold
   - 非激活：文字 `--color-text-secondary`
2. **批量操作栏**（条件渲染：选中 > 0）
   - 已选 N + 批量完成（`Check`）、批量稍后（`Clock`）、批量忽略（`X`）
3. **待办列表**
   - 每条卡片（背景 `--color-bg-card`，边框 `--color-border-default`，圆角 `--radius-lg`，内边距 16px）
   - 结构：
     - 左：复选框 + 类型图标（固定时间=`Clock`、等待回复=`MessageCircleMore`、暂不跟进=`PauseCircle`）
     - 中：客户名（semibold）+ 项目名（tertiary）+ 提醒内容
     - 右：到期时间 + 状态 Tag + 操作按钮组
   - 逾期卡片左侧 4px 边条 `--color-error`
   - 状态 Tag：待处理=`--color-info`、等待回复=`--color-warning`、已逾期=`--color-error`、已完成=`--color-success`、已忽略=`--color-gray-400`
   - 操作按钮：完成（`Check` 16px）、稍后（`Clock` 16px）、忽略（`X` 16px）、更多（`MoreHorizontal`）
4. **排序规则**
   - 默认按逾期 → 高风险 → 分级(S/A/B/C 项目, A/B/C 客户) → 到期时间
5. **空状态**
   - Lucide `ListTodo` 48px（`--color-gray-300`）+ "暂无待办" 或 "全部已完成"

### 数据展示方式
卡片列表

### 交互说明
1. Tab 切换重新请求
2. 点击"完成"立即更新状态（乐观更新），失败回滚并 Toast 提示
3. "稍后"打开下拉选择 1 小时后 / 3 小时后 / 明天 / 自定义
4. 卡片点击展开详情（关联跟进记录、客户链接）
5. 游标分页滚动加载

### 响应式
- 1366x768：单列列表
- 1440px+：保持单列，最大宽 960px 居中

---

## 页面 8: 备份与恢复 `/settings/backup`

**路由**：`/settings/backup`
**对应 API**：POST /backups/create, POST /backups/validate, POST /backups/restore
**主题**：浅色

### 布局结构
- Header（面包屑 "设置 / 备份与恢复"）
- Sidebar（"设置"激活）
- Main：左右两栏
  - 左栏（占 50%）：创建备份
  - 右栏（占 50%）：恢复备份
  - 下方全宽：备份历史

### 核心组件
1. **创建备份卡**（左栏）
   - 标题 "创建加密备份" + Lucide `DatabaseBackup` 24px
   - 说明文字 "备份包含全部客户、联系人、项目、跟进和提醒数据，使用 Argon2id 派生密钥 + AES-256-GCM 加密"
   - 密码输入框（`Lock` 16px 前缀）+ 确认密码框
   - 密码强度指示条（弱/中/强）
   - 安全提示框（`--color-warning-light` 背景）：Lucide `ShieldAlert` 16px + "密码丢失后无法恢复备份，请妥善保存"
   - `Button` "创建备份"（主色，密码满足强度后启用）
   - 备份进度条（创建中显示）
2. **恢复备份卡**（右栏）
   - 标题 "恢复备份" + Lucide `DatabaseRestore` 24px
   - 拖拽区：选择 .dpbak 备份文件
   - 密码输入框
   - `Button` "校验并恢复"
   - 校验结果展示：完整性 ✓ + 兼容性 ✓ + Schema 版本 + 创建时间
   - 安全提示框：Lucide `AlertTriangle` 16px + "恢复将覆盖当前全部业务数据，操作不可撤销。建议先创建当前数据备份"
   - 恢复中：进度条 + "正在恢复... 请勿关闭窗口"
   - 恢复互斥：其他恢复进行中时禁用
3. **备份历史**（底部全宽）
   - 标题 "备份历史"
   - 表格：时间 + 文件名 + 数据量 + 操作（下载、恢复）
   - 无历史时："暂无备份记录"
4. **Excel 导出区**（底部附加）
   - 标题 "导出明文 Excel"
   - 四个按钮：导出客户 / 导出联系人 / 导出项目 / 导出跟进+提醒
   - 安全提示：Lucide `FileWarning` 16px + "Excel 为明文文件，导出前请妥善保管"

### 数据展示方式
卡片 + 表格

### 交互说明
1. 创建备份：输入密码 → 点击创建 → 下载加密文件
2. 恢复备份：选择文件 → 输入密码 → 校验 → 确认 → 恢复
3. 恢复前强制二次确认（模态框，需输入 "RESTORE" 确认）
4. 恢复过程中全局禁用其他操作

### 响应式
- 1366x768：左右栏上下排列
- 1440px+：左右并列

---

## 页面 9: 设置 `/settings`

**路由**：`/settings`
**对应 API**：Profile preferences 与云端备份 API（统一由 `packages/api-client` 调用）
**主题**：浅色

### 布局结构
- Header（面包屑 "设置"）
- Sidebar（"设置"激活）
- Main：分组卡片列表

### 核心组件
1. **通用设置卡**
   - 标题 "通用设置"
   - 语言选择（下拉：简体中文 / English）—— V1 仅展示简体中文
   - 时区显示（只读，跟随系统）
2. **云端数据与备份卡**
   - 显示当前账号、云端数据状态和最近一次云端备份时间
   - 创建加密云端快照、导出加密备份文件、从备份恢复
   - 恢复前强制二次确认（模态框，需输入 "RESTORE" 确认）
   - 不展示本地路径、SQLite、托盘、开机自启或 Agent 状态
4. **关于卡**
   - 版本号 + Web/PWA 更新提示

### 数据展示方式
表单卡片

### 交互说明
1. 偏好设置保存后显示 Toast "已保存"
2. 创建或恢复云端备份显示明确的成功/失败状态
3. 恢复数据需输入确认词

### 响应式
- 1366x768：单列卡片
- 1440px+：单列，最大宽 800px 居中

---

## 页面 10: Content Script 浮窗（插件）

**触发**：进入 WhatsApp Web / Telegram Web 一对一会话
**对应 API**：POST /matches/resolve, GET /follow-ups, GET /reminders, POST /follow-ups, POST /reminders
**主题**：浅色，Shadow DOM 隔离

### 布局结构
- **不使用工作台 Shell**
- Shadow DOM 宿主元素（`z-index: 2147483000`），内部渲染浮窗
- 浮窗尺寸：宽 320px，最小高 200px，最大高 480px
- 定位：固定在会话区域右侧（不遮挡消息区和输入框），可拖拽、可折叠
- 折叠态：48x48 圆形按钮（`--color-primary` 背景，Lucide `Compass` 24px 白色），点击展开

### 核心组件（按匹配状态区分）
1. **唯一命中：客户档案摘要**
   - 顶部条：客户名（semibold）+ 公司名（sm）+ 分级 Badge + 折叠按钮（`ChevronDown` 16px）
   - 基础信息：国家 + 来源 + 最近跟进时间
   - 最近跟进摘要：1 条最近跟进（类型 + 时间 + 备注，点击展开全文）
   - 未完成提醒区（条件渲染）：
     - 标题 "未完成提醒 N" + `Bell` 16px
     - 每条：类型 + 到期时间 + 状态 Tag
     - 逾期条目 `--color-error` 文字
   - 操作按钮组（底部）：
     - `Button` "标记消息"（`Bookmark` 16px，主色）—— 标记当前会话选中的消息为跟进记录
     - `Button` "新建跟进"（`Plus` 16px，次级）
     - `Button` "设置提醒"（`Clock` 16px，次级）
2. **多候选：选择确认**
   - 顶部条：Lucide `Users` 20px + "找到 N 个匹配客户"
   - 候选列表：每条 客户名 + 公司 + 匹配依据（手机号/用户名）+ `Button` "确认为此客户"
   - 底部：`Button` "新建客户" + `Button` "绑定已有客户"
3. **未命中：新建或绑定**
   - 顶部条：Lucide `UserQuestion` 20px + "未匹配到客户"
   - 当前会话标识展示（平台 + 账号标识）
   - `Button` "新建客户"（`UserPlus` 16px，主色）
   - `Button` "绑定已有客户"（`Link` 16px，次级）—— 弹出搜索框
4. **不支持场景：群组/频道**
   - Lucide `Ban` 20px（`--color-gray-400`）+ "不支持自动识别"
   - 说明："群组/频道会话不支持客户识别，请在一对一对话中使用"
   - `Button` "关闭浮窗"

### 数据展示方式
摘要卡片 + 列表 + 按钮组

### 交互说明
1. 进入会话后自动调用 `/matches/resolve`，1 秒内展示结果
2. "标记消息"：读取用户当前选中的单条消息正文 → 打开跟进记录抽屉（预填消息正文）→ 保存
3. "新建跟进"：打开抽屉表单（类型下拉、备注、关联项目下拉、时间）→ 保存（失败保留内容可重试）
4. "设置提醒"：打开抽屉（类型选择：固定时间/等待回复/暂不跟进 → 对应表单）→ 保存
5. 折叠/展开记忆状态（会话切换后保持）
6. 匹配失败时降级显示，不静默消失

### Shadow DOM 隔离
- 所有样式通过 `:host` 注入，不继承宿主页 CSS
- 字体强制 `var(--dp-font-sans)`
- 颜色、圆角、阴影使用 `--dp-*` 前缀变量
- 事件不冒泡到宿主页

### 响应式
- 浮窗固定 320px 宽，不随窗口缩放
- 会话区域宽度 < 600px 时浮窗自动折叠为圆形按钮

---

## 页面 11: Popup — 待办列表

**触发**：点击浏览器工具栏插件图标
**对应 API**：GET /reminders/popup
**主题**：浅色

### 布局结构
- **不使用工作台 Shell**
- Popup 尺寸：360px x 480px
- 顶部 Header + 中间待办列表 + 底部操作栏

### 核心组件
1. **Header**（高 48px）
   - 左：DealPilot 小 Logo + "待办" 文字
   - 右：`Button` "新建客户"（`UserPlus` 16px，图标按钮）→ 跳转 Popup 新建客户页
   - 下边框 `--color-border-default`
2. **待办列表**（主体，可滚动）
   - 前 5 条待办，按排序规则：逾期 → 高风险 → 分级 → 到期时间
   - 每条卡片（内边距 12px，间距 8px）：
     - 第一行：客户名（semibold sm）+ 分级 Badge（xs）
     - 第二行：项目名（xs tertiary，无项目则不显示）
     - 第三行：到期时间（xs）+ 状态 Tag
     - 逾期：左侧 3px `--color-error` 边条，时间文字 `--color-error`
     - 高风险：右上角 `AlertOctagon` 12px（`--color-error`）
   - 点击卡片：优先打开对应平台会话（WhatsApp/Telegram 深链），无法深链时打开平台 + 复制可搜索账号到剪贴板 + Toast "已复制账号 {xxx}，请在平台搜索"
3. **空状态**
   - Lucide `CheckCircle2` 32px（`--color-success`）+ "暂无待办" + "全部已完成"
4. **底部操作栏**（高 48px，上边框 `--color-border-default`）
   - `Button` "查看全部"（`ArrowRight` 16px）→ 打开工作台 `/reminders`（新标签页）

### 数据展示方式
卡片列表

### 交互说明
1. Popup 打开即请求 `/reminders/popup`
2. 加载中显示 5 个骨架卡片
3. 点击待办卡片跳转会话
4. 角标数字与列表数量一致

### 响应式
- 固定 360x480，无响应式断点

---

## 页面 12: Popup - 新建客户

**触发**：Popup 内点击"新建客户"按钮
**对应 API**：POST /customers
**主题**：浅色

### 布局结构
- **不使用工作台 Shell**
- Popup 尺寸：360px x 480px
- 顶部返回栏 + 表单主体 + 底部操作栏

### 核心组件
1. **返回栏**（高 48px）
   - 左：`Button` 返回（`ArrowLeft` 16px）→ 返回 Popup 待办列表
   - 中：标题 "新建客户"
   - 下边框 `--color-border-default`
2. **表单主体**（可滚动）
   - 字段（垂直排列，间距 16px）：
     - 客户名（必填，输入框）
     - 公司名（输入框）
     - 国家（下拉选择，带搜索）
     - 来源（下拉：展会 / 询盘 / 推荐 / 主动开发 / 其他）
     - 分级（单选 Segment：A / B / C，默认 C）
     - 社媒账号（可选，自动填充当前会话平台 + 账号标识，只读展示）
   - 必填项标记 `*`（`--color-error`）
   - 输入框：高度 36px，边框 `--color-border-default`，聚焦 `--color-border-focus`，圆角 `--radius-md`
   - 校验错误：下方 xs `--color-error` 文字
3. **底部操作栏**（高 56px）
   - `Button` "取消"（次级）+ `Button` "保存"（主色）
   - 保存成功后 Toast "客户已创建" + 自动返回 Popup 待办列表
   - 保存失败：保留表单内容 + Toast 错误信息 + 可重试

### 数据展示方式
表单

### 交互说明
1. 从会话浮窗进入时，社媒账号字段自动填充当前会话信息
2. 表单实时校验（必填项失焦校验）
3. 保存成功后自动绑定该社媒账号到新客户
4. 重复提交不产生重复客户（Idempotency-Key）
5. 网络异常时保留输入内容

### 响应式
- 固定 360x480，无响应式断点

---

## 附录：Lucide 图标使用速查

| 场景 | 图标名 | 尺寸 |
|------|--------|------|
| 仪表盘导航 | `LayoutDashboard` | 20px |
| 客户导航 | `Users` | 20px |
| 项目导航 | `FolderKanban` | 20px |
| 待办导航 | `ListTodo` | 20px |
| 设置导航 | `Settings` | 20px |
| 新建 | `Plus` | 16px |
| 搜索 | `Search` | 16px |
| 编辑 | `Pencil` | 16px |
| 删除 | `Trash2` | 16px |
| 导入/上传 | `Upload` / `UploadCloud` | 16-48px |
| 下载 | `Download` / `FileDown` | 16px |
| 通知 | `Bell` | 20px |
| 警告 | `AlertTriangle` / `AlertOctagon` | 16-20px |
| 成功 | `CheckCircle2` / `Check` | 16-24px |
| 信息 | `Info` | 16px |
| 客户分级 A | `Circle` 实色填充 | 24px Badge |
| 时间/提醒 | `Clock` | 16px |
| 消息标记 | `Bookmark` | 16px |
| 跟进记录 | `MessageSquareText` | 16-24px |
| 合并 | `GitMerge` | 16px |
| 更多操作 | `MoreHorizontal` | 20px |
| WhatsApp 平台 | `MessageCircle` | 16px |
| Telegram 平台 | `Send` | 16px |
| 备份 | `DatabaseBackup` | 24px |
| 恢复 | `DatabaseRestore` | 24px |
| 锁/密码 | `Lock` | 16px |
| 安全 | `ShieldAlert` | 16px |
| 文件警告 | `FileWarning` | 16px |
| 折叠 | `ChevronDown` / `ChevronUp` | 16px |
| 返回 | `ArrowLeft` | 16px |
| 排序 | `ArrowUp` / `ArrowDown` / `ArrowUpDown` | 16px |
| 不支持 | `Ban` | 20px |
| 绑定 | `Link` | 16px |
| 新建客户 | `UserPlus` | 16px |
| 未匹配 | `UserQuestion` | 20px |
| 等待回复 | `MessageCircleMore` | 16px |
| 暂停 | `PauseCircle` | 16px |
| 文件夹打开 | `FolderOpen` | 16px |
| 指南针/Logo | `Compass` | 24px |
| 箭头右 | `ArrowRight` | 16px |
| 硬盘下载 | `HardDriveDownload` | 20px |

**P0 规则再次强调**：
- 以上所有图标均为 Lucide React SVG，禁止用 emoji 替代
- 所有颜色值必须通过 `design-tokens.css` 变量引用，禁止硬编码
- 所有页面展示真实产品数据（客户名、待办、跟进），禁止 "Welcome to DealPilot" / "Lorem ipsum" 占位
- 主视觉为蓝灰色系 `--color-primary: #2563eb`，禁止紫粉渐变

---

**文档结束**
