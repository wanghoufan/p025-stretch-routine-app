# HANDOFF｜拉伸语音播报App V1开发

> 大交接冻结版（开发暂时收工）。恢复开发：先按文末「恢复读盘」顺序读，再看本页「一、二、三」。

## 机器字段（治理用，勿删）

- Captured at（YYYY-MM-DD HH:MM）：2026-09-19 12:40（TASK-018 收工·大交接冻结）
- PROJECT_PHASE：DEVELOP（DEV_BASELINE=PRODUCT_PLAN_V1.2，PLAN_GATE=APPROVED）
- PLAN_VERSION：PRODUCT_PLAN_V1.2
- PLAN_READINESS_SCORE：94
- PLAN_GATE：APPROVED
- DEV_BASELINE：PRODUCT_PLAN_V1.2
- CHANGE_REQUEST：B（B-2 倒计时背景音 characterizing＋B-3 动作库分组筛选＋B-4 动作库动态部位筛选；均为局部功能变化，Requirement/DoD 见文末「任务备注」，不召 Planner、DEV_BASELINE 不变。B-4 曾按用户指定例外加派一次 planner 复核，Phase 与基线不变）
- Stage ID（本阶段叫什么）：stretch-app-v11-ambient
- 剩 P0（没完的才列，多一条都不行）：
  - P0-5：native R004-R006 / R022-R034（FGS / Doze / Android 版本矩阵）待排期；本地构建链已通，可随时开工
- 当前 Task（正干到哪）：**无进行中任务**。TASK-018（动作库动态部位筛选 B-4）全链完成并放行；后续候选见「二、下一步任务」
- 执行链/Session（仅真 resume 通道填；TM 只记录/引用，不手造 ID）：builder 走 opencode 通道 `opencode-go/deepseek-v4.1-flash`（旧 codebuddy 通道作废；TASK-018 同链续 session 返工 3 轮）；supervisor 走 opencode `opencode-go/muse-spark-1.3-contributor`；planner/product-reviewer/senior 走 codex；code-reviewer/experience-recorder/neat-freak 本窗口 subagent；qa 本窗口直派 + adb/Expo 走本窗口 bash 直驱
- 账本：`docs/model/TASK-MODEL-LOG.jsonl` **23 行**、`docs/model/DISPATCH-LOG.jsonl` **35 行**，两文件 schema 第二道校验均 exit 0（supervisor 已复检；neat-freak 2026-09-27 复核 `node scripts/model/check-ledger.mjs docs/model` 仍 exit 0）
- 未闭环评审意见（还没改的）：
  - 已 CLOSED：TASK-018 的 P1-1（可见归属缺失）、reviewer P2-1（两条 DoD 断言缺失）、qa P2（搜索态两次点按）、qa P3-1（单字 chip 宽 42.5dp<48）、P3-5（陈旧注释）——均随 B-4 ⑨⑩⑪ 与对应集成断言闭环，⑫ 真机复验通过
  - 挂账（**非阻塞**，不属 B-4 范围，详见 `docs/review/CODE_REVIEW-task018-dynamic-filter.md`）：
    - P2-2 拉伸动作被删光时 chips 与默认展开会指向空组
    - P3-2 `BODY_PART_GROUPS` 与 `TAG_BODY_PART_VALUES` 重复定义
    - P3-3 场景组头 `minHeight=44` < 48（HEAD 既有问题）
    - P3-4 清除筛选用例未断言搜索框清空；`DEFAULT_ACTION_FILTERS` 为共享常量对象
  - V1.0 遗留：P1-1（后台到期 cue 不补播）转 V1.1 R025–R028 实测；P1-2 已确认符合 US7 保持现状；QA 的 WAVE1-SEED-001 已 CLOSED
- docs 落盘清单（累计，按目录）：`docs/handoff/HANDOFF.md`；`docs/pm/` PRODUCT_PLAN_V1.1 + V1.2 + PLAN-TASK-018-library-dynamic-filter；`docs/review/` RESEARCH_REVIEW-V1.1-R1 + V1.2-R2 + CODE_REVIEW-2026-09-17 + -2026-09-18-seed + v11-wave1 + seed-repair + v11-ambient-seedv2 + library-filter + light-music + task018-dynamic-filter；`docs/qa/` v1.1-baseline + v11-wave1-functional + v11-filter-ambient + android-v1-silent-install + android-background-spike + android-tts-spike + task018-dynamic-filter；`docs/model/` TASK-MODEL-LOG + DISPATCH-LOG
- 人要拍什么板（列出来问，不问不许开工）：无阻塞项。用户口令集：`继续开发` / `变更请求：……` / `第一阶段，计划` / `第二阶段，开发`；**commit/push 需用户明确指令**；EAS/付费/环境改动类需用户批（本地 JDK/SDK 链已批）；不擅自关用户其它服务、不改端口外服务
- permission_request：无
- 收尾记一笔（neat-freak）：2026-09-19 大交接收尾——文档对齐完成（`PLAN-TASK-018-…md` 状态字段同步为「全链完成并放行」、qa 报告尾部追加收尾核对，首轮 OPEN 项已被复验 CLOSED 取代）；清理未跟踪系统垃圾 `.DS_Store`×5 与 `.expo/dev/logs` 临时日志×2（零业务/仓库文件改动，`git status` 与清理前一致）；账本只校验不改；未决已落位。**遗留待人工确认**：见「三、注意事项与规矩」的 U-1 / U-2 / U-3
- 收尾记一笔（neat-freak）：2026-09-21 Motion Core V1 纯UI换皮收尾——分支 `visual-optimization` 合入 main：theme 深蓝 token＋共享组件＋7 页磁贴/配色＋App Icon（`assets/icons/motion-core/001..050`＋`motion-core-*`），零业务改动；tsc 干净＋258/258 全绿；xagapro/ruby/pearl 三台 release 包装机冷启动通过；APK 留 `releases/`（git 忽略），24MB 资源原包留磁盘、`.gitignore` 止其进仓；Metro 8095 已停。
- 收尾记一笔：2026-09-21 App 图标修复——首版 release 包图标未变，根因为 `android/` 原生目录已存在、`expo run` 未重跑 prebuild（app.json 新图标未进 `res/`）；已 `expo prebuild --platform android`＋gradle 重编＋三台重装，抽屉图标确认为新图（深蓝底青色小人），冷启动正常；新 APK 已覆盖 `releases/stretch-routine-motioncore-v1-local.apk`。
- 收尾记一笔（neat-freak）：2026-09-27 TASK-020 启动画面换肤收尾——删除零引用孤儿资源 5 个（`assets/splash-icon.png`、`assets/icon.png`、`assets/android-icon-background/foreground/monochrome.png`，均为 Expo 模板默认图，全仓 grep 自证零引用；它们会被 `assetBundlePatterns: assets/**/*` 打进 APK，删后 `favicon.png`（web.favicon 引用）与品牌套 `motion-core-*` 全部保留、不动）；清理未跟踪系统垃圾 `.DS_Store`×3（根/docs/assets）与 `.expo/dev/logs/{start,export}.log`；HANDOFF 账本行数对齐真实（TASK 23 / DISPATCH 35，`check-ledger.mjs` exit 0）；`npm run typecheck` 0 错、`npm test` 36 套件/263 用例全绿；未决见 §3.4 U-2（刷新）/U-4（新增）。仅删文件+改本 HANDOFF，未 commit/push（交 TM）。
- 收尾记一笔（neat-freak）：2026-09-27 **同批追加·U-2 用户拍板「处理」**——点名靠 README「勿留根」口径处置根目录治理布局：**删 2**（根 `Orca 通用编排者持续推进协议.md` 过期版、根 `Orca 编排治理监督者提示词.md` 重复版，`git rm`）**移 1**（根 `归位表.template.md`，`git mv -f` 去重——`docs/templates/` 本已有自 `90bd862` 起跟踪且逐字节相同的模板源，现仅留指定位置，与已填产物 `docs/templates/归位表.md` 共存）**留 1**（根 `编排者提示词.md` 按 README:23 原位不动）；全仓 grep 自证所有引用者（README/AGENTS/编排者提示词/迁移整理提示词/docs 归位表/scripts）**全部走 `docs/prompts/` 路径、零根路径引用**；更正上轮「引用悬空」误述（引用所指文件一直在 `docs/prompts/`，从未悬空）；新增 §3.4 **U-5**（`迁移整理提示词.md:13` 自相矛盾，属中央治理布局，未擅改，建议移出「铺到根」清单，留用户/中央治理定）。本轮只动 3 个根文件＋本 HANDOFF，未碰 `AGENTS.md`/两账本/业务代码/`经验一句话.md`（U-4 由 experience-recorder 并行处理）。

---

## 一、当前工作进展

### 1.1 产品与阶段

- 产品：Android 拉伸语音播报 App（Expo SDK 57 + React Native 0.86.3 + TypeScript + 本地 SQLite + TTS），本地优先、无账号、无云后端。
- 阶段：`DEVELOP`，`DEV_BASELINE=PRODUCT_PLAN_V1.2`（V1.1 Release Hardening 增量计划，Readiness 94，已过 Human Gate）。
- 阶段目标（Stage `stretch-app-v11-ambient`）：在**不重做 V1.0 业务**的前提下，把 Android 计时/活动会话/后台锁屏播报/停止恢复/迁移行为加固到可验证；并顺带完成若干局部 UI/音频增强。

### 1.2 已完成并收工的内容（按时间）

1. **V1.0 全量开发**：首页、流程详情/编辑器、批量录入、动作库、bilateral、Runner、设置、种子数据、本地 SQLite —— 基线 `main@bc1f39f`（tag `v1.0-implemented-bc1f39f`），154 tests green。
2. **Wave1 纯 JS hardening**（TASK-007，185 tests）：WallClock/MonotonicClock 拆分、ActiveSession V2 + 版本化 snapshot、StartRoutineService 与冲突门、Runner 改为 ActiveSession 驱动、首页活动会话 Banner、种子修复。
3. **种子 V2**（TASK-012）：59 动作 / 9 模板 / 标签 V3 迁移，动作库分组筛选（TASK-014）。
4. **倒计时背景音**（TASK-011/016）：5 选 1（无声 / 滴答 / 轻音乐·晨曦 / 轻音乐·静夜 / 轻音乐·空山，默认滴答），三首合成轻音乐替换原自然音（体积 7.6MB，用户已批），本地打包离线可用。
5. **本地构建链打通 + 出包**（TASK-015）：免 sudo 在用户目录装 JDK17 + Android SDK，走本地构建出 `releases/stretch-routine-v1.1.0-local.apk`，不耗 EAS 额度；已装三台真机。
6. **TASK-018 动作库动态部位筛选（B-4）**：本次收工任务，全链放行。
   - 交互：顶部保留全局搜索；**删除难度 chips**；新增**动态部位 chips**，跟随「当前活动场景」（默认拉伸；点哪个场景组头，chips 就跟哪个场景，一次点击即认领并保持展开，再点才收起）；chips 顺序 全部→颈→肩→胸→背→腰腹→髋臀→腿→小腿→全身→（其他，仅在存在无规范部位动作时）；单选、交集命中、同一屏去重；badge = 当前实际显示的唯一动作卡片数；部位筛选只作用于活动场景，其他已展开场景仅受全局搜索；活动场景 0 命中时归属文案显示「（当前无匹配）」；chip 触控 48dp。
   - 代码：`src/features/actions/services/actionGroups.ts`、`components/ActionFilterBar.tsx`、`screens/ActionLibraryScreen.tsx` + 两份测试改造。
   - 质量：全量 **35 suites / 258 tests 绿**，`npm run typecheck` 0 错；code-reviewer 两轮过、qa 真机两轮 PASS（xagapro / Expo Go）、supervisor 复检放行（P0=0 / blocking P1=0）。
   - 证据：计划 `docs/pm/PLAN-TASK-018-library-dynamic-filter.md`；复核 `docs/review/CODE_REVIEW-task018-dynamic-filter.md`（含 Round 2）；QA `docs/qa/task018-dynamic-filter.md`（含复验轮）。
7. **多语言**（2026-09-27，commit `4be0428` / `c2393af`）：中英文切换、立即生效、持久化，启动自动跟随系统语言。纯 JS 运行时（`src/shared/i18n.ts` + `LanguageContext.tsx`），未引入 `expo-localization`，app.json 无需 locales 配置。
8. **TASK-020 启动画面换肤**：见下方「启动画面换肤（2026-09-27）」。
9. **本次大交接**：neat-freak 文档对齐与清理完成；全部产出**已按用户指令提交并推 `main`**。

### 1.3 明确未做（别误以为做了）

- **native hardening 全部未开工**（计划里的 R004–R006、R022–R034 等固定 P0）：FGS、通知双分支、Doze/Deep Sleep、WakeLock、`ApplicationExitInfo` 与终止信号矩阵、API 33/36 与 minSdk 矩阵 —— 一项都没做。
- **TASK-017 背景音试听按钮**：已实现（DISPATCH-LOG 有 builder PASS 行）但**未收口**（未走完 review/QA），当前状态＝挂起。
- Google TTS 替代 Sherpa：未做，属可选。
- Play 发布轨道：未进入；`RB-PLAY-FGS` 条件 Release Blocker 未触发。

---

## 二、下一步任务

### 2.1 恢复开发后的候选优先项（自行按用户指令择一）

1. **背景音试听按钮（TASK-017 收口）** —— 最轻，纯 JS + 单测 + 真机听测；改动面小，可当天闭环。
2. **native hardening（P0-5，R004 起）** —— 计划里的硬骨头：先建 `modules/stretch-runtime` 单一 Android local Expo module，暴露 `nowElapsedMs()` / `getBootCount()` / `getLastProcessExitReason()`，再做 FGS 与 Doze 矩阵。**建议单独开一个 Wave**，不要和 UI 小功能混做；每轮都要构造 APK + 真机取证。
3. **Google TTS 替代 Sherpa**（可选，非阻塞；PRODUCT_PLAN 明确 TTS 非权威、eSpeak 为验收环境之一）。

### 2.2 真机与出包（现成能力）

- 三台手机均已装 `releases/stretch-routine-v1.1.0-local.apk`：`xagapro`=Note11T Pro（**开发机，唯一可动**）、`ruby`=Note12、`pearl`=Note12T Pro（后两台是用户机，**禁碰**）。
- 新手机装机：直接 `adb install -r` 该 APK；HyperOS 会弹 USB 安装确认框，**等倒计时走完再点「继续安装」**，点早直接判拒绝。
- 要出新的本地 APK：走本地构建链（`npx expo run:android --variant release` 或 `cd android && ./gradlew :app:assembleRelease`），产物在 `android/app/build/outputs/apk/release/app-release.apk`，按惯例拷成 `releases/stretch-routine-vX.Y.Z-local.apk`。**不耗 EAS 额度**；EAS 免费额度 2026-10-01 恢复仅为备用通道（TASK-015）。
- 纯 JS 改动想快速真机看效果：`npx expo start --port 8081` + `adb reverse tcp:8081 tcp:8081` + 用 Expo Go 打开 `exp://127.0.0.1:8081`（Expo Go 57.0.9 已装在 xagapro）。

### 2.3 恢复时第一件该做的事

读盘（见文末顺序）→ 确认 `git log` 最新提交与本 HANDOFF 一致 → 找用户要口令（`继续开发` 或指定任务）→ 派工。**不要自行认领 2.1 里任何一项就开工。**

---

## 三、注意事项与规矩

### 3.1 铁律（都踩过坑，别重复）

1. **USB 线连着手机时手机无声**（疑似音频被线缆/投屏路由吞掉），一切「听不到」先拔线再查引擎；听测时拔线（adb 会断，测完再连）。**但纯 UI/交互任务的真机验收不涉及此条，线可保持连接。**
2. **所有 adb 命令必须带 `export ANDROID_SERIAL=<序列号>`**；当前三台都在线，不加会打到错机器。
3. **测试机只有 `xagapro`（Note11T Pro，序列号 `IN9LZTAYV4UGU4JF`）**；`ruby` / `pearl` 是用户机，禁碰。
4. **HyperOS 装机**：USB 安装确认框必须等倒计时走完再点「继续安装」。
5. **commit / push 必须用户明确指令**（含分支名）；不碰 secrets；不改旧的封存版本。
6. **真机验收前置（ENV-018-1）**：Metro 缓存可能给设备发**旧 bundle**——TASK-018 复验时 qa 就遇到过（行为仍是旧规则）。验收前必须先核对设备上的 bundle 是否含本轮改动标记（或在改动后用 `--clear` 重启 Metro），否则结论无效。
7. 启动任何服务前先查端口占用；冲突时改用可用端口并告知用户，**不擅自关别人的服务**。

### 3.2 模型与通道（每次派工前读根 `USER_MODEL_OVERRIDE.md`，以表为准）

| 角色 | 模型 | 通道 |
|---|---|---|
| task-manager | 开窗口时定 | 本窗口 |
| supervisor | opencode-go/muse-spark-1.3-contributor | opencode 直调 |
| builder | codebuddy/deepseek-v4.1-flash | codebuddy 直调（`codebuddy --model deepseek-v4.1-flash --effort high -y -p`） |
| planner | codex/gpt-6-sol | codex 直调（`codex exec -m "gpt-6-sol" --skip-git-repo-check`） |
| code-reviewer | codebuddy/glm-5.3-flash | codebuddy 直调（同 builder 通道，换 model） |
| qa | codex/gpt-6-luna | 普通 QA 走 codex 直调（`-s danger-full-access`，仅 QA）；**真机 QA（adb/Expo）走本窗口 bash 直驱**，note 记分支 |
| product-reviewer | opencode/muse-spark-1.3-contributor-free | 本窗口 subagent |
| experience-recorder | opencode-go/space-bunny-free | opencode 直调 |
| neat-freak | volcengine-plan/ark-code-latest | opencode 直调 |
| senior-expert | codex/gpt-6-sol | codex 直调（只接升级任务） |
| db-admin | volcengine-plan/ark-code-latest | opencode 直调（专项，TM 直派直收） |

> 本表为 T22（2026-09-27）实派快照，与根 `USER_MODEL_OVERRIDE.md` 一致；**冲突时以 override 表为准**，改表按 override 规矩（改表→真调→记账）。

- 表定通道的角色**必须走通道直调，禁套娃**成本窗口 subagent。
- 返工必须**续原 session**（opencode 用 `-c`）；同一 Task 累计被 supervisor 打回 2 次自动升 senior-expert，senior 再被打回 2 次即停线找人。

### 3.3 流程规矩

- 主链：`builder → code-reviewer → qa → supervisor → TM`；**不可跳 code-reviewer + qa + supervisor**（单文件小修可跳 planner/product，跳了要记原因）。
- 变更分类：`A`=开发内小改；`B`=局部功能变化（更新局部 Requirement/DoD，留 DEVELOP，不召 Planner）；`C`=产品/架构变更（进 `PLAN_REOPEN_REQUIRED`＋新 Plan 版本＋新 DEV_BASELINE）。见 `AGENTS.md`。
- 记账：每派工记 `docs/model/DISPATCH-LOG.jsonl` 一行；任务收工由 builder 出账本初版 → supervisor 校验 → TM 落盘 `TASK-MODEL-LOG.jsonl`。`used` 恒填「主」。
- 每个 Task 收尾：经验记 `经验一句话.md`（只追加一句）；neat-freak 只在收尾派一次。

### 3.4 待人工确认（neat-freak 提出，TM 未擅改）

- **U-1**：`docs/pm/PRODUCT_PLAN_V1.2.md` 里「当前机器无 JDK / 构建阻塞」等 4 处描述与现状不符（JDK17+SDK 已装、本地构建链已通）；该文件自身 `PLAN_GATE：IN_PROGRESS` 也与 HANDOFF 的 `APPROVED` 不一致。**因它是 DEV_BASELINE，改它属 Plan 变更邻域（Change C），TM 未擅改**。现状以本 HANDOFF 为准；若要改 Plan 正文，请用户拍板走 Change C。
- **U-2（已处理，2026-09-27 用户拍板「处理」）**：`README.md:24-25` 要求 `Orca 通用编排者持续推进协议.md`/`Orca 编排治理监督者提示词.md` 放 `docs/prompts/`、`归位表.template.md` 放 `docs/templates/`（第 24 行并明令「勿留根」）。**最终处置＝删 2 / 移 1 / 留 1**：
  - ① `git rm` 根 `Orca 通用编排者持续推进协议.md`（28504B / 2026-09-13 的过期十卡版；`docs/prompts/` 版 28518B / 2026-09-19 已更到「9+1＋1」，`cmp` 证两版有差异）。
  - ② `git rm` 根 `Orca 编排治理监督者提示词.md`（与 `docs/prompts/` 版 `cmp` 逐字节相同，纯重复）。
  - ③ 根 `归位表.template.md` 与 `docs/templates/归位表.template.md` **本已逐字节相同**（均为空模板源，且后者自提交 `90bd862` 起已被 git 跟踪）；本轮 `git mv -f` 去重，**仅保留 README 指定位置 `docs/templates/归位表.template.md`**，与已填产物 `docs/templates/归位表.md` 共存（两者内容不同、均保留）。
  - ④ 根 `编排者提示词.md` 按 `README.md:23`「包内原位」**保留不动**。
  - **依据**：README 口径 + `cmp` 实测 + 全仓引用者（`README.md:24`、`AGENTS.md:94/173`、`编排者提示词.md:13`、`迁移整理提示词.md:13`、`docs/templates/归位表.md:8`、`scripts/orchestration/README.md:3`）**全部按 `docs/prompts/` 路径引用，无一处按根路径引用**——删除不影响任何引用（引用指向的文件本就在 `docs/prompts/`）。
  - **更正前一轮表述**：`AGENTS.md` 与 `编排者提示词.md` 引用的本就是 `docs/prompts/` 里一直存在的文件，**引用从未悬空**；真正多余的是根目录这两份过期/重复副本与错位的根 `归位表.template.md`。
- **U-5**（neat-freak 2026-09-27 新提出）：根 `迁移整理提示词.md:13` 一句话内自相矛盾——既说把源包「铺到本项目根目录……归位表.template.md」，又说「把归位表.template.md 放到本项目 docs/templates/」，且与 `README.md:23-25`「文件＋落位路径成对」的口径已不一致。**该文件属中央治理布局，AGENTS 禁改、neat-freak 未擅改**。建议修法：把第 13 行铺底清单里的 `归位表.template.md` 从「铺到根」清单移出，只保留「放到 `docs/templates/`」一句，与 README:25 对齐（改母版真源后同步 `新项目模板包/`、`老项目迁移模板包/` 两包）。请用户/中央治理裁定。
- **U-3**：`TASK-MODEL-LOG.jsonl` 无 TASK-017 行（只有 DISPATCH 行）——与「TASK-017 未收口」一致；是否补记由用户/TM 定（账本红线只校验不改）。
- **U-4**（neat-freak 2026-09-27 新提出）：根 `经验一句话.md` 有整段重复——第 26–40 行把第 5–15 行的通用经验（含重复的 `# 经验一句话` 标题）原样再抄一遍，其后才是本项目独有经验（2026-09-18 起）。该文件自称「只追加」且归 experience-recorder 管，**neat-freak 未擅改**；是否去重请用户/TM 定（去重＝纯删除重复行，零信息损失）。既有封存件 `经验一句话.md.旧版-2026-09-27` 未动。

### 3.5 构建环境（一句话备忘，详细整理由用户另派智能体负责）

本项目的本地构建真链是 `~/android-toolchain/`（JDK 17 + Android SDK，含 android-36 / build-tools 35.0.0+36.0.0 / NDK 27.1.12297006）。出包前需设 `JAVA_HOME` 与 `ANDROID_HOME`。**注意**：用别的 SDK 根跑 gradle 会因项目声明了 `ndkVersion` 而自动下载约 2.4GB 的 NDK——用真链可避免。环境本身的梳理不在本交接范围。

---

## 恢复读盘（全体系唯一顺序，别乱）

1. `AGENTS.md`；2. `docs/roles/` 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。

## 任务备注

- 业务代码落位：项目根即业务仓库（Expo 工程初始化在项目根；AGENTS 规定业务文件原地不动、搬了会 broken 的留原地记映射——本项目为空白起步，直接在根建 Expo 工程）。
- 真机：adb 设备已连 `IN9LZTAYV4UGU4JF`（xagapro / 22041216UC）。
- 工具：node24 / npm11 / eas / codebuddy / codex / opencode 可用；expo CLI 需 `npx`。
- 用户指令：不中断、不提问、小问题自治、疑难挂账、完成后 adb 推送安装到手机。2026-09-18 追加：builder 双模型限额时切 codex/gpt-5.6-luna 续跑禁停摆；禁音令已解除，现在可做语音测试。
- 音频铁律（2026-09-18 真机实证）：USB 线连着时手机无声，拔线即恢复；一切「听不到」先查线缆再查引擎。Expo Go + Sherpa xiao_ya 神经音用户初听通过；eSpeak 仅备用。听测时拔线（adb 会断，测完再连）。
- B-1 局部 Requirement（种子数据，不召 Planner）：①首版 14 动作 + 2 流程；TASK-010 已扩到 28 动作 + 5 模板 + 设置页一键清除（`seed_examples_cleared` 标记防复活，改名/自建数据不动）；②幂等：`seed_version=1`，仅全空播种；老库 repair 补新模板只增不改。后续 TASK-012 扩到 **59 动作 / 9 模板 / 标签 V3 迁移**。
- B-2 局部 Requirement（倒计时背景音，用户 2026-09-18 修订：自然音三段替换为三首轻音乐）：①设置页「倒计时背景音」5 选 1（无声/滴答/轻音乐·晨曦/轻音乐·静夜/轻音乐·空山，默认滴答）；②背景音仅在 `RUNNING_STEP`/`TRANSITION` 播放，暂停/结束/完成即停；③TTS 播报时背景音不掐断计时、不吞 cue（音量 coexistence，有条件 duck）；④音频本地打包离线可用、有出处 license 记录；⑤DoD：5 选项切换单测 + 启停跟随状态机测试 + 真机 sandwich（Expo Go）验证；⑥用户终验通过后 10-01 EAS preview 打包 adb 装机（额度所限，之前不承诺 APK 推送）。
- B-3 局部 Requirement（动作库分组筛选，用户 2026-09-18 批准，**③已被 B-4 取代、②的二级分组已并入 B-4 的 chips**）：①动作库按场景折叠分组（拉伸/热身/核心训练，默认只展第一组，组头数量 badge）；②拉伸组内按部位二级分组（颈肩胸背腰腹髋臀腿小腿全身）；③顶部筛选 chips（难度低中高）+ 搜索框，筛选后只显命中分组；④流程模板页按场景分组（日常拉伸/健身前后/热身/核心，难度角标）；⑤DoD：分组/筛选/搜索单测 + 集成测试 + 真机验证。
- B-4 局部 Requirement（动作库动态部位筛选，用户 2026-09-19 确认；取代 B-3③ 难度 chips，仅动作库页，**流程模板页 B-3④ 不动**，`CHANGE_REQUEST: B`）：
  ①顶部保留搜索框，移除难度 chips（动作难度数据与动作编辑器不动）；
  ②新增动态部位 chips，跟随「当前活动场景」，默认第一组「拉伸」；顺序 全部→颈→肩→胸→背→腰腹→髋臀→腿→小腿→全身，只列该场景内 count>0 的部位，存在无部位标签动作时追加「其他」chip；
  ③三个场景都用部位 chips；命中规则＝动作 `bodypart` 与所选部位有交集即命中（点「腿」和点「髋臀」都能看到同一个多部位动作）；**【HD-1=A 修正】chips 单选、同一屏每个动作只出现一次（去重），组头 badge＝该场景当前实际显示的唯一动作卡片数——原「组头数字会重复计数」表述作废**；
  ④多组同时展开时，部位 chips 只作用于活动场景组，其它已展开组保持全显、不受影响；
  ⑤场景组内不再渲染二级部位标题，改为平铺；
  ⑥搜索框按全局处理（作用于所有组），与部位取交集（AND）；
  ⑦DoD：chips 生成单测（顺序/空部位剔除/其他项条件出现）+ 交集命中单测 + 活动场景切换集成测试 + 非活动组不受影响集成测试 + 旧测试（`src/tests/domain/actionGroups.test.ts`、`src/tests/integration/libraryFilter.test.tsx`）同步改造不留红 + 真机（xagapro / Expo Go）验证；本改动无音频，不涉拔线铁律；
  ⑧状态：**全链完成并放行**（2026-09-19）。HD-1 用户拍板 = A；planner 复核 PASS（用户指定例外加派，未触发 Change C）；code-reviewer 两轮过（P0=0 / blocking P1=0）；qa 真机两轮 PASS；supervisor 复检放行（六项校验全过）；产出已提交推 main；
  ⑨【交互修正，TM 按 B 类更新局部 Requirement，来源=QA 真机 C-2】活动场景认领规则＝「点谁谁成为筛选对象」：点【非活动场景】组头 → 立即认领为活动场景（chips 切换、部位重置「全部」）并保持/设为展开，**这次点击不收起**；点【自身已是活动场景】组头 → 才做展开/收起切换；
  ⑩【同批修正】当活动场景因搜索或部位筛选 0 命中（该组已从列表隐藏）时，chips 条可见归属文案追加「（当前无匹配）」；chip 选项本身不收缩、不隐藏；
  ⑪【合规补齐，来源=QA 真机 P3-1】chip 显式 `minWidth: MIN_TOUCH_SIZE`（真机实测单字 chip 由 42.5dp → 48.0×48.0dp）；
  ⑫DoD 追加：⑨⑩⑪ 三条须有集成测试覆盖，并在 xagapro / Expo Go 真机复验通过（已达成）。
- 本地构建授权（2026-09-18 用户明确批准）：brew 安装 JDK17 + Android SDK（约 3GB），走本地构建（`expo run:android release` / `eas build --local`）出 APK，不耗 EAS 额度；用户要求下载 → 调试 → 推送手机。

## 迁移整理（2026-09-23，整理工）
- 模板包重铺：新放58、备份8、跳过23（含GOVERNANCE_VERSION一致）；AGENTS旧规已附新版末尾；USER_MODEL_OVERRIDE转软链（实文件备份.旧版-2026-09-13）
- 归位表：docs/templates/归位表.md；GOVERNANCE_VERSION：版本以 Git 历史为准
- 基线：typecheck PASS，jest 35/258 PASS，lint无配置不卡；两账本为真实账本已原样保留（模板覆盖后回退）
- CHANGE_REQUEST：NONE（本次为治理整理，不碰业务）

## 真机联调（2026-09-24）
- Picker总数+分组筛选、Routine分组选择+自定义分组、设置页测试语音按钮三处改动，随release包真机验收通过（jest 36套件/263用例全绿）
- 真机无声根因：speaker音量0＋sherpa引擎无中文包（切mibrain）＋投屏/录屏劫持remote_submix；均设备侧修复，无业务代码改动
- 当前手机上为release包（离线独立运行）；CHANGE_REQUEST：NONE

---

## 启动画面换肤（2026-09-27，TASK-020，CHANGE_REQUEST: B，全链放行）

- **起因**：用户指出 App 启动画面还是 Expo 默认框架。根因查实——`assets/splash-icon.png` 是 Expo 模板自带的「网格+同心圆靶心」图，且 `android/` 是 prebuild 产物、`splashscreen_background` 仍残留 `#FFFFFF`，app.json 的 splash 改动从未同步进原生。
- **做法**：接入 SDK 内置的 `expo-splash-screen@~57.0.9`（`node_modules/expo/bundledNativeModules.json` 锁定版本，非第三方新依赖），把它作为 app.json `plugins` 让 app.json 成为唯一真源，再 `npx expo prebuild -p android` 同步原生。启动画面换用品牌图 `assets/motion-core-icon.png`，底色 `#041B3D`，`imageWidth: 100`（100dp 方图半对角线 70.7dp < 96dp 圆形遮罩半径，不会被切角）。Android 12+ 靠 androidx core-splashscreen 的平台属性转发生效，不需手写 `values-v31`。
- **防闪烁**：`preventAutoHideAsync` 放模块作用域不 await（挂住原生 splash 到本地 DB 初始化完成），`hideAsync` 在 `boot.status` 离开 loading 后 rAF 调用，**错误分支也放行**（否则初始化失败会被 splash 永久盖死）。App.tsx boot 屏与原生 splash 同图源、同 100dp、同居中，过渡帧证实图标原位淡出、无跳变。
- **真机验收**：xagapro(API31) / ruby(API34) / pearl(API35) 三台覆盖安装成功（**全程未卸载，用户数据零丢失**），逐帧录屏 + PIL 像素统计取证：主内容区全程 `#041B3D`，**纯白帧 0、纯黑帧 0**。冷启动 526ms。报告 `docs/qa/task020-brand-splash.md`。
- **顺手修掉的既有 P1**：`app.json` `versionCode` 2→3。此前有人手改未跟踪的 `android/app/build.gradle` 为 3 未回写真源，prebuild 又重置为 2，导致装机一律 `INSTALL_FAILED_VERSION_DOWNGRADE`（`-d` 也不放行）。口径已落 `docs/sop/android.md` §5.1。
- **挂账非阻塞**：①`app.json` 顶层 `splash` 与插件 props 双写（权威源＝插件 props，口径同落 §5.1）；②`assets/splash-icon.png`（17KB Expo 靶心图）原为零引用孤儿、会被 `assets/**/*` 打进包——**已清（2026-09-27 neat-freak，同批删除 `assets/icon.png`、`assets/android-icon-background/foreground/monochrome.png` 共 5 个 Expo 模板默认图）**；③splash 期间底部系统导航栏约 130ms 为纯黑（Android 12+ 固有行为）；④「Motion Core 拉伸」字样因 DB 初始化 <100ms 未被看到，**要不要加 splash 最短显示时长属观感决策，未擅自加**；⑤splash 图标自带浅蓝圆角方块底，在深蓝上可见方形边界（素材级微调）。
- **出包铁律（新增）**：`android/` 已存在时 `expo run:android` 不重跑 prebuild（2026-09-21 图标修复已踩过同坑），**出包前必须先 `npx expo prebuild --platform android` 再 gradle**，否则按旧 versionCode 打包并误判成"修复没生效"。
