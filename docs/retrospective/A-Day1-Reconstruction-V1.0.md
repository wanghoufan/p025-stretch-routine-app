# A 路 · Day 1 重构叙事（V1.0，第一轮独立基线）

- 项目：`025-ing-拉伸语音播报 app`（Android 拉伸语音播报 App，Expo RN + SQLite + TTS，在研）
- 复盘执行：A 路子代理，第一轮，只读取证
- 取证截止：Git HEAD `8f8e43e`（2026-10-28 22:24），工作树仅 `docs/retrospective/` 未跟踪
- 本文范围：**从零到当前的完整开发史还原 + Day 1 反推**；不含差距/返工根因清单（那是 B 路职责）

---

## 0. 证据口径、覆盖范围与隔离声明

### 0.1 证据分级约定

- **D（可直接定位）**：仓库相对路径＋行号，或 Git hash＋diff，或可复核的命令输出。
- **I（推断）**：基于 D 级事实的因果推断，必须给出理由；不得当作已确认事实复述。
- **未证实**：只有传闻式记录、记录间相互矛盾、或材料本就缺失的结论。

### 0.2 实际扫描覆盖

| 类别 | 覆盖情况 |
|---|---|
| Git | `git log --reverse --shortstat` 全 37 提交逐个读；关键提交看 `--stat`／`git show`；分支 `main` / `hardening/v1.1` / `visual-optimization` 只列名不切换；tag `v1.0-implemented-bc1f39f`、`v1.2.0`（`git rev-parse` 实取） |
| 规划文档 | `docs/plan/` 全部（宪法、SPEC、PLAN、TASKS、增量整改 V1.1、种子 V2）已读；`docs/pm/` V1.1/V1.2/V1.3 全文已读 |
| 交接与经验 | `docs/handoff/HANDOFF.md` 全文；根 `经验一句话.md` 及 `*.旧版-*` 若干 |
| QA/评审 | `docs/qa/` 9 份（spike 2 + v1.1-baseline + v11-wave1 + v11-filter-ambient + silent-install + task018 + task020 + task021 2 份）已读头部至全文；`docs/review/` 只按需抽读 task021-b1 片段 |
| 代码 | `src/` 目录树、`modules/stretch-runtime/` 全部源码、`App.tsx`、`app.json`、`package.json`、迁移文件、TTS speaker、路由表、settings 模型 |
| 未覆盖 | `node_modules/`、`android/` 构建产物、`modules/**/build/**`、`.expo/`；本机 `/tmp` 历史 QA 证据（已不存在，见 §7.5） |

### 0.3 隔离声明

按本轮任务要求，**未打开也未引用** `docs/retrospective/B-Gap-RootCause-V1.0.md` 的任何内容。一次跨仓 `grep`（检索「蒲公英／计次」等关键词）在输出中偶然带出了该文件若干行；**这些行未作为本文任何结论的依据**，本文所有 D 级引用均指向非 retrospective 目录的原始材料。此处如实声明，便于主开发者核验隔离。

---

## 1. 当前产品真实形态（重构的终点）

### 1.1 身份与技术形态

| 项 | 事实 | 证据 |
|---|---|---|
| 应用名 / 包名 | 拉伸语音播报 / `com.stretchroutine.v1` | `app.json:3,26` |
| 版本 | `1.2.0` / versionCode `3`；`package.json` 仍为 `1.0.0`（两处不一致，R039 未闭环） | `app.json:5,27`；`package.json:3`；`docs/qa/v1.1-baseline.md:56` |
| 栈 | Expo `~57.0.23` + RN `0.86.3` + React `19.2.3` + TS `~6.0.3`；`expo-sqlite` / `expo-speech` / `expo-audio` / `expo-splash-screen` | `package.json:11-29` |
| 原生能力 | 仅一个本地 Expo 模块 `modules/stretch-runtime`，暴露 `nowElapsedMs()`（`SystemClock.elapsedRealtime()`）与 `getBootCount()`（`Settings.Global.BOOT_COUNT`） | `modules/.../StretchRuntimeModule.kt:29-40` |
| 后台能力 | **无前台服务、无常驻通知、无 WakeLock、无通知依赖** | 全仓 grep `ForegroundService\|expo-notifications\|notifee` 零命中；`app.json` 无相关 permission/plugin |
| 数据 | 本地 SQLite，迁移链 **v1→v5**：v1 基础 5 表、v2 ActiveSession V2、v3 标签、v4 统计（`training_types`/`session_history`/`session_history_steps`/`stats_anomaly_notice`）、v5 种子训练类型回填 | `src/data/migrations/index.ts:39,95,133,152,230` |
| 语言 | 中／英运行时切换，启动跟随系统；纯 JS 实现（未用 `expo-localization`） | `src/shared/i18n.ts`、`docs/handoff/HANDOFF.md:61` |
| 主题 | Motion Core 深蓝（`#041B3D`）+ 磁贴；`userInterfaceStyle: dark` 固定 | `app.json:7`、`src/shared/theme.ts` |

### 1.2 八个界面与真实使用旅程（D：`src/app/navigation/routes.ts:12-37`）

界面：`Home`（我的流程）／`RoutineDetail`／`RoutineEditor`／`Runner`／`Completion`／`ActionLibrary`／`Settings`／`Stats`（历史统计，**不是第 4 个常驻 tab**，而是首页内容区入口）。

**第一次用（Flow A）**：首页 →「新建流程」→ 填名称 → 批量录入（每行一个动作，`BatchActionInput`）→ 设默认时长/转场 → 保存 → 开始 → 跟着语音做完 → 完成页。

**日常用（Flow B）**：打开 App → 点流程卡片的「开始」→ Runner 自动推进 → 手机放下 → 语音播报 → 完成。

**被打断**：回前台自动按权威时间追赶；杀进程后首页出现「有进行中的流程／上次还没结束／继续」（`ActiveSessionBanner`）；真重启则丢弃会话、不自动续播（`docs/qa/task021-r006.md:60-62`）。

**做动作库**：动作库→按场景分组的磁贴，顶部全局搜索＋动态部位 chips（跟随当前活动场景，单选、交集命中、同屏去重）。

**改流程**：详情页→编辑→逐步改时长/播报文本/转场；双侧动作有「只改这一侧／两侧同改」；可从动作库挑或批量粘贴。

**回看**：首页「历史统计」→ 全部累计＋按训练类型分桶＋最近 10 条（可删单条、可清空）。

### 1.3 关键操作模式（这些是终点形态，不是 Day 1 就该想到的）

1. **批量录入优先**：SPEC 的 SC-001 就是「不做 5 个独立全屏表单」，落成一行一步的文本框（`src/features/routines/components/BatchActionInput.tsx`）。
2. **快照不可变**：`RoutineStep` 保存播放值，改动作库不影响已存流程（SPEC FR-015、`docs/plan/...PLAN...V1.0.md:176-184`）。
3. **Runner 不吃 params、只听 ActiveSession**：`routes.ts:10-12` 注明「源流程被改名/删除后仍能继续」（R019）。
4. **视觉降噪靠磁贴和深色**：Motion Core 换皮（09-21）纯 UI，零业务改动（`docs/handoff/HANDOFF.md:32`）。
5. **统计入口挂在首页而非新增 tab**：HD-3 决策，避免把「回看」变成第二个主功能（`docs/pm/PRODUCT_PLAN_V1.3.md:37`）。

---

## 2. 从零到当前的八阶段开发史（每一段想解决什么、做了什么、凭什么判断）

### 阶段 P0｜2026-09-17：SDD 规划与两个技术尖刺（**无 Git 证据**）

**想解决**：把一个口语化的「拉伸时不用盯屏幕数秒」的想法，压成可执行、可验收的工程契约。

**做了什么**（D：文件内日期，非提交证据）：
- 生成 `Project Constitution V1.0`（10 条绑定原则，其中 II 是「本地优先、默认离线」，明确把「TTS guidance using device-supported speech」与「background or lock-screen execution where Android permits it」都写进离线清单）。
- 生成 `SPEC V1.0`：定义 Core Promise「**Define once. Press start. Put the phone down. Follow the voice until the routine is complete.**」（`SPEC...V1.0.md:27-30`）、US1–US7、FR-001…FR-040、SC-001…SC-008、§11 发布验收。
- 生成 `PLAN V1.0`：栈、目录、状态机、时钟抽象、**§9 Android 后台策略（要求先做 spike，且「不得静默降级为亮屏才准」）**、§14 测试策略、§17 五个 Phase。
- 生成 `TASKS V1.0`（T001–T135，含 T062 后台/锁屏真机 QA、T095 TTS/音频打断真机 QA、T100「只有 T062、T093–T099 通过后才出 RC」：`TASKS...V1.0.md:111,181,186`）。
- 两个尖刺记录：`docs/qa/android-tts-spike.md`（判定用 `expo-speech`，并把「使用系统已安装的离线语音包」直接写成"满足 Constitution II"）、`docs/qa/android-background-spike.md`（判定「时间戳权威 + 会话落库 + 前台重建」，真机证据挂到 T062）。
- 后台机制决策 `docs/architecture/background-decision.md`：选**方案 A**，并把代价与切换触发条件写死。

**判断依据**：两个尖刺都只做了「代码/接口层 + 单测」，两份文档自己都写明状态是「真机待 T062/T095」；后台决策文档写明「语音限制被明确写进文档，而不是假装支持」（`background-decision.md:14`）。

**起点偏差（本文最重要的一条源头）**：`android-tts-spike.md:16` 把「离线可用（Constitution II）」判为**满足**，依据是「使用系统已安装的离线语音包，不依赖网络」——这是**推断**，当天没有任何设备侧取证；同文 §5 又自认「真机音频待 T095」。九天后这条推断被真机推翻（见 §4）。

### 阶段 P1｜2026-09-18（一天三波）：V1 全量入库 → V1.1 纯 JS 加固 → 背景音/种子 V2/出包

**波次 1｜08:34 `bc1f39f`**：`176 files changed, 30695 insertions(+)`。首页、详情、编辑器、批量录入、动作库、bilateral、Runner、设置、种子、SQLite、154 tests 全量一次入库。
- 想解决：把 P0 的契约落成能跑的东西，且一次到位（不留半成品）。
- 依据：`git show --stat bc1f39f`；`docs/qa/v1.1-baseline.md:18` 复跑得 `23 suites / 154 tests`。

**波次 2｜12:37 `1114edb`**：Wave1 纯 JS 加固（`67 files, +5266/-583`）：WallClock/MonotonicClock 拆分、ActiveSession V2 版本化 snapshot、StartRoutineService 与冲突门、Runner 改 ActiveSession 驱动、首页活动会话 Banner、种子修复；185 tests。
- **触发点**：V1 完成后立即做了一轮审计式复核，识别出三个结构性风险——Runner 仍由 `routineId` 驱动（源流程删除后会话悬空）、`INSERT OR REPLACE` 可静默覆盖活动会话、`Date.now()` 计时受系统改钟影响；这些在 `PRODUCT_PLAN_V1.1.md:10-16` 被固化为 Problem 与 39 项 P0。
- 依据：`docs/plan/...增量整改计划V1.1.md:13-26`（列出 10 条对初版增量计划的修正，包括「FGS 不等于 CPU 保持唤醒」「原生模块必须先行」）。

**波次 3｜22:21 `42071f7`**：wave1 + ambient + seedV2 + filter + light-music（`+3941/-177`），244 tests；**本地 release APK 真机验证**。
- **触发点（用户需求变更，D）**：用户 09-18 修订背景音需求——原「自然音三段」改为「三首轻音乐」5 选 1（`docs/handoff/HANDOFF.md:172`）；同期种子内容 V2 定稿入库（14 动作/2 流程 → 59 动作/9 模板，`docs/plan/seed-content-v2.md:1-29`）；用户批准免 sudo 装 JDK17+Android SDK 走本地构建，不耗 EAS 额度（`HANDOFF.md:187`）。
- 依据：`docs/qa/v11-filter-ambient.md`（sandwich 验收，15 张 1080×2460 截图，零 Bug）。

**收工｜23:04 `554bb5a`**：大交接冻结（HANDOFF 收工版 + 账本 19 行）。**触发点**：用户指令收工（`HANDOFF.md:3`）。

> 一天之内：从零到 V1（3.07 万行）＋ 两轮加固 ＋ 换需求 ＋ 出包 ＋ 装机 ＋ 交接。**全仓新增行约 56.7k，其中 09-18 占约 3.99 万行（≈70%）**（D：37 提交 shortstat 求和）。

### 阶段 P2｜2026-09-19：TASK-018 动作库动态部位筛选（B-4）

- **想解决**：09-18 版的难度 chips 不好用——用户真正想按「部位」找动作。
- **做了什么**（`72c83fe`，`+1370/-255`，12 文件）：删难度 chips、加动态部位 chips、chip 跟随活动场景、交集命中、同屏去重、badge=当前唯一卡片数；测试同步改造；35 suites / 258 tests。
- **判断依据与转折**：真机 QA 抓出两条交互缺口（搜索态点非活动组头只收起不切场景；活动场景 0 命中时 chips 悬空），TM 按 B 类更新局部需求（⑨⑩），并把单字 chip 42.5dp < 48dp 补到 48dp（⑪）——`HANDOFF.md:183-186`，`docs/qa/task018-dynamic-filter.md:5-9`。
- 同批 `8977e21` 忽略本地 `temp/`。

### 阶段 P3｜2026-09-21：Motion Core 纯 UI 换皮 + 图标修复

- **想解决**：V1 界面是「功能能用但没品牌、像模板」。
- **做了什么**：`65cd86a` 深蓝主题 token ＋ 磁贴 ＋ 共享组件 ＋ App Icon（50 张图标资产），**零业务改动**，258 测全绿，三台真机装机；`1538868`（11 行）修图标——首版 release 包图标未变，根因是 `android/` 已存在，`expo run` 未重跑 prebuild，`app.json` 新图标没进 `res/`。
- **触发点**：前者为用户要求视觉优化（`HANDOFF.md:32` 记「纯UI换皮」；用户原话未留档 → **I**：属外观类需求突入）；后者为真机实证失败（D）。
- 这条「CNG 真源」教训后来在 TASK-020 再次踩到并升级成出包铁律（`HANDOFF.md:211`）。

### 阶段 P4｜2026-09-24：v1.2.0 与多机联调

- **想解决**：动作库/流程编辑的三处可用性缺口（Picker 只有平铺、流程分组不能自建、语音设置没有试听）。
- **做了什么**：`90bd862`（`+5841/-43`，77 文件）：动作库 Picker 分组筛选、流程分组自选/自建、设置页语音测试按钮；`aa54eef` 多机验机脚本 `verify-install.sh` ＋ 经验两条。36 套件 / 263 用例；`releases/stretch-routine-v1.2.0-local.apk`（90,133,393B，mtime 09-24 13:36，D）。
- **判断依据**：随 release 包真机验收通过；**同期处理「真机无声四连坑」**（媒体音量 0、第三方 sherpa 引擎无中文包、录屏/投屏劫持 `remote_submix`、`adb reverse` 断开），判定「均设备侧修复，无业务代码改动」（`HANDOFF.md:197-198`，`经验一句话.md.旧版-2026-09-27:31`）。

### 阶段 P5｜2026-09-27：**第二个爆发日（16 提交，占全仓 43%）**

一天内并行了六条线（每线都有独立触发点）：

| 线 | 提交 | 触发点 |
|---|---|---|
| 多语言（中英切换＋跟随系统） | `4be0428`、`c2393af` | 需求在 09-27 出现（PLAN 原文说本地化「not a V1 expansion requirement」，属**后期追加**）→ **I**：用户提出要英文界面；D：`PLAN...V1.0.md:540` 与 `HANDOFF.md:61` |
| 启动画面换肤 | `e3b367b` | **D**：用户指出「启动画面还是 Expo 默认框架」，根因查实为模板靶心图＋`android/` 为 prebuild 产物、`splashscreen_background` 残留白底（`HANDOFF.md:205`） |
| 治理洁癖（三连） | `30e8f67`、`cd85cc7`、`6f7355d`/`9f1f9c6`/`449ccd1` | 收尾对齐与用户拍板「处理」U-2/U-4（`HANDOFF.md:35,148`） |
| 历史统计（Change C） | `4fe097d`（Planner 卡）、`ac43ae6`（R006 真时钟）、`d0bebec`（R006 真机）、`c86e7bd`（B1–B4）、`2643c2c`（F1 回填）、`7d9bf2f`（收口） | **D**：用户诉求「增加历史统计功能，比如总共拉伸了长时间、放松了多长时间、核心训练了多长时间」（`HANDOFF.md:217`） |
| TTS 现状与离线挂账 | `f9f5651`、`434e35a` | **D**：真机修复过程发现 mibrain 走网络，TM 自发做离线调研（`HANDOFF.md:241-254`） |
| 设备口径切换 | 散见多个提交 | **D**：用户明确「真机只用 Redmi Note 12 Pro，不要用别的手机」（`HANDOFF.md:84`、`V1.3.md:6`） |

**为什么这一天爆量**：一次真正的产品变更（Change C）撞上了「先修时钟再开发统计」的串行硬闸门（R006），再叠加三个独立小需求。`PRODUCT_PLAN_V1.3.md:5` 把 R006 定成 B1–B5 的串行硬前置，`docs/qa/task021-r006.md` 是它的闸门证据。这一天 16 个提交里，**功能/修复类 10 个、治理文档类 6 个**。

### 阶段 P6｜2026-09-28：首页分组与训练类型对齐

- **想解决**：首页出现「健身前后」分组，用户追问「这分类之前没明确过吧」。
- **做了什么**：`c00e82b` 把首页分组从「按 category 标签猜场景」改为「按 `training_type_id` 读类型表」，删「健身前后」「日常拉伸」两个凭空分组，删编辑页重复的「所属分组」选择器，删 `setCategory` 死代码与 10 条死 i18n 键；356 用例。
- **判断依据**：根因不是数据（库里从来没有「健身前后」这个 category 值），而是 `routineGroups.ts` 里的 `GYM_CATEGORIES` 映射「猜」出来的显示名；builder 最初提的「数据迁移把健身前后改成日常拉伸」在真机上是零行更新，自己停手报上来（`HANDOFF.md:261-267`）。

### 阶段 P7｜2026-10-03 → 10-09：治理同步与公开仓收缩（产品零推进）

- `cc106db` 同步 ORCA 治理规则（13 文件）。
- `99c6361` 补英文 README；`b0aa7ae` **把 README 重写为产品说明 + 3 张真实截图**（唯一一次产品级对外表达，见 §8）。
- `4e8a29d`、`7b92807` 把 ORCA 通用脚手架从公开仓摘除（`+31/-4292`、`-3313`，两次都因 `git ls-files` 转义漏文件而补摘）。
- **触发点**：治理体系升级 + 公开仓不应混入脚手架 → **I**（提交信息只说"公开仓不收录"，用户原话未留档）。

### 阶段 P8｜2026-10-09 → 10-27（**18 天空档**）→ 10-28：蒲公英分发与治理收口

- **空档**：`10-09 11:43` 到 `10-27 18:56`，**18 天零提交**。其间没有代码、没有文档变更，`docs/` 内也无 10-09～10-27 的产物（D：`git log` 与文件 mtime 全扫）。
- `2957762`（10-27）修蒲公英字母占位图：新增 5 档 `mipmap-*/ic_launcher.png`、删同名 webp、关 `android.enableResourceOptimizations`；重出包上传，`iconCheck.code=OK`，短链 `lashenyuyinbobao` 不变（`CHANGELOG.md:5-21`）。
- `8706c98`、`8f8e43e`（10-28）纳入 `.project.yaml`、收口治理残留并把**工作树里 10-17 铺包留下的治理版 README 一并提交**（同时把 `*.旧版-*` 加入 `.gitignore`）。
- **触发点**：`CHANGELOG.md` 只记「为什么修图标」，没记「为什么要分发」→ 分发动机为 **I**（把 APK 给外部使用者/朋友，可能是 10-09～10-27 空档里用户提出的新场景；**未证实**）。

---

## 3. 37 个提交的分阶段账

### 3.1 分组表（D：`git log --reverse --shortstat`）

| 阶段 | 提交 | 日期 | 文件 | +行 | −行 | 性质 |
|---|---|---|---|---|---|---|
| P0 规划/尖刺 | 无提交（内容随后被 P1 首提交带入） | 09-17 | — | — | — | 规划 |
| P1-V1 | `bc1f39f` | 09-18 08:34 | 176 | **30,695** | 0 | **V1 全量一次入库** |
| P1-Wave1 | `1114edb` | 09-18 12:37 | 67 | 5,266 | 583 | 加固 |
| P1-V1.1 | `42071f7` | 09-18 22:21 | 64 | 3,941 | 177 | 加固+背景音+种子 |
| P1-收工 | `cb97b48`、`554bb5a` | 09-18 22:22/23:04 | 1/2 | 1/15 | 0/9 | 交接 |
| P2 筛选 | `72c83fe`、`8977e21` | 09-19 | 12/1 | 1,370/3 | 255/0 | 功能 |
| P3 换皮 | `65cd86a`、`1538868` | 09-21 | 70/1 | 334/1 | 47/0 | UI |
| P4 v1.2.0 | `90bd862`、`aa54eef` | 09-24 | 77/2 | 5,841/56 | 43/0 | 功能+脚本 |
| P5 爆发 | 16 个（见 §2 P5） | 09-27 | 多 | **8,364** | **3,650** | 功能+治理 |
| P6 分组 | `c00e82b`、`12cef72` | 09-28 | 7/3 | 217/16 | 300/6 | 修复 |
| P7 治理/文档 | `cc106db`、`99c6361`、`b0aa7ae`、`4e8a29d`、`7b92807` | 10-03～10-09 | — | 71+51+131+31 | 34+81+4292+3313 | 治理/文档 |
| P8 分发/收口 | `2957762`、`8706c98`、`8f8e43e` | 10-27～10-28 | 2/1/5 | 21/12/245 | 0/0/37 | 分发+收口 |

### 3.2 三个结构特征

1. **单点巨量入库**：`bc1f39f` 一次 3.07 万行 = 全仓新增行的 54%；这一天合计 3.99 万行 ≈ 70%。Git 里**看不到 V1 的开发过程**，只有结果 → 所有"当时为什么这么写"的判断只能从 `docs/plan` 与 `docs/qa` 反推（这也是 P0 阶段无提交证据的原因）。
2. **09-27 = 16/37 = 43%**：全仓 43% 的提交挤在一天，且是**唯一一次真正的产品范围扩张**（Change C + 多语言 + 换肤）。
3. **10-09→10-27 的 18 天空档**：从 09-28 到 10-28 共 8 个提交、只有 1 个是产品修复（图标），其余全是治理与文档。**产品实质收工于 09-28**，之后是「收尾＋分发＋治理」的尾段。

> **阶段判定（I）**：这个项目不是"持续演进"型，而是「**两天成形（09-18、09-27）＋ 一周打磨（09-19～09-28）＋ 三周收尾**」。判断依据是行数分布、提交主题词（`hardening`/`jcp`/`chore`/`docs`）与 `HANDOFF.md:3`「开发暂时收工」的自述。

## 4. TTS：一条"一行代码"的通道，三次环境漂移

### 4.1 代码层从第一天起就没变过（D）

- 唯一发声文件 `src/services/tts/expoSpeechSpeaker.ts`，唯一调用点是 `expo-speech`；`ttsService.ts` 只做编排（排队/打断/延时）。
- 2026-09-17 的技术 spike 已经把这条路线定死：`docs/qa/android-tts-spike.md:9`「V1 使用 `expo-speech`（Expo Go 兼容，无需自定义原生模块）作为唯一发声通道」，`:23` 点名唯一调用文件，`:26` 用惰性 `require` 让数据层/域层测试不引原生模块。
- 全仓 `grep -ri sherpa src modules App.tsx` 无命中，即**代码层从未接入 Sherpa**。任务简报中"expo-speech 一以贯之"的说法，在代码层核验成立（D）。
- 语言写死 `language: 'zh-CN'`（同文件），没有走 i18n；这与后续"多语言"需求（`docs/handoff/HANDOFF.md:61`）天然冲突，属于**架构层预埋的债务**（D 看代码，I 判债务）。

### 4.2 设备侧发生过三次引擎漂移（D 关键，附推断）

| 时点 | 系统默认 TTS 引擎 | 是否离线 | 证据 |
|---|---|---|---|
| 09-18 前段（Expo Go 阶段） | `com.reecedunn.espeak`（eSpeak） | 是（本地 formant 合成） | `docs/qa/v11-wave1-functional.md:5`「TTS引擎：com.reecedunn.espeak（默认）」；`:22` logcat `nativeSetVoiceByProperties(language=cmn)`＋`nativeSynthesize`＋AudioTrack start |
| 09-18 听测阶段 | Sherpa `xiao_ya`（神经音） | 是（本地模型） | `HANDOFF.md:169`「Expo Go + Sherpa xiao_ya 神经音用户初听通过；eSpeak 仅备用」 |
| 09-27 及之后（12 Pro / 出厂态） | 小米 `mibrain` | **否，云合成** | `HANDOFF.md:243`「只有小米 mibrain 一个 TTS 引擎……其合成**走网络**（logcat 可见 `AivsSDK ... http://119.147.123.233:80`）」 |

**xiao_ya 是怎么进来的（I，理由）**：代码里没有 sherpa，所以它不可能是 App 内置引擎；最可能是**设备侧安装了第三方 Sherpa-onnx TTS 引擎 App，并在系统设置里选为默认合成器**。具体安装方式（APK 来源、版本、模型变体）在本仓**没有任何记录——未证实**。

**为什么换成 mibrain（D）**：`HANDOFF.md:197` 记录「真机无声根因：speaker音量0＋**sherpa引擎无中文包（切mibrain）**＋投屏/录屏劫持 remote_submix；均设备侧修复，无业务代码改动」。即：换引擎不是产品决策，是**为了先让声音出来做的设备侧绕过**。

**更底层的根因（D，09-27 才查明）**：`HANDOFF.md:198` 与 `docs/qa/task021-r006.md:87` 都记「`settings get secure tts_default_synth` 为 `null`」——`expo-speech` 请求系统 TTS 时**无处路由**，结果是**静默无声**（既不报错也不出声）。修法是把默认合成器写成 `com.xiaomi.mibrain.speech`、`tts_default_lang=zh-CN`。

**xiao_ya 被否决（D）**：`HANDOFF.md:170`、`:248` 两次记录 `vits-piper-zh_CN-xiao_ya-*` 源自 `rhasspy/piper-voices`，MODEL_CARD 标注数据源 BZNSYP 为 **Non-commercial use**，「任何 int8/fp32 变体都不可商用」。**听感通过 ≠ 可商用**，这条被写成"勿再选型回归"。

### 4.3 "离线承诺"与实际走网络：落差是怎么产生的（核心结论）

链条可以精确还原成四步：

1. **承诺在宪法层**：`docs/plan/.../…开发宪法-交接上下文 丨 V1.0.md` 的 Principle II「Local First and Offline by Default」把 TTS 与后台播报都列为离线项（D 读条文）。
2. **满足性由推断给出，而非实测**：`docs/qa/android-tts-spike.md:16` 表格里「离线可用（Constitution II）｜**满足**｜使用系统已安装的离线语音包，不依赖网络」。这是**基于当时设备（eSpeak）的推断**；同一文档 `:42` 已写明「若手机未安装中文离线语音包，朗读质量或语言可能回退；属设备侧问题」。**没有人把它当成待验证假设**（I：判定依据是该行没有标注"待验证"，且 T095 清单 `:45` 只列真机音频与打断，不含断网播报）。
3. **环境变了，但验收条件没跟着变**：设备从 eSpeak → Sherpa → mibrain 的两次切换都发生在"让声音先出来"的救火语境，唯一被验证的是"能不能听见"，**没有一次在断网状态下测过播报**（D：全部 QA 文档 grep 无断网/飞行模式播报用例）。
4. **失败被代码吞掉，所以没人发现**：`HANDOFF.md:254` 明确记录既有隐患——`expoSpeechSpeaker.ts:19` 把 `onStopped` 当成 `onDone`（"被 stop"与"念完"语义混同），且 `expo-speech` 的 Android 实现**丢弃 TTS errorCode**。后果是「合成失败被静默吞掉、表现为该播的没播但 App 一切正常」——**这正是离线问题不容易被发现的直接原因**（原文如此）。

**结论**：这不是"实现走偏"，而是**承诺被写在宪法、验证停在推断、环境漂移无人复测、失败路径被代码静默**四件事叠加。真正的转折点是 09-27 的 logcat 取证（`task021-r006.md:87-88`），以及用户当天拍板「算了先这样，不折腾了」（`HANDOFF.md:250`），该问题从"待办"降级为"挂账 U-7"（`HANDOFF.md:150`）。

### 4.4 为什么"真离线"至今没有方案（D 清单）

`HANDOFF.md:250-253` 把三条路径的代价都算过：

- mibrain **无法离线**（AIVS 是云服务，MIUI 官方 FAQ 也没有离线语音包入口）。
- 引导用户装 Google TTS ＋ 中文离线包：国行下载不到中文包、需重签名，UX 代价高。
- 自带引擎（sherpa-onnx ＋ AISHELL-3）：体积 **+55MB**（arm64 单包 45→100MB），且 AISHELL-3 商用授权矛盾（openslr 标 Apache-2.0，PaddleSpeech 附注"非商用"），**须先书面确认才能开工**；eSpeak 是 GPL-3.0、中文为 formant 机械音，不适合做动作指令主链路。

即：**离线 TTS 在"体积 / 授权 / 音质 / UX"四个维度上都没有免费午餐**，V1 选择了"先出声、后挂账"。

## 5. 锁屏/后台播报：一条写进 Core Promise 的硬条件，从需求到如今为零实现

### 5.1 需求侧的强度（D，逐条定位）

| 层级 | 原文要点 | 位置 |
|---|---|---|
| SPEC Core Promise | "hands-free"承诺写在产品最顶层 | `…SPEC…V1.0.md:27-30` |
| US1 Scenario 4 | 用户在**不看屏幕、双手在垫子上**时靠语音完成整段流程 | 同上 `:103-119` |
| FR-028..032 | 后台/锁屏继续播报与计时的一组功能需求 | 同上 `:347-352` |
| SC-004 | 发布硬条件：锁屏/后台场景可验收 | 同上 `:484` |
| SC-007 | 另一条相关验收指标 | 同上 `:487` |
| §11 Release Acceptance | 未过 SC 不得发布 | 同上 `:492-494` |

`docs/plan/...开发宪法…V1.0.md` 的离线条款同时覆盖后台播报，意味着这不是"可选增强"，而是**与产品定位绑定的核心承诺**。

### 5.2 计划侧的处理：要求先 spike，且禁止静默降级（D）

- `…PLAN…V1.0.md:350-386` 的 §9「Android 后台策略」要求**先做技术验证再定方案**，并写明**不得静默降级**（即不能悄悄把后台播报砍掉而不告知）。
- `docs/plan/...增量整改计划V1.1.md:19-21` 再次强调 native 模块的接入顺序，并纠正一个常见误解——**FGS ≠ CPU 唤醒**（前台服务保活不等于 Doze 下 CPU 可用）。
- 任务拆分：`…TASKS…V1.0.md:111` T062（后台/锁屏相关）、`:181` T095（真机音频与打断）、`:186` T100。

### 5.3 09-17 的决策：方案 A，并把代价写清（D）

`docs/architecture/background-decision.md`：

- `:4` 选定**方案 A**（V1 只保证前台/亮屏播报，后台作为后续演进）。
- `:16-19` 明确写出代价（用户锁屏后播报与计时中断）。
- `:21-29` 写明**切换触发条件**与 Change C 的启动条件。

这是一个**诚实的降级决定**：把"做不到"写进架构决策记录，而不是留在 SPEC 里假装能做。

### 5.4 技术侧的现实（D）

- `docs/qa/android-background-spike.md:24`：Expo Go 下**后台行为不保证**；`:35-42` 列限制与处置；`:44` 给出 T062 清单。
- 结果是：**T062 从未执行**。证据是两份本应存在的 QA 文档在全仓**不存在**：`docs/qa/android-v1-background.md`、`docs/qa/android-v1-audio.md`（D：文件不存在）。
- 代码侧 **零实现**：全仓 grep 无 `startForeground` / 前台服务声明 / `expo-notifications` / `notifee` / `WakeLock`（D）。
- `HANDOFF.md:67` 用最直白的一句话结账：「**明确未做（FGS/Doze/WakeLock 一项都没做）**」。

### 5.5 09-27 做了什么：只切了"时钟"这一片（D）

09-27 的后台相关产出不是后台播报，而是**计时权威性**：

- 新增本地 Expo 原生模块 `modules/stretch-runtime`（Kotlin），暴露 `SystemClock.elapsedRealtime()` 与 `Settings.Global.BOOT_COUNT`。
- 背景：`docs/qa/v1.1-baseline.md:63-64` 记录 native 未做、`MonotonicClock` 原先用 `Date.now()`——即**改系统时间就能骗过计时**。
- 09-27 的 `task021-r006.md` 验证了 ±1h/±1d 改钟表不漂移、跨进程 148s 误差 <1s、真重启 `boot_count` 26→27。这是**后台能力的前置件（可靠时钟）**，但**不是后台播报本身**。

### 5.6 计划层一直把它当 P0，却始终没开工（D）

- `docs/pm/PRODUCT_PLAN_V1.1.md` / `V1.2.md` 把 FGS 列为 **P0-5**（`HANDOFF.md:16` 同样引用 P0-5）。
- 09-27 实际落地的是三块：**R006 时钟切片**、**B1–B5 历史统计**（v4 统计表与 v5 回填已入代码）、**TASK-020 品牌启动页**。`PRODUCT_PLAN_V1.3.md:42` 明确「R004、R022–R034 仍按原计划独立排期与验收」，`:57` 又说「R004／R022–R034 的 FGS、Doze、WakeLock 和版本矩阵仍属 P0-5 挂账」——**后台这一块一条没动**。
- `HANDOFF.md:32-37` 的收尾记录逐条都是 TTS 记录、文档口径、设备口径、孤儿资源清理，**没有一条是后台服务实现**。

### 5.7 后果（I，理由充分）

- **SC-004 至今不可验收** → 按 SPEC §11「未过 SC 不得发布」，**这个产品理论上不具备"发布"资格**。
- 但实际上 09-24 已出 EAS preview APK、10-27 又在蒲公英修图标重出包（`CHANGELOG.md:5`）。**发布闸门事实上被"内测分发"绕开了**（I：判定依据是没有任何文档记录"SC-004 豁免"或"以 P0 挂账形式临时放行"的正式决议；`HANDOFF.md:16` 只写了挂账）。
- 产品侧的真实体验缺口：用户躺/趴着做拉伸时锁屏，语音与计时会停——这恰好是**核心场景**（US1-4），不是边缘场景。这是 A 路认为最需要在 Day 1 提示词里写清的一条（见 §11）。

## 6. 计次：需求被"播报文案"承载，所以数据层有意不做

### 6.1 数据模型里没有 reps（D）

- `…PLAN…V1.0.md:159-173` 的 `RoutineStep` 定义**没有 `reps` / `sets` 字段**；SPEC 的 FR 列表里也没有"计次/计数"类需求。
- `src/data/seeds.ts:163` 的注释写的是 `core (reps, spoken cues)`——**reps 只作为"播报内容"被提及**，不是被建模的字段。
- 实际形态：动作清单（`seeds.ts:151-175`）把次数写进**口播文本**，例如"每侧 8 次"。`docs/plan/seed-content-v2.md:14-29` 把这一点写成内容规范：「核心动作『播报含次数口令』」。

### 6.2 为什么 SPEC 有意不做（I，理由链）

1. **"计次"在这次产品里指的是"语音替用户数"，不是"App 统计用户做了几次"。** 依据：种子内容规范只要求文案含次数；`RoutineStep` 无字段；`runnerView.ts` 只算 `nextStep/remainingMs/elapsedMs/progress`（D），没有任何计数状态。
2. **要做真计次，成本不在 UI，在判定**：拉伸没有传感器信号（手机放垫子上，加速度计不可靠），只能靠用户点按或语音识别，两者都会引入新的权限、误判与状态持久化问题，直接冲击"hands-free + 离线"两条核心承诺。
3. **V1 的替代方案成本几乎为零**：把次数写进口播，用户听到"每侧 8 次"就够了；App 不需要知道用户做了几次。这是**用内容替代功能**的典型取舍。
4. **因此它不是"漏做"，而是"被 SPEC 有意排除"**；代价是完成页/统计无法呈现次数维度（D：`stats` 表见 `src/data/migrations/index.ts:195-222`，无 reps 相关列）。

> **未证实**：是否有用户在真机验收中提出过"希望能记次数"。`docs/qa/` 内未见此类反馈记录，不能断言"用户没提"。

## 7. 真机验收证据链：两代设备、一次 FAIL→PASS 闭环、一张缺回执的分发

### 7.1 第一代（09-17～09-18，Expo Go / Metro 阶段）

- 通道：Metro 8092 + `adb reverse`，`exp://localhost:8092` 冷重载；uiautomator dump + screencap + logcat（`docs/qa/v11-wave1-functional.md:49`）。
- 覆盖：首页/启动/Runner/暂停/继续/结束确认、TTS 中文播报、背景音、筛选与环境（`v11-filter-ambient.md` 记录 sandwich 15 张截图零 Bug）。
- **音频铁律**在这一代被实证（D）：`HANDOFF.md:169`「USB 线连着时手机无声，拔线即恢复；一切『听不到』先查线缆再查引擎」。
- 这一代的验收**不能算原生特性验收**：`HANDOFF.md:88` 明确「Expo Go 不能作原生特性验收」。因此第一代只证明了业务逻辑与交互，**没有证明 APK 行为**。

### 7.2 第一次 FAIL→PASS 闭环（09-17 装包静默）

`docs/qa/android-v1-silent-install.md`：

- 包：EAS preview APK，version 1.0.0 / versionCode 1；`SHA-256 = c30db3f3ef36e966c4dc6217b008dfcf5d6dfc68e633cfefadd1d085de4b180a`；`75,908,085 B`（`:25-26`）。
- 可追溯性在本项目里属于**最好的一份**：记了 EAS 项目 `@wanghoufan/stretch-routine-v1`、`Build ID 1590108d-016e-4912-bdd3-ccc163399c8b`、profile `preview`、构建日志与下载 URL（`:16-20`）。后续 09-24 / 10-27 的包都没有这个级别的记录。
- 设备：`Redmi 22041216UC（xagapro，HyperOS V816 / Android 14）`，序列号 `IN9LZTAYV4UGU4JF`（`:6`）。
- 拦阻与处置：HyperOS/MIUI 特有安装拦截被记录并解决（`:37` 起）。
- 结论：**冷启动 `TotalTime: 862ms`**，E/F 级日志为 0，并给出"静默"的证明路径。
- **重要限定（D，文档自述）**：该文档开头声明「本文是 builder 的技术证据记录……不是 qa 的评审/验收结论。T062/T095 真机实测仍属 qa」，且「语音/后台音频实测未做（见 §5 挂账）」。因此它证明的是**装得上、起得来**，不是"功能通过"。

### 7.3 第二代（09-27，三机并行 + 逐帧像素取证）

`docs/qa/task020-brand-splash.md:28-30`：

| 序列号 | 机型 | Android | SDK | 结果 |
|---|---|---|---|---|
| `IN9LZTAYV4UGU4JF` | xagapro / 22041216UC | **12** | **31** | Success（主真机，重点取证） |
| `indq5xfi6hovay4d` | ruby / 22101316C | 14 | 34 | Success |
| `192.168.31.104:5555` | pearl / 23054RA19C | 15 | 35 | Success（首轮停在通知栏，唤醒后重取，**不采信首轮无效证据**） |

- 取证方法升级为**逐帧像素统计**（`:32` 冷启动 204 帧 @30fps），冷启动 `am start -W` 实测 **526ms**（pearl 台，`:47`）。
- 数据无损验证：xagapro 覆盖安装后主页仍为"共 10 个流程"，用户自建数据完好（`:75`）。

### 7.4 一次真正的功能 FAIL→PASS 闭环（09-27 TASK-021）

`docs/qa/task021-真机第一轮.md`：

- 第一轮 12 项 PASS，但暴露 **P0 存量问题：9 个种子流程全部落在"未分类"**。
- 修复方式不是改 UI，而是 **Schema v5 迁移回填种子训练类型**（`src/data/migrations/index.ts:230` 一带；种子侧 `seeds.ts:184+` 每个流程带 `trainingTypeId`）。
- 第二轮复测 PASS。这是本项目**唯一一条有"缺陷 → 根因 → 迁移修复 → 复测通过"完整记录**的闭环。

### 7.5 分发回执（10-27）

- `CHANGELOG.md:5`：10-27 修复蒲公英列表"字母占位图（ICON_ABSENT）"；`:14` 说明蒲公英只认 APK 内 `res/mipmap-*/ic_launcher.png` 位图，此前只有 webp；`:20`「蒲公英 `iconCheck.code = OK`，落地页 `https://www.pgyer.com/lashenyuyinbobao` 图标正常」。
- 仓内另有该短链的二维码 PNG（370×370，1-bit）。

### 7.6 这条证据链缺什么（缺口的准确清单）

1. **后台/锁屏验收完全缺位**：`docs/qa/android-v1-background.md`、`docs/qa/android-v1-audio.md` 两份本应存在的文档**不存在**；T062/T095 从未执行（D）。
2. **设备口径自相矛盾（证据冲突，标未证实）**：同一序列号 `IN9LZTAYV4UGU4JF` / 同一型号 22041216UC，09-17 记为 **HyperOS V816 / Android 14**（`android-v1-silent-install.md:6`），09-27 记为 **Android 12 / SDK 31**（`task020-brand-splash.md:28`）——两者不可能同时为真；另 `indq5xfi6hovay4d` 在 `task020` 标 "ruby/22101316C"、在 `task021-r006.md` 标 Redmi Note 12 Pro，也需核对。**A 路不做修正，只登记冲突**。
3. **截图证据已丢**：`/tmp/orca-qa-018/`、`/tmp/qa_*.png` 等路径在仓内被引用（如 `v11-wave1-functional.md:38`、`task018-dynamic-filter.md:5-9`），但**当前文件系统已不存在**；`HANDOFF` 也承认证据目录是临时路径。→ 复盘的"可复查性"打折。
4. **分发回执不成链**：只有 CHANGELOG 文字 + 短链 + 二维码，**没有上传构建记录、没有包哈希回读、没有下载侧验签**。
5. **版本与包的对应关系需要靠 versionCode 才能拆开**：`1.2.0` 有两次出包——09-24 的 `releases/stretch-routine-v1.2.0-local.apk`（90,133,393 B，`versionCode 2`，见 `90bd862` 的 `app.json`）与 10-27 的重出包（`versionCode 3`，`e3b367b` 在 09-27 就已提到 3）。**同名版本、不同 code，靠 `versionCode` 可区分，但没有一份文档把两个包并列记录**；另外首个 EAS 包是 `1.0.0/code 1`，而 V1 入库时仓内 `app.json` 已是 `1.1.0/code 2`（`bc1f39f`），存在"仓内版本领先于线上包"的历史。
6. **"完成页用时 == 统计页"未在真机对照**：`task021-真机第一轮.md` 该项标 ⚠「未取到直接对照」——三个流程都以"提前结束"落点、不经完成页，改由 code-reviewer 以**代码级证据**放行（同一 `statsTotalStepMs` → `total_step_ms` → `getTotals()` 列，仓储层测试断言 `getTotals()==={20000,1}`），真机对照列为 **P2 挂账**。即：**这个数字目前只有代码证据，没有屏幕证据**。
7. **UI 层面的 P2/P3 挂账未复测**：`task018-dynamic-filter.md:5-9` 的挂账项在后续文档中没有闭环记录。

## 8. 10-17 事故：治理铺包把产品 README 覆盖成治理导航

### 8.1 事实链（D，全部可回查）

```
bc1f39f (09-18)  V1 首次入库（含治理模板包 README）
99c6361 (10-07)  补英文 README（README.en.md）
b0aa7ae (10-07)  README 重写为产品说明 + 真实界面截图（模板说明移入 docs/）
   ↓ 10-12 工作区被治理模板 README 覆盖（备份 README.md.旧版-2026-10-12，2259 B）
   ↓ 10-17 再次被治理导航版覆盖（备份 README.md.旧版-2026-10-17，19354 B）
8f8e43e (10-28)  把治理版 README 提交入库（README.md +234/−33），同时 .gitignore 忽略 *.旧版-*
```

关键澄清（比"产品版仅存 b0aa7ae"更准确的说法）：

- `git log --follow -- README.md` 只列出 4 个提交（`bc1f39f`、`99c6361`、`b0aa7ae`、`8f8e43e`）。**10-12 与 10-17 的两次覆盖都没进 Git**，它们只发生在工作区。
- 因此 **`b0aa7ae` 是"产品版 README 作为仓库正式内容"的最后一个提交**（内容 2259 B），历史未被销毁，`git show b0aa7ae:README.md` 可完整取回。
- `8f8e43e` 才是**把治理导航版正式写进仓库**的那一刀，并在同一提交里用 `.gitignore` 屏蔽了 `*.旧版-*` 备份——**事故的"合法化"发生在这一步**。
- 当前工作区：`README.md` 20839 B（治理版）、`README.md.旧版-2026-10-17` 19354 B（同尺寸的上一版治理版）、`README.md.旧版-2026-10-12` 2259 B（**正是产品版**）。

### 8.2 真正的事故损失是什么（I，基于 D）

1. **产品门面丢失**：一个已经做完真机验收、已出 APK、已上蒲公英分发的产品，仓库首页讲的是"治理模板包怎么用"，而不是"这是一个什么产品"。
2. **中英不对称**：`README.en.md`（2313 B，10-07）**仍是产品英文版**，而 `README.md` 是治理版。即**英文读者看到产品，中文读者看到脚手架**——比完全丢更糟，因为不易被察觉。
3. **分发链路断点**：蒲公英短链、版本号、安装说明在治理版里没有位置，新用户从 GitHub 进不来。
4. **审计线索被 `.gitignore` 遮住**：`*.旧版-*` 被忽略后，未来任何"铺包事故"都不会再在 `git status` 里显形。

### 8.3 反复的根因（I）

不是"某人手滑"，而是**两套模板都声称自己拥有 `README.md`**：

- 产品侧：README 是该项目的对外说明。
- 治理模板包：README 是"如何使用这套治理脚手架"的入口。
当治理铺包脚本按模板整目录覆盖时，`.md` 层面**没有所有权规则**，也没有"同名文件已存在则改名保留"的保护。10-12 覆盖后发现、恢复；10-17 再来一次；10-28 干脆把治理版提交——**从"事故"演进为"既成事实"**。

> 这一点与 §2 的 P8 阶段判定一致：10 月之后的提交主题几乎全是治理与收尾，**产品叙事在仓库层面让位给了治理叙事**。

## 9. 后来才明确的需求：哪些是"真迭代"，哪些是"当初没说清"

判断标准（A 路自定，依据 V3.1 对"真实迭代"的要求）：**如果需求在 SPEC 里被明确排除或被写成非 V1，之后又回来了，就属于"需求澄清延迟"；如果 SPEC 没提、也没排除，属于"真迭代"。**

| # | 后补需求 | 类型 | 触发点（D） | 造成的返工（D/I） |
|---|---|---|---|---|
| 1 | **历史统计**（全部累计/按类型/最近 10 条/单删/清空） | 真迭代（原 SPEC 把统计排除在 V1 之外，`docs/pm/PRODUCT_PLAN_V1.3.md:3` 明说"局部取代 V1.2 的历史统计排除条款"） | 2026-09-27 Human Gate 批准 V1.3（`:3`） | **反向补技术债**：为了"可信统计"，先必须把 `Date.now()` 假单调钟换成 native `elapsedRealtime`+`boot_count`（R006）。即"一个新需求把一条老债逼上台面"（I：顺序可由 V1.3 `:42`「R006 最小切片现在先执行，不再称待排期」与 `:56` 串行硬门推出） |
| 2 | **训练类型分类轴** | 架构纠正 | V1.3 Problem 段（`:7`）自述「既有 `category` 混合场景与部位，不能可靠表示训练类型」 | 新增 `training_types` 表 + `routines.training_type_id`（可空）+ v5 迁移回填（`:19`、`:36`）。**原 V1 的封闭分类在这条需求下被判定为设计错误**，而不是"够用" |
| 3 | **完成页/统计页同源时长** | 需求澄清 | V1.3 `:37`「完成页『用时』改为与统计同源、同单位、同舍入的实际动作时间（不含暂停与转场）」 | 完成页数字会**变小**（`:59` 明说），需要新的说明文案；且 `completedPhaseMs` 被判定**不可回推**（`:45`） |
| 4 | **停止确认文案是假话** | 事实修正（不是新需求） | V1.3 `:37`「停止确认改掉『已经完成的部分不会保存』的假话」 | 说明 V1 界面上存在**与实现相反**的承诺。这是"文案先行、实现没跟上"的典型（D 文案，I 判性质） |
| 5 | **局部多语言（中英）** | 需求澄清延迟 | SPEC 把本地化列为非 V1（`…SPEC…V1.0.md:540`）；V1.3 `:37`、`:70` 只要求完成页＋Runner 接双语 | **只做两屏**，全量多语言仍未做；而 TTS 语言写死 `zh-CN`（§4.1），因此"切英文后语音仍是中文"是**结构性不一致**（I，代码 D） |
| 6 | **首页入口而非第 4 个 tab** | 决策固化 | V1.3 `:13`、`:37`「首页『我的流程』内容区进入独立『历史统计』页，不加第 4 个常驻 tab」 | 影响 `routes.ts` 的导航结构（D：现有 8 路由，`:12-37`） |
| 7 | **种子扩量与映射** | 内容返工 | V1.3 `:37`「9 种子按表预置」；`:36` 记录真机 QA 抓出 P0——**存量 9 个种子全部落"未分类"**，修复为 v5 迁移按**流程名**一次性回填 | 一次真机验收直接产生一个数据迁移。这是本项目"真机验收 → 数据修复"的最佳例证 |
| 8 | **换肤/视觉方向** | 真迭代 | 分支 `visual-optimization`；09-27 起出现品牌启动页专项（`docs/qa/task020-brand-splash.md`） | 需要原生 splash/图标改造、逐帧像素验收；与"离线/后台"相比优先级被前置（I：依据是 09-27 同一天既做 R006 又做品牌启动页，而后台零动作） |
| 9 | **蒲公英分发** | 渠道新增 | 原计划只到 EAS preview（`HANDOFF.md:172` 明说"额度所限，之前不承诺 APK 推送"） | 10 月新增蒲公英短链 + 图标合规修复（`CHANGELOG.md:5`）；带来"包内必须放 `mipmap` 位图"这类**平台特异性约束** |
| 10 | **构建环境事实翻转** | 文档未同步（非需求） | V1.2 叙述是"无 JDK、只能等 EAS"；V1.3 `:56` 改为「JDK17＋Android SDK 已就绪、本地 APK 构建链已通，不能再沿用 V1.2 的阻塞叙述」 | 环境其实早在 **09-18 就解决**：用户当天批准安装 JDK17 + Android SDK（`HANDOFF.md:187`），TASK-015 打通本地构建链并出 `releases/stretch-routine-v1.1.0-local.apk`（`HANDOFF.md:55`）。**问题不在环境，而在计划文档沿用了过期前提**——这是一条"计划与事实脱钩"的典型 |

### 9.1 一条值得单独写的"真迭代"：从"计时"到"可信计时"

V1 的计时是 `Date.now()` 差值（`docs/qa/v1.1-baseline.md:63-64`）。这不是 bug，是**当初的合理简化**：前台亮屏时 `Date.now()` 够准。

但历史统计一来，"够准"变成"不可信"：

- 改系统时间 → 可能跳阶段或丢会话（V1.3 `:7`）。
- 进程重建 → 被误判为重启（同上）。
- 直接累计 → **把没练的时间记进去，或静默漏记**（同上）。

于是 09-27 造了 `modules/stretch-runtime`，用 `SystemClock.elapsedRealtime()`（不受墙钟影响）与 `Settings.Global.BOOT_COUNT`（真实 boot 身份）替换。**这条链说明：一个"看起来只是加个页面"的需求，实际改的是时间底座。**

## 10. A 路交付：V1 必须有 / 明确不做 / 验收方法 / 开发前置资源

### 10.1 V1 必须有的（D 汇总，按"少一条就不成立"排序）

| 优先级 | 能力 | 证据 |
|---|---|---|
| 1 | **本地流程库**（SQLite + 种子流程 + 动作库，可增删改、可复制） | `src/data/migrations/index.ts` v1→v5；`src/data/seeds.ts:151-175`、`:184+` |
| 2 | **Runner 状态机**（步骤推进、暂停/继续、上一项/下一项、+10s、结束确认、完成页） | `src/features/runner/services/runnerView.ts`；`RunnerControls.tsx` 的 testID |
| 3 | **中文语音播报**（`expo-speech`，唯一通道，含次数口令） | `expoSpeechSpeaker.ts`；`seeds.ts:163`；`android-tts-spike.md:9` |
| 4 | **可靠计时**（真实单调时钟 + boot 身份） | `modules/stretch-runtime`；`task021-r006.md` |
| 5 | **设置**（8 项，含背景音 5 选 1、播报开关、时长等） | `src/features/settings/settingsModel.ts` |
| 6 | **首页与筛选**（我的流程分组、部位/场景筛选） | `routes.ts:12-37`；`v11-filter-ambient.md` |
| 7 | **历史统计**（V1.3 增量：总累计/类型累计/最近 10 条/单删/清空/异常提示） | `PRODUCT_PLAN_V1.3` 全篇 |
| 8 | **可安装分发**（APK + 短链 + 图标合规） | `CHANGELOG.md:5-20`；`app.json` v1.2.0 |

### 10.2 明确不做的（D，都是"被写下来的不做"，不是"忘了"）

- **真计次**（次数只进口播文案，不建模）——§6。
- **后台/锁屏播报**（FGS/Doze/WakeLock 全部未做，P0-5 挂账）——§5；`HANDOFF.md:67`。
- **真离线 TTS**（mibrain 走网络；离线方案四维皆不划算）——§4.4。
- **全量多语言**（只完成页＋Runner 双语；TTS 仍 zh-CN）——§9 第 5 项。
- **云同步 / 账号 / 自动备份**（统计页明写"数据仅保存在本机，不上传"、"卸载或清 App 数据会失去本机统计，不承诺自动备份"，V1.3 `:39`）。
- **第 4 个常驻 tab**（统计走首页入口，V1.3 `:13`）。
- **用户自建训练类型**（V1.3 `:19` 明写"不在本轮做用户自建入口"）。
- **图表 / 心率 / 轨迹 / 穿戴设备指标**（V1.3 `:54` 明写"不复制"）。

### 10.3 验收方法（按"能证明什么"分层）

1. **静态门禁**：`npm run typecheck` + `npm test -- --runInBand`。基线从 **154 用例**（`v1.1-baseline.md:18`）涨到 **47 套件 / 352 用例**（`HANDOFF.md:36`）。
2. **业务真机**：12 项功能清单 PASS（`task021-真机第一轮.md`），并**必须跑"存量数据"路径**（覆盖安装不卸载），因为唯一 P0 就是这么抓到的。
3. **时间权威性**：真机手动改钟表 ±1h / ±1d、跨进程计时 148s 误差 <1s、真重启 `boot_count` 26→27（`task021-r006.md`）。
4. **视觉**：逐帧像素统计（204 帧 @30fps）＋冷启动 `am start -W` 计时（`task020-brand-splash.md:32`、`:47`）。
5. **安装/分发**：EAS preview APK 冷启动、E/F 日志为 0、SHA-256 与体积记录（`android-v1-silent-install.md:26`）；蒲公英 `iconCheck.code = OK`（`CHANGELOG.md:20`）。
6. **不可用的验收方式**（必须写进禁止清单）：Expo Go 不能作原生特性验收（`HANDOFF.md:88`）；静态代码分析不能当运行测试；**"代码级证据放行"必须显式标注为挂账**（`task021-真机第一轮.md` 的完成页数字就是这么过的：标 ⚠ 未对照、改由 reviewer 证代码、真机对照列 P2）。

### 10.4 开发前置资源（I，基于 D 的事故链）

按"缺了就会静默失败"排序——这四条都是从真实故障里反推出来的：

1. **`tts_default_synth` 必须显式设置**：否则 `expo-speech` 无处路由、**静默无声**（`HANDOFF.md:247`）。→ Day 1 就要写进环境自检，而不是等"没声音"再查。
2. **USB 线会让手机无声**：听测必须拔线（`HANDOFF.md:169`）。→ 验收流程要有"拔线听测"这一步。
3. **构建环境要可自证**：JDK17 + Android SDK 已于 **09-18** 由用户批准安装（`HANDOFF.md:187`），本地构建链（`expo run:android --variant release` 或 `gradlew assembleRelease`）在 TASK-015 打通（`HANDOFF.md:55`、`:87`），产物放 `releases/`（已被 git 忽略）。**注意**：`app.json` 版本 `1.2.0` 与 `package.json` 版本 `1.0.0` 当前不一致（D），计划里必须指定唯一权威来源。
4. **真机与配额**：主力机 12 Pro（`indq5xfi6hovay4d`，`HANDOFF.md:84` 明说"现行只用 12 Pro"）；EAS 免费额度 2026-10-01 才恢复、仅作备用通道，**默认走本地构建不耗额度**（`HANDOFF.md:87`）。

## 11. 可直接复制给计划者的 Day 1 提示词

> 用途：让一个**没有任何本项目上下文**的计划者（或新会话）在第一天就能按真实形态做出可执行计划。内容全部来自本报告 D 级证据；不要在此基础上加"未来功能"。

```text
你是这个项目的产品/技术计划者。项目是一个 Android 中文语音拉伸 App（Expo + React Native + TypeScript），
目标用户躺/坐在瑜伽垫上做拉伸，双手不碰手机，靠语音口令完成整套流程。

【当前真实形态，不要重新发明】
- 8 个界面：首页、流程详情、Runner（执行中）、完成页、动作库、流程编辑、设置、历史统计。
- 数据在本机 SQLite，迁移链已到 v5；表包括 routines、routine_steps、actions、active_session、
  session_history、session_history_steps、stats_anomaly_notice、training_types、settings。
- 预置 9 个种子流程 + 一组动作库；每个动作的口播文案里带次数（例如"每侧 8 次"）。
  次数只存在于播报文本，数据模型没有 reps/sets 字段，不做计数统计。
- 语音唯一通道是 expo-speech（走 Android 系统 TTS 引擎）。语言写死 zh-CN。
- 计时权威来源是本地原生模块：SystemClock.elapsedRealtime()（不受改系统时间影响）
  + Settings.Global.BOOT_COUNT（真实重启识别）。不要用 Date.now() 做业务计时。
- 活动会话是不可变版本化快照（ActiveSession V2），推进步骤时生成新快照；
  已用时间以时间戳计算，TTS 回调不承担计时职责。
- Runner 控件：暂停/继续、上一项、下一项、+10 秒、结束（二次确认）、完成页。
- 设置 8 项，含倒计时背景音 5 选 1（无声/滴答/轻音乐·晨曦/轻音乐·静夜/轻音乐·空山，默认滴答），
  背景音只在 RUNNING_STEP 与 TRANSITION 播，暂停/结束/完成即停，TTS 播报时不能吞掉口令。

【已经明确不做的，不要写进计划】
- 不做真计次（不建模次数、不统计次数）。
- 不做锁屏/后台播报：没有前台服务、没有 WakeLock、没有 Doze 适配。
  这是已知缺口（原 SPEC 的 Core Promise 与 SC-004 因此长期不可验收），
  第一版计划里只允许写"前台运行、保持亮屏"，不得写成"后台也能播"。
- 不做真离线 TTS：目标机型只有小米 mibrain 引擎，合成走网络。不要承诺断网可播。
- 不做云同步/账号/自动备份；统计数据只在本机，卸载即丢，界面要如实说明。
- 不做全量多语言：只允许完成页与 Runner 接中英双语；其余界面中文。
- 不加第 4 个常驻 tab；历史统计从首页"我的流程"内容区进入。
- 不做用户自建训练类型；预置"拉伸放松 / 热身 / 核心训练"三类，"拉伸"与"放松"同类；
  流程未设类型时显示"未分类"，"未分类"不是第四类。

【第一天必须先解决的四件事】
1. 环境自检：确认系统默认 TTS 引擎（settings get secure tts_default_synth）已设置，
   未设置时 expo-speech 会静默无声且不报错；同时确认 tts_default_lang=zh-CN。
2. 构建链路：确认能本地出 APK（JDK17 + Android SDK），并确认能读到真实版本号。
   注意 app.json 与 package.json 的版本号目前不一致，计划里要指定唯一权威来源。
3. 真机与听测流程：主力机固定一台；听测时拔掉 USB 线（插线会无声）；
   杀掉落屏/投屏进程（会抢占 remote_submix）。
4. 验收判据先写死：typecheck + 全部单测通过；真机跑通"新建→执行→暂停→继续→结束→完成页"；
   覆盖安装不卸载后旧数据仍可读。任何"看着对"的数字必须并排对照才算通过。

【交付要求】
- 先给任务分解（按可独立验收的小步），每步写清：改哪些文件、怎么证明改对了、失败时怎么回滚。
- 涉及数据库变更必须给迁移脚本与"旧数据回填"策略，并单独说明回填只填空值、不覆盖用户数据。
- 涉及语音、计时、归档三类逻辑的改动，必须给出真机验证步骤（含如何看 logcat 证据）。
- 不要引入新的 TTS 引擎、不要新增原生依赖，除非先给出体积、授权、离线可行性的对比结论。
```

## 附录 A：未证实 / 证据冲突清单

| # | 事项 | 状态 | 说明 |
|---|---|---|---|
| A1 | Sherpa `xiao_ya` 是怎么装到设备上的（APK 来源、版本、模型变体） | **未证实** | 仓内只有 `HANDOFF.md:169` 一句"Expo Go + Sherpa xiao_ya"，代码无 sherpa（D），安装方式无记录 |
| A2 | 同一设备 `IN9LZTAYV4UGU4JF`（22041216UC）到底是 Android 12/SDK31 还是 Android 14/HyperOS V816 | **证据冲突** | `android-v1-silent-install.md:6` vs `task020-brand-splash.md:28`，两者矛盾，需现场核对 |
| A3 | `indq5xfi6hovay4d` 的机型标识 | **证据冲突** | `task020-brand-splash.md:29` 标 "ruby/22101316C"；`task021-r006.md` 标 Redmi Note 12 Pro |
| A4 | 09-24 那次本地 `1.2.0` 包的实际验收范围 | **未证实** | 只知道产物存在（90,133,393 B, `versionCode 2`）与 `HANDOFF:195`「真机联调（2026-09-24）」，没有对应的分包 QA 记录 |
| A5 | 10-27 重出包的构建方式与哈希 | **未证实** | `CHANGELOG.md` 只写图标修复与 `iconCheck.code=OK`，无构建号、无 SHA-256、无 `versionCode` 回读 |
| A6 | 蒲公英上传回执、下载侧验签 | **未证实/缺失** | 只有 `CHANGELOG.md:20` 文字与短链，无上传记录、无哈希回读 |
| A7 | 后台/锁屏是否曾做过任何真机尝试 | **未证实（倾向从未做）** | 两份应存在的 QA 文档不存在；`HANDOFF.md:67` 明说一项都没做 |
| A8 | 用户是否提出过"记次数" | **未证实** | `docs/qa/` 无相关反馈记录 |
| A9 | `/tmp` 下的截图/证据是否还能找回 | **确认已丢失** | 引用路径（`v11-wave1-functional.md:38`、`task018-dynamic-filter.md:5-9`）当前不存在 |
| A10 | `session_history_steps` 表是否属 V1.3 授权 schema | **待追认** | `docs/review/CODE_REVIEW-task021-b1.md:40`、`:109` P2-3 指出其超出 V1.3 schema，评审意见为"可保留、待 TM 追认" |
| A11 | 10-12 / 10-17 两次 README 覆盖的**操作者与工具** | **未证实** | 只有备份文件时间戳与内容体量（2259 B / 19354 B）可证，操作过程无日志 |
| A12 | 37 个提交之外是否还有未入仓的本地实验（如 Sherpa 接入尝试） | **未证实** | 只能证明"仓库里没有"，不能证明"没试过" |

## 附录 B：本报告用到的命令（可复现）

```bash
cd "025-ing-拉伸语音播报 app"
git log --oneline --date=short --format='%h %ad %s' | wc -l
git log --oneline --follow -- README.md
git show b0aa7ae:README.md | wc -c
git show --stat 8f8e43e
ls -l README*
grep -ri "sherpa" src modules App.tsx
grep -rn "startForeground\|expo-notifications\|notifee\|WakeLock" src modules app.json
ls docs/qa/ | grep -i "background\|audio"
```

> 本报告只做读取与统计，未修改任何既有文件、未建/切分支、未 commit、未 push、未构建、未安装依赖。

