# RESEARCH_REVIEW｜TASK-021 历史统计 开发计划复核

- **Plan Version（评的是哪版）**：`docs/pm/PLAN-TASK-021-history-stats.md`（Planner `codex/gpt-6-sol` 产出，未 commit/push）；所对照的基线为 `DEV_BASELINE=PRODUCT_PLAN_V1.2`（`PLAN_GATE=APPROVED`，Readiness 94）
- **Review Round**：Round 1
- **Result**：**FAIL — 建议打回**。计时与归档的口径设计质量高于本项目既有计划的平均水准，8 条主张里 6 条经我逐行验证为真、2 条自信地写错了；但有 **3 个 P0**（其中 2 个是「照方案实施会算错数 / 治理基线判错」级别），Readiness 58 分，距 Gate（≥90）差距不是措辞问题。
- **P0 / P1 / P2**：
  - **P0：3**
    - **P0-1｜「monotonic 有效时长不受改钟影响」在当前构建下是假陈述。** 方案 L85 / Risks「改系统时间只影响显示日期，monotonic 有效时长不变」依赖 `MonotonicClock` 是真单调源；但 `src/services/clock/MonotonicClock.ts:36-42` 的 `ExpoGoMonotonicClock.nowElapsedMs()` 就是 `return Date.now()`（注释自认「NOT truly monotonic」，真源 `elapsedRealtime` 仍挂在 R006 未开工的 native TODO）。当前纯 JS 回退下同一个 `Date.now()` 同时驱动「时长」与「日期」，方案赖以成立的不变量不存在。真实后果不是理论问题：改钟 **+1h** 会让 `advanceRunner`（`src/features/runner/domain/runnerMachine.ts:107-193`）在一次 tick 内冲过全部边界直接 COMPLETED，把用户没做的步骤按 `effectiveStepDurationMs` 全额归档；改钟 **-1h** 触发 `sessionRecovery.ts:82` 的 `phaseStartedElapsedMs > nowElapsedMs` → 整场丢弃。已有的「±1h/±1d 不动倒计时」测试（`src/tests/domain/sessionRecovery.test.ts:185`）用的是 `FakeMonotonicClock`，**只证明领域逻辑与 wall 解耦，不构成真机证据**——方案把它当作已验证事实用。
    - **P0-2｜方案把「跨 boot 丢弃」写成安全策略，而当前构建里它是「跨进程丢弃」——用户最常踩的路径，且全程零告知。** `src/services/runtime/BootInfo.ts:29` 的 `bootCount = Date.now()`（JS 上下文创建时取一次，注释自认是 process identity 的近似）。于是任何进程死亡（OS 回收/HyperOS 后台杀进程/Expo Go 重载/用户划掉）都满足 `bootCount` 不匹配 → 丢弃。两条丢弃路径都**静默删数据**：`startRoutineService.ts:88-90`（`await deps.sessions.clear()`，**连提示都没有**）、`runnerController.ts:127-131`（清行 + 弹一句带原始 reason 的错误）。方案 L21/L43/L127 三处把这条写成「不伪造训练记录」的正确性保护，却从未（a）说明它在当前构建是高频路径而非边角、（b）要求任何用户告知。照方案实施后：用户练了 20 分钟 → 进程被杀 → 重开点别的流程 → 旧会话静默消失、统计不记、界面无提示，且统计页永远无法解释这个空洞。这同时踩中「数据正确性」与「诚实性」两条判据。
    - **P0-3｜Change 分类错误：应为 C，方案判 B。** 见下方「Change B/C 独立判定」。若按 B 开工，等于在 `PRODUCT_PLAN_V1.2` **两处明文**列为 Out of Scope / P2 的能力上开发（`docs/pm/PRODUCT_PLAN_V1.2.md:36` 与 `:154`，详见判定段），基线从此不再描述产品，AGENTS.md:9 的 P2/Out-of-Scope 机制被架空。
  - **P1：7（全部 blocking）**
    - **P1-1｜HD-1 漏掉了最小选项（TM 点名要查的「更简单的路径」确实被忽略了）。** HD-1 只给 A（步骤级覆盖）/B（流程单类型）/C（复用 category），**「本期先不引入分类维度、只按流程累计一个有效时长总数」这个选项完全缺席**。该方案成本约为 HD-1=A 的一半：一列累计值 + 一张 `session_history` 单表（无明细表）、零枚举、零编辑器 UI、零种子定义、零「未分类」桶，却能独立验证本任务真正难的部分（终态原子归档、`session_id` 幂等、时钟、跨进程）。方案直接跳到「实现用户已点名需求的完整形态」，从未把它摆到用户面前。**HD-1 必须补 D 选项。**
    - **P1-2｜`end_local_date` / `end_utc_offset_min` 与周月分桶的可行性完全未验证，而这是 Hermes 上的已知雷区。** 全仓当前**零时区/本地日期代码**（`rg` 实测：唯一时间源是 `WallClock.nowMs()` 与 `MonotonicClock.nowElapsedMs()`，都只是 `Date.now()`）。方案没说明 `end_local_date` 怎么取得。外部证据显示这条路不安全：Hermes 的 `toLocaleDateString` 走设备 ICU，跨平台/跨 API 级别行为不一致（`facebook/hermes#630`：Linux/Windows 不应用客户端时区；`facebook/hermes#1485`：Asia/Singapore 出现差一天；`facebook/hermes` `doc/IntlAPIs.md`：Intl 支持不完整、`dateStyle/timeStyle` 未实现，Android 侧可用性依赖平台 ICU；`facebook/react-native#29141`：Hermes 开启后 Android Intl 不可用）。日/周/月是方案的 P0 验收项，却建立在一条未验证的地基上。
    - **P1-3｜口径一致性没有闭环，方案漏了一处上线后必成假话的文案。** 完成页 `用时` = `routineElapsedMs`（`src/features/runner/services/runnerView.ts:91` → `runnerTime.ts:57-59`，**含转场**），Runner 顶部「已用」同理（`RunnerScreen.tsx:144`），统计页「动作有效时长」不同——用户看到两个数不一样就是 bug，方案只说「标注说明」，**没把「完成页/Runner 同步标注或同时展示两口径」写进 DoD**。更硬的是：`RunnerScreen.tsx:57` 的结束确认弹窗写着「**已经完成的部分不会保存**」，方案 L43 让 STOPPED 也归档后，这句话直接变成假话，方案全文未列这项文案改动。
    - **P1-4｜双语范围会外扩，方案没把范围与决策摆出来。** `CompletionScreen.tsx:19,29,37` 与 `RunnerScreen.tsx:57,65,67,144` **全是硬编码中文**（对比 `HomeScreen.tsx:50` 已走 `t('home.title')`），完成页/Runner 根本没接入 i18n。方案 P0 要求「成功落盘后才给出『已计入统计』的反馈」——这条反馈只能落在完成页，于是要么在中文页面里插英文（不可接受），要么顺带本地化完成页（范围外扩、额外测试面）。这需要用户拍板，不该由 Builder 临场决定。
    - **P1-5｜旧种子流程将永久「未分类」，方案没给任何批量路径。** 现有 9 个示范流程对既有用户永远是 `NULL` → 统计页长期挂着「有未分类时长」提示，而出路只有「到流程编辑页逐个设置」＝至少 9 次手动编辑。方案 L34 的顾虑（种子 ID 随机、名称可能被用户改动/复用）**我验证为真**（`src/shared/utils/id.ts:13-19` 随机 ID；`src/data/seeds.ts:316-322` 种子识别确实靠名称，还有 `办公室肩颈放松→办公室久坐放松` 的历史改名），所以「不按名字猜」正确；但方案漏了一条**安全且廉价的路**：`repairSeededRoutines`（`seeds.ts:631`）**由 App 自己重新插入**的行是无可置疑的种子行，新插入时直接写类型即可，只有既存用户行保持 `NULL`。
    - **P1-6｜`stats_state_json` 与 `SessionSnapshot` 构成两份步骤真源 + 两套版本机制，且留了「可拆成若干新增列」的自由裁量。** 方案 L82 自己说 `stats_state_json` 至少要存「会话开始时每步的固定类型快照」——但 `src/domain/session/SessionSnapshot.ts:18-27` **已经是**为此存在的、带 `version` + 严格解码的不可变快照机制（`decodeSnapshot` L98-147，fail-safe 不猜）。同一个步骤列表被两处描述、各自版本化、各自校验，必然漂移。而「实际实现可将序列化字段拆成若干新增列」（L82）这种授权会让不同 Builder 落成不同 schema，正是后续统计对不上的来源。方案必须定死一套。
    - **P1-7｜缺「统计数据可删除/重置」这一决策。** 一旦本地存了「我练了多少」，删除/清空/导出就是用户会要的东西；本项目已有「设置页一键清除示范数据」的成熟先例（`seeds.ts:673-682`，`seed_examples_cleared` 机制）。方案通篇未提，HD-1/2/3 也没问。
  - **P2：7**
    - P2-1 `idx_session_history_recent`（L69-70）与 `idx_session_history_date`（L67-68）双索引：一年几千行、单索引足够，砍。
    - P2-2 `accounting_version`（L65）：全库只有一个版本在用、无重算需求，本期无消费者，砍或写明用途。
    - P2-3 `end_utc_offset_min`：既然「换时区不重排旧日」，该列本期无读取方，砍或降 P1。
    - P2-4 类型枚举含 `OTHER`：无用户需求来源，会退化成垃圾桶并稀释「未分类」这个诚实信号。建议 HD-1 一并把枚举缩到 拉伸/放松/核心/未分类。
    - P2-5 方案**完全没评估 `bodypart` 作为统计维度**。v3 迁移已给 `routines` 加了 `bodypart` 列（`migrations/index.ts:129`），动作级 `bodypart` 已可编辑且已是动作库主筛选维度（TASK-018）。竞品（见 Competitor Findings）做图表的恰恰是**部位平衡**。拉伸/放松/核心是「目标意图」轴、与部位正交，所以主轴选 `training_type` 我认同；但方案有义务写一句「为何不并列展示部位平衡」，否则是盲点而非取舍。
    - P2-6 12 小时 stale 丢弃路径（`sessionRecovery.ts:32,85`）未在 Risks 出现（方案只列了跨 boot/损坏/ERROR）。
    - P2-7 方案 L44「先到终态再被较早的写覆盖」这一并发风险**在当前代码里不可能发生**：`UPDATE ... WHERE id=1`（`sessionRepository.ts:45-51`）在 DELETE 之后影响 0 行并抛 `PersistenceError`（L106-109），不会复活。真正的顺序风险是反方向的——fire-and-forget（`runnerController.ts:209`）意味着**完成页可能先渲染、归档后提交**。结论对、机制说错了。

- **Key Assumptions（逐条＋是否成立）**

| # | 假设 | 判定 | 依据 |
|---|---|---|---|
| A1 | 旧版无历史数据，历史不可回溯 | **成立（零粉饰）** | `rg "session_history\|sessionHistory\|统计\|history\|statistic" src` → **全仓 0 命中**；`active_session` 是 `id INTEGER PRIMARY KEY CHECK (id = 1)` 单例（`migrations/index.ts:59,92`），终态唯一去向是 `sessionRepository.clear()` 的 `DELETE`（L119-121），由 `sessionPersistence.ts:41-43` 在非 active 态无条件调用。方案 L126 的「不能把空白解释为用户过去没练过」态度正确 |
| A2 | `category` 不可复用为统计类型 | **成立** | `src/domain/tags.ts:14-24` 九个值里 晨起/睡前/跑后/办公/热身 是场景、胸/背/腿 是部位，混装；`RoutineEditorScreen.tsx:105` 流程侧只暴露 `category` |
| A3 | 迁移 v4 纯 additive 可行 | **成立** | `migrations/index.ts:113-131` v3 全是 `ADD COLUMN`/`TEXT` 可空；`runMigrations`（L148-170）事务 + `PRAGMA user_version`；方案 DDL 合法（`NOT NULL DEFAULT '{}'` 允许，缺省值不可为 NOT NULL 是另一回事） |
| A4 | `resetSchema()` 需同步新表 | **成立** | 实际函数名是 `resetSchema`（`migrations/index.ts:173-179`）——**TM 简报里写的 `resetToV1()` 不存在，方案写的 `resetSchema()` 是对的** |
| A5 | `completedPhaseMs` 含转场、Previous 会重置，不能用于统计 | **成立（判断精准）** | `advanceRunner` 每次跨界 `completedPhaseMs += total`，而 `total=phaseTotalMs()` 对 step 相加 `effectiveStepDurationMs`、对 transition 相加 `effectiveTransitionDurationMs`（`runnerTime.ts:33-44`）→ 步+转场混合累计；Previous 把它换成 `plannedCompletedMsBefore(steps, targetIndex)`（`runnerMachine.ts:254`），那是**按计划值**回推（`runnerTime.ts:111-124`），且 `buildPhase` 会把 `runtimeExtensionMs` 清 0。**方案这条防统计算错的关键判断完全正确** |
| A6 | `session_id` 可作幂等键 | **成立** | `src/shared/utils/id.ts:13-19`：时间基36+计数+6位随机 |
| A7 | 种子不可按名称/标签自动归类 | **成立** | 种子识别靠名称（`seeds.ts:316-322` 含历史改名兼容），ID 是随机生成；方案拒绝猜测是对的 |
| A8 | 示范数据不入统计 | **成立（方案主动守住）** | 方案 L34 明写「示范数据只提供可运行流程，绝不插入历史表」，与 `seed_examples_cleared` 铁律一致 |
| A9 | **时长不受改钟影响 / 跨 boot 是边角** | **不成立** | 见 P0-1、P0-2。`MonotonicClock.ts:36-42`、`BootInfo.ts:29` |
| A10 | Change B 成立 | **不成立** | 见 P0-3 与独立判定段 |

- **Verified Facts（已验证事实＋证据）**
  1. `active_session` 单例、无归档表、终态 `clear()` 直删 —— `migrations/index.ts:59,92`、`sessionRepository.ts:76-78,119-121`、`sessionPersistence.ts:41-43`。**主张 3 为真。**
  2. 导航是 `useState` 轻量栈，7 个 route，无导航框架 —— `routes.ts:12-44`、`AppNavigator.tsx:14-31`；`ROUTE_TITLES`（`routes.ts:36`）**是死代码**（全仓仅定义处命中，无消费者），各屏自己传 `title`。**主张 6 的前提为真。**
  3. `package.json` 依赖仅 expo-sqlite/expo-audio/expo-speech/expo-splash-screen/react(-native)，**零图表库**；`theme.ts:38` 有 `MIN_TOUCH_SIZE = 48`。**主张 6 可行。**
  4. `i18n.ts` 是纯字典（409 行，`translate(language, key, params)`），`HomeScreen` 已接入，**Runner/完成页未接入**。**主张 8 的双语要求成立，但覆盖面比方案以为的窄（P1-4）。**
  5. `HD-3=A` 落位可行：首页 header 已有「动作库/设置」两个入口（`HomeScreen.tsx:51-66`）。但方案说「保持现有三入口结构」而入口在 **headerRight**，加第三个会在小屏 header 拥挤——方案 P2 未提。
  6. `save()` 吞错误（`sessionPersistence.ts:46-48`）、`apply()` fire-and-forget（`runnerController.ts:209`）——**主张 2 的这条判断为真**，是本方案最有价值的技术发现之一。
  7. `sessions.replace()` = DELETE+INSERT（`sessionRepository.ts:112-117`），由 `startRoutineService.replaceWith()` 在用户确认后调用（L154-167）。方案「先归档旧会话、成功后再开始新会话」的要求方向正确。
  8. `routine_steps` 已有 `pair_group_id`/`side`（`migrations/index.ts:50-51`），双侧动作左右两步各占一行、各有时长 → 方案「左右步骤分别按实际时长计」与数据模型一致。

- **External Sources**
  1. Hermes Intl/时区不可靠（用于 P1-2）：`facebook/hermes#630`（`toLocaleString` 在 Linux/Windows 不应用客户端时区，https://github.com/facebook/hermes/issues/630）、`facebook/hermes#1485`（Asia/Singapore 差一天，https://github.com/facebook/hermes/issues/1485）、`facebook/hermes doc/IntlAPIs.md`（支持不完整、`dateStyle/timeStyle` 未实现、Android 侧依赖平台 ICU，https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md）、`facebook/react-native#29141`（Hermes 开启导致 Android Intl 不可用，https://github.com/facebook/react-native/issues/29141）。→ 建议：`end_local_date` 用**纯算术**（UTC getter + `getTimezoneOffset()`）推导，周月分桶也用算术，彻底绕开 `Intl`。
  2. 竞品现状（用于 Competitor Findings 与 P2-5）：Stretch Day（https://apps.apple.com/tm/app/stretch-day-bend-stretching/id6767430728）、Flexor（https://flexor.app/features）、Voice Stretch Guide（https://mwm.ai/apps/voice-stretch-guide-stret/6779091186/）、MuChills（https://mwm.ai/apps/muchills-daily-stretch-log/6757006099）。

- **Competitor Findings（竞品现状＋对本 Plan 的启示）**
  - 四家竞品的留存核心高度一致：**连续打卡（streak）+ 一个总时长数字 + 日历/热力图**。方案把 streak 划到 P2 是可辩护的（方案自陈「中止是否算打卡、跨天归属未沉淀前易误导」，这个顾虑是对的），但「一个总时长数字」是四家无一例外的第一屏元素，而它恰好就是 **P1-1 里被方案完全省略的那个最小方案**。这是我不接受「分类维度必须和统计同时上」的直接外部依据。
  - **图表化的真实用例是「部位平衡」**：Stretch Day 的 Body Radar 按六个身体区、Voice Stretch Guide 的 body area balance statistics。而本项目**已经有**部位维度（`TAG_BODY_PART_VALUES` 九值、`routines.bodypart` 列已存在、动作库已按部位做动态筛选）。方案一个字的 bodypart 都没提。启示：部位平衡几乎是「零新增字段」就能做的第二张卡（步骤级覆盖逻辑与训练类型完全同构），方案应至少写明为何不做。
  - 竞品还有一类本项目完全没提的轻量高价值项：每次训练一条自由文本「感觉如何」备注（Voice Stretch Guide / MuChills）。成本极低、不破坏任何口径。列为可选，不阻塞。
  - 竞品普遍用 **Apple Health 写入**替代自建统计页。本项目无账号离线、宪法 II 不联网，正确排除——方案 Out of Scope「不引入云端」与之一致，无异议。

- **Counter-evidence（反对证据＋成功的相反做法）**
  1. **反对 HD-1=A 的「新维度」优越性**：新增正交维度相对「复用 + 映射规则」的优势只在**语义准确性**；代价是每加一维就加一套列 + 编辑器 UI + 种子定义 + 一个「未分类」诚实桶（本项目已有可复用的 `bodypart` 列却被闲置于流程编辑器之外，说明本项目「加一维」的边际成本不低）。方案的 A 在语义上正确（`category` 确实无法表达拉伸/放松），但「A 明显更优」的口气掩盖了它同时是**最贵**的选项，而最贵的选项没有和零成本的总时长方案（D）并列比较。**我不接受这个默认。**
  2. **反对「跨 boot 丢弃」是正确性保护**：把它当保护只在「诚实」维度成立，在**用户信任**维度它是反效果——四家竞品都靠 streak 留存，而 streak 的前提是数据不丢。方案一边把 streak 划到 P2（承认留存逻辑没沉淀），一边引入一条当前构建下高频静默丢数的路径，却没有一条告知需求。**这是方案最不诚实的一处**：它把自己的漏洞写成了原则。
  3. **成功的相反做法（第一方）**：本项目 `SessionSnapshot` 已经把「会话开始时冻结播放内容 + 版本 + 严格 fail-safe 解码」做对了（R009/R021），并被 8 个测试文件依赖。方案却为同一个步骤列表另起一套 JSON 版本机制，而不是扩展既有机制。**成功做法就在仓库里，方案没复用。**
  4. **成功的相反做法（第二方）**：竞品用「一个总时长 + 打卡」就完成了 80% 的心理价值，部位图表与备注是第二梯队。方案的 MVP（枚举 × 5、三档周期、三个窗口、趋势条、最近 20 条）**明显超过第一梯队所需**。

- **Unverified Items（未验证项＋验证方法）**
  1. Hermes/Intl 在本项目目标机型（xagapro API31 / ruby API34 / pearl API35）上 `toLocaleDateString` 与 `getTimezoneOffset` 的实际行为 —— 方法：真机最小脚本取值比对，或直接采纳算术实现规避。
  2. `stats_state_json` 承载逐阶段账本后，**在纯函数状态机（`runnerMachine.ts` 每个 transition）里穿一条可变累计字段**的实际改动面 —— 方案 L82 只说「实际实现可将序列化字段拆成若干新增列」，把最难的部分整体授权给 Builder。方法：Builder 出一页「累计值在哪个函数里、每次跨界如何结算」的伪码，Reviewer 先行确认再动手。
  3. 真机覆盖安装时 HyperOS 是否会杀掉后台进程、进而多快触发 P0-2 的丢弃路径 —— 方法：xagapro 起一场流程 → `adb shell am force-stop` → 重开，观察是否静默清行。
  4. 单会话最长 3 小时量级下，历史表实际增长曲线（用于判断 P2-1 双索引是否必要）—— 可由 3 推算，不必单独验。

- **Required Fixes（打回依据，Planner 必须改）**
  1. **改写 P0-1 的风险陈述**：明确「monotonic 保证在 R006 native `elapsedRealtime` 落地前不成立」，并把「单测用 `FakeMonotonicClock` 不等于真机保证」写进方案；补一条需求：改钟导致会话跳变/丢弃时，统计按实际发生处理且**告知用户**。
  2. **补 P0-2 的告知需求**：所有丢弃路径（跨进程/boot、stale>12h、损坏、越界）必须给用户一句明确「刚才那段没有计入统计」，不得静默；并在 Risks 里把「当前构建下跨进程＝常态」写明。
  3. **把 Change 分类改为 C**，按 Controlled Reopen 走（局部暂停 → Sol Planner → Research Review → Human Approval → 新 Plan 版本/新 `DEV_BASELINE` → 回 DEVELOP）。本文件是 `PLAN.template` 形态的 Phase2 增量卡，在 C 口径下需要被并入一份 V1.3 级产品计划或明确登记为新 Requirement/DoD，不能以 B 留在 `docs/pm/` 里。
  4. **HD-1 补 D 选项**：「本期只累计一个有效时长总数，不引入分类维度」，并给出成本对比（P1-1）。
  5. **补 HD-4/HD-5/HD-6/HD-7**（见下方遗漏段）。
  6. **DoD 补三条硬项**：(a) 完成页 `用时` 与统计页「动作有效时长」的口径差异在 UI 上可见（改文案或并列展示，写进 DoD 而非「在说明里解释」）；(b) `RunnerScreen.tsx:57` 「已经完成的部分不会保存」必须改；(c) 丢弃路径的告知文案有集成断言。
  7. **写清 `end_local_date` 的取得方式**（建议纯算术，绕开 `Intl`），并在真机覆盖「改时区后旧记录不重排」。
  8. **定死统计状态的存储形态**，别留「可拆成若干新增列」的自由裁量；并明确 per-step 类型快照是扩展 `SessionSnapshot`（`decodeSnapshot` 必须**显式接受 v1 并把全部步骤解为 UNCLASSIFIED**，否则既有活动会话会被判 corrupt 而丢弃 —— 这是现方案唯一做对的地方，改造时**不许丢**）。
  9. **补种子路径**：`repairSeededRoutines` 重新插入的行直接写种子定义里的类型；既存用户行保持 `NULL`。
  10. **收敛 MVP**：至少把「日/周/月三档 + 三个窗口 + 趋势条形图」整体后置，先交付「累计总数 + 最近 N 条」；枚举砍掉 `OTHER`。
  11. **补一段 `bodypart` 取舍说明**（为何不做部位平衡这张卡）。

- **Plan Readiness Score**（口径以 `docs/pm/PRODUCT_PLAN.template.md` 为准；注：TASK-021 是 Phase2 形态的 Change 卡，理论上不套 Phase1 Readiness 门，但 TM 要求独立判定且本轮按变更评审，故仍按正典七项打分并声明此适用性）

  | 分项 | 满分 | 得分 | 理由 |
  |---|---|---|---|
  | 产品目标与用户需求 | 20 | 14 | 目标清晰、离线/不伪装有原则；需求来源仅用户一句话，无真实使用反馈、无目标用户访谈 |
  | 核心方案完整性 | 20 | 15 | 时长/分类/归档/迁移口径细到可直接施工（本项目少见的优点）；缺归档触发点的实现位置、缺丢弃路径需求、缺删除/重置需求、缺最小方案 |
  | 外部事实与竞品验证 | 20 | **5** | 零外部来源、零竞品、零用户反馈。**本轮我补的 Hermes/竞品证据证明这块可补且必要** |
  | 技术可行性 | 15 | 9 | 同源计时、additive 迁移、事务归档、`session_id` 幂等我逐条验过，可行；但本地日期/时区分桶未验证，且依赖的 monotonic 不变量在当前构建不成立 |
  | 风险与异常场景 | 10 | 6 | 列了 6 条且多数诚实；唯独最关键的两条（改钟、跨进程丢弃）被写成「安全策略」而非风险 |
  | 开发范围与 DoD | 10 | 7 | DoD 可执行、测试面具体（含故障注入、覆盖安装、48dp）；MVP 偏大、枚举偏多、无「砍到最小」选项 |
  | 未决问题 | 5 | 2 | 3 个 HD 中 2 个阻塞且问对了；但缺删除/重置、批量归类、口径承诺、双语外扩 |
  | **合计** | **100** | **58** | |

  **Gate**：Readiness 58 < 90，**P0=3 ≠ 0**，blocking P1=7 ≠ 0 → **不进 WAITING_HUMAN_APPROVAL**。

- **Human-only Decisions（只需人类拍板项）**
  - **HD-1（阻塞）**：分类方案。**必须补 D 选项**（只累计总数、暂不引入维度），A/B/C/D 四选一并说明成本。
  - **HD-2（阻塞）**：主动结束半程是否计入。方案口径正确（>0ms 计入并标「提前结束」、0ms 不计、ERROR/损坏/不可信不计），无异议，等签字。
  - **HD-3（非阻塞）**：入口位置。方案推荐 A（我的独立判断也偏 A：不动轻量栈、不加第四主入口），但需注明 A 落地在 headerRight、小屏需验拥挤。
  - **HD-4（我补，阻塞体验）**：**统计数据能否删除/重置/导出？** 单条删除、全部清空、导出？与设置页既有「一键清除示范数据」先例如何并存？（P1-7）
  - **HD-5（我补，阻塞体验）**：**旧流程怎么归类？** 逐个手动 / 一次性确认批量（仅限 App 重新插入的种子行 + 用户确认）/ 长期接受「未分类」提示。（P1-5）
  - **HD-6（我补）**：**两个时长口径怎么对外？** 完成页/Runner 是否同步标注、还是统计页同时显示「含转场」与「有效时长」两个数？用户看到两个数必须能理解差别。（P1-3）
  - **HD-7（我补）**：**是否顺带本地化完成页？** 「已计入统计」反馈要落在目前全中文的完成页上，不定这个范围，Builder 会自行混语或跳过反馈。（P1-4）
  - **HD-8（我补，非阻塞）**：历史数据保留期/上限（一年几千行，无需分页策略则明确写「不设上限」），以及是否在统计页显式声明「数据只存在本机」。

- **Next Action**
  **回 Planner 修订（Round 2）。** 同时由 TM 按 AGENTS.md:9 把本变更判定为 **Change C**，进 `PLAN_REOPEN_REQUIRED` 做局部受控重开：局部暂停 → Sol Planner 出 V1.3 级产品计划（把历史统计从 Out of Scope/P2 移入 Functional Scope 并补 Requirement/DoD）→ 再派 Research Reviewer 复审 → Human Approval → 新 `DEV_BASELINE` 回 DEVELOP。修订后 P0 必须为 0、blocking P1 必须为 0 才可进 Human Gate。

---

## 附：TM 点名的 8 条主张 · 逐条验证结果表

| # | 主张 | 结论 | 证据 / 不符之处 |
|---|---|---|---|
| 1 | 新增正交训练类型维度；不复用混杂 `category`；流程设默认类型 + 步骤覆盖；旧未设类型记「未分类」不猜测；暂不做全局映射 | **基本为真（取舍论证不足）** | `tags.ts:14-24` 混装成立；`routineEditor` 仅暴露 category（`RoutineEditorScreen.tsx:105`）故新维度确需新 UI；拒绝按名猜测正确（`seeds.ts:316-322` 名称识别 + 随机 ID）。**但**：未评估既有 `bodypart` 列（`migrations/index.ts:129`）作为并列维度；未把「零维度只出总数」列为选项（TM 问的更简路径） |
| 2 | 复用 Runner monotonic 阶段计时；只累计实际动作时间；暂停与转场不计；`+10s` 只计实跑；Skip/Previous 各按实际练习结算 | **为真（判断精准，是本方案最强项）** | `completedPhaseMs` 步+转场混合（`runnerTime.ts:33-44`+`runnerMachine.ts:128`）；Previous 换成**计划值** `plannedCompletedMsBefore`（`runnerMachine.ts:254`）故不可回推；`buildPhase` 清 `runtimeExtensionMs`（`runnerTransitions.ts:73`）故 +10s 按段有界；`applySkip` 用 `phaseElapsedMs` 实算（L267）。**唯一缺陷**：依赖的 monotonic 不变量在当前构建不成立（P0-1） |
| 3 | 旧版无历史表、会话被 `clear()` 删除，历史无法补算，空状态如实告知 | **为真，零粉饰（罕见）** | 全仓 `统计/history/statistic` **0 命中**；单例表 + `clear()` 直删。方案还额外守住了示范数据不入统计（L34）。**唯一可补**：`repairSeededRoutines` 重插行可安全写类型（方案未提） |
| 4 | SQLite 迁到 v4、纯 additive、新增类型字段+活动会话统计状态+历史主表+分类明细表；归档与清活动会话同事务；`session_id` 防重复；按结束日建索引 | **为真，DDL 合法** | v3 已是纯 additive（`migrations/index.ts:113-131`）；`runMigrations` 事务 + `user_version`（L148-170）；`NOT NULL DEFAULT '{}'` 合法；`session_id` 由 `id.ts:13-19` 保证唯一性。**但**：`stats_state_json` 与 `SessionSnapshot` 双真源（P1-6）、双索引与 `accounting_version` 冗余（P2-1/2） |
| 5 | MVP＝累计总时长及分类 + 日/周/月 + 简易趋势 + 最近记录；打卡/目标率/复杂图表延后 | **后半为真，前半偏大** | 延后打卡/目标率的**理由站得住**（方案自陈缺目标配置、跨天归属未定）。但 MVP 含 5 个枚举 × 3 档周期 × 3 个窗口 + 趋势条 + 最近 20 条，**超过「一个总时长 + 打卡」的第一梯队需求**（见 Counter-evidence 4），且未提供更小选项 |
| 6 | 入口建议「我的流程」首页加入口进独立页（HD-3 的 A）；用现有 View/Text 自绘条形趋势，不装图表库 | **为真且可行** | 轻量栈无需扩展（`routes.ts`/`AppNavigator.tsx`）；`package.json` 零图表依赖；`theme.ts:38` 有 48dp。**但**入口在 `HomeScreen.tsx:51-66` 的 headerRight，加第三个需小屏验证（方案 P2 未列） |
| 7 | 建议 Change B，保持 `DEV_BASELINE=PRODUCT_PLAN_V1.2`；若须改已批准基线的产品目标或架构则升 C | **错误（应 C）** | `PRODUCT_PLAN_V1.2.md:36`「不建立 SessionSnapshot 历史表…V1.1 没有历史会话查询需求」＋ `:68`「一个 ActiveSession 足够，V1.1 不需要历史会话查询」＋ `:154` P2 首项「历史会话查询」。方案自己在 L132 承认了这点，却仍判 B —— **自相矛盾** |
| 8 | 提出 HD-1 分类 / HD-2 主动结束 / HD-3 入口，各给 A/B 与影响 | **部分为真** | 三问都问对了、选项与影响清楚。但**漏了 5 个用户真会关心的点**（HD-4~HD-8，见下） |

## 附：Change B / C 独立判定

**判定：C（Change C）。** 依据按强度排序：

1. `PRODUCT_PLAN_V1.2` **两处**、且是**不同小节**明文把本能力排除：Out of Scope（`:36`）与 P2（`:154`，首项即「历史会话查询」），技术取舍段还第三次写「V1.1 不需要历史会话查询」（`:68`）。这不是「没提到」，是**主动判定为不需要**。
2. AGENTS.md:9 的 B 定义是「**局部**功能变化，更新局部 Requirement/DoD」—— 隐含前提是变化留在基线范围内。TASK-021 要动 DB schema、新增两张表、一套新领域概念（训练类型）、一条新终态写入链、一整个新页面。这与已在基线内的 B 类历史改动（倒计时背景音、动作库筛选）不是一个量级。
3. 若按 B 交付，`DEV_BASELINE=PRODUCT_PLAN_V1.2` 将不再描述实际产品：一个写着「不建立历史表」的基线下面，长出了一张历史表。基线一旦可以被无声绕过，Out of Scope 与 P2 两个机制就失去约束力。
4. 成本其实很低：AGENTS.md:9 明确 C 是「**局部暂停**＋Sol Planner＋Research Reviewer＋Human Approval＋新版本＋新基线，**不全量重跑**」。本任务不碰 V1.1 native hardening（P0-5 仍在挂账），重开范围天然局部。

**诚实列出反方论据（B 侧的最好读法）**：`:36` 那句字面点名的是「SessionSnapshot 历史表 / 两张 snapshot 表」，那指的是**可恢复的旧会话快照**（回到过去继续跑），与 TASK-021 的**只读聚合统计表**在工程上不是一回事；一个 B 侧支持者可以据此主张本变更未触碰该 Out-of-Scope 条目的字面对象。这个读法有道理，但**救不了 B**：`:68` 与 `:154` 的「历史会话查询」是**不带限定**的，而 TASK-021 正是历史会话查询（外加一张历史表）。字面窄读最多说明「越界程度比想象的轻」，不改变等级。

**建议 TM 走的路径**：不必把 TASK-021 整包重做。局部重开只需产出一份增量产品计划（V1.3 或 V1.2 的受控附录），把「历史统计」从 Out of Scope/P2 移入 Functional Scope、补 Requirement/DoD、把 P0-5 native hardening 的相对优先级写清（统计功能不应挤掉 R004-R006），再由 Human 批准新 `DEV_BASELINE`。本文件这份 `PLAN.template` 形态的卡片届时作为该基线下的实现计划保留即可。

## 附：我发现的 Planner 遗漏（含建议补充的决策点）

1. **零维度的最小方案没被认真排除**（最严重遗漏，对应 TM 复核重点 2）。`session_history` 单表 + 一列累计有效时长 + 「累计总数 + 最近 N 条」，约为现方案一半工作量，能独立验证全部难点，且**不需要任何用户决策**就能开工。方案跳过了它。建议：HD-1 补 D 选项。
2. **既有 `bodypart` 维度未被评估**。`routines.bodypart` 列已存在（`migrations/index.ts:129`），步骤级覆盖逻辑与训练类型**完全同构**，竞品的图表化用例恰恰是部位平衡。方案应写明为何不并列。
3. **「统计可删除/重置/导出」完全缺席**（HD-4）。隐私 + 本项目既有「一键清除示范数据」先例。
4. **旧流程批量归类路径缺席**（HD-5）。9 个种子流程逐个手设是明显的体验坑；而 `repairSeededRoutines` 重插行是安全的自动写入点。
5. **两个时长口径的对外承诺未定**（HD-6）。用户看到完成页 20:00 与统计 17:30 是 bug，不是 feature。
6. **完成页/Runner 未接入 i18n 的范围外扩未摆出**（HD-7）。
7. **保留期/上限与「数据只在本机」的显式声明缺席**（HD-8）。数据量其实很小（一年几千行），但「不设上限」也该是明写而不是默认。
8. **12 小时 stale 丢弃路径**未进 Risks（`sessionRecovery.ts:32,85`）。
9. **归档触发点的实现位置未指定**：L82 把「累计值怎么在纯函数状态机里逐阶段结算」整体授权。这是全案最难的一步，Reviewer 应在 Builder 动手前先看伪码。
10. **STOPPED 路径当前零反馈**：`RunnerScreen.tsx:42-45` 主动结束直接 `navigation.reset('Home')`。若 HD-2 选 A（计入），用户结束一场 20 分钟的流程后**得不到任何「已计入」提示**，只能自己去统计页发现。多半要加一条提示，文案与本地化随之进来。

## 附：过度设计 / 建议砍掉

| 项 | 判定 | 理由 |
|---|---|---|
| `stats_state_json` 版本化 JSON + 严格解码 + 「可拆成若干新增列」的授权 | **建议改写** | 与 `SessionSnapshot` 构成两份步骤真源 + 两套版本机制。**但必须保留它的唯一优点**：`ALTER ADD COLUMN` 默认 `'{}'` 让既有活动会话继续可恢复；若改走 `SessionSnapshot` v2，`decodeSnapshot`（`SessionSnapshot.ts:114-116` 当前对未知版本直接 fail）**必须显式接受 v1 并解为全 UNCLASSIFIED**，否则既有会话会被判 corrupt 而丢弃（`sessionRepository.ts:88-92` 直接清行）。这一步不能省。 |
| `idx_session_history_recent` 第二个索引 | **砍** | 一年几千行，`idx_session_history_date` 足够；两个索引在小表上只会增加写放大。 |
| `accounting_version` 列 | **砍**（或写明用途） | 全库单版本、无重算需求，本期无读取方。 |
| `end_utc_offset_min` 列 | **砍或降 P1** | 「换时区不重排旧日」已定，该列本期无消费者。 |
| 类型枚举 `OTHER` | **砍** | 无需求来源，会变垃圾桶并稀释「未分类」这个诚实信号。枚举建议收到 拉伸/放松/核心/未分类。 |
| 日/周/月三档 + 三个窗口 + 趋势条形图 | **建议整体后置** | 竞品第一梯队是「一个总时长 + 打卡」；本任务真正难的是口径与归档，不是维度数量。先交「累计总数 + 最近 10 条」，把真机验证面压到最小。 |
| P1 的「用户编辑历史记录**类型/日期**」 | **建议整条删掉** | 允许改历史日期会直接摧毁「历史不可篡改」的可信度，且与快照不可变原则冲突；不该进 P1 候选池。 |
| 阶段 5 验收表里「真机验证跨天显示时记录日期语义」 | **降级** | 人工改时区/改钟在真机上不可靠复现，方案自己已说用受控 clock 集成测试覆盖；真机只需验「不崩 + 旧记录不重排」。 |

**一句话总评**：口径设计（尤其 A5 那条对 `completedPhaseMs`/Previous 的判断）是本项目见过的最扎实的一次，方案没有粉饰「老数据不可回溯」；但它把两件真事写成了安全原则（改钟无影响、跨进程丢弃是保护），把治理等级判低了一级（应为 C），并在最该提供选项的地方（要不要先只出一个总数）关上了门。这三件事修完，方案值得放行。

---
---

# Round 2 复审（追加章节）

- **Plan Version（评的是哪版）**：`docs/pm/PLAN-TASK-021-history-stats.md`（Round 2 修订版，210 行）。
  ⚠️ **版本比对方式说明（须记账）**：该 Plan **与我的 Round 1 报告同为 git 未跟踪文件**（`git status` 实测 `?? docs/pm/PLAN-TASK-021-history-stats.md` / `?? docs/review/RESEARCH_REVIEW-task021-history-stats.md`），`git log -- docs/pm/PLAN-TASK-021-history-stats.md` 为空，**因此无法做 `git diff`**。我改用「我 Round 1 报告里逐行引用的旧内容（L21/L34/L43/L65/L67-70/L82/L85/L126/L127/L132）逐条比对当前文本」的方式验证。**结论：Planner 自述的 8 条处置在当前文件里都能找到对应落地文字，不是嘴上说改**；但 Round 1 引用的行号已全部漂移，**建议 neat-freak 后续把本文件 Round 1 段的行号引用改为「原文摘录＋行号」双写**，否则下一轮无法机械复核。
- **Review Round**：Round 2
- **Result**：**FAIL（轻量）— 需再打回一次，只补 3 条机械项，不重开论证。**
  Round 1 的 **3 个 P0 全部真闭环**（不是换说法搪塞，逐条见下表）；7 条 blocking P1 全部有对应落地文字。剩余 **3 条 blocking P1** 全部是「排期归属 / DoD 覆盖 / 一处文案分流」级别的补漏，不是设计错误。**P0=0 ✔，blocking P1=3 ✘** → 按 `PRODUCT_PLAN.template.md:32` 的 Gate **不得进 Human Gate**。
- **P0 / P1 / P2**：**P0：0**（R1 的 3 条已闭环）｜**P1：4（blocking 3 / 非 blocking 1）**｜**P2：4**

## 一、Round 1 逐条闭环判定表（3 P0 + 7 P1）

| # | R1 判据 | 闭环？ | 我本轮独立复核的依据（已回源码/已 git 核实，非采信自述） |
|---|---|---|---|
| **P0-1** | 「monotonic 不受改钟影响」是假陈述 | **✅ 真闭环** | 我重读 `src/services/clock/MonotonicClock.ts:36-42`，确认 `return Date.now()` 与 `TODO(native R006)` 原文仍在。Round 2 Plan **L19/L50/L76/L106/L88** 五处**主动**写明：当前构建改钟 +1h 可一 tick 冲到 COMPLETED、-1h 可丢整场（与我 R1 的 `runnerMachine.ts:107-193` / `sessionRecovery.ts:82` 结论一致）、`FakeMonotonicClock` 只作纯函数证据、**R006 真机 ±1h/±1d 是发布前置**。**性质变了**：R1 的 P0 是「把假陈述当已验证事实」，那是 Plan 的缺陷；R2 把它改成「已验证的发布阻塞项＋已登记的外部依赖」，是**正确的工程处置**。见下方「新 P0 判定」一节我对「是否等于把成败挂在另一个未开工 P0 上」的正面回答。 |
| **P0-2** | 跨 boot 丢弃实为跨进程丢弃，且零告知 | **✅ 真闭环** | 我重读 `src/features/runner/services/startRoutineService.ts:82-90`，源码注释原文是 *"Drop it so a new start is not blocked by a dead session; this mirrors the recovery fail-safe **without announcing anything**"* —— 零告知路径客观存在，R1 判定成立。Round 2 Plan **L51** 承认 BootInfo 只是进程身份近似、进程死亡/系统回收/崩溃/Expo Go 重载**都是高频路径**；**L65** 给出机制级要求：所有丢弃入口统一「**先持久化通知原因和发生时间，再清活动行**」、首页或统计页可见「上次训练有一段未计入统计」、统计页声明「合计可能低于实际练习」、**通知持久化失败不得静默清行**；**L66** 给了真机取证动作（`force-stop`/重开→核同 boot 恢复或可见丢弃→从首页点别的流程也须显示通知）；**L108/L134** 进了 Risk 与 DoD。**这是新增的硬需求，不是把风险重贴标签。** |
| **P0-3** | Change 应判 C | **✅ 真闭环** | Plan **L4** 改为 `CHANGE_REQUEST: C`、**L16** 给出与我不谋而合的三处引用、**L17** 给出受控重开路径且明确「无需全量重跑 V1.1」「R004–R006 挂账不动」。我按 TM 要求**独立重查** `PRODUCT_PLAN_V1.2.md`：`:36`「不建立 SessionSnapshot 历史表或两张 snapshot 表；V1.1 没有历史会话查询需求」、`:68`「一个 ActiveSession 足够，V1.1 不需要历史会话查询」、`:154`「历史会话查询、SessionSnapshot 独立历史表、跨设备同步…」—— **三处原文逐字确认存在**。**我独立判定仍为 C，与 Planner 结论一致（但我是重查后自己得出的，不是因它改判而同意）。** |
| **P1-1** | HD-1 漏了 D（零分类只出总数） | **✅ 闭环** | Plan **L36-40** 给出 A/B/**D** 三行 + 相对工作量（2.0×/1.4×/1.0×）＋各自代价；**L42** 明确「Reviewer 竞品归纳『总时长』是第一屏关键数字，故 D 是完整首发候选，**不预设 A 更优**」，并把 C（复用 `category`）降为「不建议备选、选则须重审口径」。**L44** 另补了 `bodypart` 取舍（R1 的 P2-5）。R1 遗漏段第 1 条（零维度最小方案被跳过）**已正面回应**。 |
| **P1-2** | 本地日期/周月分桶未验证（Hermes Intl 雷区） | **✅ 闭环** | Plan **L87** 砍掉日/周/月三档与三窗口与趋势条；**L60** 规定 `end_local_date` 用「结束 UTC 毫秒 + `getTimezoneOffset()` **纯算术**」推导、跨午夜整场归结束日、存后换时区旧记录不重排、**墙钟倒退/无效则不归档或标待核实并告知，不猜**；**L81** DoD 要求算术日期单测覆盖跨午夜/时区变化/**负 offset**。**绕开了 `Intl`，我的 R1 外部证据（hermes#630/#1485/IntlAPIs.md、RN#29141）被采纳并转化成了可测口径。** |
| **P1-3** | 口径不一致 + `RunnerScreen.tsx:57` 假文案 | **✅ 闭环** | 我重读 `src/features/runner/screens/RunnerScreen.tsx:57`，原文 `'确定要结束当前流程吗？已经完成的部分不会保存。'` **逐字确认仍在**。Plan **L68** 要求完成页/Runner 现显示的是**含转场流程用时**、统计是**动作有效时长**（与我 R1 的 `runnerTime.ts:33-44`＋`runnerMachine.ts:254` 判断一致），**L29/L67/L80** 三处要求按 HD-2 改成事实且「DoD 必须真机可见，不能只写在说明里」。HD-6（L182-188）把「并列展示 vs 只改标签」摆给用户。 |
| **P1-4** | 双语范围会外扩 | **✅ 闭环** | 我实测 `rg "t\('"` 确认 `RunnerScreen.tsx` / `CompletionScreen.tsx` **零 i18n 接入**（仅 `navigation.reset` 误命中），`HomeScreen.tsx:50-51` 已走 `t('home.title')`＋`headerRight` 两入口 —— **R1 前提全部为真**。Plan **L70** 要求新增反馈不得混语或省略，**HD-7（L190-196）** 摆出 A/B 两案，且两案都硬性要求计入/未计入/提前结束反馈随语言正确显示。 |
| **P1-5** | 旧种子永久「未分类」 | **✅ 闭环** | 我重读 `src/data/seeds.ts:631-671`，确认 `repairSeededRoutines` 由 App 自己 `insertSeedRoutine` 补插、`hasClearedMarker` 短路、已存在行按**目录名**判存在 —— **「App 新插入的行可安全赋类型」这条路客观存在，R1 判断成立**。Plan **L69** 正是这个口径：新装机播种与 repair 新插入行可按种子定义写类型、既存 9 行与用户行保留 NULL/UNCLASSIFIED、`seed_examples_cleared` 时绝不复活。**HD-5（L174-180）** 摆出 A/B/C。 |
| **P1-6** | `stats_state_json` 与 `SessionSnapshot` 双真源 | **✅ 闭环（且优于 R1 要求）** | Plan **L56** 取消 `stats_state_json`、**不留 JSON/列二选一的自由裁量**；A/B 升 `SessionSnapshot` 到 v2，**`decodeSnapshot` 显式接受 v1 并全部解为 UNCLASSIFIED**。我重读 `src/domain/session/SessionSnapshot.ts:16`（`ACTIVE_SESSION_SNAPSHOT_VERSION = 1`）与 `:114-116`（`value.version !== ACTIVE_SESSION_SNAPSHOT_VERSION` 直接 fail）—— **R1 强调的「改造时不许丢这步」被原样保留**。**L57** 另把运行累计改为 `active_session` 固定标量列（`stats_total_step_ms` / `stats_accounted_phase_ms` / `stats_eligible`，A/B 再四个分类标量），**明确「不在不可变快照里维护运行账本」** —— 这是 R1 建议的方向，比 R1 自己的措辞更干净。 |
| **P1-7** | 缺删除/重置/导出决策 | **✅ 闭环** | Plan **L86** 把「编辑历史类型/日期」整条移出 In Scope 并注明「破坏不可篡改性，从 P1 候选删除」（= 采纳我的砍项建议）；**HD-4（L166-172）** 摆出 A/B/C/D 四案，并写明「清除示范数据只影响示范流程，不清训练历史」—— 我实测 `seeds.ts:673-682` 的 `clearSeededExamples` 确实只删 `SEED_ROUTINE_NAMES`/`LEGACY_SEED_ROUTINE_NAMES` 命中的流程与动作，**先例成立、两者边界清晰**。**L113** Risk 写明「清示范数据不等于清统计」。 |
| P2-1/2/3/4 | 双索引 / `accounting_version` / `end_utc_offset_min` / `OTHER` | **✅ 闭环** | **L55** 只建 `idx_session_history_date(end_local_date, ended_at_wall_ms DESC)`，最近 10 条靠小表排序扫描；`accounting_version` 与 UTC offset 列**已删**（L55 明写「不存 `end_utc_offset_min`，本期无读取方」）；枚举收到 `STRETCH/RELAX/CORE/UNCLASSIFIED`。**四刀都砍对了**（详见第四节）。 |
| P2-5 | 未评估 `bodypart` | **✅ 闭环** | 我重读 `src/data/migrations/index.ts:113-131`，v3 确为纯 `ADD COLUMN`、`routines.bodypart TEXT` 存在、且 `category` 与 `bodypart` 在同一 migration 里被混装 —— **R1 判断为真**。Plan **L44** 给出的理由（部位与训练意图正交、部位可多值、汇总易重复计数）是**真实且技术正确**的（v3 注释自述 multi-value 用逗号分隔），不是敷衍。 |
| P2-6 | 12h stale 未进 Risks | **✅ 闭环** | 我重读 `src/features/runner/services/sessionRecovery.ts:32`（`MAX_RECOVERY_AGE_MS = 12 * 60 * 60 * 1000`）与 `:85-87`（`phase start is in the future` / `session is stale` 两条 discard）—— **两条路径均已进 Plan L65 通知清单、L108 Risk、L76/L78 DoD**。 |
| P2-7 | 「旧 UPDATE 复活已删行」机制说错 | **✅ 闭环** | 我重读 `src/data/repositories/sessionRepository.ts`：确实是无条件 `UPDATE ... WHERE id = 1` 后再 `SELECT` 查存在性、查不到抛 `PersistenceError` —— **不会复活**，R1 判定为真。Plan **L58** 已改为「真实顺序风险是完成页**先渲染、后提交**；DELETE 后旧 UPDATE 影响 0 行并报错，不会复活会话」并追加「要串行化写队列，避免假成功」。**机制改对了，且补了我 R1 没提的串行化要求。** |
| R1 遗漏 4/8/9/10 | HD-4~HD-8、伪码先审、STOPPED 反馈 | **✅ 全部闭环** | **HD-4**（L166）、**HD-5**（L174）、**HD-6**（L182）、**HD-7**（L190）、**HD-8**（L198，保留期/「仅存本机」声明）全在；**L49**「Builder 改代码前交 tick/Skip/Previous/Pause/Stop/Complete/后台 catch-up 的结算与持久化伪码，Code Reviewer 先审」= 我 R1 Unverified Item 2 与遗漏段第 9 条的原样落地；**L67**「HD-2=A 时 STOPPED >0ms 归档，返回首页提示『本次动作有效时长已计入』」= 遗漏段第 10 条落地。**另**：Plan L82 主动写入「新包/新 bundle 覆盖安装」+ L81「人工改时区不充当可靠跨天证据」—— 对齐了 `经验一句话.md` 2026-09-19 的 Metro 陈旧 bundle 教训与 ENV-018-1，**这一条我没要求，是它自己想到的**。 |

## 二、是否引入新 P0（含 TM 点名的「R006 前置是否等于新 P0」正面回答）

**结论：未引入新 P0。P0 = 0。但新增 1 条 blocking P1 与 3 条非阻塞 P1/P2。**

**正面回答 TM 的核心疑问 ——「把 R006 列为发布前置」是否等于把统计功能的成败挂在另一个未开工的 P0 上：**

1. **两者的区别是「依赖被显式登记 + 有硬发布闸」还是「依赖被藏起来」。** Plan **L18/L25/L88/L97/L106** 五处一致地写明：R006 真机真实 monotonic + 可信 boot 身份是**发布前置**、**未完成只可隔离开发、不得上线宣称时长可靠**、TASK-021-R006 已在 Task Breakdown 登记为「P0 发布前置 / 原任务 / NOT_STARTED / 本任务不代做」。**R1 的 P0 恰恰是「藏起来」**（把 `FakeMonotonicClock` 单测当真机证据用），R2 是「摆到台面上并锁死发布闸」。同一件事，两种性质。
2. **不构成死锁。** R006 与 TASK-021 **无双向依赖**：R006 属于既有 native hardening 波（`HANDOFF.md:16` P0-5、`§2.1.2` 建议单独开 Wave，先建 `modules/stretch-runtime` 暴露 `nowElapsedMs()` / `getBootCount()`），它不等待统计的任何产出。R006 是**单向被依赖方**，开工即可推进。
3. **不构成无限期挂起的「新 P0」**，但**确实有一个排期空洞**——见 **P1-A**。R006 目前在 HANDOFF 里是「待排期、无责任人」，而 Plan 允许「统计可隔离开发」，两者相加的后果是：**B1/B2 全部写完、测试全绿、真机验收通过，然后发不出去，且没有日期。** 这是**必须在 Human Gate 前解决**的（否则等于请用户批准一个交付日期未知的功能），但它是**一条可以在本卡内写清的排期/门禁条款**，不是需要重新论证的设计缺陷。所以我判它 **P1（blocking）而非 P0**。

**新增问题清单：**

| # | 级别 | 问题 | 依据与要求 |
|---|---|---|---|
| **P1-A** | **blocking** | **R006 依赖无排期、无责任人、无最小切分；Plan 允许「隔离开发」但没写「隔离开发的前置门」。** 结果：统计功能可能开发完成却无限期不可发布。 | `HANDOFF.md:16` P0-5「待排期」、`:77` R006 需新建 native module 暴露 `nowElapsedMs()`/`getBootCount()`；`HANDOFF.md:18` 原生波与 UI 功能「不要混做」。Plan `L18/L88` 只写「未完成可隔离开发」。**要求二选一并写进本卡**：①TM/编排者给 R006 或其**最小切片**（只做 `nowElapsedMs()` + 真实 boot 身份，不带 FGS/Doze）排期并落责任人；②或本卡明确 **「R006 未排期前不得启动 B1/B2 开发」**，把依赖从「发布前置」前移为「开发前置」。二者都可行，但必须挑一个，不能既说可隔离开发又不说何时必须真。 |
| **P1-B** | **blocking** | **HD-1 = D 档没有自己的 DoD 与验收行。** 现有 DoD 表 `L80` 写「总数＋最近 10 条；**A/B 分类和=总数**；…」—— D 档**没有类型列、没有 `session_history_type_totals` 明细表**，「分类和=总数」这条断言在 D 下**不成立也无法测**。若用户选 D，Builder 会拿着 A/B 的 DoD 开工，验收无的放矢。 | 方案自己在 `L40/L55` 明确了 D 的增量是「一张表、一列累计值、零枚举/零 UI/零明细」，**却没同步收 DoD**。**要求**：DoD 表按 A/B/D 分列或加一列「D 档适用性」，D 档的验收证据应替换为「单表单列、`total_step_ms` 非负且单调、10 条排序稳定（`ORDER BY ended_at_wall_ms DESC, session_id DESC`）、无分类列/无明细表」等**可在 D 下真跑的断言**。 |
| **P1-C** | **blocking** | **`stats_eligible=0` 的「因版本切换未计入」与异常丢失共用同一条通知路径，未分流措辞。** 存量用户升级后，正在进行的会话在终态时按 `L57` 判为「不补造升级前训练并提示未计入」——**这是一次预期内的、非故障的排除**，却与「进程被杀/改钟/归档失败」弹同一条「上次训练有一段未计入统计」。发版首日几乎所有存量会话都会弹这条告警，**直接摧毁 P0-2 刚刚建立起来的数字可信度**（用户看到满屏「未计入」，第一反应是「这统计不可信」而不是「哦升级前那段不算」）。 | `L57`（`stats_eligible` 默认 0、既有行保持可恢复、终态不补算并提示）＋ `L65`（所有丢弃入口统一产生「未计入」结果、可关闭）。**要求**：通知必须区分**预期排除**（版本切换/0ms/ERROR 不可信区间）与**异常丢失**（进程死亡/boot 不符/stale/损坏/归档失败）两类措辞与视觉权重；且统计页的「合计可能低于实际练习」caveat 只对异常类生效，**预期排除不得计入「有未计入时段」的提示**。这条成本极低（只是分流），但不做就会把 P0-2 的成果作废。 |
| **P1-D** | 非 blocking | **「未计入通知」的持久化载体未指定**（新表？`app_settings` 键？`active_session` 列？），而它是 P0-2 闭环的唯一落地机制。 | `L65`「先持久化通知原因和发生时间，再清活动行」未指定落点。我已核实 `resetSchema()`（`migrations/index.ts:173-179`）是**硬编码表名数组**、新增表必须同步登记，否则测试库与真机库结构漂移。**要求**：本卡定死载体（建议独立小表，因需「原因+时间+已读位」），并写明纳入 v4 migration 与 `resetSchema()`。 |
| **P2-1** | P2 | **HD-1 = D 与用户原话诉求的冲突在 Product Goal 顶层未标为「诉求降级」。** | `L10` 只写「是否首发即分类由 HD-1 决定」，语气偏中性；虽在 `L40`（表内 D 行「本期不能回答三类各练多久」）与 `L148`（HD-1 说明「D 首发不能回答三类各练多久」）**两处已诚实呈现**（我认可这已满足「诚实呈现」底线），但建议 `L10` 直接写明「**若选 D，则用户原始诉求『三类各练多久』在首发不被满足，需用户明确接受该降级**」，避免用户在 Gate 上误以为三类一定会交付。 |
| **P2-2** | P2 | **HD-5 选项行与说明行不一致**：说明里出现「D 无此问题」，但【请你决策】只列了 A/B/C。 | `L174-180`。建议在选项行补一行 D（= 不适用/自动满足），否则用户在决策框里找不到 D。 |
| **P2-3** | P2 | **「可关闭通知」与「统计页常驻 caveat」的边界未定**：用户关掉通知后，统计页的「有未计入时段，合计可能低于实际练习」是否仍在？ | `L65` 给了「可关闭通知」，`L80` 又要求「未计入时段可见」。需明确二者是同一开关还是两个，否则 Builder 会自行解释（很可能出现「关掉通知＝caveat 也没了」，那就把 P0-2 需要的诚实性关掉了）。 |
| **P2-4** | P2 | **`total_step_ms` 列名与对外措辞未统一**（列名像「总步数毫秒」，对外叫「动作有效时长」）。 | `L55` vs `L68`。低风险，但两处措辞漂移正是 R1 P1-3 的同类病根，建议统一为「动作有效时长 / effective step ms」。 |

## 三、8 条自述 · 逐条独立验证（不采信自述）

| # | Planner 自述 | 我的独立验证 | 结论 |
|---|---|---|---|
| 1 | 承认 `MonotonicClock.nowElapsedMs()` 就是 `Date.now()`；R006 + 真机改钟验证列为发布前置；不再拿 fake clock 当真机证据 | **实测为真。** `MonotonicClock.ts:36-42` 原文 `return Date.now()` 与 TODO 均在；Plan `L19/L50/L76/L106` 四处一致声明 | **✅ 真** |
| 2 | 承认 `BootInfo.bootCount = Date.now()` 实为进程身份、进程重建是常见丢弃路径；要求区分「同 boot 进程重建」与「真重启」；所有未计入时段产生可见提示 | **实测为真。** `BootInfo.ts:29` `private readonly bootCount = Date.now();` 在（且类名 `ExpoGoBootInfoProvider` 自带 "Expo Go fallback" 语义）；`startRoutineService.ts:82-90` 注释原文含 "without announcing anything"。Plan `L51/L65` 要求区分 + 可见提示 | **✅ 真**（**唯一提醒**：「同 boot 进程重建 → 审慎恢复」里的「审慎」仍是模糊词，落地时 R006 必须给出可判定的 boot 身份，否则会退化成「一律丢弃」，而 Plan `L51` 末句「仍无法判别时保守丢弃并告知」已给了可接受的下限，故不升级为问题项） |
| 3 | 已改判 **CHANGE_REQUEST: C**（局部受控重开 + 新 Plan 版本 + 新 DEV_BASELINE，不全量重跑，不动 native hardening 挂账） | **实测为真。** `L4` C、`L17` 完整路径、`L18` 「R004–R006、R022–R034 native hardening P0 保持挂账与优先级，本轮不动其代码或计划」。我**独立重查** `PRODUCT_PLAN_V1.2.md:36/:68/:154` 三处排除条款**逐字存在** | **✅ 真**；且**我独立判定同为 C**（见下节） |
| 4 | HD-1 补 D 选项（零分类、只做总时长与最近记录、约 A 的一半工作量） | **实测为真。** `L36-40` D 行完整存在，含成本标注「1.0×，约 A 一半」与代价；`L42` 声明相对量级**非实测工时**（诚实标注） | **✅ 真**（唯一保留：**「约 A 一半」未实测**，但已标注，我不据此扣分——真正决定 D 成本的是 `total_step_ms` 标量账本仍要做，这部分 A/D 完全相同，所以「一半」很可能**偏乐观**；建议在 Human Gate 上把这句话改成「D 省掉的是编辑器 UI、种子类型定义与明细表，不省标量账本」——**列为 P2 级提醒，不单列**） |
| 5 | 新增 HD-4~HD-8：删除/重置/导出、旧流程批量归类、两个时长口径对外统一、完成页+Runner 本地化范围、历史保留与本机声明 | **实测为真。** HD-4 `L166`、HD-5 `L174`、HD-6 `L182`、HD-7 `L190`、HD-8 `L198`，五项全在且各带 A/B(/C/D) 选项与影响说明 | **✅ 真**（HD-5 选项行漏 D 见 P2-2） |
| 6 | 砍过度设计：删双份步骤真源、第二索引、`accounting_version`、`end_utc_offset_min`、枚举 `OTHER`、日/周/月三档+三窗口+趋势条；移除「用户编辑历史类型/日期」 | **逐条实测，全部找到落地文字**：`L56`（取消 `stats_state_json`、唯一真源 SessionSnapshot v2）、`L55`（仅一个日期索引、删 offset 列、枚举收到四值）、`L87`（三档/三窗口/趋势条/打卡/目标率/部位平衡/备注/复杂图表全入 Out of Scope）、`L86`（编辑历史类型/日期整条移出并注明「从 P1 候选删除」）。**`accounting_version`**：全文件 `rg` 无该词 → **确已删除** | **✅ 真，八刀全砍**（砍得对不对见第四节） |
| 7 | 收敛首发范围：累计动作有效时长 ＋ 最近 10 条，分类能力依 HD-1 决定 | **实测为真且一致。** `L28` Stage P0「首发仅『累计动作有效时长＋最近 10 条』」、`L34-40` 三档表、`L55` 最近列表 `ORDER BY ended_at_wall_ms DESC, session_id DESC LIMIT 10` | **✅ 真** |
| 8 | 补上必成假话的文案：`RunnerScreen.tsx:57`「已经完成的部分不会保存」在 STOPPED 也归档后即为假话 | **实测为真。** `RunnerScreen.tsx:57` 原文逐字确认仍在；Plan `L29`（Stage P0 要求改）、`L67`（「随之改」）、`L80`（DoD「Runner 假文案已改」）、`L124`（处置表）四处覆盖 | **✅ 真** |
| 9 | 自评 Readiness 78/100，承认未达 ≥90 Gate | **我的独立打分 = 74/100**（见下表），方向一致、绝对值接近 | **✅ 诚实**（Planner 没有虚报分数加分，这一点值得肯定） |

## 四、砍掉的是否砍对了

**八刀全砍对，没有误砍「首发必须」的东西，也没有留下无价值的东西。** 逐条判：

| 砍项 | 我的判定 | 依据 |
|---|---|---|
| `stats_state_json`（双真源） | **砍对** | 改用「SessionSnapshot v2 管类型不可变快照 + `active_session` 固定标量列管运行账本」，是**两件事分两份存储**而非两份真源 —— 概念上比 R1 的建议更干净，且不丢 v1 兼容那步 |
| 第二索引 `idx_session_history_recent` | **砍对** | 我算过：一年按每天 3 场 ≈ 1100 行，`LIMIT 10` 排序扫描在千行级 SQLite 上是微秒级；双索引只会增加每场归档的写放大 |
| `accounting_version` | **砍对** | 全库单版本、无重算需求、本期零读取方。`rg` 确认已从全文消失 |
| `end_utc_offset_min` | **砍对** | 「换时区不重排旧日」已定为产品承诺（`L60`），该列没有读取方；保留它就是保留第二个「本地日期」定义，正是 R1 P1-6 那类双真源病的温床 |
| 枚举 `OTHER` | **砍对** | 收到 `STRETCH/RELAX/CORE/UNCLASSIFIED`。`UNCLASSIFIED` 是**诚实信号**（明确「不知道」），`OTHER` 是垃圾桶（把「不知道」伪装成「其他」）—— 两者语义相反，砍 `OTHER` 是把诚实性往前推了一步 |
| 日/周/月三档 + 三窗口 + 趋势条 | **砍对** | 我 R1 的外部依据（Stretch Day / Flexor / Voice Stretch Guide / MuChills 四家留存核心＝连续打卡 + **一个总时长** + 日历/热力图）支持：总时长是第一梯队，日/周/月分桶是第二梯队。而 Plan 已经**主动承认**分桶依赖 `end_local_date` 正确性 —— 在时钟 P0-1 尚未解决、发布还压在 R006 上的前提下砍掉分桶，是**正确的风险排序** |
| 「用户编辑历史类型/日期」 | **砍对，且应更彻底** | 允许改历史日期直接摧毁「历史不可篡改」。移到 Out of Scope 并注明「破坏不可篡改性」是对的 |
| 真机跨天显示语义验证 | **降级对** | 人工改时区在真机上不可靠复现；`L81` 保留「旧记录不重排/不崩」+ 单测覆盖跨午夜/时区/负 offset，是正确的证据分级 |

**但我点名两项「首发必须」被砍得过头/砍得不够**（都不构成 P0）：

1. **「归档可信度」没有被砍，但被削弱了** —— 「可见提示」机制在（`L65`），**可解释性**也在（`L80`），这两项正是我 R1 说的不能砍的。**削弱点**：`stats_eligible` 预期排除与异常丢失不分流（P1-C）——**这实际上是把 P0-2 刚建立的信任在发版首日就打折**。所以「归档可信度」不是被砍了，是**接缝没打磨**，而这正是 P1-C 存在的理由。
2. **「统计可解释性」没有被砍** —— HD-6（两个时长口径）+ 通知可读简明原因 + 统计页 caveat 都在。**唯一缺口**是 P2-3（caveat 与「可关闭通知」是否同开关），属打磨级。

**结论：砍对了。** 本轮 Plan 的范围收敛（从「5 枚举 × 3 档周期 × 3 窗口 × 趋势条 × 最近 20 条」收到「累计有效时长 + 最近 10 条」）是**正确的风险排序**，不是偷工。

## 五、Change 等级独立判定

**独立判定：Change C（与 Planner 改判一致，但我是自己重查后得出的）。**

本轮我按 TM 要求**重新独立核了** `docs/pm/PRODUCT_PLAN_V1.2.md` 三处：

- `:36`（Out of Scope）「不建立 SessionSnapshot 历史表或两张 snapshot 表；V1.1 没有历史会话查询需求。」→ 原文确认
- `:68`（技术取舍）「一个 ActiveSession 足够，V1.1 不需要历史会话查询；因此单例表内 snapshot JSON 是最小合理方案。」→ 原文确认
- `:154`（P2 首项）「历史会话查询、SessionSnapshot 独立历史表、跨设备同步、云备份与更多 OEM/语音引擎扩展矩阵。」→ 原文确认

**理由（与 R1 一致，未因 Planner 改判而松动）**：

1. **`:154` 的「历史会话查询」是本任务本身**（不是它的近亲），且不带任何限定语 —— TASK-021 交付的就是历史会话查询 + 一张历史表。P2 首项被开发期做掉，是基线被无声绕过。
2. `:36` 的字面窄读（只指「可恢复旧会话的 snapshot 表」）**救不了这个等级**，但它确实说明越界程度比想象的轻 —— 这一点我在 R1 已诚实列出，Round 2 维持。
3. **即使只做 D**（一张表一列累计值），仍然：新增历史表、新增终态归档链、新增页面、把能力移出 Out of Scope/P2。**改动量减半不等于等级下降** —— 等级看的是「基线是否还描述产品」，不是工时。
4. AGENTS.md:9 的 C 是「**局部暂停**＋Sol Planner＋Research Reviewer＋Human Approval＋新版本＋新基线，**不全量重跑**」，成本低；本任务不碰挂账中的 native hardening，重开范围天然局部。**Plan `L17` 给的路径与 AGENTS.md:9 逐项对齐，我核对无误。**

**给 TM 的执行提醒**：`HANDOFF.md:8-13` 仍是 `PROJECT_PHASE: DEVELOP` / `DEV_BASELINE=PRODUCT_PLAN_V1.2` / `CHANGE_REQUEST: B`（B-2/B-3/B-4），**尚未反映 TASK-021 的 C 判定**。Plan `L5` 已诚实声明「HANDOFF 尚未更新，不声称阶段已切换」—— 这点做得对，但**在 Human Gate 前 TM 必须把 HANDOFF 的 PROJECT_PHASE 切到 `PLAN_REOPEN_REQUIRED` 并把 CHANGE_REQUEST 更新为 C**，否则治理字段与实际状态长期不一致。

## 六、收敛后的首发范围是否满足用户原话诉求 —— 明确判断

**用户原话诉求**：「总共拉伸了多长时间、放松了多长时间、核心训练了多长时间」——**三个分类型的时长**。

**我的明确判断：**

| HD-1 选定 | 是否满足原话诉求 | 判定 |
|---|---|---|
| **A（步骤级）** | **满足，且唯一能对混合流程给出正确答案** | ✅ 达标 |
| **B（流程级）** | **基本满足，但混合流程会失真**（一场含拉伸+放松的流程只能整体归一类）。方案已要求「失真须可见提示」（`L39`），属**有损满足**，需用户知情接受 | ⚠️ 有条件达标 |
| **D（零分类）** | **不满足。** D 只能回答「总共练了多久」，**完全无法回答「拉伸/放松/核心各多久」** | ❌ **未满足** |

**这个矛盾是否被诚实呈现给用户？—— 是。** 我逐处核过，**三处**都已明写，不是藏在脚注里：

- `L40`（HD-1 表 D 行代价列）：「**本期不能回答三类各练多久**；未来不能准确拆分 D 期间旧记录」
- `L148`（HD-1【说明】）：「D 首发不能回答三类各练多久，后续不能精确回拆旧记录」
- `L40` 尾 + `L42`：D 被列为「完整首发候选」而非「降级凑合」，且明确「不预设 A 更优」

**且方案没有偷偷替用户选 D** —— `L23` Stage P0 第一条就是「用户拍板 HD-1/2/4/5/6/7…**未拍板不选 A/B/D、不定删除能力**」，HD-1 明确「本卡不代用户选」（`L140`）。这是**正确的处理方式**：把「要降级」这件事摆在决策框里，让用户自己拍。

**但我要给 TM 一条明确的转达要求（这是 TM 的活，不是 Planner 的）：**

> 当把 HD-1 拿给用户时，**必须用一句大白话把矛盾挑明，不能只把 A/B/D 三个按钮摆上去**：
> **「你当初说的是『拉伸多久、放松多久、核心多久』这三类分开看。选 D（最省事）的话，App 只能给你一个『总共练了多久』，三类分不出来，而且以后也补不回来（老数据没法精确回拆）。要三类，就必须做 A 或 B，工作量大概是 D 的一到两倍。」**

**My independent recommendation（供用户参考，非我替用户决定）**：**选 A 或 B，不建议 D。** 理由：①用户明确点名了三类，D 直接不满足原始诉求；②Plan 自己在 `L42` 承认竞品的留存第一屏就是「一个总时长」，但那是**竞品在没有用户明确分类诉求时的做法**，本项目的用户诉求已经不同；③D 的「省下的一半工作量」省不掉标量账本（`stats_total_step_ms` / `stats_accounted_phase_ms` / `stats_eligible` 三列 A/D 完全相同），省掉的只是编辑器 UI、种子类型定义与明细表 —— **省不到一半，且省掉的是让功能真正有用的部分**；④D 之后升级到 A/B 时，**D 期间的历史记录无法精确回拆**，会留下一个永久的「分类不完整」空洞，反而损害 P0-2 刚建立的可信度。若用户坚持要最小步，**B（流程级）是更好的中间点**（1.4× D，实现分类，成本介于两者之间，失真仅限混合流程且有可见提示）。

## 七、仍需用户拍板的决策点 · 最终清单

> 以下可直接转给用户。**均为待人工确认，本卡不代选**（Plan `L140`）。★=阻塞实施；☆=非阻塞但需记录。

### ★ HD-1（阻塞）首发分类做到哪层？

**【请你决策】**
- **A 步骤级**：流程默认类型 + 步骤覆盖，混合流程能准确拆三类
- **B 流程级**：每场流程只选一类，混合流程分类会失真（须可见提示）
- **D 零分类**：先只做「全部累计 + 最近 10 条」，三类后续再补
- （C 复用现有 `category`/名称映射：**语义不可靠，仅列不建议**；你若仍选 C，须先重审口径）

**【说明】**
- 相对工作量（非实测工时）：**A ≈ 2.0×｜B ≈ 1.4×｜D = 1.0×**。三者都要解决原子归档、`session_id` 幂等、时钟、跨进程这四件难事。
- **关键取舍**：D 省掉的是「两层编辑器 UI、种子类型定义、分类明细表」，**省不掉**运行标量账本（三列 A/D 完全相同）。
- **D 的代价（请务必看清）**：**D 首发无法回答你原话里的「拉伸多久、放松多久、核心多久」三类**，只能回答「总共练了多久」；且**未来升级到 A/B 时，D 期间的历史记录无法精确回拆三类**，会留下永久的分类空洞。
- 我的建议：**A 或 B**（B 是折中）；若你只想先看最小可用，选 B。

### ★ HD-2（阻塞）主动结束算不算？

**【请你决策】**
- **A**：实练动作时长 > 0 就计入，标「提前结束」
- **B**：只计正常完成，主动结束明确告知不计

**【说明】**
- A 更贴近「总共练了多久」（你原话的第一句）；B 更贴近「完成量」。
- 两案共同：0ms、ERROR 状态、不可信时段均不计；都会改掉 Runner 结束弹窗里那句「已经完成的部分不会保存」（`RunnerScreen.tsx:57`）。

### ★ HD-4（阻塞）历史记录可删 / 重置 / 导出吗？

**【请你决策】**
- **A**：本期只做「清空全部统计」+ 二次确认
- **B**：本期还能删单条
- **C**：本期不可删，清除/导出都后置
- **D**：本期还要本地导出

**【说明】**
- 设置页已有的「清除示范数据」**只删示范流程，不清训练历史** —— 两者入口、文案、事务完全分开，不会互相误伤。
- 删除会**永久改变累计数字**；导出需另定格式与分享位置。
- 不设能力的后果：一旦本机存了「我练了多少」，用户迟早会想要删除权。

### ★ HD-5（阻塞，仅当 HD-1 选 A/B）已有流程怎么补类型？

**【请你决策】**
- **A**：已有 9 个示范流程 + 你的自建流程先记「未分类」，你逐个进编辑页设置
- **B**：做一次性批量确认界面，你选类型后批量写入
- **C**：本期长期允许「未分类」，给提示 + 编辑入口
- **D**：不适用（D 方案无分类维度，本项自动消解）

**【说明】**
- 新装机、以及 App 自己重新补插的示范流程，**可以安全自动写入类型**。
- 但**已存在的 9 行不能凭名字或随机 ID 认定**是种子（有历史改名案例，如「办公室肩颈放松→办公室久坐放松」），**所以不会替你猜**。
- A 至少要手动编辑 9 次；B 多一个确认页和批量事务；C 最省事但统计页会长期挂「有未分类」。

### ★ HD-6（阻塞）两个时长口径怎么对外？

**【请你决策】**
- **A**：完成页**并列展示**「流程用时（含转场）」与「动作有效时长」；Runner 标「流程已用」；统计页只累计后者
- **B**：完成页只把「流程用时」标签改清楚，统计页醒目解释差异

**【说明】**
- 完成页的「用时 20:00」**含转场**、统计页的「17:30」**只算动作实跑** —— **两个数都可以是对的**，但用户看到不一致会当 bug。
- A 最清楚、改动稍大；B 更轻，但要真机确认说明足够醒目。
- **注意**：本项在 HD-1 选 D 时同样适用（两个数依然都在）。

### ★ HD-7（阻塞）完成页 / Runner 的本地化范围

**【请你决策】**
- **A**：本轮把涉及的完成页与 Runner 文案统一接进中英字典
- **B**：只新增独立双语通知来承载统计反馈，旧页其他中文另排期

**【说明】**
- 完成页与 Runner **当前全是硬编码中文、完全没接 i18n**（只有首页接了）。
- 「已计入 / 未计入 / 提前结束」这些反馈必须落在完成页上 —— 不定范围，Builder 会自行混语或直接跳过反馈。
- 两案都硬性要求：反馈随中英切换正确显示，**不得中英混语或省略**。B 另须验通知在「完成页」与「返回首页」两处都可见。

### ☆ HD-3（非阻塞）入口放哪里？

**【请你决策】** **A**：首页内容区加一张卡片 ｜ **B**：首页右上角 ｜ **C**：常驻主入口

**【说明】** A 不挤右上角既有的「动作库/设置」两个入口；B 须真机验小屏是否拥挤；C 改动最大。

### ☆ HD-8（非阻塞）历史保留与本机声明

**【请你决策】** **A**：不设上限，页面标「仅存本机，卸载或清数据会丢失」 ｜ **B**：设保留期/数量上限并指定数值

**【说明】** 一年数千场量级适合本地小表；B 会**改变「累计」这个数字的含义**，需额外说明与测试。

### ☆ HD-9（我本轮新增，非阻塞但建议一起拍）本卡要不要顺带纳入 V1.3 基线之外的 native 排期？

**【请你决策】** **A**：把 R006（真实单调时钟 + 真实 boot 身份）**排期并指定责任人**，统计功能开发与发布都等它 ｜ **B**：统计开发先行、发布后置（现状＝ Plan 的写法）

**【说明】**
- R006 目前在本项目是「待排期、无责任人」的挂账 native 工作，需要新建 Android native module。
- 选 B 的话：**统计功能会开发完成、测试全绿、真机验收通过，然后发不出去，且没有日期。**
- 我建议 A（或至少给 R006 切一个「只做 `nowElapsedMs()` + boot 身份」的最小切片单独排期），理由见 P1-A。

## 八、Readiness Score（我的独立打分）

口径依 `docs/pm/PRODUCT_PLAN.template.md:24-32`。

| 分项 | 满分 | R1 | **R2（我）** | 理由 |
|---|---|---|---|---|
| 产品目标与用户需求 | 20 | 14 | **15** | 目标清晰、离线/不伪装有原则、旧数据不可回溯如实告知；HD-1 三档把「要不要降级诉求」摆给用户。仍缺真实使用反馈与目标用户访谈；D 降级未在 Product Goal 顶层标为「诉求降级」（P2-1） |
| 核心方案完整性 | 20 | 15 | **18** | 归档触发点、丢弃通知、日期推导、存储形态、编辑范围、伪码先审门禁**全部收口**，且给出了可施工的机制（标量水位 + 事务入口 + 串行化写队列）。扣分：R006 依赖无排期/无门禁（P1-A）、D 档无 DoD（P1-B）、通知载体未定（P1-D） |
| 外部事实与竞品验证 | 20 | **5** | **8** | **仍零自有外部来源、零竞品、零用户反馈。** 我 R1 补的 Hermes Intl 与四家竞品证据**被方案沿用并转化成了可测口径**（算术日期、砍分桶、承认「总时长是第一屏」），故给 8；但「沿用」不等于「独立验证」，仍远低于该项应有的 20 分基线 |
| 技术可行性 | 15 | 9 | **12** | additive v4（我已验 v3 全 `ADD COLUMN`）、算术日期绕开 Intl、标量账本、事务归档、`session_id` 幂等我逐条验过成立。扣分：发布可行性完全绑定未排期的 R006 |
| 风险与异常场景 | 10 | 6 | **9** | 8 条 Risk，改钟/跨进程/stale/归档失败/时区/旧种子/旧历史/本机保留全部写实；最关键的两条从「安全策略」改写为「发布阻塞」与「当前常态」 |
| 开发范围与 DoD | 10 | 7 | **8** | 范围真收敛到「累计 + 最近 10 条」且八刀砍对；主动引入「新 bundle 覆盖安装」证据门禁（对齐 Metro 陈旧 bundle 教训）。扣分：D 档 DoD 缺失（P1-B） |
| 未决问题 | 5 | 2 | **4** | 8 个 HD 全摆出、每项选项与代价清楚、C 选项明确标「不建议」而非偷偷删。扣分：HD-5 选项行漏 D（P2-2） |
| **合计** | **100** | **58** | **74** | Planner 自评 78，方向与量级一致 |

**Gate（`PRODUCT_PLAN.template.md:32`）**：`Readiness >= 90` **AND** `P0 = 0` **AND** `blocking P1 = 0` **AND** 关键事实已验证 **AND** 核心假设已合理验证
→ **P0 = 0 ✔｜blocking P1 = 3 ✘｜Readiness 74 < 90 ✘ → 不进 Human Gate。**

**适用性声明（同 R1，须记账）**：本卡是 `PLAN.template` 形态的 Change 卡，**形式上的 Readiness Gate 落在 TM 将要产出的 V1.3 级产品计划上**，不是这张卡。但既然 TM 要求按变更评审独立判定，我把「本卡能否作为 V1.3 草案的输入」当作门：**上述 3 条 blocking P1 未闭环前，不应把 V1.3 草案摆到用户面前。**

## 九、Next Action

**回 Planner 做 Round 3（轻量修订，只补 3 条 blocking P1，不重开任何论证）**：

1. **P1-A**：二选一并写进本卡 —— ①给 R006（或其只做 `nowElapsedMs()` + 真实 boot 身份的最小切片）排期并落责任人；②或明确「R006 未排期前不得启动 B1/B2 开发」，把依赖从发布前置前移为开发前置。
2. **P1-B**：DoD 表按 A/B/D 分列（或加「D 档适用性」列），补 D 档可真跑的验收断言。
3. **P1-C**：通知按「预期排除（版本切换 / 0ms / 不可信区间）」与「异常丢失（进程死亡 / boot 不符 / stale / 损坏 / 归档失败）」分流措辞与视觉权重；统计页 caveat 只对异常类生效。

**顺带（非阻塞，可一并带上）**：P1-D（通知载体落点 + 纳入 v4 与 `resetSchema()`）、P2-1（D 降级在 Product Goal 顶层标明）、P2-2（HD-5 补 D 行）、P2-3（caveat 与「可关闭通知」是否同开关）、P2-4（`total_step_ms` 措辞统一）。

**TM 侧的并行义务（不属 Planner）**：
- 在 HANDOFF 里把 `PROJECT_PHASE` 切到 `PLAN_REOPEN_REQUIRED`、`CHANGE_REQUEST` 更新为 C（现仍写着 DEVELOP / B-2·B-3·B-4）。
- 把 HD-1~HD-9 一次汇总给用户，**HD-1 必须用第六节的「大白话矛盾说明」转达**，不能只摆三个按钮。
- Round 3 通过后，产出 V1.3 级增量产品计划（把历史统计移入 Functional Scope、补 Requirement/DoD、写清与 P0-5 native hardening 的相对优先级），再走 Human Approval 与新 `DEV_BASELINE`。

**一句话总评（R2）**：**R1 的三条 P0 不是被话术化解的，是被真的修掉了 —— 尤其 P0-2 从「把漏洞写成原则」变成了一条带机制、带落点、带真机取证动作的硬需求，这是本项目见过的最诚实的一次自我修正；R1 的七条 blocking P1 全部有对应落地文字，无一条只是「已知悉」。** 剩下的三条是排期归属、一张表的验收行、一处文案分流 —— **补完即可进 Human Gate，不需要第三次论证。**

---

# Round 3 复审（收口审 · 追加章节）

- **Plan Version（评的是哪版）**：`docs/pm/PLAN-TASK-021-history-stats.md`（Round 3 收口版，152 行 / 24278 字节）。
  ⚠️ **版本比对方式（同 R2，须记账）**：该 Plan 与本报告同为 git 未跟踪文件（`git status` 实测 `?? docs/pm/PLAN-TASK-021-history-stats.md`），`git diff` 不可用。本轮改用「我在 R2 报告里引用的原文摘录＋行号 vs 当前文件」逐条比对，并**对每条关键主张回源码独立复核**（不采信 Planner 自述）。
- **Review Round**：Round 3（收口审）
- **Result**：**PASS（可作为 V1.3 草案的输入）—— P0 = 0，blocking P1 = 0。**
  R2 的 3 条 blocking P1 **全部真闭环**，且 P1-A 的闭环是**闸门级**的（不是措辞）：`TASK-021-R006` 有独立 Task ID、独立责任链、显式取消「隔离开发」例外、B1～B5 状态全部为 `BLOCKED_BY_R006`。**TM 点名的核心疑问（「±1h/±1d 拨钟」这个 DoD 有没有鉴别力）我的结论是：有，且鉴别力很强**——详见第四节，这是我本轮最重要的独立技术判断。
  剩余问题全部是 **P2 级措辞/冗余/可判定性打磨**，不构成设计错误，不需要第四次论证。
- **P0 / P1 / P2**：**P0：0**｜**P1：1（blocking 0 / 非 blocking 1）**｜**P2：5**

## 一、R2 的 3 条 blocking P1 · 闭环判定表

| # | R2 判据 | 闭环？ | 本轮独立复核依据（回源码/回原文，非采信自述） |
|---|---|---|---|
| **P1-A** | R006 无排期/无门禁；或把依赖从「发布前置」前移为「开发前置」，二选一 | **✅ 真闭环（闸门级）** | ① 选了更严的那条：**开发前置**。`L18`「**未 PASS 则统计 Builder 子任务 B1～B5 全部不得开工，不存在『隔离开发』例外**」、`L25` Stage P0 同义复述、`L48`「未通过连统计 Builder 都不得启动」、`L114` Risk「不能用 fake clock 或『隔离开发』绕过」、`L124` 处置表「取消『隔离开发可先行』」——**五处一致**。② Task Breakdown 把它落成**可机械判定的状态位**：`TASK-021-R006` 单列一行（P0 / Builder→CR→QA 真机→Supervisor→TM / NOT_STARTED），B1～B5 五行 Status 全部为 **`BLOCKED_BY_R006`**，R006 行 Notes 写明「**FAIL／未验证＝B1～B5 不开工**」。③ DoD 表首行是「R006 开发闸门」，验收证据含「Reviewer、QA、Supervisor PASS **且 TM 记账后**才派 B1～B5」。④ **残留并行表述扫描**：`rg "隔离开发|并行|可以先|先行开发|不阻塞"` 全文 3 处命中，**全部是「禁止并行」的表述**（L18/L114/L124），**零残留并行承诺**。**判定：这不是「把风险重贴标签」，是一条有主体、有前置条件、有机械阻断状态、有 DoD 的真闸门。** |
| **P1-B** | D 档无自己的 DoD 与验收行 | **✅ 真闭环** | `L81` DoD 表保留 **D 档专行**，且写明三件事：①**已评估并由用户否决**；②**不属首发实施或验收分支**；③理由（不能回答三类各多久、日后无法精确回拆旧记录）；④「不得用它替代本轮 B 档」；并给出**将来另起 Change C 重审时**才适用的可测断言（单历史表、`total_step_ms` 非负且单调、稳定最近 10 条排序、无类型列/分类明细）。**用户既已选 B，这份留痕正是应有的形态**——它把「D 被否决过、为什么、以后要怎么做」留在案上，而不是删掉选项。**另注**：`L39` In Scope 内也独立记了 D 否决与 C 不可靠的理由，两处不冲突。 |
| **P1-C** | 预期排除与异常丢失共用一条通知路径、未分流 | **✅ 真闭环（结构级，不是措辞级）** | **关键在于分流点被下沉到了「载体」层，不是「文案」层**：`L66` 规定通知载体是 v4 独立小表 `stats_anomaly_notice`（原因码、发生时间、已读/关闭位），并明写「**预期排除不写该表**」。于是两类事件在实现上是**互斥可判的**——「这张会话结束时有没有往 `stats_anomaly_notice` 插行」就是判定依据，不需要 QA 去 judging 措辞轻重。`L64/L65` 各自给出封闭清单：预期排除＝版本切换 `stats_eligible=0`、0ms、ERROR、规则内不可计时段 → **中性、低权重、操作处局部说明**，不弹全局警告、**不产生统计缺口标记**；异常丢失＝进程死亡不可恢复、boot 不符、12h stale、损坏/越界、不可信恢复、改钟异常、归档失败 → **先持久化再清行**、首页或统计页醒目但可关闭、统计页**只在存在未关闭异常通知时**显示「合计可能低于实际练习」。`L83` DoD 把它写成**成对断言**（`stats_eligible=0`/0ms/ERROR → caveat 不出现；进程/boot/stale/损坏/归档失败 → 持久化异常提示、关闭只隐藏提示、通知写失败不能静默清行）。`L26` Stage P0 也单列一条。**「实现时会糊成一团」的风险已被载体设计排除**；唯一残留是一处措辞开口（见 P2-3）。 |

## 二、本轮新发现（全部 P2 / 非 blocking P1，无一构成设计缺陷）

| # | 级别 | 问题 | 我的独立依据与要求 |
|---|---|---|---|
| **P1-E** | **P1 非 blocking** | **HD-5 与 HD-6 的「选项字母」相对 R2 选项文本发生语义漂移；计划内部自洽且与用户拍板内容一致，但 Gate 若只报字母会让用户批准到与 R2 选项不同的东西。** | 用户拍板原文：HD-5＝「9 个种子流程开发时预置类型；自建默认未分类；不凭名字猜」；HD-6＝「完成页也改为实际动作时间，与统计页一致」。我在 R2 §7 列的 HD-5 选项是 A=逐个手动／**B=一次性批量确认界面**／C=长期未分类；HD-6 的 A=**并列展示两个数**／B=只改标签。计划（`L34/L37`、`L69`）实现的是**种子预置＋既存行未分类＋无批量入口**（≈ 我 R2 的 A 加一条新装机优化）与**统一为实际动作时间**（≈ 我 R2 的 B 之上再加上换源）。**我不判这是偏离**——用户已拍板的内容就是计划实现的内容，我 R2 的选项文本不是宪法。**但**：① HD-5=B 的落地含义是**升级用户要把 9 个示范流程逐个进编辑页各选一次**（无批量入口），这个代价必须让用户在 Gate 上听见；② HD-6=A 的落地含义是**完成页「用时」数字会变小**（去掉转场与暂停），不是「多显示一个数」。**要求**：V1.3 草案与 Gate 提问**一律用行为语言复述，禁止只报选项字母**。 |
| **P2-1** | P2 | **`active_session` 里「四个非负分类累计标量」（`L55`）在 HD-1=B 下冗余 3 列，是被否决的 A 方案残留。** | 会话类型在开始时**已冻结进快照**（`L54`），且 B 档明确「所有步骤继承该类型、不做步骤级覆盖」→ 一场会话只可能有一种类型。归档时按冻结类型写 `session_history_type_totals` 明细即可，运行期只需「本场已结算实际动作毫秒」一个标量。保留 4 列意味着**同一事实有两个存储点**（标量组 + 明细表），必须靠「和 = 总数」这条断言兜底——**这正是我在 R1 P1-6 判过的「双真源」病的同型复发**，只是规模小得多。**要求**：收敛为 1 个类型标量（或 0 个，归档时按快照类型直接写明细），把「四类之和＝总数」的维护面缩到最小。 |
| **P2-2** | P2 | **R006 DoD 有两处措辞在 R006 阶段「不可判定／可被空过」**（`L44`）。 | ①「**已跑动作时间**不随墙钟跳变」——「动作有效时长」这个量要到 **B1** 的 `stats_total_step_ms` 账本才存在；R006 阶段能观察的只有 Runner 顶部 `elapsedMs`（`runnerView.ts:91` → `routineElapsedMs`，**含转场**）。②「真重启后…**并给出可解释结果**」——我核实了**两条**丢弃路径的告知能力不同：`runnerController.ts:127-131` 会给 `无法恢复上次流程（boot count changed）`，但 `startRoutineService.ts:88-90`（`loadLiveSession` 身份不符即 `sessions.clear()`）**至今零提示**，而持久化的 `stats_anomaly_notice` 是 **B1** 的交付物。**要求改写两处**：①改成「Runner 倒计时与顶部已用时间在改钟前后连续、不跳变」（可观察、且预修必挂）；②改成「真重启后能正确识别 boot 改变、不把旧 elapsed 误作本次运行，**并给出可解释结果（现有错误提示即可）；持久化异常通知是 B1 的 DoD**」（把跨任务断言交回它的归属任务）。**注意：这两处都不削弱闸门的鉴别力**（见第四节），所以只是措辞打磨，不升级为 blocking。 |
| **P2-3** | P2 | **「预期排除」清单里的「规则内不可计时段」是开口短语，可能把「改钟异常」这类异常吞进中性说明。** | 同一现象在文中出现两种归属：`L59`「墙钟若倒退/无效且日期不可信，明确不归档或标待核实**并告知**」（语义＝异常）vs `L64` 预期排除含「**规则内不可计时段**」（语义＝中性、不弹全局警告）。**要求一句封口**：把「预期排除」定义为**封闭枚举**（`stats_eligible=0`、0ms、ERROR），并加一条兜底规则「**不在预期排除封闭枚举内的一切情形，一律按异常丢失处理**」。有这条兜底，分流在实现期不可能糊；没有这条，Builder 取默认「预期排除」就会静默吞掉异常——那正好把 P0-2 的成果作废。 |
| **P2-4** | P2 | **R006 改钟的**操作手段**未在计划中指定，而它决定闸门能否执行。** | xagapro（Note11T Pro / `IN9LZTAYV4UGU4JF` / API31）是**未 root 的零售机**：`adb shell date` 在这类设备上通常返回 `Permission denied`，`adb shell su -c date` 无 su。可行路径是**系统设置里手动改时间**（先关「自动设置时间」）。`L44` 只要求「记录包版本、设备、**操作顺序**」，把手段下放给 QA——这在正常 QA 卡里没问题，但**这是整个功能的唯一硬闸门**，QA 若在方法上试错，代价是排期。**要求**：在 R006 子任务 Notes 里写死唯一口径「设置 → 系统 → 日期和时间 → 关闭自动确定时间 → 手动设置（分别拨 ±1h、±1d，改完立即记录设备时间与 App 倒计时读数）"，并声明 `adb shell date` 不可用、不要再试。 |
| **P2-5** | P2 | **「9 个种子流程逐条人工指定正确训练类型」没有落成映射表，而 9 个里有 1 个在 4 值枚举下**没有干净答案**。** | 我读了 `src/data/seeds.ts:170-300` 的 9 个种子定义：8 个无歧义（晨起全身拉伸／久坐办公族拉伸→拉伸；跑后下肢放松／办公室久坐放松／睡前全身放松→放松；初级／中级／高级核心→核心）。**第 5 个「5分钟快速热身」是真歧义**：步骤为 `shoulder-rolls`（肩绕环）、`cross-body-shoulder`（交叉臂）、`standing-quad/hamstring/calf`（站姿静态拉伸）——在只有 `STRETCH/RELAX/CORE/UNCLASSIFIED` 四值的枚举里，「热身」既不是放松也不是核心，判 `STRETCH` 是可辩的但**本质是猜**。而计划自己的原则是「**不凭名字猜**」（`L37`）。**要求**：V1.3 草案里把 **9 个种子 → 类型**的映射列成一张表交用户过目（顺便一并解决「升级后这 9 个是未分类、需你手动各选一次」的知情），并对「5分钟快速热身」**显式拍板**（建议：归 `STRETCH` 并在种子注释里写明理由，或干脆归 `UNCLASSIFIED` 保持诚实——两者都比 Builder 临场猜好）。**顺带**：DoD `L80`「9 个种子定义逐条预置」目前**不可测**——「预置了」不等于「预置对了」，建议 DoD 断言写成「9 个种子定义的 `training_type` 与 V1.3 草案映射表逐条相等」。 |

## 三、9 项用户决策 · 固化准确性核对（逐项回原文）

| 决策 | 用户拍板 | 计划落点 | 判定 |
|---|---|---|---|
| HD-1 | **B 流程级分类**（不做步骤级；D 已否决） | `L34/L36` 每流程一种类型、不做步骤级覆盖；`L38` 写明已知局限（混合流程整场归一类、分类数字有偏差、统计页提示）＋**A 方案升级路径占位**且「不实施、不倒推旧记录」；`L39` 记 D 与 C 被否的理由；`L137` 复述 | ✅ **准确无偏离**，且比要求多给了「已知局限诚实写明 + 升级路径占位」 |
| HD-2 | **A** >0ms 计入并标「提前结束」；0ms 不计 | `L57` COMPLETED 与 STOPPED>0ms 归档、标「提前结束」、0ms 不计；`L70` 最近记录如实标；DoD `L79` | ✅ 准确 |
| HD-3 | **A** 首页加入口，不加第 4 个常驻 tab | `L68` 首页「我的流程」内容区加入口进独立页、**明写不新增第 4 个常驻 tab**；`L139` 复述 | ✅ 准确 |
| HD-4 | 可清空全部 + 可删单条；与 `seed_examples_cleared` 隔离 | `L58` 设置页独立「清空全部统计」+ 二次确认、**同事务只清三张统计表**、不删 routines/routine_steps/动作库/活动会话/`seed_examples_cleared`；统计页删单条 + 同事务删主表与明细 + 累计按剩余重算；DoD `L82` | ✅ 准确，隔离条款写得比要求更硬（点名了 5 类不受影响对象） |
| HD-5 | **B** 9 个种子开发时预置类型；自建默认未分类；不凭名字猜 | `L34` 标题标 HD-5=B；`L37` 种子定义写入、新插入行安全赋型、既存行与用户行保留未分类、`seed_examples_cleared` 后不复活；`L141` 复述 | ✅ **行为准确**；⚠️ 选项字母相对 R2 文本漂移（见 P1-E）；⚠️ 映射表未落（见 P2-5） |
| HD-6 | **A** 完成页也改为实际动作时间，与统计页一致 | `L69` 完成页改为**与统计同一累计源、同一单位、同一舍入**的实际动作时间、不含暂停与转场、保证两页数字一致、页面说明迁移口径、Runner 若保留含转场时间须明标「流程已用（含转场）」；`L113` Risk；`L142` 复述 | ✅ **行为准确**；⚠️ 字母漂移（见 P1-E） |
| HD-7 | **A** 完成页＋Runner 一并双语；修「已完成部分不会保存」假话；不扩到重构 | `L70` 假文案改为「若已有实际动作时间，提前结束也会计入统计」、对 0ms 不作假承诺；`L71` 两屏接入既有中英字典、即时切换、**明写范围边界**（只做本地化＋HD-6 必需显示调整＋停止确认假话修正，不重构两屏状态机/导航/视觉）；`L118` Risk；`L143` 复述 | ✅ 准确，划界写得很干净 |
| HD-8 | 做，统计页中英双语声明仅存本机 | `L68` 中英双语「数据仅保存在本机，不上传」+ 卸载或清数据会丢失 + 不设保留期/数量上限；`L144` 复述 | ✅ 准确 |
| HD-9 | **A** R006 真单调时钟**先落地并真机改钟验证通过**，才允许开发统计（硬前置、不得并行） | `L18`（含「不存在隔离开发例外」）+ `L25` Stage P0 + `L41-44` 责任链与 DoD + `L101` 独立 Task 行 + `L114` Risk + `L124` 处置表 + `L145`/`L152` 复述 | ✅ **准确，且是九项里固化最彻底的一项**（六处一致） |

**核对结论：9/9 决策全部准确落地，0 项偏离。** 2 项存在「字母相对 R2 选项文本漂移」（HD-5、HD-6），但**实现内容与用户拍板一致**，我判为**表述层风险而非偏离**，处置办法见 P1-E。

## 四、★ 核心判断：R006「±1h/±1d 拨钟」DoD 的鉴别力（TM 点名）

**结论（确定）：有鉴别力，而且鉴别力很强。这个 DoD 能区分修复前后，不会出现「修没修都过」或「没修也过」的情况。我不因此新增 blocking P1。**

**推理链（每一步都回源码核过）：**

1. **倒计时这条链上不存在第二个时间源。** 我 `rg` 全仓（排除测试）扫 `nowElapsedMs|nowMs()|WallClock|Date.now`：Runner 的显示与判定**全部**走 `monotonic.nowElapsedMs()`——`runnerController.ts:119/161/186/223` 取值 → `runnerView.ts:50-92` 算 `remainingMs/remainingSec/elapsedMs/progress` → `runnerTime.ts:21-77` 全部以 `nowElapsedMs` 为唯一入参。`WallClock` 在整个计时链上**只**被用于两处非计时字段：`sessionPersistence.ts:45` 写 `updatedAtWallMs`、`startRoutineService.ts:105` 写 `wallMs`。**没有任何一个用户可见的倒计时数字来自墙钟。**
2. **修复前，拨钟必然污染倒计时 —— 可观测且剧烈。** `MonotonicClock.ts:36-41` 原文 `return Date.now()`。把系统时间 **+1h** → `nowElapsedMs()` 凭空 +3,600,000ms → `phaseElapsedMs`（`runnerTime.ts:28`）直接越过 `effectiveStepDurationMs` → `advanceRunner`（`runnerMachine.ts:107-193`）在**一次 tick 内冲过全部阶段边界**直到 COMPLETED（这正是我 R1 P0-1 的机制）。把时间 **-1h** → `phaseStartedElapsedMs > nowElapsedMs` → `sessionRecovery.ts:82` 判 `phase start is in the future` → **整场丢弃**。两者都是「用户看得见、会喊 bug」的现象。
3. **修复后，同一操作必须无影响 —— 且这是可实现的，不是空要求。** R006 的目标实现（`elapsedRealtime()`）按定义不受用户/网络改时区与改时间影响（`MonotonicClock.ts:10-11` 的注释即此意）；`sessionRecovery.ts:11` 的规则 1 原文「**The wall clock is never read, so a wall-clock jump of any size is ignored**」本来就是按真单调写的。所以「改钟 ±1h/±1d 倒计时不回跳、不跳阶段、不丢会话」在修复后**必然成立**。
4. **因此 DoD 的两个方向都有明确的、相反的观测值：**

| | 修复前（当前构建） | 修复后（R006 PASS） |
|---|---|---|
| 前拨 +1h / +1d | 倒计时**瞬间冲到完成**／跳阶段 | 倒计时连续，不跳变 |
| 后拨 -1h / -1d | `phase start is in the future` → **整场丢弃** | 会话在、倒计时连续 |
| 同 boot 进程重启 | `bootCount = Date.now()`（`BootInfo.ts:29`，JS 上下文创建时取一次）→ 值必变 → **误判跨 boot 丢弃** | 真 boot 身份 → 同一 boot 判定成立 → 可信恢复且不重复计时 |
| 真重启 | 同上，**丢弃**（但不可区分于上一行） | 真 boot 身份 → 正确识别为跨 boot，**不把旧 elapsed 误作本次运行** |

5. **不会「假失败」**：我核过所有可能受墙钟影响又会在同一屏出现的量——`updatedAtWallMs`/`wallMs` 不进任何倒计时或已用时间显示；`SettingsScreen.tsx:49` 的 `Date.now()` 只做测试语音的 key；会话历史里**当前没有任何按墙钟排序或显示的界面**（统计页是本轮才建的，且排序键是 `ended_at_wall_ms`+`session_id`、日期由算术推导）。**所以改钟时页面上唯一会动的就是倒计时本身**——这正好让 QA 的判读干净。
6. **不会「假通过」**：DoD 的四条断言（不回跳 / 不跳过阶段或直接完成 / 不丢会话 / 已用时间连续）**在修复前全部会挂**。不存在「只验其中一条就放过」的空间——因为修复前的失败不是某一条弱断言，而是**整个会话被冲到完成或被丢掉**这种一眼可见的现象。

**一个额外的好消息（我核过，让 R006 的范围站得住）**：真实 `bootCount` 一旦落地，**「同 boot 恢复 / 真重启丢弃」的判定逻辑不需要新写**——`sessionRecovery.ts:65-67` 的 `stored.bootCount !== currentBootCount → discarded` 与 `startRoutineService.ts:88-90` 的同款比较**本来就在**，只是今天被假 boot 身份喂坏。也就是说 **R006 真的是两个 port 实现 + 组合根接线，不需要新增策略代码**，`L92`「只承担统计所需真实时钟和 boot 身份切片」这句**成立**。反过来这也说明：`L44` 里「同 boot 重开能可信恢复」是**免费搭到的**（不是 R006 额外的活），所以我 R2 提的「R006 是否越界做了恢复策略」这一顾虑**在 Round 3 已经不成立**，不必再纠。

**但我要把三条限定一起交出去（都归 P2，不影响闸门成立）：**
- 「**已跑动作时间**」在 R006 阶段**不可直接观测**（该量属 B1）→ 改成「Runner 倒计时与顶部已用时间连续」（P2-2①）。
- 「真重启…**给出可解释结果**」在 R006 阶段只能由 `runnerController` 那条路径满足，`startRoutineService` 的静默清行要到 B1 的 `stats_anomaly_notice` 才补上 → 明确归属（P2-2②）。
- 改钟**手段**必须写死为「系统设置手动改 + 先关自动设置时间」，否则闸门会在方法上卡住（P2-4）。

**一句话**：**鉴别力成立，闸门是真的，唯一的工作是把三处措辞改到「QA 判得了、且不越界到 B1」。**

## 五、Task Breakdown 与「先 R006 后统计」的串行一致性

| 检查项 | 结论 |
|---|---|
| 有无 B1～B5 与 R006 并行的表述 | **无**。`rg` 扫描「隔离开发/并行/可以先/先行开发/不阻塞」共 3 处命中，**全部是禁止并行的表述**（L18/L114/L124） |
| 阻断是否可机械判定 | **可**。B1～B5 五行 Status 统一为 `BLOCKED_BY_R006`（不是散文描述，是状态位）；R006 行 Notes 写「FAIL／未验证＝B1～B5 不开工」 |
| 责任链是否到人/到角色 | **到**。R006 行写全 Builder（Android 切片）→ Code Reviewer → QA 真机 → Supervisor → TM 记 PASS；与 AGENTS.md:8 的 Phase2 主链一致 |
| DoD 表是否与 Task Breakdown 对齐 | **对齐**。DoD 首行「R006 开发闸门」与 R006 行 Notes 同源；「提示分流」行与 B1 的异常通知表对应；「B 档流程分类」行与 B3 对应；「删除与隔离」行与 B5 对应；「页面与双语」行与 B4/B2 对应 |
| 有无「R006 顺带做了统计的活」的隐性扩张 | **无**。B1 的 v4 迁移、标量账本、事务归档、异常通知表全部仍在 B1，未被前移进 R006 |
| 与 HANDOFF 的一致性 | **一致**（`HANDOFF.md:8` `PROJECT_PHASE=PLAN_REOPEN_REQUIRED`、`:13` `CHANGE_REQUEST=C`、`:17` 当前 Task=TASK-021）——R2 遗留的「TM 未更新治理字段」问题**已解决** |

## 六、Readiness Score（我的独立打分，R3）

| 分项 | 满分 | R1 | R2 | **R3（我）** | 理由 |
|---|---|---|---|---|---|
| 产品目标与用户需求 | 20 | 14 | 15 | **17** | 9 项决策固化后目标零歧义；不可回溯、混合流程偏差、旧 seed 未分类、上传声明全部写明。仍无真实使用反馈与目标用户访谈 |
| 核心方案完整性 | 20 | 15 | 18 | **17** | 归档触发、通知载体、两类分流、算术日期、单一快照真源、删除与隔离、伪码先审门禁全部收口。扣分：R006 DoD 两处措辞不可判定（P2-2）、四个分类标量冗余（P2-1）、种子映射未落（P2-5） |
| 外部事实与竞品验证 | 20 | 5 | 8 | **8** | **仍零自有外部来源。** R1 的 Hermes Intl 证据被沿用为算术日期（有效），但「沿用」不构成独立验证；本轮无新增外部检索、无用户反馈 |
| 技术可行性 | 15 | 9 | 12 | **12** | additive v4、算术日期、标量账本、事务归档、`session_id` 幂等我逐条验过成立；**本轮新增正面证据**：R006 两个 port 落地后既有恢复逻辑无需改动即正确，且改钟 DoD 有鉴别力。扣分：R006 是新 native 波（新包＋真机），改钟手段可行性待 QA 确认 |
| 风险与异常场景 | 10 | 6 | 9 | **9** | 7 条 Risk 写实；最关键的两条已从「安全策略」改写为「硬闸门」与「预期排除/异常丢失分流」；唯一开口是「规则内不可计时段」需封口（P2-3） |
| 开发范围与 DoD | 10 | 7 | 8 | **8** | 范围真收敛到「累计＋分类＋最近 10 条＋删除」，DoD 9 行多数可落到一条会红的断言；扣分：D 档行是留痕非验收分支（合理但不可测）、R006 两处措辞 |
| 未决问题 | 5 | 2 | 4 | **5** | 9 项决策全部固化，**确无开放问题**；R2 的 P2-1/P2-2 因 D 被否决而自然消解 |
| **合计** | **100** | **58** | **74** | **76** | Planner 自评 90，方向一致、绝对值偏高（见下） |

**Gate 判定（`PRODUCT_PLAN.template.md` 正典口径）**：
`Readiness >= 90` **AND** `P0 = 0` **AND** `blocking P1 = 0` **AND** 关键事实已验证 **AND** 核心假设已合理验证
→ **P0 = 0 ✔｜blocking P1 = 0 ✔｜本卡 Readiness 76 ✘**

**为什么 76 < 90 我仍然判 PASS —— 适用性声明（须记账，与 R1/R2 同一口径）**：
这张卡是 `PLAN.template` 形态的**变更卡**，**形式上的 Readiness Gate 落在 TM 将要产出的 `PRODUCT_PLAN_V1.3` 增量草案上**，不是这张卡（R1 已声明、R2 已沿用）。我沿用 R2 设的门：「**本卡能否作为 V1.3 草案的输入**」——**能，故 PASS**。
**但我必须把话说透，否则 Human Gate 会踩坑**：76 分里唯一的大缺口是「外部事实与竞品验证」8/20。**按我给 V1.3 草案的预期分数结构（其余六项合计约 68–70），该项必须做到 15 分以上才可能摸到 90。也就是说：V1.3 草案若只是把本卡搬进 Functional Scope，会卡在 Gate 上。** 这一条我写进下面的 Next Action，**属 TM 义务，不构成本卡 blocking**。

## 七、Next Action

**① 给 TM 的执行口径（Human Gate 前必做，均不需再派 Planner）**
1. HANDOFF 机器字段已切 `PLAN_REOPEN_REQUIRED` / `CHANGE_REQUEST=C` ✔（R2 遗留已闭环，无需再动）。
2. `PLAN_VERSION` 保持 V1.2、`DEV_BASELINE` 保持 V1.2 **直到 Human Approval**；获批那一刻才同时改 `PLAN_VERSION=PRODUCT_PLAN_V1.3`、`DEV_BASELINE=PRODUCT_PLAN_V1.3`、`PLAN_GATE=APPROVED`（并写 V1.3 自己的 Readiness 分，不沿用 V1.2 的 94）、`PROJECT_PHASE=DEVELOP`、`CHANGE_REQUEST=NONE`。
3. **V1.3 增量草案该怎么写**（避免卡 Gate）：①把历史统计从 V1.2 的 `:36/:68/:154` 三处移入 Functional Scope，**逐处写明「V1.3 取代 V1.2 的这三条」**（否则基线内部自相矛盾，这正是我 R1 判 C 的根据）；②吸收本卡已固化的 9 项决策与 3 条闸门条款；③**补一手外部/用户证据**（真实使用反馈，或对 Stretch Day / Flexor / Voice Stretch Guide / MuChills 现状做一次复核）——这是 Readiness 到 90 的**唯一binding 缺口**；④写清与 P0-5 native hardening 的相对优先级：**`TASK-021-R006` 最小切片现在有了需求方与排期**，不再是「待排期」；R004/R022–R034 仍挂账、不被本任务顺带宣称完成；⑤**不要继承 V1.2 的 4 处过期描述**（HANDOFF §3.4 U-1：无 JDK/构建阻塞等），顺手改正即可。
4. **Gate 提问必须用行为语言**（P1-E）：不许只报 HD 编号与字母。

**② 给 Planner 的收尾清单（全部 P2，建议随 V1.3 草案一并落地，不必再开 Round 4）**
1. R006 DoD 两处措辞改写（P2-2①②）。
2. R006 改钟手段写死为系统设置手动改 + 先关自动设置时间，声明 `adb shell date` 不可用（P2-4）。
3. 「预期排除」改为封闭枚举 + 「不在枚举内一律按异常丢失」兜底规则（P2-3）。
4. `active_session` 四个分类标量收敛（P2-1）。
5. 9 个种子 → 类型的映射表落进草案交用户过目，并显式拍板「5分钟快速热身」；DoD 断言改为「与映射表逐条相等」（P2-5）。

**③ 给 QA 的前置提醒（写在派 R006 单时）**
改钟闸门是本功能唯一硬门：必须用新构建 release 包（对齐 `HANDOFF.md` 出包铁律：先 `expo prebuild` 再 gradle）、核对设备 bundle 含本轮改动（对齐 `经验一句话.md` 2026-09-19 Metro 陈旧 bundle 教训）、全程录像并记录每一步的设备时间与 App 倒计时读数。

**一句话总评（R3）**：**R2 的三条 blocking P1 全部真闭环，其中 P1-A 是有 Task ID、有责任链、有机械阻断状态、有 DoD 的真闸门，并且我核出它「改钟 ±1h/±1d」这个验收在当前构建下确实抓得到修复前的失败（倒计时冲到完成／整场丢弃）、也抓得到修复后的通过——鉴别力成立，不需要第四次论证。** 剩下的是三处措辞、一列冗余、一张种子映射表，都在 V1.3 草案里顺手落地即可。**唯一需要 TM 高度警惕的不是这份卡，而是下一份卡：V1.3 草案的 Readiness 会卡在「外部事实与用户反馈」这一项上，那才是真正需要提前动手的地方。**
