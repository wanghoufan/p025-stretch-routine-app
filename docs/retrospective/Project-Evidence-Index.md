# 项目证据索引｜P025 拉伸语音播报 App（Project-Evidence-Index）

- 项目：`025-ing-拉伸语音播报 app`（软链接 → `/Volumes/项目归档/025-ing-拉伸语音播报 app`）
- 复盘基线：Git HEAD `8f8e43e`（2026-10-28 22:24），37 提交，全仓 +56,679 行
- 本文件用途：把 `A-Day1-Reconstruction-V1.0/V1.1`、`B-Gap-RootCause-V1.0/V1.1`、`Project-Lessons-V1.0` 中的**重大断言**逐条映射到可重定位证据
- 所有路径均为**项目根相对路径**；命令均只读、可复现
- 状态取值：**已证实**（本轮亲自复算通过）／**部分证实**（结论成立但需限定）／**未证实**（无材料或材料缺失）／**证据冲突**（多份材料互斥）／**已修正**（既有断言被本轮实测推翻并改写）

## 0. 证据类型代码

| 代码 | 含义 |
|---|---|
| G | Git 提交 / `git show <hash>:<path>` 内容 |
| F | 仓库内文件原文（可给行号） |
| C | 本轮实测命令输出（grep / ls / wc / diff / md5） |
| H | HANDOFF 或 QA 报告的**自述记录**（作者=开发执行者，非独立验证） |
| I | 推断（由已证实事实推出，附理由） |

## 1. 时间线与规模

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E01 | 全仓共 37 次提交 | C | `git rev-list --count HEAD` → 37 | HEAD `8f8e43e` | 2026-10-28 | 已证实 |
| E02 | 末次提交为治理收口（5 文件 +245/−37） | G | `git show 8f8e43e --stat` | `8f8e43e` | 2026-10-28 | 已证实 |
| E03 | V1 单次入库 176 文件 / +30,695 行 | G | `git show --stat bc1f39f` | `bc1f39f` | 2026-09-18 | 已证实 |
| E04 | 09-18 单日 5 提交、占全仓新增约 70% | C+I | `git log --pretty=%ad --date=short \| sort \| uniq -c`；`--shortstat` 求和 56,679 | — | 2026-09-18 | 已证实 |
| E05 | 09-27 单日 16 提交（占 43%） | C | 同上日期分布 | — | 2026-09-27 | 已证实 |
| E06 | 09-27 的 16 提交中仅 6 个触及代码 | C | 逐提交 `git show --stat --format='' \| grep -cE 'src/\|modules/\|App.tsx\|app.json'`：`4be0428`=11、`c2393af`=1、`e3b367b`=2、`ac43ae6`=11、`c86e7bd`=45、`2643c2c`=4 命中，其余 10 个为 0 | — | 2026-09-27 | 已证实（A V1.0「功能10/治理6」写反，已修正） |
| E07 | 10-09→10-27 有 18 天零提交空档 | C | `git log` 时间序列 | `7b92807`→`2957762` | 2026-10-09→10-27 | 已证实 |
| E08 | 产品实质收工于 09-28，之后仅治理与分发 | I | 10 月提交主题全为 `chore/docs/jcp/fix(android)` | — | — | 已证实（推断合理） |
| E09 | 文档/代码比 ≈ 1.19:1 | C | `docs/`（排除 retrospective）=85 文件/979,421 B；`src+modules+App.tsx`（排除 build/ios/android）=168 文件/821,861 B | — | — | 已证实（B V1.0 记 164/821,231，口径差异） |
| E10 | 版本 1.2.0 / versionCode 3，而 package.json 为 1.0.0 | F | `app.json`、`package.json:3` | HEAD | 2026-10-28 | 已证实 |
| E11 | tag `v1.2.0` 指向 `1538868`，该提交包内是 1.1.0/code2 | G | `git rev-parse v1.2.0`；`git show 1538868:app.json` | `1538868` | 2026-09-21 | 已证实 |
| E12 | 1.1.0 与 1.2.0 首包同为 code 2 | G | `git show bc1f39f:app.json`（1.1.0/2）、`git show 90bd862:app.json`（1.2.0/2） | 两处 | 09-18 / 09-24 | 已证实 |
| E13 | `code 2` 被 09-18/09-21/09-24 三类产物共用 | G | `bc1f39f`/`1114edb`/`42071f7`/`65cd86a`/`1538868` 均 1.1.0/2；`90bd862`/`c2393af`/`4be0428` 为 1.2.0/2 | 多处 | 09-18～09-27 | 已证实 |

## 2. TTS 与离线（核心域）

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E14 | TTS 代码层从未变，唯一通道 `expo-speech` | F+C | `src/services/tts/expoSpeechSpeaker.ts`（25 行，`require('expo-speech')`）；`package.json:18` `expo-speech ~57.0.3` | `bc1f39f`→HEAD | 09-18 起 | 已证实 |
| E15 | 全仓源码零 Sherpa 引用 | C | `grep -ril sherpa src modules App.tsx app.json package.json` → exit 1 | HEAD | 2026-10-28 | 已证实 |
| E16 | 09-17 尖刺判定「离线可用＝满足」，未标待验证 | F | `docs/qa/android-tts-spike.md:16`「离线可用（Constitution II）｜满足｜使用系统已安装的离线语音包，不依赖网络」 | 文件 mtime 09-17 | 2026-09-17 | 已证实（判定为**推断**，非实测） |
| E17 | 同尖刺 §5 自认「真机音频待 T095」，§6 待验清单 4 项不含断网 | F | `docs/qa/android-tts-spike.md` §5、§6 | 同上 | 2026-09-17 | 已证实 |
| E18 | 首次漂移：09-18 系统默认引擎是 eSpeak | F+H | `docs/qa/v11-wave1-functional.md:5`「TTS引擎：com.reecedunn.espeak（默认）」、`:22` logcat `nativeSetVoiceByProperties(language=cmn)` | — | 2026-09-18 10:47–12:04 | 已证实 |
| E19 | 第二次漂移：Sherpa `xiao_ya` 神经音「用户初听通过」 | H | `docs/handoff/HANDOFF.md` 任务备注「Expo Go + Sherpa xiao_ya 神经音用户初听通过；eSpeak 仅备用」 | — | 2026-09-18 | 部分证实（仅开发侧自述，用户身份未确认） |
| E20 | 第三次漂移：09-24 起切小米 mibrain | H | `docs/handoff/HANDOFF.md` §真机联调「sherpa 引擎无中文包（切 mibrain）」 | — | 2026-09-24 | 已证实（自述级，与 E21 互证） |
| E21 | mibrain 合成走网络（非离线） | H | `docs/handoff/HANDOFF.md` §TTS 专节：logcat `AivsSDK ... http://119.147.123.233:80` | — | 2026-09-27 | 已证实（自述+logcat 摘录） |
| E22 | 出厂 `tts_default_synth=null` 导致静默无声 | H | `docs/handoff/HANDOFF.md` §TTS 专节坑 1；`docs/qa/task021-真机第一轮.md` §8 | — | 2026-09-27 | 已证实（自述级） |
| E23 | xiao_ya 数据源 BZNSYP 为 Non-commercial，永久否决 | H | `docs/handoff/HANDOFF.md` 两处（任务备注失效标注 + §TTS 专节坑 2） | — | 2026-09-27 | 已证实（自述引用 MODEL_CARD，未直连上游核实） |
| E24 | 离线三路径全否决（mibrain 无离线 / Google TTS 国行无中文包 / sherpa-onnx +55MB 授权矛盾 / eSpeak GPL 机械音） | H | `docs/handoff/HANDOFF.md` §TTS 专节「若将来要做真离线」 | — | 2026-09-27 | 部分证实（体积/授权为自述引用） |
| E25 | `onStopped` 被当作 `onDone`（失败静默） | F | `src/services/tts/expoSpeechSpeaker.ts:17` `onStopped: options.onDone,` | `bc1f39f`→HEAD | 2026-09-17 起 | 已证实（**行号修正**：HANDOFF 记 `:19`，实际 `:17`） |
| E26 | errorCode 吞噬是「离线问题不易被发现的直接原因」 | H | `docs/handoff/HANDOFF.md` §TTS 专节末段 | — | 2026-09-27 | 部分证实（降级为「抬高排查成本」；09-24 已暴露无声） |
| E27 | 断网状态下的播报行为从未实测 | C | `docs/qa/`、`docs/pm/`、`docs/plan/` grep「断网」「飞行模式」仅文字提及，无用例 | — | — | 未证实（无记录） |

## 3. 后台 / 锁屏播报（最大缺口）

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E28 | Core Promise 明写「Put the phone down. Follow the voice」 | F | `docs/plan/2026-09-17 …SDD开发包…/…SPEC…V1.0.md:27-30` | — | 2026-09-17 | 已证实 |
| E29 | FR-028/029/030 要求后台延续、锁屏不重置、回前台重建 | F | 同 SPEC `:347-349` | — | 2026-09-17 | 已证实 |
| E30 | SC-004 是发布硬条件（真机后台/锁屏计时与状态恢复） | F | 同 SPEC `:486`；§11 `:492-494`「real-device Android background/lock-screen QA is complete」 | — | 2026-09-17 | 已证实 |
| E31 | 09-17 决策选方案 A（前台重建、无 FGS），并明写代价与切换条件 | F | `docs/architecture/background-decision.md:4`、`:16-19`（代价）、`:21-29`（触发条件） | — | 2026-09-17 | 已证实 |
| E32 | 代码层零后台实现（无 FGS/通知/WakeLock） | C | `grep -rn "ForegroundService\|expo-notifications\|notifee\|WakeLock\|startForeground" src modules app.json package.json` → exit 1 | HEAD | 2026-10-28 | 已证实 |
| E33 | 两份应存在的后台 QA 文档不存在 | C | `ls docs/qa/`（15 文件）无 `android-v1-background.md`、`android-v1-audio.md` | HEAD | 2026-10-28 | 已证实 |
| E34 | HANDOFF 自述「FGS、通知双分支、Doze/Deep Sleep、WakeLock……一项都没做」 | H | `docs/handoff/HANDOFF.md` §1.3 | — | 2026-10-16 前后 | 已证实（自述，与 E32 互证） |
| E35 | 09-27 只做了 R006 时钟切片，不等于后台能力 | H | `docs/pm/PRODUCT_PLAN_V1.3.md`「R006 切片不等同完成整个 P0-5，也不证明 Doze／FGS 行为」；`docs/qa/task021-r006.md` | — | 2026-09-27 | 已证实 |
| E36 | 仓内无 SC-004 豁免/放行记录 | C | 全仓 grep「豁免」「SC-004」：命中的均在治理规则/账本语境 | HEAD | 2026-10-28 | 已证实（不能证否口头豁免） |
| E37 | 10-27 实际以蒲公英内测分发替代发布验收 | F | `CHANGELOG.md` 10-27 条目；蒲公英短链 `lashenyuyinbobao` | `2957762` | 2026-10-27 | 已证实 |

## 4. 计次 / 换边 / 设置

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E38 | `reps` 仅作注释词，不是数据字段 | F | `src/data/seeds.ts:163` `// ---- core (reps, spoken cues) ----` | HEAD | — | 已证实 |
| E39 | 数据层/域层/迁移无 reps\|sets 字段 | C | `grep -rn "reps\|sets\|组数" src/data src/domain src/data/migrations` → 仅命中该注释行 | HEAD | — | 已证实 |
| E40 | SDD 的 FR 表无计次需求 | C | SPEC/PLAN grep `reps\|组数\|几组` → 零命中 | — | 2026-09-17 | 已证实 |
| E41 | 次数只进播报文本（如「每侧 8 次」） | F | `docs/plan/seed-content-v2.md:17`「核心动作（9个，播报含次数口令）」及流程模板 | — | 2026-09-18 | 已证实 |
| E42 | 换边（bilateral）已实现 | F | `src/domain/routine/bilateral.ts`；README 旧版宣传「换边」 | HEAD | — | 已证实（实现）；真机听测无专项记录 → 未证实 |
| E43 | 语速可调 + 5 秒预警每步一次；「逐秒倒数」明确不做 | F | `src/features/settings/settingsModel.ts`；`docs/qa/android-v1-silent-install.md` §4 | HEAD | — | 已证实 |
| E44 | 用户是否曾提过「记次数」 | — | `docs/qa/` 无相关反馈 | — | — | 未证实 |

## 5. README 覆盖事故

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E45 | README 仅 4 个提交，10-12/10-17 两次覆盖未进 Git | C | `git log --follow --oneline -- README.md` → `8f8e43e`/`b0aa7ae`/`99c6361`/`bc1f39f` | 四处 | 09-18～10-28 | 已证实 |
| E46 | 产品版 README 为 2,259 B | G+C | `git show b0aa7ae:README.md \| wc -c` = 2259 | `b0aa7ae` | 2026-10-07 | 已证实 |
| E47 | `README.md.旧版-2026-10-12` 与产品版逐字节一致 | C | `diff` 退出码 0；两边 MD5 均 `22b3fcbdbff4b762ba7ede6254d4ad5a` | — | mtime 10-13 15:26 | 已证实 |
| E48 | 10-17 覆盖留下的是上一版**治理版**（19,354 B） | C | `ls -l README*`；`README.md.旧版-2026-10-17` 19,354 B | — | mtime 10-18 14:24 | 已证实 |
| E49 | 当前 `README.md` 为治理导航版（20,839 B），与 HEAD 一致 | C | 实读 `README.md` | HEAD | 2026-10-28 | 已证实 |
| E50 | `README.en.md` 仍是产品英文版（2,313 B）⇒ 中英不对称 | C+F | `README.en.md` 头部「# Stretching Voice-Broadcast App」 | `99c6361` | 2026-10-05 | 已证实 |
| E51 | `8f8e43e` 把治理版 README 正式入库（+234/−33） | G | `git show 8f8e43e --stat` | `8f8e43e` | 2026-10-28 | 已证实 |
| E52 | 「`8f8e43e` 才屏蔽 `*.旧版-*`」 | G | `git show 90bd862:.gitignore` 第 3-4 行已含 `*.旧版-*`；`git check-ignore -v` 命中 `.gitignore:93`（8f8e43e 追加） | `90bd862` / `8f8e43e` | 09-24 / 10-28 | **已修正**：规则自 09-24 生效，8f8e43e 是追加第二条 |
| E53 | 10-17 母版铺包把 README 列入覆盖清单 | H | `docs/handoff/HANDOFF.md`「治理规则更新通知 · 2026-10-17」 | — | 2026-10-17 | 已证实（自述） |
| E54 | 两次覆盖的操作者与工具 | — | 仅有备份文件名与 mtime | — | — | 未证实 |

## 6. 验收与分发

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E55 | 本地 v1.2.0 APK 存在，90,133,393 B | C | `ls -l releases/stretch-routine-v1.2.0-local.apk` | — | mtime 09-24 13:36 | 已证实 |
| E56 | v1.1.0 APK 已被覆盖丢失 | C | `ls releases/` 仅 1 个文件 | — | — | 已证实 |
| E57 | 09-17 EAS 包有完整 SHA-256 与 Build ID | F | `docs/qa/android-v1-silent-install.md` §1 | — | 2026-09-17 | 已证实（全仓唯一有此级记录的包） |
| E58 | 唯一 FAIL→PASS 闭环：9 个存量种子落「未分类」→ v5 迁移回填 → 复测 PASS | F+H | `docs/qa/task021-真机第一轮.md` §2/§9；`src/data/migrations/index.ts` v5 | `2643c2c` | 2026-09-27 | 已证实 |
| E59 | 完成页「用时」与统计同源仅代码证据，真机对照 P2 挂账 | F | `docs/qa/task021-真机第一轮.md` §7 表格「⚠ 未取到直接对照……按代码级证据放行，真机对照列为 P2 挂账」 | — | 2026-09-27 | 已证实（挂账无复测排期） |
| E60 | 蒲公英 `iconCheck.code=OK` 是回执 | F | `CHANGELOG.md` 10-27 条目（仅文字自述） | `2957762` | 2026-10-27 | 部分证实（降级为自述级：无构建号/哈希/下载侧验读） |
| E61 | 蒲公英二维码 PNG 存在（370×370，778 B） | C | `2026-10-27-拉伸语音播报-1.2.0.png` | — | mtime 10-27 18:55 | 已证实 |
| E62 | 三张产品截图随 `b0aa7ae` 入库 | C | `docs/screenshots/{home-my-routines,action-library,settings}.png` | `b0aa7ae` | 2026-10-07 | 已证实 |
| E63 | 同一序列号 `IN9LZTAYV4UGU4JF` 被记为 Android 14 与 API31/12 | F | `docs/qa/android-v1-silent-install.md:6` vs `docs/qa/task020-brand-splash.md:28`；`docs/pm/PRODUCT_PLAN_V1.1.md:8`；`HANDOFF`「xagapro(API31)」 | — | 09-17 / 09-27 | 证据冲突（至少一处笔误，I） |
| E64 | `indq5xfi6hovay4d` 机型标识跨文档不一致 | F | `docs/qa/task020-brand-splash.md:29`（ruby/22101316C）vs `docs/qa/task021-r006.md` §0（marketname Note 12 Pro） | — | 2026-09-27 | 证据冲突（或同机异名） |
| E65 | `/tmp` 截图证据已丢失 | C | 引用路径 `v11-wave1-functional.md:38`、`task018-dynamic-filter.md:5-9` 当前不存在 | — | — | 已证实（丢失） |
| E66 | 用户正式发布签收记录不存在 | C | 仓内无签收文档（有 Human Gate 批准与口头拍板） | — | — | 未证实 |
| E67 | 与 020/053 的代码/经验复用 | C | 全 docs/ grep「拉伸换边」「护眼」「020」「053」无命中（排除本项目自身编号） | — | — | 未证实（仅治理模板同构，I） |

## 7. 其他已核验事实

| # | 断言 | 证据类型 | 相对路径 / 命令 | hash | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E68 | `docs/qa/` 共 15 文件，其中 10 份实质报告 | C | `ls docs/qa/`（另 5 个为 `BUGS.template.md` 及其 3 个旧版、`产品验收追踪矩阵.template.md`） | HEAD | 2026-10-28 | 已证实（A V1.0 记「9 份」为算术笔误） |
| E69 | 8 路由，Stats 走首页入口非第 4 tab | F | `src/app/navigation/routes.ts`（55 行）；`docs/pm/PRODUCT_PLAN_V1.3.md` HD-3 | HEAD | — | 已证实 |
| E70 | 迁移链 v1→v5（v4 统计、v5 种子类型回填） | F | `src/data/migrations/index.ts` | HEAD | — | 已证实 |
| E71 | 原生模块仅 `modules/stretch-runtime`（`nowElapsedMs` / `getBootCount`） | F | `modules/stretch-runtime/android/src/main/java/.../StretchRuntimeModule.kt` | `ac43ae6` | 2026-09-27 | 已证实 |
| E72 | 公开仓两次摘除 ORCA（第二次因中文文件名转义漏摘） | G | `git show --stat 4e8a29d`（81 文件 +31/−4,292）、`7b92807`（7 文件 −3,313） | 两处 | 2026-10-09 | 已证实 |
| E73 | JDK17 + Android SDK 于 09-18 获用户批准并打通本地构建 | H | `HANDOFF`「本地构建授权（2026-09-18 用户明确批准）」；「TASK-015 本地构建链打通 + 出包」 | — | 2026-09-18 | 已证实（自述） |
| E74 | V1.2 的「无 JDK／只能等 EAS」是过期前提 | F | `docs/pm/PRODUCT_PLAN_V1.3.md`「不能再沿用 V1.2『无 JDK／只能等 EAS』的阻塞叙述」 | — | 2026-09-27 | 已证实 |
| E75 | 背景音由「自然音三段」改为「三首轻音乐 5 选 1」 | H | `HANDOFF` B-2 局部 Requirement（用户 2026-09-18 修订） | — | 2026-09-18 | 已证实（自述） |
| E76 | 首页「健身前后」分组是凭空造的分类 | H | `HANDOFF` §分组对齐（用户原话「这分类之前没明确过吧」）；`c00e82b` 删组 | `c00e82b` | 2026-09-28 | 已证实 |
| E77 | 图标/启动画面三次返工（prebuild 未重跑 + 分发只认 png 位图） | G+H | `1538868`（1 文件 1 行）、`e3b367b`、`2957762`；`CHANGELOG.md` | 三处 | 09-21 / 09-27 / 10-27 | 已证实 |

## 8. 状态汇总（按表内 77 行逐条计数）

| 状态 | 条数 | 编号 |
|---|---|---|
| 已证实 | 64 | E01–E18、E20–E23、E25、E28–E41、E43、E45–E51、E53、E55–E59、E61–E62、E65、E68–E77 |
| 部分证实（结论成立但需限定） | 5 | E19（用户身份未确认）、E24（体积/授权为自述引用）、E26（降级为「抬高排查成本」）、E42（实现已证、真机听测缺）、E60（降级为 CHANGELOG 自述） |
| 未证实 | 5 | E27、E44、E54、E66、E67 |
| 证据冲突 | 2 | E63（同一序列号系统版本 14 vs 12/API31）、E64（机型标识 ruby/22101316C vs marketname Note 12 Pro） |
| 已修正 | 1 | E52（`*.旧版-*` 自 90bd862 已生效，非 8f8e43e 首设） |

> 合计 64+5+5+2+1 = 77，与 E01–E77 行数一致。E06 的「A V1.0 记 9 份」等既有笔误已在单行备注中标注，不另计入「已修正」——它们是被前一轮自纠的，不是本轮推翻的。

## 9. 复现命令（全部只读）

```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/025-ing-拉伸语音播报 app"

# 规模
git rev-list --count HEAD
git log --pretty=%ad --date=short | sort | uniq -c
git log --shortstat --format="" | awk '/changed/ {for(i=1;i<=NF;i++) if($i ~ /insertions/) ins+=$(i-1)} END{print ins}'

# 版本与 tag
for c in bc1f39f 1114edb 42071f7 65cd86a 1538868 90bd862 c2393af 4be0428 e3b367b 8f8e43e; do
  echo -n "$c: "; git show ${c}:app.json | grep -E '"version"|versionCode' | tr -d ' \n'; echo
done
grep -n '"version"' package.json
git tag -l; for t in $(git tag -l); do echo "$t -> $(git rev-parse --short $t)"; done

# TTS
cat -n src/services/tts/expoSpeechSpeaker.ts
grep -ril sherpa src modules App.tsx app.json package.json; echo "sherpa_exit=$?"
sed -n '1,30p;38,50p' docs/qa/android-tts-spike.md
sed -n '5p;22p' docs/qa/v11-wave1-functional.md

# 后台
grep -rn "ForegroundService\|expo-notifications\|notifee\|WakeLock\|startForeground" src modules app.json package.json; echo "bg_exit=$?"
ls docs/qa/

# 计次
sed -n '163p' src/data/seeds.ts
grep -rn "reps\|sets\|组数" src/data src/domain src/data/migrations

# README
git log --follow --oneline -- README.md
ls -l README*
git show b0aa7ae:README.md | wc -c
diff <(git show b0aa7ae:README.md) "README.md.旧版-2026-10-12"; echo "diff_exit=$?"
git show b0aa7ae:README.md | md5; md5 -q "README.md.旧版-2026-10-12"
git check-ignore -v "README.md.旧版-2026-10-12"
git show 90bd862:.gitignore | sed -n '1,6p'
git show 8f8e43e -- .gitignore

# 产物
ls -l releases/ docs/screenshots/ *.png
```

> 本文件只做读取与统计，未修改任何既有文件、未建/切分支、未 commit/push、未构建、未装依赖。
