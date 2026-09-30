# 多语言（i18n）改动明细 — 供审阅

本轮任务：按用户确认的默认方案，为 ArduDeck 桌面端加入多语言支持。
**方案默认值（用户回复"按你推荐的来"）**：i18next + react-i18next、英语 + 简体中文、**仅渲染层**、设置页做试点、附未翻译串扫描脚本。

- 分支基线：`master @ 0acb0943cecea40284e15d60a0e4513373d1edc9`
- 改动范围：`apps/desktop/`、`tools/`，**未触碰 `packages/`、主进程逻辑、以及任何既有 UI 文案以外的代码**
- 逐条明细见下表；每条都可单独回退

## 一、改动清单（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 1 | `apps/desktop/package.json`（dependencies） | 项目**完全没有** i18n 库：`grep -rn "i18next\|react-i18next"` 全仓 0 命中 | 新增 `"i18next": "^26.4.2"`、`"react-i18next": "^17.0.15"` | 实现翻译必需；选这两个是 React/Electron 生态事实标准 | ★ 官方仓库 `package.json` 实测；版本号为本次实际安装版本（`node -e require(...).version`） |
| 2 | `apps/desktop/src/shared/app-language.ts`（新增，34 行） | 没有语言枚举，language 值无类型约束 | 新增 `APP_LANGUAGES = ['en','zh-CN']`、`AppLanguage`、`isAppLanguage()`、`DEFAULT_APP_LANGUAGE`、`APP_LANGUAGE_LABELS`（原生语言名）、`normalizeAppLanguage()`（`zh-*` 全部归到 `zh-CN`） | 让「持久化的语言值」与「i18n 资源包」共用同一份定义，避免两处漂移；`normalizeAppLanguage` 是 OS locale → 受支持语言的唯一入口 | ◎ 代码推导，可逐行核验 |
| 3 | `apps/desktop/src/shared/app-language-storage.ts`（新增，33 行） | 语言设置若只存主进程 settings 文件，首帧渲染时异步未返回，会先渲染英文再跳中文 | 新增 localStorage 镜像读写（键 `ardudeck.ui-language`），读写均 try/catch | 首帧即用正确语言；注释已写明「settings 文件仍是真源，这里只是快速启动镜像」 | ◎ 代码推导 |
| 4 | `apps/desktop/src/renderer/i18n/locales/en.ts`（新增，45 行） | 无 | 英文语言包（参考包），`as const` | 作为键树的唯一真源 | ◎ 代码推导 |
| 5 | `apps/desktop/src/renderer/i18n/locales/zh-CN.ts`（新增，49 行） | 无 | 简体中文语言包 | 目标语言之一 | ○ 术语判断：Vehicle→载具、Mission→任务、配置/地图/高级/关于，属我的译法取向，**请审校** |
| 6 | `apps/desktop/src/renderer/i18n/locales/types.ts`（新增，18 行） | 直接写 `typeof en` 会因 `as const` 把中文值约束成英文字面量（tsc 实际报错 24 条：`Type '"取消"' is not assignable to type '"Cancel"'`） | 新增 `TranslationBundle`：递归把叶子类型放宽为 `string`，保留完整键树 | 既保证缺键/多键在 `tsc` 报错，又不限制译文内容 | ★ 实测：修复前 24 条 TS2322，修复后仅剩 1 条与本轮无关的既有错误 |
| 7 | `apps/desktop/src/renderer/i18n/index.ts`（新增） | 无 | `initI18n()`（幂等）、`applyAppLanguage()`、资源注册、`fallbackLng: 'en'`、`escapeValue: false` | `escapeValue:false` 是 i18next 官方对 React 的建议（React 自己会转义） | △ 训练知识（高置信、低漂移风险）；公开核对渠道：i18next 官方 React 文档 |
| 8 | `apps/desktop/src/renderer/main.tsx`（+5 行） | 首次渲染前无 i18n 实例，`useTranslation` 无从取用 | 在 `registerArduDeckDialect()` 之前调用 `initI18n()` | 必须在 `ReactDOM.createRoot(...).render()` 之前完成初始化 | ◎ 代码推导（`main.tsx:19` 前后） |
| 9 | `apps/desktop/src/renderer/stores/settings-store.ts`（+29 行） | 设置无 `language` 字段，语言选择无处持久化 | ① 接口加 `language: AppLanguage` + `setLanguage`；② 初始值取 localStorage 镜像；③ `loadSettings` 读取 settings 文件里的 `language` 并在末尾 `await applyAppLanguage(...)`；④ `_saveSettings` payload 增加 `language`；⑤ 订阅选择器与变更判定各加 `language`；⑥ `setLanguage` 动作同步调 `applyAppLanguage` | 复用项目既有的 electron-store 设置通道（`getSettings/saveSettings`），不新建配置文件；变更判定必须加字段，否则改语言不触发保存 | ◎ 代码推导；★ 实测：漏加判定会导致不落盘，已补 |
| 10 | `apps/desktop/src/shared/ipc-channels.ts`（+3 行） | `SettingsStoreSchema` 无 `language` | 加 `language?: AppLanguage` 并 `import type { AppLanguage } from './app-language.js'` | 主进程 `SETTINGS_SAVE` 是整对象覆盖写（`settingsStore.set(settings)`），类型不加字段则在 IPC 边界被类型检查挡住 | ★ 实测：`ipc-handlers.ts:7062` 为整对象 `set` |
| 11 | `apps/desktop/src/renderer/components/settings/LanguageCard.tsx`（新增，38 行） | 无语言选择入口 | 新增语言下拉卡片，样式与既有 `UnitSelectionCard` 一致（同 class、同 `data-tour` 约定） | 贴合现有 UI 语言，不引入新范式 | ◎ 代码推导（对照 `UnitSelectionCard.tsx`） |
| 12 | `apps/desktop/src/renderer/components/settings/UnitSelectionCard.tsx` | 9 个字段标签硬编码英文（`label: 'Distance'`…）与标题 `Display Units` | 删除 `label` 字段，改为按 `kind` 查 `units.fields.<kind>` 翻译键；标题用 `units.heading`。**单位符号（m/km/mAh/m/s…）保持不翻译** | 字段 kind 本身即稳定 id，键可一一对应；单位是符号不是文案 | ◎ 代码推导 |
| 13 | `apps/desktop/src/renderer/components/settings/SettingsView.tsx`（+25/-20） | 页面标题 `Settings`、副标题、5 个分类标签硬编码英文 | ① 引入 `useTranslation('settings')`；② 标题/副标题改 `t('title')`/`t('subtitle')`；③ `SETTINGS_CATEGORIES` 去掉 `label` 字段，改为 `t(\`categories.${cat.id}\`)` | 分类 id 与翻译键同名，省掉第二张映射表；`t` 在组件内取用才能随语言切换重渲染 | ◎ 代码推导 |
| 14 | `tools/i18n-scan.mjs`（新增，239 行） | 无 | 未翻译串扫描器：扫 JSX 文本节点 + `aria-label/placeholder/title/alt`，输出按文件与按重复度两个榜单，带首处 `file:line`；支持 `--top/--all/--json/--strict` | 试点之外的剩余工作量必须可量化、可追踪，否则"支持多语言"不可验证 | ★ 实测：注入测试串能命中；误报修正见下节 |

**未改动（有意）**：`packages/*`（协议/解析库，无 UI 文案）、主进程菜单与对话框（用户选定"仅渲染层"）、任何既有业务逻辑。

## 二、验证证据

| 验证项 | 命令 | 结果 | 等级 |
|---|---|---|---|
| 类型检查 | `tsc --noEmit -p apps/desktop/tsconfig.json` | 仅剩 1 条 `src/main/index.ts(325,5) app.dock possibly undefined` | ★ 实测；并已用 `git stash` 在**基线**上复现同一条，证明为既有问题，非本轮引入 |
| 生产构建 | `turbo run build --filter=@ardudeck/desktop` | 10/10 成功，渲染层 `index-DFalqcap.js` 15,961 kB | ★ 实测 |
| 产物验证 | `grep -c` 于构建产物 | `i18next` 命中 13 次；`配置任务默认值与载具档案`、`显示单位` 各命中 1 次 | ★ 实测 |
| 测试套件 | `vitest run --root apps/desktop` | **281/281 文件通过，3005 通过 / 2 跳过 / 0 失败** | ★ 实测 |
| 静态检查 | `eslint` 于全部新增与改动文件 | 无告警无错误 | ★ 实测 |
| 扫描器有效性 | 注入 `ZZ Probe String Here` 到真实组件后运行 `--json` | 命中 1 次；已还原（`grep -c` = 0） | ★ 实测 |

补充说明（诚实义务）：`vitest` 首次运行时 `src/main/testing/mcp-server.test.ts` 失败，原因是沙箱禁止写 `~/.ardudeck/screenshots`；把 `HOME` 指向工作区后**全绿**。该失败与本轮改动无关，但如实记录。

## 三、第二轮：设置区全量翻译（本轮新增）

第一轮只翻了设置页"外壳"。本轮把 `apps/desktop/src/renderer/components/settings/**` 整体翻完。

### 改动清单（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 15 | `i18n/locales/en.ts` / `zh-CN.ts` | 语言包只覆盖外壳 | 新增分组：`vehicleProfile`（drift/selectors/stall/snapshots/apply/realFc/templates）、`secureLink`、`signing`、`traffic`、`tileCache`、`profileCompat`、`weather`、`vehicleSection`、`configuration`、`about`、`vehicleEditor`；`common` 增加 `undo` | 设置区所有文案的键都在此，随语言切换即时生效 | ◎ 代码推导；★ 实测：缺键时 `tsc` 报错 |
| 16 | `i18n/index.ts` | 子组件用 `useTranslation('settings')`，但 `Undo`/`Cancel` 属通用词 | 增加 `fallbackNS: 'common'` | 功能命名空间可回退到通用词表，避免同一词在多处重复定义 | △ 训练知识（i18next 官方 `fallbackNS` 选项） |
| 17 | `settings/GroupShapeCard.tsx` | 标题、说明、3 组标签/描述硬编码 | 改用 `t('groupShape.*')`；**不再从 store 导入 `GROUP_SHAPE_LABELS/DESCRIPTIONS`**（store 内常量保留未删，仅此组件不再引用） | 键以模式 id 命名，随语言切换 | ◎ 代码推导 |
| 18 | `settings/vehicle-profile/ConfigSelectors.tsx` | 3 个选择器标题 + 23 个选项的 label/hint 全部硬编码 | 静态表只留 `value`+`key`，文案走 `t('vehicleProfile.selectors.options.<value>.<label|hint>')`；`Selector` 用 `selectorKey` 取代 `label` prop | 表格与译文解耦，新增机型只需加键 | ◎ 代码推导 |
| 19 | `settings/vehicle-profile/DriftBadge.tsx` | 徽标 `Drifted · N`、弹窗标题与说明 | 改 `t()`，徽标用 `{{count}}` 插值 | 文案随语言切换 | ◎ 代码推导 |
| 20 | `settings/vehicle-profile/StallSpeedCalcButton.tsx` | 按钮/面板标签、AUW 等 4 个行标签、缺项提示 | 改 `t()`；**升力公式本身不翻译**（数学记号） | 公式是记号不是文案；行标签与单位无关（单位由 `UNIT_LABELS` 提供） | ◎ 代码推导；○ 判断（公式不译） |
| 21 | `settings/vehicle-profile/SnapshotList.tsx` | 按钮/标题/空态/恢复/删除等 12 处 | 改 `t()`；数量用 i18next 复数键（`buttonCount_one/_other`、`params_one/_other`） | 中英文复数规则不同，复数键由 i18next 处理 | △ 训练知识（i18next 复数 `_one/_other` 约定） |
| 22 | `settings/vehicle-profile/ProfileApplyOverlay.tsx` | 写入进度、Undo、Dismiss | 改 `t()`，`Undo` 走 `common` 回退 | 通用词集中管理 | ◎ 代码推导 |
| 23 | `settings/vehicle-profile/RealFcApplyConfirm.tsx` | 标题、sysid 警告、拓扑参数提示、备份说明、就绪/倒计时、两个按钮 | 改 `t()`；`Confirm available in {{seconds}}s` 用插值 | 真实硬件确认框是安全关键路径，必须完整本地化 | ◎ 代码推导 |
| 24 | `settings/vehicle-profile/VehicleTemplatePicker.tsx` | 搜索占位符、导入按钮 | 改 `t()` | 同上 | ◎ 代码推导 |
| 25 | `settings/TrafficSettingsCard.tsx` | 标题、说明、5 个数据源名、8 个占位符、若干开关标签、告警区文案 | 批量锚定替换为 `t('traffic.*')`；`AlertZonesSection` 子组件补 hook | 该卡片约 26 处文案 | ◎ 代码推导；★ 实测：替换脚本对每个锚点校验出现次数 |
| 26 | `settings/TileCacheCard.tsx` | 下载区/缓存设置标题、4 个经纬度占位符与 4 个标签、开关标签、删除提示 | 批量替换为 `t('tileCache.*')`；`SavedRegions` 子组件补 hook | 同上 | ◎ 代码推导 |
| 27 | `settings/SigningSection.tsx` | 标题、密钥不匹配告警、口令步骤、`Key:`、复制提示、启用/包签名 | 改 `t('signing.*')`；`Key:` 值含全角冒号，与中文排版一致 | 同上 | ◎ 代码推导 |
| 28 | `settings/SecureLinkCompliance.tsx` | 合规标题（原文用 `&amp;` 实体）、导出按钮与提示、日志说明 | 改 `t('secureLink.*')`；三态文案（有/断链/无数据）的静态部分改 `t()`，含变量的分支**保持原样** | 含 `chain.count` 的句子是动态拼接，本轮不动以免改变行为 | ◎ 代码推导；★ 实测：`t` 作用域由 `tsc` 校验 |
| 29 | `settings/SettingsView.tsx`（4598 行） | 99 处硬编码文案遍布 7 个内部组件 | 批量锚定替换为 `t()`（`vehicleSection`/`configuration`/`weather`/`about`/`vehicleEditor`/`profileCompat` 分组）；给 `ProfileCompatibilityBanner`、`WeatherWidget`、`ArduPilotFlightStats`、`OpenAipKeyInput`、`MavlinkSettingsSection`、`ConsoleSettingsSection`、`AiAnalysisSection`、`ExperimentalFeaturesSection`、`GraphicsStatus`、`AboutSection`、`PropSizeInput`、`VehicleEditModal`、`VehicleCard` 补 `useTranslation` | 这是设置区剩余量的主体；`tsc` 的 "Cannot find name 't'" 被用作"哪些组件缺 hook"的精确清单 | ◎ 代码推导；★ 实测：每处替换前校验锚点出现次数，`tsc` 逐条收敛到 0 |
| 30 | `stores/settings-store.ts`（语言初值） | 首次启动若系统是中文，store 初值仍是 `en`，语言下拉会与界面语言不一致 | 初值改为 `normalizeAppLanguage(readStoredAppLanguage() ?? (i18n.isInitialized ? i18n.language : null))` | 与 i18next 首帧选择保持同源 | ★ 实测：`tsc` + 30 个 store 测试通过 |
| 31 | `i18n/index.ts`（`applyAppLanguage`） | 测试导入 store 时 i18n 未初始化，`changeLanguage` 抛 `Cannot read properties of undefined (reading 'hasLanguageSomeTranslations')`（★ 实测到 3 个失败） | 未初始化时提前返回，只写 localStorage 镜像 | 该函数会被 store 在无渲染器的测试环境调用；防抛错而非改行为 | ★ 实测：修复后连跑 2 次全绿 |
| 32 | `tools/i18n-scan.mjs` | 数学/遥测记号被计入待翻译 | allowlist 增加 `Lmax`、`AUW`、`AGL`、`MSL`、`RSSI`、`SNR`、`HDOP`、`VDOP` | 这些记号在任何语言下都保持原样，属"有意不译"而非遗漏 | ○ 判断 |

### 本轮验证证据（★ 全部实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 仅剩既有 1 条 `src/main/index.ts(325) app.dock`（基线可复现） |
| `turbo run build --filter=@ardudeck/desktop` | 10/10 成功 |
| `vitest run --root apps/desktop` | **281/281 文件、3005 通过、0 失败**（连跑 2 次，用于确认 i18n 初始化竞态已消除） |
| `eslint`（设置区 + i18n + store + main） | 0 error；2 warning，均为**既有**问题（`SnapshotList` 的 `useMemo` 依赖告警来自原始代码，已用 `git show HEAD:` 比对确认；另一处在 `use-profile-apply.ts`，本轮未改） |
| 设置区扫描 | **0 条**未翻译（本轮起点 144 条） |
| 产物校验 | 构建产物的 renderer bundle 中 `载具与状态`、`飞行统计（来自飞控）`、`天气`、`阵风`、`螺旋桨`、`关于` 均可检索到 |

### 覆盖率的诚实口径

- **设置区（`components/settings/**`）：144 → 0**，这是本轮可验证的硬指标
- **全局：2463 → 2290**（−173）。注意这 −173 **不能全部归给本轮翻译工作**：其中一部分来自扫描器 allowlist 调整（`Lmax` 等记号被移出待译统计），另一部分是本轮在设置区之外的 `label`/`title` 分支变化。两个口径都已列出，不做合并宣传
- 全局 2290 仍是**下界**（口径与盲区见下节）

## 四、第三轮：左侧导航栏 + 扫描器盲区修补（本轮新增）

### 改动清单（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 33 | `components/navigation/NavigationRail.tsx` | 19 个导航项标签硬编码在模块级数据表里（`label: 'Telemetry'`…`label: 'Cargo'`），另有 `title="Report a Bug"` | `NavItem` 的 `label` 改为 `labelKey`，值取该条目的 `id`（如 `telemetry`→`items.telemetry`）；渲染处 2 处 `item.label` 改 `t(item.labelKey)`；组件加 `useTranslation('nav')`；"Report a Bug" 改 `t('reportBug')` | 导航标签在模块作用域，拿不到 hook，只能存键、渲染时取；键用 ViewId 使新增视图只需加一条键 | ◎ 代码推导；★ 实测：`tsc` 0 新增错误、281 文件测试全绿 |
| 34 | `i18n/locales/en.ts` / `zh-CN.ts` | 无导航文案 | 新增顶层 `nav` 分组（`items.*` 19 条 + `reportBug`） | 导航是全局外壳，与设置页解耦更清晰 | ◎ 代码推导 |
| 35 | `tools/i18n-scan.mjs` | **盲区**：只扫 JSX 文本节点与 4 个属性，因此导航栏 19 条硬编码标签只报出 1 条 | 新增对象字面量文案检测：匹配 `label/title/name/heading/description/tooltip/placeholder/hint: '...'`，跳过已 `t()` 或已用 `*Key` 的行；新增 `byKind` 分类统计并在文本报告里输出 | 这类"数据表文案"是本仓库最主要的未统计来源（导航、OSD 元素表、Lua 节点库、MAVLink 预设等） | ★ 实测：加检测后导航栏从 1 条→0 条；`node --check` 通过 |

### 本轮验证证据（★ 全部实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 仅剩既有 1 条 `src/main/index.ts(325) app.dock` |
| `turbo run build --filter=@ardudeck/desktop` | 10/10 成功 |
| `vitest run --root apps/desktop` | **281/281 文件、3005 通过、0 失败** |
| `eslint`（navigation 目录） | 无输出（0 error / 0 warning） |
| 产物校验 | bundle 中可检索到 `任务规划`、`机队仓库`、`天气简报`、`教练模式`、`飞行日志`、`反馈问题` |
| 扫描器 | 导航栏未翻译数 = 0；`node --check` 通过 |

### ⚠️ 统计口径变更（重要，别拿两次数字直接比）

本轮给扫描器加了对象字面量检测，**分母变了**，所以总数从 2290 跳到 **4984**，这**不是**翻译退化：

```
4984  总计
├ 1894  jsx-text            （与上一轮同口径，上一轮此项约 1894）
├ 1350  object:label        ← 新纳入统计
├  694  object:description  ← 新纳入统计
├  474  object:name         ← 新纳入统计
├  377  attribute           （同口径）
├  140  object:title        ← 新纳入统计
└   55  object:hint/heading ← 新纳入统计
```

- `jsx-text` 与 `attribute` 两项与上一轮口径一致，可与上一轮对比
- `object:*` 是**新纳入**的数据表文案，含少量代码标识符误报（抽查确认 `name: 'Flight Mode'`、`label: 'Value'` 这类确实是界面可见文案）
- 因此该数字应作为**工作清单**使用，而不是精确计数——脚本输出末尾已写明这一点

## 五、第四轮：任务规划（mission）整个目录（本轮新增，用户选 A）

范围：`apps/desktop/src/renderer/components/mission/**`，扫描器口径 **290 条 → 1 条**（剩下的是版本号 `iNav 2.6.1`，按设计不译）。

### 改动清单（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 36 | `MissionPlanningView.tsx` | 4 个面板标题（`title: 'Flight Info'` 等）、iNav 说明区 6 处、Survey 面板标题 | 新增 `mission.panelTitles.*` / `mission.planningNote.*`，全部改 `t()`；`ensureFlightInfoPanel` 与 `createDefaultLayout` 改为**接收 `t: TFunction` 参数** | 这两个是普通辅助函数不是组件，不能调 hook（见第 47 条） | ★ 实测：`tsc` + `eslint` 双通过 |
| 37 | `MissionMapPanel.tsx` | 7 个按钮 tooltip、Home 提示两行、空态、图例区 8 处 | 新增 `mission.map.*`（20 条），改 `t()`；给 `MissionMapPanel2D` 补 hook | 地图面板是任务页主交互面 | ★ 实测 |
| 38 | `FlightInfoPanel.tsx` | 11 处 tooltip/文案 | 新增 `mission.flightInfo.*`；`DaylightBar` 子组件补 hook | 同上 | ★ 实测 |
| 39 | `MissionToolbar.tsx` | 14 处 tooltip/文案 + 机架选择器数据表 | 新增 `mission.toolbar.*`；`MISSION_FIRMWARE_OPTIONS` 从 `label/title` 改为 **`labelKey/titleKey`**（PX4 品牌名保留 `labelText`），渲染处解析 | 模块级常量表不能调 hook | ◎ 代码推导 |
| 40 | `AutoAdjustAltitudeDialog.tsx` | 7 处 | `mission.autoAdjust.*` | 地形规避确认框 | ★ 实测 |
| 41 | `FlightPreviewPanel.tsx` | 图例 4 处（行内文本，扫描器此前漏检） | `mission.preview.*`；组件补 hook | 行内 `/> text</span>` 形式需单独处理 | ★ 实测 |
| 42 | `Mission3DPanel.tsx` / `RelativeWaypointPopover.tsx` / `SurveyedPointsDialog.tsx` / `AltitudeProfilePanel.tsx` / `UploadPreviewModal.tsx` / `MissionStatusBar.tsx` | 共 11 处，含 `aria-label`、`placeholder`、空态 | 各自分组键；`SurveyedPointsDialog` 带 `): JSX.Element` 返回类型注解，需单独插 hook | 覆盖面补齐 | ★ 实测 |
| 43 | `WaypointTablePanel.tsx` — 命令菜单 | **126 条**命令条目硬编码 `label` + `desc` | `CommandOption` 改为 `labelKey`/`descKey`；新增 `mission.commands.*`（82 个键，去重后）、`mission.commandGroups.*`（7 个分组名）；搜索过滤改为按**译文**匹配 | 命令数据表是模块级常量；搜索必须匹配用户看到的语言 | ◎ 代码推导；★ 实测：`tsc` 0 新增错误 |
| 44 | `WaypointTablePanel.tsx` — 命令参数字段 | `getCommandParams()` 内 **80 处** `label`（53 个唯一） | `CommandParamConfig.label` → `labelKey`，键为 `mission.paramFields.<key>`；调用点改 `t(param.labelKey)` | 该函数被导出给单测用，不能引入 hook | ★ 实测：`WaypointTablePanel.command-params.test.ts` 通过 |
| 45 | `WaypointTablePanel.tsx` — 面板其余文案 | 23 处（分组 tooltip、状态 tooltip、空态、列头） | 新增 `mission.waypointPanel.*`；`GroupHeaderRow`、`WaypointListContent`、`CommandDropdown` 补 hook | 同上 | ★ 实测 |
| 46 | `i18n/locales/en.ts` / `zh-CN.ts` | 无 | 新增 135 条译文：82 条命令（label+desc）、7 个分组名、53 个参数字段、其余面板文案 | 中文按 MAVLink/ArduPilot 惯例译（如 Loiter→盘旋、ROI→兴趣点、Acceptance Radius→到点判定半径） | ○ 术语判断，**需你审校** |
| 47 | **修复自己引入的缺陷** | 我用脚本自动给嵌套组件补 hook 时，把 `useTranslation` 插进了 `ensureFlightInfoPanel` / `createDefaultLayout` 两个**普通函数** | 改为 `t: TFunction` 参数注入（4 个调用点补实参）；另给 4 个 effect/callback 的依赖数组补 `t` | ★ **`eslint` 的 `react-hooks/rules-of-hooks` 报了 2 个 error**，是本次唯一的真错误；依赖数组缺失会导致切语言后面板标题不刷新 | ★ 实测：修复后 0 error |

### 本轮验证证据（★ 全部实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 仅剩既有 1 条 `src/main/index.ts(325) app.dock` |
| `turbo run build --filter=@ardudeck/desktop` | 10/10 成功 |
| `vitest run --root apps/desktop` | **281/281 文件、3005 通过、0 失败**（含 `WaypointTablePanel.command-params.test.ts`） |
| `eslint`（mission 目录） | **0 error / 3 warning**，3 条 warning 已用 `git stash` 在**基线**上复现同样 3 条，证明为既有问题 |
| 产物校验 | bundle 中 `起飞`×7、`盘旋`×5、`兴趣点`×7、`云台`×6、`导航`、`条件`、`相机`×17、`到点判定半径`、`任务地图`、`高度剖面` 均可检索 |
| mission 扫描 | **290 → 1**（剩 `iNav 2.6.1` 版本号） |

## 六、扫描器已知边界（避免过度解读）

`node tools/i18n-scan.mjs` 当前报告：扫描 834 个文件、**约 4700 条**（口径见第四节）。已覆盖：单行 JSX 文本节点、`aria-label`/`placeholder`/`title`/`alt`、8 种属性的对象字面量。**未覆盖**：

- `{}` 表达式内的字符串、跨行文本块、模板字符串内英文
- `strong`/`em` 嵌套句中的片段（第 29 条对 "Advanced map commands" 采用了拆片段翻译，**中文语序可能不自然，需你审校**）
- 主进程文案（菜单、对话框、托盘）——范围仅渲染层
- 由 store 生成的文案（见第七节第 6 条）

已修正的误报/漏检（均经实测）：① TS 泛型 `<Promise<string>>` 曾被当作 JSX 文本，产生 250 次误报；② 早期实现会删掉带属性开标签，导致设置页 87 条被漏检成 0 条；③ 行内 `/> text</span>` 形式曾被漏检（第四轮发现并补上）。

## 七、遗留与待决策

1. **未翻译范围（新口径 Top）**：`lua-graph/graph-templates.ts` 372、`lua-graph/node-library.ts` 268、`mission/WaypointTablePanel.tsx` 215、`mavlink-config/FlightModesTab.tsx` 135、`mavlink-config/presets/mavlink-presets.ts` 130、`parameters/MspConfigView.tsx` 127。其中带 `_templates`/`_library`/`presets` 的文件是**数据定义文件**，翻译需改数据模型（把 `label:` 换成 `labelKey:`），工作量与非数据文件不同。要继续翻哪一块，说范围即可。
2. **锁文件不一致（需要你决定）**：你的全局 `~/.npmrc` 里有 `lockfile=false`，因此 `pnpm install` **不会更新** `pnpm-lock.yaml`。`apps/desktop/package.json` 已加 `i18next`/`react-i18next`，但 lock 的 `apps/desktop` importer 段里没有它们。CI（`.github/workflows/*.yml`）用裸 `pnpm install`，**不会因此失败**；任何 `--frozen-lockfile` 用法会失败。修法需显式 `pnpm install --lockfile=true`（会改写锁文件）；**未经许可我没有动它**。
3. **截图证据（状态更新）**：第二轮时确实缺截图。第三轮补上了**间接但更硬**的证据——切换语言写盘成功（`settings.json` 出现 `"language": "zh-CN"`，见下条），说明用户在下拉里选中并持久化成功。但**仍然没有截图**：沙箱把应用与探测脚本切成两个进程组，每次工具调用结束即回收，MCP 长调用（`get_page_state`）只成功过一次就超时。
4. **`~/.config/@ardudeck` 仍读不到**：在 DSH 沙箱内用真实家目录启动会撞 `EROFS: .../modules.json.tmp-...`（沙箱拒写）。要持久化到你的真实配置，需在你自己终端里跑 `.run/run-for-user.sh`。
5. **术语待审（○ 判断，非官方术语表）**：载具(Vehicle)、任务(Mission)、配置(Configuration)、遥测(Telemetry)、任务库(Mission Library)、机队仓库(Fleet Vault)、天气简报(Weather Briefing)、教练模式(Trainer)、伴飞计算机(Companion Computer)、货舱(Cargo) 等。请确认或给出术语表。
6. **含变量的句子未逐句本地化**：`SecureLinkCompliance` 的三态文案、`ProfileApplyOverlay` 的 toast、`SnapshotList` 的 `${reason}` 等由 store 生成；要彻底本地化需把 store 内文案也纳入 i18n（属新范围，需你批准）。



## 八、第五轮：`mavlink-config` 前两屏（本轮新增）

范围：`apps/desktop/src/renderer/components/mavlink-config/**`，扫描器口径 **988 → 808**（本轮完成 `MavlinkConfigView` 与 `SafetyTab`）。

### 改动清单（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 48 | `MavlinkConfigView.tsx` | 37 个 TabGroup/Tab 的 `name`/`description` 硬编码，渲染点 5 处 | 接口改 `nameKey`/`descKey`；TabGroup 接口去掉 `description`（该字段从未渲染）；22 个名称键 + 30 个描述键进语言包；`modes`（飞行/驾驶模式）与 `pid`（copter/rover）冲突用 `modes-drive` / `pid-rover` 消歧 | 数据表在模块作用域，不能调 hook | ★ 实测：`tsc` 0 新增错误；扫描器该文件 0 |
| 49 | `MavlinkConfigView.tsx` | 9 处界面文案（Loading/Reboot Required/Write Parameters to Flash/3 个列头/3 个 tooltip） | 新增 `mavlink.view.*` | 补齐该文件 | ★ 实测 |
| 50 | `SafetyTab.tsx` | 76 处界面文案（13 个 enum 动作选项、4 个区块标题+说明、5 个带参数名的标签、状态/表头） | 新增 `mavlink.safety.*`（options/common/rcSignalLost/datalinkLost/lowBattery/criticalBattery/geofence/autoDisarm/labels/states/table/presetsNamed 共 12 个子分组）；`SafetyTab` 与 `Px4SafetyConfig` 各补 hook | 安全关键页必须完整本地化 | ★ 实测：替换脚本对每处校验出现次数；`tsc` 通过 |
| 51 | `__tests__/issue-50-low-battery-fix.test.ts` | 断言逐字检查源码里的 `value={0}>Disabled` 等英文文案，i18n 化后必然失败 | 断言改为检查 `value={0}>{t('safety.options.disabled')}`；区块边界从 `'Low Battery'` 改为 `safety.lowBattery.heading` 键 | 断言意图是「0/1/2 三个取值存在」，不是文案本身；**这是我主动改测试，请审**（测试文件改动见 git diff） | ★ 实测：改前 5 失败，改后 281/281、3005 通过 |

### 本轮验证证据（★ 全部实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 全绿（无输出） |
| `turbo run build` | 10/10 成功 |
| `vitest run --root apps/desktop` | **281/281 文件、3005 通过、0 失败** |
| `eslint`（mavlink-config + i18n） | **0 error / 4 warning**，4 条均为既有问题（未触及的文件） |
| 产物校验 | bundle 中 `失效保护与围栏`、`遥控信号丢失`、`地理围栏`、`自动上锁`、`越界动作`、`写入参数到`、`需要重启` 均可检索 |
| 扫描器 | `MavlinkConfigView` 0；`SafetyTab` 0（其 3 条 preset 名称随 `mavlink-presets.ts` 下轮处理）；`mavlink-config` 988 → 808 |

### 一个我自己的诊断错误（留痕）

本轮我一度报告「`SafetyTab` 剩余 48 条」，随后发现那 48 条属于 **`parameters/SafetyTab.tsx`**（不同目录），`mavlink-config/SafetyTab.tsx` 实际只剩 3 条 preset 名称。原因是我的 `endswith('SafetyTab.tsx')` 过滤匹配到了两个同名文件。**初版结论有误，已更正。**

### 下一步（mavlink-config 剩余 808 的主体）

`presets/mavlink-presets.ts`（128，10 张数据表：飞行模式/技能/任务/安全/失效动作/解锁检查/围栏/电池/PID/速率）、`FlightModesTab.tsx`(130)、`SerialPortsTab.tsx`(62)、`MavlinkConfigView` 剩余 0、`parameters/SafetyTab.tsx`(48，属另一目录)。

其中 `mavlink-presets.ts` 与 `SafetyTab`/`FlightModesTab` 强耦合（`SAFETY_PRESETS.*.description` 被 SafetyTab 引用），应作为一个单元一起改。

## 九、第六轮（进行中）：`mavlink-presets.ts` 数据层（本轮新增）

背景：用户选 A（`presets/mavlink-presets.ts` + `FlightModesTab.tsx` 作为一个单元）。本轮**只完成了该单元的数据层**，UI 渲染层尚未接入（见"未完成"一节）。

### 已改动（逐条）

| # | 位置 | 原文问题 | 修改内容 | 理由 | 证据等级 |
|---|---|---|---|---|---|
| 52 | `presets/mavlink-presets.ts` | 12 张表、69 组 `name`/`description` 硬编码 | 每个条目**新增** `nameKey`/`descKey`（键形如 `flightModePresets.beginner`、`failsafeActions.0`、`armingChecks.8192`）；9 个接口/内联类型同步加字段 | 键用 `<表><条目键>` 命名，天然规避不同表之间的同名冲突 | ★ 实测：`tsc` 通过；键数 69/69 |
| 53 | `i18n/locales/en.ts` / `zh-CN.ts` | 无 | 新增 `mavlink.presetNames`(69) + `mavlink.presetDescriptions`(69)，中文按航空/固件惯例译（如 `SmartRTL`→智能返航、`Rangefinder`→测距雷达、`LiFePO4`→磷酸铁锂、`FuelLevel PWM`→油量 PWM） | 预设名称与说明是用户直接看到的文案 | ○ 术语判断，**需你审校** |

### 关键设计决策：**保留** `name`/`description` 字段

它们**没有**被删掉，而是与键并存。原因：`presets/__tests__/safety-presets.test.ts` 断言 `preset.name` / `preset.description` 非空。保留后该测试无需改动即可通过（★ 实测）。

代价：`mavlink-presets.ts` 里同一份文案出现两次（字面量 + 键路径）。这是**有意为之的折中**，换取"不动既有断言"。若你更希望消除重复，我可以改为纯键并同步更新该测试——**属范围外，等你决定**。

### 本轮验证证据（★ 实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 全绿 |
| `turbo run build` | 10/10 成功 |
| 产物校验 | bundle 中 `新手安全`×2、`测绘/航测`×2、`最高安全`、`智能返航`、`解锁前检查`×3、`BLHeli 电调`、`磷酸铁锂`×2 均可检索 |
| `vitest` | **280/281 文件通过**；1 个失败为 `src/main/sitl/ardupilot-sitl-relaunch.test.ts`，**与本轮改动无关**（该测试未导入任何 i18n/presets 模块，且失败项在两次运行中不同——一次是 `respawns with the requested take-off point`，一次是 `tells the renderer...`，均为进程 spawn/kill 的 30s 超时抖动；当前沙箱对子进程生命周期有限制） |
| 扫描器 | `mavlink-presets.ts` 的 128 条**尚未计入减少**，因为消费者仍在使用 `preset.name`（见下） |

### 未完成（下一步）

数据层已就绪，但**渲染层还没接入**，所以用户在界面上现在**仍看到英文预设名**。剩余工作：

1. `SafetyTab.tsx` 的 `PRESET_SELECTOR_PRESETS`（3 条，`description` 来自 `SAFETY_PRESETS.*.description`）
2. `FlightModesTab.tsx` 的 `COPTER_PRESET_SELECTOR` / `PLANE_PRESET_SELECTOR`（8 条）及其自身 130 条文案
3. `BatteryTab.tsx`（3 处：`monitor.name`、`BATTERY_MONITORS[..].description`、`chemInfo.name`）
4. `SafetyTab.tsx` 第 848 行的 `Apply "{SAFETY_PRESETS[...]?.name}" Preset`

一个我评估后**回退**的改动（留痕）：`ui/PresetSelector.tsx` 是共享组件（8 个消费者），我一度把它的默认 `label`/`hint` 也接了 i18n；核对后发现这两个值**本来就是 props**（各调用点自己传中文/英文），改动无实际收益却扩大了范围，已 `git checkout` 还原，并移除了随之添加的未使用键。

## 十、⚠️ 重要更正：扫描器有两处缺陷，此前多轮"清零"数字被高估（本轮修复）

在第六轮推进时发现：扫描器**把"已翻译"判错了**，导致我此前报告的多处"清零"数字**不准确**。两处缺陷都已修复（提交见 git log）。

### 缺陷 1：`*Key` 属性被当成"已翻译"

原规则：一行里出现 `Key:` 就整行跳过。但迁移中途的行是这样的：

```ts
{ name: 'Takeoff', nameKey: 'takeoff', description: '…', descKey: '…' }
```

字面量仍在，而消费者可能还没接 `t()`。结果：我给 `mavlink-presets.ts` 加键后，该文件 128 条**全部消失**，看似"已完成"。修复：仅当该行**没有任何** `label/title/name/heading/description/tooltip/placeholder/hint` 字面量时才跳过。

### 缺陷 2（更根本）：用"文本是否在 en.ts 里"判断"是否已翻译"

原规则：`!bundleValues.has(text)` 过滤掉出现在英文包里的字符串。但 **`en.ts` 就是英文源包**——任何有键的文案必然同时存在于 en.ts 和组件里。于是这条过滤恰好隐藏了「**已加键、但组件仍渲染字面量**」这一最重要的一类。修复：删掉该过滤，不再使用 `loadBundleKeys()`。

### 更正后的真实数字（★ 实测）

| 区域 | 我此前报告 | 修正后真实值 | 说明 |
|---|---|---|---|
| 设置区 `components/settings/**` | 0（第二轮） | **66** | 真实遗漏：各下拉选项的硬编码 `label` 数组（帧型/机型、电池化学、OFF/自动/全量、Home/Terrain/Sea、模板分类等），例如 `label: 'Tricopter (3)'`、`label: 'LiPo (3.7V)'`、`label: 'Ackermann (car)'` |
| `components/mission/**` | 1 | **3** | 多出 2 条同源漏检 |
| `components/navigation/**` | 0 | **0** | 此项确实为 0（导航项存的是 `labelKey`） |
| `mavlink-config` | 808 → 664 | **895** | 664 是缺陷 1 造成的假象；真实为 895（`FlightModesTab` 137、`mavlink-presets` 134、`SerialPortsTab` 65 …） |
| 全局 | 4545 → 4105 | **4742** | |

**结论**：`components/settings/**` 的"144 → 0"**不成立**，真实是 144 → 66。这是我的报告错误，特此更正并留痕。已翻译的部分（设置页外壳、单位、语言、GroupShape、Traffic、TileCache、Signing、SecureLink、vehicle-profile 各卡片）**仍然有效**；遗漏的是我当初按扫描器口径选范围时没看见的那些 `label:` 数组。

### 教训

用"字符串是否出现在英文包里"来判断翻译进度，在"英文包即源包"的结构下逻辑上就不成立。我当时把这个过滤当成便利启发式，没有验证它的语义——**两次误报（设置区清零、presets 清零）都源于此**。修复后这个工具才第一次给出可信的未翻译存量。

## 十一、第七轮：AST codemod（提速工具，用户选 A）

目的：把"发现文案 + 改代码 + 生成键"从手工改成自动化。此前几轮我每条文案手写替换锚点，既慢又多次出错（`>} =` 破坏泛型、漏删 `description`、单行/多行漏检、给嵌套 `GraphFile` 误加键）。

### 新增工具：`tools/i18n-codemod.mjs`

用 **TypeScript 编译器 API + 类型检查器**，不靠正则。核心设计：**只装饰类型在白名单里的对象字面量**（`--types=NodeDefinition,GraphTemplate`）。

- 嵌套的 `graph: {...}`（类型 `GraphFile`）→ 不动
- 内联匿名对象 → 不动
- 只有真正的条目对象被加键
- 属性名**不需要**白名单：除 deny 列表外的字符串字面量属性都视为文案，新增显示字段会自动被识别
- 默认 `report` 模式（只报告），`write` 才落盘

### 试点结果：`lua-graph/graph-templates.ts` + `node-library.ts`

| 指标 | 数值（★ 实测） |
|---|---|
| codemod 识别的**真实可翻译文案** | **187 条（全部唯一）** |
| 扫描器口径（对照） | 652 条 |
| 差额来源 | 211 个图内节点标签、151 个 `PortDefinition.direction`、9 个 `defaultValue`、若干预设 'Step 1/2/3' 等**非界面文案** |
| `tsc` / `build` / `tests` | 全绿；`turbo build` 10/10；`vitest` **281/281 文件、3005 通过** |

**结论：这一块的真实工作量比看起来小约 4 倍。**

### codemod 自身被发现并修掉的 3 个缺陷（都靠实测暴露）

| # | 缺陷 | 后果 | 修法 |
|---|---|---|---|
| 1 | 对**对象字面量本身**取类型，得到匿名类型 | 首轮 report **0 条**（假阴性） | 改用**上下文类型**或所在数组的元素类型 |
| 2 | 用递增计数器生成键 | 'Step 1' 出现 18 次→18 个不同键 | 改为**按文案内容映射到同一键**（382 次出现→262 键） |
| 3 | **不幂等** | 第二次运行生成 `descriptionKeyKey`、重复 `nameKey`（`tsc` 报 TS1117） | 跳过已存在 `<prop>Key` 兄弟属性的属性；不把以 `Key` 结尾的属性当文案 |
| 4 | deny 列表含 `name` | `GraphTemplate.name` 的 28 条被跳过 | 从 deny 列表移除 `name`（安全由类型白名单保证，而非属性名） |
| 5 | 接口字段声明为**必填** `labelKey: string` | 全大写文案（如 `label: 'AND'`）不满足 `isLikelyCopy`，缺键→`tsc` 报错 | 键字段改为**可选**，组件回退到字面量 |

### 当前状态

- codemod 已提交，试点文件的**数据层键已就位**（187 个键）
- 界面**仍是英文**：`InspectorPanel`、`NodePalette`、`TemplateDialog` 仍渲染 `def.description` / `node.description` / `t.description`
- 187 条中文译文**尚未添加**
- 因此本轮是工具与数据层的完成，**不是用户可见的完成**

### 一个流程教训（留痕）

我中途用 `cp` 做的备份不是"干净版本"（已含前次 codemod 输出），导致幂等缺陷被掩盖、又跑出重复键。后来改用 `git checkout` 取真正干净状态才发现问题。**codemod 的备份必须取自版本库，而不是自己的中间产物。**

## 十二、第八轮：试点闭环 + 扫描器口径修正（用户选 A，本轮收尾）

### 试点闭环（lua-graph 现在用户可见为中文）

| # | 改动 | 说明 |
|---|---|---|
| 54 | `InspectorPanel.tsx` / `NodePalette.tsx` / `TemplateDialog.tsx` | 3 个消费者接入键；新增本地 `luaText(t, key, fallback)`：有键用键，无键回退字面量（codemod 会跳过 `'AND'` 这类全大写不需翻译的串） |
| 55 | `NodePalette.tsx` / `TemplateDialog.tsx` | **搜索匹配也改为按译文**（`luaText(...).toLowerCase()`），否则用户用中文搜不到东西 |
| 56 | `i18n/index.ts` | `I18N_NAMESPACES` 加入 `lua` 命名空间 |
| 57 | `i18n/locales/{en,zh-CN}.ts` | 新增 `lua.auto.*` 187 条（en 取源码字面量，zh 为我逐条给出） |

一个实测发现的坑：`TemplateDialog` 的 `GRAPH_TEMPLATES.filter((t) => ...)` 回调参数名 `t` **遮住了** `useTranslation` 返回的 `t`，导致 `tsc` 报"GraphTemplate 不能赋给 (key:string)=>string"。已把回调参数改名为 `tpl`。

### 扫描器口径修正（两处，让数字与代码一致）

| 问题 | 后果 | 修法 |
|---|---|---|
| 有 `<prop>Key` 兄弟属性的行仍被计入 | codemod 跑完界面已全键化，扫描器仍报 lua-graph 677 条，**与代码自相矛盾** | 该属性在本行或相邻行存在 `*Key` 兄弟时视为已迁移 |
| 无类型意识：把 `graph: {...}` 内的图实例数据、以及单行内联 `PortDefinition` 当作界面文案 | 仅 `graph-templates.ts` 就虚增 **377** 条（'Step 1'、图内节点标签），`node-library.ts` 虚增 **247** 条（端口 `label`/`direction`） | 跳过 `graph: {` 嵌套块；跳过含 `id:` 的单行内联对象 |

### 数字变化（★ 实测）

| 口径 | 修正前 | 修正后 |
|---|---|---|
| 全局 | 4742 | **3673** |
| `lua-graph` | 652 | **54** |

也就是说：扫描器此前把**约 1000 条非界面文案**算成了待翻译工作量。这正是"翻译慢"的一个隐藏原因——**先量准，再翻译**。

### 本轮验证证据（★ 全部实测）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | 全绿 |
| `turbo run build` | 10/10 成功 |
| `vitest run --root apps/desktop` | **281/281 文件、3005 通过、0 失败** |
| `eslint`（lua-graph + i18n） | 无输出（0 error / 0 warning） |
| 产物校验 | bundle 中 `低电量告警`、`地理围栏告警`、`地形跟随`、`云台增稳`、`测距雷达`、`遥控辅助开关`、`看门狗定时器` 均可检索 |

### 结论：提速方案有效

`lua-graph` 从"看起来 652 条、手工改法需多轮"变成"**187 条真实文案，一轮闭环**"。方法可复制到其他区域：**codemod 批量加键 → 消费者接入（含搜索）→ 批量译文 → 扫描器验证**。

## 十三、进度登记：剩余工作量与固定流程（第九轮）

### 已完成的（用户可见中文 / 或工具就绪）

| 区域 | 状态 |
|---|---|
| 左侧导航栏（19 项 + 反馈问题） | ✅ 中文 |
| 设置区外壳 + 各卡片（单位/语言/GroupShape/Traffic/TileCache/Signing/SecureLink/vehicle-profile 卡片） | ✅ 中文 |
| 任务规划区（面板标题/地图控件/飞行信息/工具栏/航点表/命令菜单） | ✅ 中文 |
| 设置页部分下拉选项（帧型/电池化学/Home-Terrain-Sea/模板分类等 66 条） | ❌ 仍英文（此前被扫描器缺陷掩盖） |
| `lua-graph`（Lua 图形编辑器） | ✅ 中文（187 条，含搜索按译文匹配） |
| `mavlink-config` 主视图 + 安全页 | ✅ 中文 |
| 预设数据层（69 组 name/description 的键） | ⚠️ 键就绪，`FlightModesTab`/`BatteryTab`/`SafetyTab` 的 selector 与界面文案**仍英文** |
| 其余约 25 个区域 | ❌ 未开始 |

### 剩余量（`tools/i18n-scan.mjs` 口径，已修正为可信）

全局 **3673** 条。Top 区域：`mavlink-config` 742、`parameters` 519、`companion` 171、`sitl` 153、`logs` 132、`panels` 118、`survey` 115、`map` 108、`utils` 106、`modes` 105、`legacy-config` 102、`servo-wizard` 99、`feature-tours` 96、`mission-library` 84、`quick-setup` 81、`calibration` 70、`radio-hud` 69、`connection` 64、`script-installer` 62、`firmware` 55。

### 固定流程（每批照做）

1. `node tools/i18n-codemod.mjs report <目录> --types=<条目类型>` —— **先量准**（例：lua-graph 扫描器报 652，真实 187）
2. `... write ... --ns=<命名空间> --en-out=<片段>` —— 批量加键（幂等，可重复跑）
3. 消费者接入 `t(key)`；**搜索/过滤也必须按译文**，否则中文用户搜不到
4. 我逐条给中文译文 → 写入 `en.ts` / `zh-CN.ts`
5. 门禁：`tsc` + `turbo build` + `vitest`（281 文件/3005 测试）+ `eslint`，且该区域扫描计数为 0
6. 记录到本文件 → 提交并推送到 `github.com:652436962/ardudeck.git`

### 新增资产：`tools/i18n-tm.json`

从现有语言包提取的**译记忆**（346 条 英文→中文），用于后续批次复用，避免重复翻译相同文案（当前重复率 26.5%）。

### 当前状态（★ 实测）

- 工作树干净；`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）
- codemod 对已完成的 `lua-graph` 复跑 = 0 条（幂等成立）
- 扫描器口径已修正：全局 4742 → 3673，其中约 1000 条是它此前误算的非界面文案

## 十四、第十轮：OSD 元素注册表（82 条 → 0）

| # | 位置 | 改动 |
|---|---|---|
| 58 | `utils/osd/element-registry.ts` | codemod 给 `OsdElementDefinition[]` 的 48 个条目加 `nameKey`/`descriptionKey`（实测 93 个有效键；扫描器报 82）；接口加**可选**键字段 |
| 59 | `components/osd/OsdElementBrowser.tsx` | `OsdElementBrowser` 与内层 `ElementRow` 补 hook；新增本地 `osdText(t,key,fallback)`；**搜索按译文匹配**；`useMemo` 依赖补 `t`（否则切语言后列表不刷新） |
| 60 | `i18n/locales/{en,zh-CN}.ts` + `i18n/index.ts` | `osd.auto.*` 93 条 + `osd.browser.unsupported`；注册 `osd` 命名空间 |

**codemod 缺陷（本轮实测发现并修）**：它把 `previewText`（预览样例，如 `' 120m'`、`'11.8V'`）也当成了文案，产生 3 个孤立键。已把 `previewText` 加入 deny 列表，并删除孤立键。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）；`eslint` **0 error / 1 warning**（`moduleRev` 那条已在基线复现，属既有）；产物中 `飞行模式`、`电池电压`、`人工地平仪`、`距返航点距离`、`电调温度` 均可检索。

**口径**：`utils/osd` **82 → 0**；全局 **3673 → 3591**。

## 十五、第十一轮：`parameters/SafetyTab.tsx`（57 → 3）

| # | 改动 |
|---|---|
| 61 | 6 张内联数据表加键：`FAILSAFE_PROCEDURES`(4)、`RECEIVER_TYPES`(4)、`BF_RECEIVER_PROVIDERS`(15)、`BF_QUICK_SELECT`(4)、`ALTITUDE_MODES`(3)、`SANITY_CHECKS`(3)。键形如 `safetyTab.failsafe_procedures.0.land`，描述用 `<key>.desc` |
| 62 | 3 个被渲染的表接入 `stText(t,key,fallback)`（失效保护动作卡、高度模式、健全性检查）；`SafetyTab` 补 hook |
| 63 | 17 条界面文案（Loading、Failsafe Behavior、Altitude Mode、Sanity、GPS Rescue PIDs、(Advanced)、Arming Safety、Navigation Arming Safety、Enabled、Require GPS fix…、Allow Bypass、Bypass Mode:、Receiver、Return to Home、Navigation 等）接入 `safetyTab.ui.*` |
| 64 | 语言包：`params.safetyTab.*` 共 29 组 + 4 条接收机类型 + 17 条 ui；注册 `params` 命名空间 |

**残余 3 条说明**：扫描器仍报 3 条，但我**本地逐行复刻扫描器逻辑得到 0**，且扫描器 `byText` 的首处位置指向 `mavlink-config/SafetyTab.tsx`（同名文件的共享重复文案）。这 3 条不是本文件的漏改，属扫描器的文件归属共享文案所致，**如实记录，不再追**。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）；`eslint` 无输出；产物含 `失效保护行为`、`高度模式`、`健全性检查`、`解锁安全`、`GPS 救援`。

**口径**：全局 **3673 → 3537**（本轮 OSD 82 + SafetyTab 57 的贡献）。

## 十六、第十二轮（进行中）：`FlightModesTab` 部分完成

**已完成**：
- `COPTER_MODES` / `PLANE_MODES`（47 条）加 `descKey`（内联 `Record` 类型增加可选 `descKey`）
- `SWITCH_POSITIONS`（3 条）加 `labelKey`
- `MODE_PWM_RANGES`（9 条）加 `labelKey`
- 语言包键已生成于 `.run/fm-pairs.json`（尚未写入 en/zh 包）

**关键判断（需保留）**：**飞行模式名不翻译**。`Stabilize`/`Acro`/`AltHold`/`Auto`/`Guided`/`Loiter`/`RTL`/`SmartRTL` 等是用户必须与飞控显示逐一对照的专有名词，翻译会导致对不上。只译其**说明**（description）与开关档位文案。

**未完成**：消费者接入（渲染点 601/630/641 等仍读 `modeInfo.name` / `pos.name`）、50 条中文译文、7 条 JSX 文案。

**口径**：`FlightModesTab` 137 → 128（部分）；全局 3537 → 3529。

## 十七、第十三轮：`FlightModesTab` 完成

| # | 改动 |
|---|---|
| 65 | 消费者接入：`fmText(t,key,fallback)` + `useTranslation('mavlink')`；渲染点 `pos.label`(2)、`modeInfo.description`(2)、`range.label`(1)；`getModeInfo` 兜底对象补 `descKey: 'modes.unknown'` |
| 66 | 7 条 JSX 文案接入 `mavlink.fm.ui.*`（模式切换通道、开关档位示意、连接后查看实时数据、模式开关、保存全部更改、模式对照表…） |
| 67 | 语言包 `mavlink.fm.*` 57 组（模式说明 47 + 开关档位 3 + PWM 区间 7）中英双语 |

**保留原则（再次确认）**：飞行模式名 `Stabilize/Acro/AltHold/Auto/Guided/Loiter/RTL/SmartRTL` **不翻译**，只译说明与档位文案。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` **281/281（3005 通过）**——首次运行时 `src/main/sitl/*` 有 3 个超时失败，**复跑即全绿**，属既有 SITL 子进程抖动，与本轮无关；产物含 `带自稳的手动飞行`、`定高，位置手动`、`开关向上`、`模式对照表`。

**口径说明**：扫描器对该文件仍报 121 条，但其逐行判据与实际不符（该文件所有可译条目均已带 `*Key` 且渲染点已用 `fmText`）。这与 OSD 轮遇到的偏差同类，**如实记录，不再为口径消耗轮次**——以"键已就位 + 渲染点已接入 + 产物含中文 + tsc/构建/测试全绿"为准。

## 十八、第十四轮：`SerialPortsTab`（65 → 44，界面文案全部完成）

| # | 改动 |
|---|---|
| 68 | 新增 `spText(t,key,fallback)`；`Px4SerialPortsConfig`、`ArduPilotSerialPorts`、`SerialPortsTab` 三个组件补 hook |
| 69 | 界面文案接入 `serialPorts.*` 共 22 键：无可用串口提示、两处「串口配置」标题、PX4/ArduPilot 两种提示、端口分配、未分配、常见配置、说明：、协议提示片段、以及 3 条常用配置示例句（ELRS/GPS/数传，内部 `<span>` 保留） |
| 70 | 注册 `serialPorts` 命名空间；en/zh 双语 |

**剩余 44 条的性质（均属"不该翻译"）**：
- `SERIAL_PROTOCOLS` 约 40 个：`MAVLink1/2`、`GPS`、`FrSky SPort`、`SBus Out`、`ESC Telemetry`、`SmartAudio`、`Crossfire (CRSF)`、`DJI FPV OSD` … —— 是 ArduPilot 的**协议枚举名**，必须与飞控参数表一致
- `BAUD_RATES`：`1200`/`9600`/`57600` … —— **数字**
- `PORT_LABELS`：`USB`/`TELEM1`/`GPS1` —— 飞控板**丝印名**
- `PX4_PORT_LABELS`：`TELEM 1`/`RC Port`/`Wifi Port` —— 端口名，习惯上保留英文

也就是说：**该文件的界面文案已 100% 中文化**，剩余计数是扫描器把枚举名与数字计入所致。

**一个我自己引入又修掉的问题（留痕）**：生成语言包时未转义英文里的单引号（`what's`），导致 `en.ts` 语法错误（`tsc` 报 3 条 TS1005）。已修正并加转义。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）；`eslint` 无输出；产物含 `串口配置`、`端口分配`、`常见配置`、`未分配`、`该载具没有可配置的串口`。

**口径**：全局 **3521 → 3500**。

## 十九、第十五轮：`arming-checks.ts`（35 → 0）

| # | 改动 |
|---|---|
| 71 | codemod 给 `ARMING_CHECK_BITS` 加 `nameKey`/`descriptionKey`（36 个键）；`ArmingCheckBit` 接口加**可选**键字段 |
| 72 | 消费者接入：`ArmingTab`（`b.name`/`b.description` 两处）、`PrearmPanel`（`nameFor()` 里的查找）；两处加 `acText(t,key,fallback)` 与 hook |
| 73 | 语言包 `mavlink.armingChecks.*` 36 条中英双语 |

**本轮踩到的两个坑（都是我自己造成的，已修）**：
1. 我把 codemod 的键名规则记错成 `descKey`，实际是**属性名 + Key**，即 `descriptionKey`。`tsc` 报 TS2561 后改正。
2. 生成语言包时中文映射**多出 12 个英文里不存在的键**，`tsc` 报 TS2353/TS1117。修法是**严格按英文键集过滤**（`zh = {k: ZH[k] for k, _ in enp}`），不再直接写入自己的字典。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）；`eslint` **0 error / 4 warning**（4 条均为未触及文件的既有告警）；产物含 `气压计`、`罗盘`、`测距雷达`、`视觉里程计`、`飞行中 FFT`。

**口径**：该文件 **35 → 0**；全局 **3500 → 3465**。

## 二十、第十六轮：`mavlink-config/ReceiverTab`（41 → 10）

| # | 改动 |
|---|---|
| 74 | `RC_PROTOCOL_OPTIONS` 15 条加 `descriptionKey`（内联类型加可选字段）；协议**名称**（PPM/SBus/CRSF/ELRS 等）保留英文——是协议专名 |
| 75 | 13 条界面文案接入 `receiver.*`：说明、接收机协议 + 提示、快速选择、全部协议、实时遥控通道、未检测到遥控信号、请检查 3 条、遥控校准 + 提示 |
| 76 | `ReceiverTab` 与内层 `InfoBanner` 各补 hook；新增 `rcText(t,key,fallback)`；协议描述渲染点接入 |
| 77 | 语言包 `receiver.*` 28 键中英双语；注册命名空间 |

**剩余 10 条**：协议名（`Auto-Detect`/`All`/`SBus (NI)`/`DSM/Spektrum`/`FastSBUS`…）——ArduPilot 参数枚举名，须与飞控一致。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 10/10；`vitest` 281/281（3005 通过）；`eslint` 干净；产物含 `接收机协议`、`快速选择`、`实时遥控通道`、`未检测到遥控信号`、`遥控校准`。

**口径**：全局 **3465 → 3434**。

## 二十一、第十七轮：`mavlink-config/NotifyTab`（11 → 0）

本轮把该文件**全部**用户可见文案翻完，不止扫描器报的那 11 条——扫描器漏掉多行 JSX 文本和 `data-tip`，我按代码逐段读过后补齐。

| # | 改动 |
|---|---|
| 78 | 三张数据表加键：`PRESETS`（9 个色块 `nameKey`）、`LED_STATES`（5 行 `labelKey`/`hintKey`）、`AP_BRIGHTNESS`（4 项 `labelKey`） |
| 79 | PX4 蜂鸣器三态表：键从误命的 `brightness.*` **改名为 `buzzer.*`**（原键名把"蜂鸣器模式"挂在了"亮度"下），并把渲染点 `{opt.label}` 接上 `ntText`——**原先虽有键却根本没渲染键**，属于上一轮遗留的真实缺陷 |
| 80 | 新增 `ntText(t,key,fallback)` 与 `useTranslation('notify')` |
| 81 | 界面文案 25 条接入 `notify.ui.*`：板卡不支持提示、状态 LED 标题、LED 环位置说明、颜色含义、输出禁止提示、双闪说明、亮度、接管标题/说明/两态、自行控制颜色、自定义、闪烁、常亮、`{{rate}} Hz`、选色接管说明、LED 硬件、驱动计数（`{{enabled}}/{{total}}`）、探测说明、调整提示、LED 灯带、`由 {{outputs}} 驱动`、每条灯带像素数、蜂鸣器、音量、PX4 断路器说明、安全开关标题、需要/禁用安全开关、禁用警告、按住解除、启动即通电、两种说明文案 |
| 82 | 顺手修掉一个**遮蔽地雷**：`ledTypes.map((t) => …)` / `buzzTypes.map((t) => …)` / `ledTypes.filter((t) => …)` 把翻译函数 `t` 遮蔽了，改名为 `drv` / `bz`。此前能编译只因这些作用域里没调 `t()`，一旦要在其中翻译就会静默失效 |
| 83 | 语言包 `notify.*` **62 键**中英双语（键集由中英成对表生成，中英键数与顺序完全一致） |

**保留英文**：飞控驱动名（`t.label` 来自板卡元数据，固件新增驱动无需改代码）、`NTF_*`/`BRD_*`/`CBRK_*` 参数名、`SERVO<n>` 输出名。

**本轮我造成并已修复的事故（如实记录）**：生成语言包的 Python 片段里有个变量名笔误（`k` 未定义），而写文件的写法是 `open(path,'w').write(...)`——**`open()` 先执行并截断了 `en.ts`，随后表达式才抛异常**，`en.ts` 被清成 0 字节。用 `git checkout -- en.ts` 从上一提交完整恢复（确认当时工作区干净、无未提交内容丢失），随后改为**先算好字符串再打开文件**。`tsc` 报 `TS2306: en.ts is not a module` 就是这个状态。

**验证（★ 实测）**：`tsc --noEmit` 通过；`turbo run build` **12/12** 成功；`eslint` **0 error / 71 warning**（全部为未触及文件的既有 `react-hooks/exhaustive-deps` 等告警）；`vitest` **305 文件 / 3247 用例**，其中 5 条失败全部集中在 `src/main/sitl/ardupilot-sitl-relaunch.test.ts`——**已知沙箱内进程 spawn/kill 超时的抖动用例**，单独重跑该文件 **5/5 通过（5.4s）**，与本次改动无关。

**口径**：`NotifyTab` **11 → 0**；全局 **3408 → 3397**。

## 二十二、工具：新增 `tools/i18n-merge.mjs`（把翻译表折进语言包）

前 17 轮我一个人手工拼语言包，已经出过两次事故（键集中英不一致 → TS2353/TS1117；`open(path,'w')` 先截断再抛异常 → `en.ts` 清零）。这一轮把它做成工具，后续每轮只需产出 `[键, 英文, 中文]` 三列表，一条命令合并。

| 设计点 | 说明 |
|---|---|
| 只插入、不重排 | 语言包是手写 TS，有**三层嵌套**（`settings.traffic.options.*`）、**引号与裸键混用**（30 处裸键）、**键本身含点**。任何"整体重排重打印"都会把这些冲掉，所以工具**只插入一行**，已有字节永不改写 → 重复执行不可能漂移 |
| 中英同源 | 中英两份从**同一张配对表**写入，键集天然相等 |
| 不静默覆盖 | 已存在且英文不同的键 → 报冲突并中止（不是覆盖） |
| 幂等 | 已存在的键直接跳过；实测往返 1200/1200 键命中、语言包**字节不变** |
| 命名空间注册 | 自动补 `I18N_NAMESPACES`，因为漏注册会静默回退英文 |

**自测（★ 实测）**：`--dump` 导出全部 1200 键 → 原样喂回 → `bundles unchanged`，`git status` 对 `i18n/` 为空；独立正则计数（`grep -cE` 统计叶子行）也是 **1200**，与扫描器一致，交叉验证了扫描器没有漏键。

**本轮顺带发现并处理的两件事（如实记录）**：

1. **`I18N_NAMESPACES` 漏登记 `mavlink` / `mission` / `nav`**。我一度以为这意味着这几百条翻译在运行时根本不生效。**实测否定了这个怀疑**：`resources` 是内联传入的，i18next 已把它们放进 store，即使不在 `ns` 数组里，`t('fm.x', { ns: 'mavlink' })` 和 `t('mavlink:fm.x')` 都正确返回「飞行模式」。所以**没有用户可见缺陷**，原判断是错的。仍把列表补全并改为有序，因为它是一份清单，写漏了就失去意义（改动零风险，已由同一实验覆盖）。
2. **`serialPorts.setupElrs3` / `setupGps4` 中文为空串**。不是漏译：英文用 `... 115200 baud` 收尾，中文语序把「波特率」提前到前一段，末段自然为空。工具原先「中英文都非空」的校验会误拦这种合法情况，已放宽为**允许空值但逐条列出**，交人工确认。

## 二十三、第十八轮：并行铺开 6 个文件 + 新增 `tools/i18n-check.mjs`

上一轮把「合并」工具化之后，这一轮开始并行：我一次派 4~6 个子代理各自改**一个文件**并**只产出一张 `[键, 英文, 中文]` 表**，语言包由我在主线统一合并。子代理互不接触语言包，因此不会冲突。

| # | 文件 | 翻译条数 | 命名空间 / 前缀 | 扫描器口径 |
|---|---|---|---|---|
| 84 | `components/parameters/MspConfigView.tsx` | 313 | `params` / `msp` | 124 → 1 |
| 85 | `components/survey/SurveyConfigPanel.tsx` | 210 | `views` / `survey` | 60 → 2 |
| 86 | `components/radio-hud/RadioHudView.tsx` | 191 | `views` / `radioHud` | 59 → 8 |
| 87 | `feature-tours/registry.tsx` | 68 | `views` / `tours` | 96 → 96（见下） |
| 88 | `components/parameters/NavigationTab.tsx` | 85 | `params` / `navTab` | 47 → 0 |
| 89 | `components/tours/*.tsx`（导览弹窗/门控/导航按钮） | 34 | `views` / `tours.ui` | 5 个文件 → 0 |
| 90 | 语言包 `views` 命名空间（278 + 191 + 34 键）、`params` 命名空间（313 + 85 键），注册 `views` | — | — | — |

**第 89 项是我自己做的**：子代理只被授权改 3 个文件，但它报出 `TourLaunchGate.tsx` / `TourPanelsGate.tsx` 仍在渲染英文 `tour.title`（还有「Tour needs a vehicle」「取消」「跳过此导览」等）。我把 `components/tours/` 整个目录一次做完，并把 `components/tours/index.ts`（子代理新建的 barrel）**删除**，改为按仓库既有约定在 `feature-tours/index.ts` 里补类型与 `useTourText` 的再导出。

**为什么 `registry.tsx` 仍是 96**：该文件是**数据注册表**，`steps[].content` 里的 JSX 是英文原文。运行时只有「当前语言是英文」才渲染这段 JSX，其它语言走 `ActiveTour` 里重建的翻译文本。扫描器按正则统计文件内字面量，无法知道渲染分支，所以这 96 条是**口径高估**，不是漏译。同类的还有 `RadioHudView` 残留 8 条与 `ArduPilotSitlTab` 残留 18 条（正在收尾）。

## 二十四、工具：新增 `tools/i18n-check.mjs`（不信任自述的核对）

子代理会汇报「used = declared，双向一致」。这个汇报可能是错的，而肉眼看不出来。所以写了这个核对器，**从产物出发**逐表检查三件事：

1. **用了但没声明** —— 文件里 `t('x.y')` 或 `labelKey: 'x.y'` 指向表里没有的键（运行时回退英文）；
2. **声明了但没用** —— 表里有键，文件里一次都没出现（死键）；
3. **语言包有问题** —— 键不在语言包里，或英文值与表不符，或中文为空。

语言包的「到底有哪些键」不自己解析，而是复用 `i18n-merge.mjs --dump`，避免两处实现同一件事。

**这个工具立刻抓到了三个我自己写出来的严重缺陷**（下面第二十五节）。

## 二十五、我在本轮工具里造出并修掉的三个缺陷（如实记录）

**缺陷 A：组名没加引号。** 语言包按「首段作分组对象」组织，而导览的 id 形如 `altitude-planning-beta1`。我原先写成 `altitude-planning-beta1: {`——**连字符会被 JS 解析成减法**，`tsc` 报 TS1005/TS1136。修法：组名一律写成 `'name': {`。

**缺陷 B：键的层级约定前后不一致。** 组件传给 `t()` 的是**命名空间内键**（`survey.title`，命名空间另给），而我的 `--dump` 输出的是**全限定键**（`views.survey.title`）。合并逻辑按「表里是全限定键」去 `slice(命名空间长度+1)`，于是把 `survey.action.cancel` 削成了 `.action.cancel`，键**静默变成** `action.cancel`——`tsc` 照样通过，运行时全部回退英文。修法：统一约定为**命名空间内键**，`--dump` 也按此输出。**这一条是 `i18n-check` 抓到的**：它报「语言包里没有 `survey.action.cancel`」，而我原以为已经并好了。

**缺陷 C：中英共用一个「已建分组」表。** 合并时先往 `en.ts` 插英文、再往 `zh-CN.ts` 插中文，但我把同一个 `created` 表传给了两次调用。于是中文那一遍认为分组「已经建过了」，把**中文叶子挂进了英文那一遍的分组对象里**——`en.ts` 里出现 `'common.axis-roll': 'Roll'` 和 `'common.axis-roll': '横滚'` 成对重复，`tsc` 报 TS1117。同一根因还有第二个表现：延迟插入让「本遍刚建的分组」在下一次 `scanNamespace` 里看不见，于是 313 个键各建了一个 `'msp': {`，`tsc` 又报 313 条 TS1117。修法：中英各自一个 `created` 表，且分组建立后记在表里供本遍后续键复用。

三个缺陷都逃过了 `tsc` 的部分检查（B 完全静默），是核对器与独立计数抓出来的。这也说明为什么不能只靠子代理的自述。

**验证（★ 实测）**：`tools/i18n-check.mjs` 对 msp / survey / radioHud / tours / navTab 五张表全部 OK；`--dump` 往返 **2101 键**、语言包**字节不变**；独立正则计数同为 **2101**；`tsc --noEmit` 通过。

**口径**：全局 **3397 → 2946**（-451）。

## 二十六、第十九轮：第二波并行（11 个文件）+ 端到端运行时校验

| # | 文件 | 条数 | 命名空间 / 前缀 |
|---|---|---|---|
| 91 | `components/logs/LogExplorerPanel.tsx` | 158 | `views` / `logs` |
| 92 | `components/logs/log-y-scales.ts` + 消费点（我自己接线） | 6 | `views` / `logs.yMode` |
| 93 | `components/sitl/SitlView.tsx` | 92 | `views` / `sitl.view` |
| 94 | `components/sitl/ArduPilotSitlTab.tsx` | 138 | `views` / `sitl.ardupilot` |
| 95 | `components/parameters/ParametersView.tsx` | 121 | `params` / `paramsView` |
| 96 | `shared/parameter-groups.ts` + `parameters/non-default-palette.ts` + 消费点（我自己接线） | 32 | `params` / `group.*`、`palette.*` |
| 97 | `components/mavlink-config/Px4ArmingConfig.tsx` | 42 | `mavlink` / `px4Arming` |
| 98 | `components/parameters/VtxConfigTab.tsx` | 57 | `params` / `vtx` |

**我自己接线的两处**（子代理无权改这些文件，故在其报告里点名后由我完成）：
- `log-y-scales.ts` 的 `Y_MODE_LABEL` / `Y_MODE_TIP`：新增 `Y_MODE_LABEL_KEY` / `Y_MODE_TIP_KEY` 映射，消费者两处按 `lgText(t, KEY[x], LITERAL[x])` 渲染。
- `parameter-groups.ts` 的 12 个分组加 `nameKey`/`descriptionKey`，`non-default-palette.ts` 的 8 个色块加 `labelKey`，并在 `ParametersView` 的 4 个渲染点接入（分组页签标签、页签 tooltip、状态栏「分组：」、色块 title/aria-label）。`ParameterTable` 是同一批数据的另一个消费者，已交给对应子代理复用这同一批键，避免重复定义。

**未翻译且判定为不该翻译**：`shared/parameter-types.ts` 的 `getParamTypeName()` 返回 `UINT8`/`FLOAT`/`DOUBLE` 等——MAVLink 参数类型名，是协议标识，须与飞控一致。

## 二十七、工具：新增 `tools/i18n-verify.mjs`（把键真的查一遍）

`i18n-check` 只能证明「键在语言包里」且「组件提到了它」。这**不能**证明一次查询会**返回中文**：键可能被放到了 i18next 查不到的位置、命名空间可能不对、组件可能给 `useTranslation` 传错了命名空间。所以写了这个校验器：用 esbuild 把真实的 `en.ts` / `zh-CN.ts` 打成一个模块，用**应用自己的 init 选项**初始化 i18next，然后对每张表的每个键断言 `t(key, { ns })` 等于预期的中文。

它补上的正是这里最要紧的失效模式：**查询静默回退英文**。

**它立刻抓到了一个 `tsc` 完全放过的真实缺陷**：`views` 命名空间里 `'radioHud'` 分组对象被写成了 **191 份重复对象**（上一条缺陷的残留，我上次只修了 `params.msp`）。i18next 解析 `radioHud.title` 时返回键名本身，即**界面会显示 `radioHud.title` 这样的原始键字符串**或回退英文。修法是删掉全部重复分组后按表重并。同批还核对了 `en.ts`/`zh-CN.ts` 是否残留重复分组，现已干净。

**验证（★ 实测）**：`i18n-verify` **1547 个唯一键全部解析为中文**（14 张表）；`i18n-check` 14 张表全部 OK；`--dump` 往返 **2747 键**、语言包字节不变。

**口径**：全局 **3397 → 2819**（累计 -578）。

## 二十八、第二十轮：第三波并行（4 个文件）+ 我修掉两个自己引入的「翻译会过期」缺陷

| # | 文件 | 条数 | 命名空间 / 前缀 |
|---|---|---|---|
| 99 | `components/mavlink-config/ParameterTable.tsx` | 129 | `params` / `paramTable` |
| 100 | `components/parameters/PortsTab.tsx` | 49 | `params` / `portsTab` |
| — | 复用既有键而非重复定义 | 33 | `ParameterTable` 复用 `paramsView.group-label` 与 `group.*`／`palette.*` |

`ParameterTable` 与 `ParametersView` 渲染同一批 `PARAMETER_GROUPS` / `NON_DEFAULT_COLORS` 数据，我在派单时明确要求**复用** `group.*` / `palette.*` 键、不得重复定义，两处共用一份中英对照。

### 我在交错编辑中引入、并在检查中发现的两个缺陷

`eslint` 的 `react-hooks/exhaustive-deps` 从 71 条涨到 73 条，多出的两条都不是既有告警，而是我这一轮引入的**真实缺陷**：

| 位置 | 问题 | 影响 |
|---|---|---|
| `MspConfigView.tsx:2266` | `loadConfig`（`useCallback(…, [])`）里用了 hook 的 `t`，却没进依赖 | 该回调只在挂载时创建一次，闭包里的 `t` 被 react-i18next **固定成初始语言**；语言切换后，配置加载失败的报错仍是旧语言 |
| `RadioHudView.tsx:1874` | `rescan`（`useCallback(…, [loadFromCard])`）同上 | 插卡扫描的提示语在切换语言后不更新 |

**修法为什么不只是「把 `t` 加进依赖」**：加了以后 `loadConfig` / `rescan` 会在语言切换时重建，进而触发 `useEffect` **额外重读一次飞控配置 / 重新扫描一次 SD 卡**。重读配置会顺带把 `pidRatesModified` / `rebootNeeded` 置回 false——**可能吞掉用户尚未保存的改动**，代价明显大于收益。所以改为读仓库里已导出的 `i18n` 单例（`stores/settings-store.ts` 已有先例）：单例在**调用时**才决定当前语言，既不会过期，也不需要重建回调。

**这次修的时候我又犯了一次低级错误（如实记录）**：插入 import 时我把 `import { useTranslation } from 'react-i18next';` 同时写进了「新增部分」和「保留部分」，于是该行出现两次，`tsc` 报 TS2300 重复标识符。已删除多余一行。

**验证（★ 实测）**：`tsc --noEmit` 通过；`turbo run build` **12/12**；`vitest` **305 文件 / 3245 通过 / 2 跳过**；`eslint` **0 error / 71 warning**（回到改动前的基线，两条新增告警已消除）；16 张表 `i18n-check` 全 OK；`i18n-verify` **1725 个唯一键全部解析为中文**；`en.ts` / `zh-CN.ts` 无重复分组；`--dump` 往返幂等。

**产物层面（★ 实测）**：重新构建后，`apps/desktop/out/renderer/assets/index-*.js` 中确实能检索到中文文案，例如 `遥控链路 HUD`、`舵机自动微调`、`按单位分轴`、`缺少：`、`安全开关启用，按住解除`、`正在加载你的设置`、`自动网格（铺满此屏幕）`、`对比参数`、`上一步`、`跳过此导览`。这是「用户可见」而非「只加了键」的证据。

**口径**：全局 **3397 → 2788**（累计 -609）。其中 `-652` 是「已并入语言包的键」减去扫描器口径误差的差额：`registry.tsx` 剩 96 条与 `RadioHudView` 剩 8 条属**渲染分支无法被正则感知**的高估，另有若干残留为协议/枚举名（按既定策略保留英文）。

## 二十九、第二十一轮：`Px4SitlTab`（61）+ `ScriptInstallModal`（78）

| # | 文件 | 条数 | 命名空间 / 前缀 |
|---|---|---|---|
| 101 | `components/sitl/Px4SitlTab.tsx` | 61 | `views` / `sitl.px4` |
| 102 | `components/script-installer/ScriptInstallModal.tsx` | 78 | `views` / `scriptInstall` |

**本轮有一个必须记录的过程事故**：我先一口气派了 4 个子代理（`Px4SitlTab` + `mode-presets`、`ScriptInstallModal`、`companion-templates`、`AutoLaunchTab` + `servo-presets`），**4 个全部在刚开始就失败**，没有任何产出。我随后核对 `git status`，确认**工作区是干净的**——失败的代理没有留下半成品改动，因此无需回滚。改为一次只派 2 个后，两个都正常完成。这属于环境/并发层面的失败，不是代码问题；记下来是因为「代理失败」本身不能当作「没改过文件」的证据，必须实测。

**顺手删掉一处死代码**：`ScriptInstallModal` 的子代理按模式加了 `siText` 辅助函数，但该文件的数据驱动文案全部来自运行时 manifest（类型在 `shared/script-installer-types.ts`），文件内没有任何静态表可以挂 `labelKey`，于是 `siText` **一次都没被调用**。仓库的 eslint 关掉了 `no-unused-vars`，所以它不会报错、会静默留下来。我已删除（`grep -c siText` = 0）。

**需要合并端注意的约定**：该文件有 10 处把带行内 `<code>`/`<strong>` 的句子拆成 `-before`/`-after` 两个键，**连接用的空格写在值里面**（例如英文值以空格结尾）。合并工具按值原样写入、不做 trim，所以空格得以保留；若日后有人手工「清理」这些尾随空格，中英文的排版都会坏掉。

**验证（★ 实测）**：`tsc --noEmit` 通过；`turbo run build` **12/12**；`vitest` **305 文件 / 3245 通过 / 2 跳过**；`eslint` **0 error / 71 warning**（仍是既有基线）；18 张表 `i18n-check` 全 OK；`i18n-verify` **1864 个唯一键全部解析为中文**；语言包无重复分组。

**口径**：全局 **3397 → 2720**（累计 -677）。

## 三十、第二十二轮：补漏 5 处 + **发现一类严重既有缺陷：642 个查询解析不到键**

### 30.1 本轮补齐的真实漏译（★ 实测）

上一轮我按扫描器残留把这些文件判为「已完成」，本轮逐个复核源码后发现**其中一部分是漏译**，已补：

| 文件 | 漏掉的内容 | 新键 |
|---|---|---|
| `mavlink-config/SerialPortsTab.tsx` | 4 张表的表头 `Port`/`Baud Rate`/`Assigned Functions`/`Function`/`Description`/`Protocol`/`Status`（共 10 处） | `serialPorts.col.*` 7 键 |
| `mavlink-config/ReceiverTab.tsx` | 遥控通道表表头 `Channel`/`Min`/`Trim`/`Max` | `col.*` 4 键 |
| `osd/OsdElementBrowser.tsx` | 搜索框 `placeholder="Search elements..."` | `browser.search-placeholder` |
| `mission/FlightPreviewPanel.tsx` | `<option>Entire mission</option>`、分组下拉的 `data-tip` | 复用既有 `preview.entireMission` + 新 `preview.group-tip` |
| `parameters/SafetyTab.tsx` | GPS PID 三组标题 `Throttle`/`Velocity`/`Yaw` | `safetyTab.gpsPid.*` 3 键 |
| `settings/SettingsView.tsx` | 载具档案编辑按钮 `title="Edit"` | 复用既有 `vehicleEditor.editTooltip` |

**顺带修掉一个会让界面出现原始键名的真 bug**：`OsdElementBrowser.tsx:268` 写的是 `t('browser.unsupported')`，但语言包里只有 `unsupported`。该 tooltip 在两种语言下都会**直接显示字符串 `browser.unsupported`**。已改为 `t('unsupported')`。这是上一轮 OSD 工作留下的，当时只有 tsc/build/vitest 三道门，全都抓不到。

### 30.2 新工具 `tools/i18n-audit.mjs`：全应用查询审计

前一节的 bug 不是孤例，而是一整类。所以写了这个工具：遍历 `apps/desktop/src/renderer` 下每个源文件，取出所有 `t('…')` / `xxText(t,'…',…)` 字面量与 `<prop>Key: '…'`，与该文件实际 `useTranslation` 的命名空间配对，然后用真实的语言包跑 i18next 判断**是否解析得到**。分两级：

- **NOWHERE**：任何命名空间里都没有这个键 → 界面必然显示键名本身；
- **WRONG-NS**：键存在，但不在该文件加载的命名空间里 → 运行时同样显示键名。

数据文件（没有 `useTranslation`）无法判断第二级，只判第一级。

### 30.3 审计结果（★ 实测，这是本轮最重要的发现）

**642 个键在 NO 命名空间中存在，另有 5 个只在文件未加载的命名空间里。** 也就是说，这些位置在界面上显示的是 `serialPorts.configHeading` 这样的**原始键字符串**，而不是英文或中文。

根因：早期几轮（合并工具出现之前）由我手工写语言包，**组件/数据表里的键带了命名空间前缀，而语言包里的键没带**。例如：

| 组件里写的 | 语言包里的 | 结果 |
|---|---|---|
| `t('serialPorts.configHeading')` | `configHeading` | ❌ 返回键名 |
| `nameKey: 'lua.auto.low-battery-warning'` | `auto.low-battery-warning` | ❌ 返回键名 |
| `t('osd.auto.flight-mode')` | `auto.osd.auto.flight-mode` | ❌ 返回键名 |
| `t('receiver.rcProtocols.ppm-sum-signal')` | `rcProtocols.ppm-sum-signal` | ❌ 返回键名 |

我用一个独立探针确认了这个判定（不是靠推断）：`t('serialPorts.configHeading',{ns:'serialPorts'})` 返回 `"serialPorts.configHeading"`，而 `t('configHeading',{ns:'serialPorts'})` 返回 `"Serial Port Configuration"`。

**受影响的 16 个文件、642 键**（前几名）：`lua-graph/node-library.ts` 131、`mission/WaypointTablePanel.tsx` 83、`mavlink-config/presets/mavlink-presets.ts` 69、`mavlink-config/FlightModesTab.tsx` 64、`lua-graph/graph-templates.ts` 56、`parameters/SafetyTab.tsx` 37、`mavlink-config/arming-checks.ts` 36、`mavlink-config/MavlinkConfigView.tsx` 30、`SerialPortsTab.tsx` 22、`navigation/NavigationRail.tsx` 19、`utils/osd/element-registry.ts` 90。

**这直接推翻了我前几轮对其中几个区域的「已完成」结论**：lua-graph、OSD 元素库、FlightModesTab 的键、SafetyTab、SerialPortsTab 的说明文字，实际上都显示为键名。当时的验收只有 tsc/build/vitest，三道门都无法发现运行时查询失败，而 `i18n-verify`/`i18n-audit` 是这一轮才有的。这是我的验收标准不完备造成的，不是子代理的问题。

### 30.4 修复方案与为什么本轮没有直接改

我写了 `tools/i18n-fix-keys.mjs` 做批量改写，试运行覆盖 417/647。但**试运行暴露出它会产生错误改写**，因此我没有落盘：

- `mavlink.auto.airspeed`（早期坏 codemod 留下的脏键）被改写成 `lua` 命名空间里毫不相干的 `auto.airspeed`；
- `RadioHudView` 里的 `left`（是布局数据，不是键）被改写成 `survey.panorama.side.left`。

原因是我的两条候选规则（去掉首段 / 后缀匹配）都没有用**键旁边的英文原文**做校验。已在工具头部标注 **STATUS: NOT SAFE TO APPLY YET**，只保留 `--dry-run`（默认），留待下一轮先用「英文值必须与既有条目一致」把规则收紧后再执行。

**验证（★ 实测）**：`tsc` 通过；`turbo build` 12/12；`vitest` 305 文件 / 3245 通过 / 2 跳过；`eslint` 0 error / 71 warning；`i18n-audit` 检查 66 文件 / 3077 个字面量。
