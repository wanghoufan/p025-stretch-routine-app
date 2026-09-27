# PRODUCT_PLAN（Phase1 专用；Readiness 定义唯一正典，卡内引用不重写）

> 【neat-freak 2026-09-27 补注｜仅加指针，正文与历史结论未动】本计划已被 `PRODUCT_PLAN_V1.3` **局部取代**（历史统计排除条款，对应本文 `:36`／`:68`／`:154` 三处，取代明细见 V1.3「Functional Scope」前三条）；其余不冲突条款继续有效。本文作为历史基线封存；其中 JDK／EAS 构建环境等过期叙述已由 V1.3「Technical Approach · V1.2 过期环境叙述逐项更正」逐项更正，现状以 HANDOFF 为准。

- Plan Version：PRODUCT_PLAN_V1.2（V1.0 已实现后的 V1.1 Release Hardening 增量计划；代码基线 `main@bc1f39f041cfa4a71696534ed86aee25c44d09d1`）
- PROJECT_PHASE：PLAN
- Product Goal：保留 V1.0 已完成的拉伸流程产品与数据，在不重做整套业务功能的前提下，把 Android 计时、活动会话、后台/锁屏播报、停止恢复和迁移行为加固到可验证、可恢复、不会静默覆盖用户会话的 V1.1。
- Target Users：以 Android 手机进行居家、办公或运动后拉伸，希望少看屏幕、依靠语音完成自定义流程的个人用户；当前首要实机用户环境为 Redmi 22041216UC（HyperOS V816 / Android 14）。
- Problem：
  - 当前 Runner 仍由 `routineId` 驱动；源流程被编辑或删除后，活动会话无法稳定独立继续。
  - 当前 wall-clock 与 `INSERT OR REPLACE` 路径可能分别导致系统时间跳变影响倒计时、第二个流程静默覆盖当前会话。
  - Expo Go/纯 JS 不能证明息屏、Deep Sleep/Doze、Task Manager Stop、重启等 Android 生命周期下的持续播报与恢复正确性。
  - FGS 只能提高进程重要性，不等于 CPU 保持唤醒；是否需要 `PARTIAL_WAKE_LOCK` 必须由实测 Gate 决定。
  - `REASON_USER_REQUESTED` 同时可覆盖 Force Stop、Recents 移除等情形，不能当作 Task Manager Stop 的唯一标识；API 30 以下还无该信号。
  - 当前验证集中在一台 Android 14 Redmi，尚未覆盖 API 33 通知/Task Manager 语义、API 36 target 行为与 minimum SDK 策略。
  - 当前机器无 JDK，且 EAS 免费构建额度要到 2026-10-01 恢复，native build/真机验证存在明确排期约束。
- Core Value：流程开始后以不可变快照和单一活动会话为权威；倒计时不受系统时间修改影响；后台、锁屏、用户停止、重启和异常恢复均有明确且可验收的行为，同时保留离线、本地优先、TTS 非权威的 V1 原则。
- User Flow：
  1. 用户在首页选择流程并点击开始；StartRoutineService 先读取活动会话并做冲突判断。
  2. 无活动会话时，从源 Routine 生成不可变 snapshot，使用 INSERT 创建 ActiveSession，启动/确认 native runtime service，进入 Runner。
  3. 同一流程已有活动会话时返回 `continue-current`，继续当前会话，不重复创建。
  4. 不同流程已有活动会话时显示“继续当前流程 / 结束当前并开始新的 / 取消”；只有用户明确确认后才执行 replace。
  5. Runner 仅由 ActiveSession 驱动；源 Routine 后续编辑、重排、改名或删除都不改变本次运行，下一次开始才读取新版 Routine。
  6. 运行中 Pause/Resume/Previous/Skip/+10s/End 继续可用；进入后台或锁屏后由 FGS（必要时叠加有超时且可释放的 WakeLock）维持正确计时与到点 cue。
  7. 通知点击返回 Runner；Android 13+ 允许通知时验证 drawer 可见，拒绝时 FGS 仍可启动且 Task Manager 可见，drawer 不可见（除非有经证明的合法 media-session 豁免）。
  8. 普通后台或 Activity recreation 按有效 ActiveSession 恢复。Recents swipe 后 FGS/进程仍存活时可继续；若进程已终止且最新 reason 为 `REASON_USER_REQUESTED`，不论具体来自 Recents、Force Stop 或 Task Manager Stop，都一律不自动播音，仅在用户显式 Start/Continue 后恢复有效会话。API 30 以下或无法取得可信终止信号时同样 fail-safe：不自动播音，等待显式 Start/Continue。bootCount 变化或 snapshot 损坏则安全丢弃或标记 interrupted。
  9. End/Complete 后停止 FGS、释放 WakeLock、清理活动会话；不得留下 zombie service 或 stuck wakelock。
- Functional Scope：
  - 保留 V1.0 已实现的 Home、Routine Detail/Editor、Batch Input、Action Library、bilateral、Runner、Settings、种子数据和本地 SQLite 数据。
  - 建立单一 Android local Expo native runtime module，统一承载 monotonic time、boot count、last process exit reason、FGS；Path A 失败后才评审 Path B native scheduler/Android TTS。
  - 拆分 WallClock 与 MonotonicClock；普通实体时间戳用 WallClock，权威倒计时和同一 boot 恢复用 monotonic elapsed time。
  - ActiveSession V2 在单例 `active_session` 中保存版本化 immutable snapshot JSON、elapsed 字段和 bootCount；迁移只重建瞬时状态，不丢 Actions/Routines/Steps/Settings。
  - Start conflict gate、ActiveSession-driven Runner、首页活动会话 Banner、FGS/notification/Deep Sleep/WakeLock 风险门、保守终止信号与重启恢复规则。
  - WAL（满足条件时为条件 P0）、Android API/OEM 矩阵、版本治理、ADR/SDD 一致性和最终回归验收。
  - TTS 离线能力说明：Runner 核心 100% 离线；TTS 是否完全离线取决于设备 voice。当前 Redmi 使用 eSpeak 语音引擎作为验收环境之一，eSpeak 缺 voice/发声失败不得影响权威计时。
- Out of Scope：
  - 不重做 V1 UI，不重跑原 T001–T135 全量开发任务，不新增训练平台、社交、账号、云后端、支付或 AI。
  - 不建立 SessionSnapshot 历史表或两张 snapshot 表；V1.1 没有历史会话查询需求。
  - 不全局机械替换 `Date.now()`，不因理论并发大改整个数据库层，不清库完成迁移。
  - 不在 FGS 实测前把 Runner 全量改写为 Kotlin；R028 Path A 未失败且未通过 Architecture Review 时不得进入 Path B。
  - 不在开机后自动恢复播音，不在保守终止信号出现后自动恢复，不从后台自行启动 FGS。
  - 本地自用/internal APK 阶段不要求完成 Google Play Console FGS 表单和演示视频；一旦进入 Play 发布轨道，`RB-PLAY-FGS` 立即成为 Release Blocker。
- Technical Approach：
  - 权威关系：仓库没有独立的 Constitution V1.1 或 SPEC V1.1 文件。V1.1 的产品与工程权威基线明确为“V1.0《开发宪法》+ V1.0《SPEC》+《V1.0 已开发完成后增量整改计划 V1.1》§1.1 的增量条款”；后者仅增量补充，不虚构独立文件。冲突实施细节以本 PRODUCT_PLAN_V1.2 为准，V1.0 宪法/SPEC 的不冲突条款继续有效。
  - Native foundation：先建立 `modules/stretch-runtime` 一类的单一 Android local Expo module，再暴露 `nowElapsedMs()`、`getBootCount()`、`getLastProcessExitReason()` 与 FGS 能力；native 功能不得以 Expo Go 作为验收载体。
  - Clock：WallClock 用于 createdAt/updatedAt 等现实时间；MonotonicClock 使用 Android elapsedRealtime 语义，驱动倒计时、catch-up、暂停和同 boot 恢复；跨 boot 由 bootCount 判定。
  - Persistence：ActiveSession V2 使用版本化 snapshot JSON；new start 用 INSERT，正常保存用 UPDATE，显式替换只在确认后执行；禁止无条件 `INSERT OR REPLACE`。损坏 JSON、未知 snapshotVersion、boot mismatch 和保守终止信号走 fail-safe。
  - Termination policy：当前 FGS/进程存活优先于历史 exit reason；已终止进程的最新 `REASON_USER_REQUESTED` 只解释为“用户/包状态终止的保守信号”，不再细分 Recents、Force Stop 或 Task Manager Stop。无信号、信号模糊或 API <30 均默认不自动播音，仅显式 Start/Continue 可恢复有效 ActiveSession。
  - Runtime：Runner 与首页从 ActiveSession 恢复，不再要求有效 routineId；FGS 从可见 Activity 的 Start/Continue 发起，先用 `START_NOT_STICKY`。Pause/Resume/End/Complete 与 FGS/WakeLock 生命周期一一对应。
  - Risk Gate：先测试 FGS + JS Runner + `expo-speech`；5–10 分钟息屏并跨至少 2 个边界，再进入 Deep Sleep/Doze。只有 R028 失败才允许评审 native boundary scheduler/Android TTS。
  - Build/QA 约束：当前开发机无 JDK，不能把本地 Gradle/native build 当作现成能力；EAS 免费额度在 2026-10-01 恢复前不可依赖云打包。开发可先做不依赖新包的设计、TS/单测与静态验证；首个 native Exit Gate、安装包与正式真机 QA 必须等待可用构建通道（默认 2026-10-01 后 EAS），除非 Human 另行批准安装 JDK 或提供其他构建通道。
  - FGS Type ADR 执行框架（最终类型在 native spike 后定稿，但不得越过本框架）：

    | 实际持续工作 / 候选类型 | 必需 manifest permission | Runtime prerequisite | 运行时 type | Play 对应申报 | 选择/拒绝规则 |
    |---|---|---|---|---|---|
    | 用户启动的长时间倒计 + 间歇 TTS cue；`specialUse` | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`，并声明真实 subtype | 不伪造 runtime permission；用户可感知、可终止、仅在活动会话期间运行 | `specialUse` | 按同一 subtype 说明核心功能、用户影响并提供演示视频 | **受控 default 候选**：仅当官方类型无更精确匹配、subtype 可真实描述且接受 Play 审查风险时使用；否则拒绝。 |
    | 持续后台音/视频播放；`mediaPlayback` | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 必须实际存在持续媒体播放/合法 media session，不得用间歇 TTS 名义冒充 | `mediaPlayback` | 后台媒体播放用例与可感知性证据 | **受控 fallback**：只有 native spike 证明实际架构已是持续媒体播放时才能评审；当前“倒计时 + 间歇 TTS”默认拒绝。 |
    | fitness/exercise tracker 的健康/传感器长运行；`health` | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_HEALTH` | 必须有真实 high-sampling sensor 或官方列明的 runtime permission 前提 | `health` | 健康/fitness 核心用例、对应数据和权限依据 | **拒绝**：本产品当前不采集传感器/活动识别数据；禁止为满足类型前提而申请无关的 activity/sensor permission。 |

  - FGS Type default/fallback/Stop Gate：先用真实持续工作核对所有标准类型；当前受控 default 候选为 `specialUse`，`mediaPlayback` 仅在真实持续媒体架构成立时才是 fallback，`health` 非候选。若 native spike/ADR 无法为 default 或 fallback 提供真实、最窄、manifest/runtime/Play 一致的理由，立即 Stop Gate：不实施或发布后台 FGS，回到 Human Decision，在“缩减为仅可见/实际播音期间保障”与“承担 `specialUse` 发布审查风险”中选择；不得自行扩权、多报类型或伪造持续媒体会话。
- Data / API：
  - 保留本地 SQLite、`PRAGMA user_version`、foreign keys、现有 repositories、用户 Actions/Routines/Steps/Settings 与种子数据。
  - ActiveSession V2 至少包含 `phaseStartedElapsedMs`、`pausedAtElapsedMs`、`lastUpdatedElapsedMs`、`bootCount`、`snapshotVersion`、`snapshot`；snapshot JSON 必须校验版本和结构。
  - Native JS API：`nowElapsedMs()`、`getBootCount()`、`getLastProcessExitReason()`；Android 侧读取原始 `ApplicationExitInfo` reason/时间，不将 `REASON_USER_REQUESTED` 误解为 Task Manager Stop 专属信号。
  - FGS API/生命周期：ensure/start、pause policy、resume ensure、stop/release；通知含 channel、ongoing notification 与返回 Runner 的 deep link，权限允许/拒绝分支均要暴露可验收状态。
  - SQLite 初始化若同轮触及，执行 `PRAGMA journal_mode = WAL;` 并验证结果；否则 R035 维持条件项，不阻塞本计划进入 Human Review。
  - 无远端业务 API、账号、同步或遥测依赖；Runner 核心离线可用。
- Key Assumptions：
  - `main@bc1f39f` 是 V1.0 实现基线；现有 154 tests green、Expo SDK 57、RN 0.86.3、compile/target SDK 36 等声明须由 R002/R003 重新实测，不把历史记录当本轮通过证据。
  - 一个 ActiveSession 足够，V1.1 不需要历史会话查询；因此单例表内 snapshot JSON 是最小合理方案。
  - Android elapsedRealtime + bootCount 足以解决 wall-clock 跳变和跨重启判定；FGS/WakeLock 的实际充分性必须由设备测试验证。
  - `REASON_USER_REQUESTED` 是保守终止信号而非唯一事件标识；以“存活事实优先，终止后不自动播音，显式操作才恢复”消除不可区分性。
  - Android 13+ 拒绝 POST_NOTIFICATIONS 后 FGS 仍可运行，但 notification drawer 不可见、Task Manager 仍可见（合法 media-session 豁免除外）；R023/R043 必须分支验证。
  - Redmi Android 14 + HyperOS + eSpeak 是必要物理设备证据，但不是完整兼容矩阵；API 33、API 36 和 minimum SDK 仍须补证。
  - 2026-10-01 EAS 免费额度按已知账户周期恢复；若未恢复，则该事实转为构建阻塞并由 Task Manager 提交 Human 决策，不得伪造 native/真机通过。
- Competitor / Research Summary：
  - 本轮不是竞品功能扩张，而是发布加固；保留“本地优先、无账号、低操作负担、语音提示”的差异化，不引入常见健身平台的内容、社交和云服务复杂度。
  - Round1 已核验平台事实：FGS 不保证 CPU 唤醒；通知权限拒绝不等于 FGS 不可运行；`REASON_USER_REQUESTED` 不能单独区分 Recents/Force Stop/Task Manager Stop；bootCount 用于跨重启识别。
  - Expo/CNG 约束已转化为顺序：先有 local native module 与 development/preview build，再验 monotonic/FGS；Expo Go 只可用于 JS 层开发，不可证明 native hardening 完成。
  - FGS 类型的官方可比范式是“持续后台媒体→`mediaPlayback`”和“真实健康/传感器追踪→`health`”；本产品的间歇 TTS + 倒计时不能因“会发声”或“属健身类”直接套用，必须按 R024 选择最窄合规类型。
- Risks：
  - 构建阻塞：无 JDK + EAS 额度 2026-10-01 前不可用；缓解为先完成纯 JS/数据/测试工作，native Exit Gate 明确不假通过，额度恢复后集中打包取证。
  - OEM 行为差异：HyperOS 电池策略可能延迟或杀死流程；R025–R028、R038、R043 分层取证，禁止用单机短测外推。
  - WakeLock 耗电/泄漏：仅在 FGS-only 实测失败后使用，必须有 timeout、所有终止路径 release 和泄漏验收。
  - 终止信号模糊：`REASON_USER_REQUESTED` 不可精确归因；以“存活事实优先 + 死亡后保守不播音 + 显式恢复”降低误播风险，并在 R033 保留原始证据。
  - 数据迁移丢失：V2 仅重建 active_session；迁移前后验证 Actions/Routines/Steps/Settings，损坏 snapshot 安全丢弃而非清库。
  - 会话覆盖：现状 `INSERT OR REPLACE` 可能静默替换；由 INSERT/UPDATE/Explicit Replace 分离和 UI 冲突确认消除。
  - TTS 不确定：eSpeak/其他 voice 的离线性、音频焦点和 OEM 行为不同；TTS failure 必须 non-fatal，计时永不依赖 utterance callback。
  - API/政策误选：`health`、`mediaPlayback`、`specialUse` 不可凭产品名称拍脑袋选择；R024 必须通过 default/fallback/Stop Gate，Play 发布另受 `RB-PLAY-FGS` 阻塞。
  - 计划一致性：历史材料曾把 Constitution/SPEC 称作 V1.1 独立文件；本计划已纠正权威链，R041 必须确保代码和文档不再引用不存在的独立文件。
- DoD：
  - [ ] R001–R034、R039、R041–R044 共 39 项固定 P0 全部通过；R035 若触发则作为条件 P0 同轮通过。
  - [ ] V1.0 用户功能保留，历史基线测试、全部新增 hardening tests、typecheck 通过，Expo Doctor 无阻塞问题。
  - [ ] WallClock/MonotonicClock 分离，Android monotonic source 具有 elapsedRealtime 语义；系统时间 ±1h/±1d 不影响倒计时。
  - [ ] ActiveSession V2、版本化 immutable snapshot、one-active-session 数据层与 UI 均成立；新建用 INSERT、保存用 UPDATE，不再静默 replace。
  - [ ] Runner 完全 ActiveSession-driven；源 Routine 的 edit/reorder/rename/delete 不影响当前运行，下次 Start 使用新版。
  - [ ] V1 schema → V2 不丢 Actions/Routines/Steps/Settings；损坏 snapshot、boot mismatch、保守终止信号均按 fail-safe 处理。
  - [ ] FGS 在真实 native build 中通过；Android 13+ 通知允许分支 drawer 可见，拒绝分支 FGS 可启动、Task Manager 可见、drawer 不可见（合法豁免除外）；息屏、background、Deep Sleep/Doze cue 连续且时间正确。
  - [ ] R024 ADR 完成实际工作→permission→prerequisite→runtime type→Play 申报的一致链；无合规类型则 Stop Gate，不用无关权限或伪造媒体会话绕过。
  - [ ] 若启用 WakeLock，则 acquire/release/timeout 完整，无 stuck wakelock；End/Complete 后无 zombie FGS。
  - [ ] Task Manager Stop、Settings Force Stop、adb stop-app、recents swipe、普通后台、reboot 全矩阵记录原始 reason/存活状态/会话结果；不以模糊 reason 伪造精确归因，不在进程终止或重启后自动播音。
  - [ ] Android 14 Redmi/HyperOS/eSpeak 物理机、API 33、API 36 通过；minimum SDK 完成 smoke test 或形成明确提升决策。
  - [ ] 核心流程断网可用；无离线 voice 或 TTS 失败时应用不崩溃、不阻断权威计时。
  - [ ] package/app version、versionCode、Git tag、ADR、HANDOFF 与本计划一致；旧 ADR 只标 superseded，不删除。
  - [ ] Final Acceptance 覆盖创建/编辑/删除流程与动作库、bilateral、Start/Continue/conflict、Pause/Resume/+10/Previous/Skip、后台/锁屏/deep sleep、通知权限双分支、停止/重启/改系统时间、运行中源流程 edit/delete、offline/TTS failure、资源释放。
  - [ ] final code review/QA 无未闭环 P0；4 个常规非阻塞 P1 若未完成，须有清晰挂账、影响说明与后续入口；若进入 Play 发布轨道，`RB-PLAY-FGS` 必须先闭环。
- P0 / P1 / P2：
  - P0（非做不可）：39 项固定 P0 + 1 项条件 P0。
    - R001 冻结当前工作版本：确认 `bc1f39f` 基线并建立可追溯 hardening 工作线；具体 tag/branch 操作由 Phase2 按授权执行。
    - R002 重跑基线：`npm ci`、typecheck、全量测试、Expo Doctor，记录真实结果。
    - R003 Build Baseline：核验 Expo/RN、compileSdk、targetSdk、minSdk、package、versionName/versionCode 并形成 QA 记录。
    - R004 创建统一 Android local Expo runtime module。
    - R005 固定 CNG/native build 工作流；不得用 Expo Go 代替验收，并受无 JDK/EAS 10-01 约束。
    - R006 实现并真机验证 elapsed time、boot count、last exit reason 首批 native API。
    - R007 拆 WallClock/MonotonicClock。
    - R008 Action/Routine/Seeds repositories 使用 WallClock。
    - R009 定义 ActiveSession V2 domain 与 snapshot/elapsed/boot 字段。
    - R010 完成只重建 active_session 的 V2 migration 并保留用户数据。
    - R011 完成 snapshot encode/decode、版本/损坏校验及 INSERT/UPDATE 分离，移除无条件 replace。
    - R012 完成 same-boot monotonic、boot mismatch、wall-clock jump 与保守终止恢复规则：存活进程/FGS 可继续；进程已终止且 reason 为 `USER_REQUESTED`、reason 不可信或 API <30 时均不自动播音，仅显式 Start/Continue 恢复。
    - R013 完成时钟跳变、monotonic、重启、损坏 JSON、V1→V2、数据保留和旧 session 清理测试。
    - R014 建立 StartRoutineService，集中处理 active/conflict/snapshot/session/native service。
    - R015 固定 `started / continue-current / conflict / failed` Start Result Contract。
    - R016 同源活动会话只 Continue，不新建。
    - R017 异源活动会话显示三选一冲突 UI。
    - R018 仅用户确认后 Explicit Replace。
    - R019 Runner 改为 ActiveSession-driven。
    - R020 Home 显示活动会话 Banner，源 Routine 删除后仍可继续。
    - R021 完成 snapshot immutability 场景测试。
    - R022 从 visible Activity Start/Continue 启动 Minimal FGS。
    - R023 建 channel/ongoing notification/返回 Runner，并做双分支验收：通知允许时 drawer 可见；拒绝时 FGS 可启动、Task Manager 可见、drawer 不可见（合法 media-session 豁免除外）。
    - R024 依 FGS Type ADR 框架记录实际持续工作、候选类型、manifest permission、runtime prerequisite、运行时 type、Play 申报和拒绝理由；执行 `specialUse` 受控 default、真实持续媒体才可 `mediaPlayback` fallback、`health` 禁用无关权限、无合规类型即 Stop Gate。
    - R025 完成 FGS-only 10s×6、至少跨 2 边界、5–10 分钟息屏测试。
    - R026 完成 Deep Sleep/Doze cue 准时性测试。
    - R027 按证据决定 WakeLock；如启用则补 acquire/release/timeout/no-leak。
    - R028 完成 Path A Gate：FGS（必要时 + WakeLock）+ JS Runner + expo-speech。
    - R029 仅 R028 FAIL 时进入 Path B Architecture Review；未失败则记录“不触发”。
    - R030 明确并实现 Start/Pause/Resume/End/Complete 与 service/WakeLock 生命周期。
    - R031 以 `START_NOT_STICKY` 为基线；改 sticky 必须另做 ADR。
    - R032 使用 `ApplicationExitInfo` 保留原始 reason/时间并识别保守终止信号；禁止将 `REASON_USER_REQUESTED` 标成 Task Manager Stop 专属信号，API <30 走不自动播音的 fail-safe。
    - R033 完成 Active Apps Stop、adb stop-app、Settings Force Stop、recents swipe、普通后台矩阵；每项采集原始 reason/时间、进程/FGS 存活性与 session 结果，recents 仅在 FGS/进程存活时可继续，终止后一律等待显式 Start/Continue。
    - R034 验证 bootCount 变化、旧 session 不自动播放、无 BOOT_COMPLETED resume。
    - R035（条件 P0）若本轮触及数据库初始化/连接配置，则启用并验证 WAL；未触及则保留为未触发条件项，不计固定 P0 缺口。
    - R039 统一 package/app version、versionCode、tag、HANDOFF。
    - R041 核对 V1.0 宪法/SPEC + V1.1 §1.1 增量条款 + 本计划 + 当前代码，不再声称存在独立 Constitution/SPEC V1.1 文件。
    - R042 全量自动回归、hardening tests、typecheck、Expo Doctor 通过。
    - R043 完成 API 33、Android 14 Redmi/HyperOS 物理机、API 36、minSdk smoke/决策矩阵；API 33/36 均逐一记录 POST_NOTIFICATIONS 允许/拒绝两分支的 FGS 启动、Task Manager 与 drawer 可见性，不以“仍可运行”掩盖可见性退化。
    - R044 完成 21 类 Final Acceptance，状态达到 `V1.1 HARDENING COMPLETE`。
  - P1（blocking / 非 blocking 注明）：4 项常规非 blocking + 1 项条件 Release Blocker；当前 internal APK 轨道的 blocking P1=0。
    - R036（非 blocking）TTS Offline Capability：成本合理时检测 voice network requirement，否则修正产品说明/设置提示；Redmi/eSpeak 作为实测样本。
    - R037（非 blocking）Audio Focus QA：验证音乐、电话、Bluetooth 打断与恢复。
    - R038（非 blocking）HyperOS Battery QA：验证默认电池策略并记录 OEM 限制/用户指引。
    - R040（非 blocking）ADR Update：新增/更新 clock/session snapshot/background/persistence ADR，旧 ADR 标 superseded 不删除。
    - RB-PLAY-FGS（internal APK 阶段非 blocking；一旦进入 Google Play 发布轨道即为 blocking Release Blocker）：Play Console 中的 FGS 类型、完整 subtype/功能描述、用户影响、可终止性与演示视频必须与 R024 ADR、manifest 和运行时 type 一致；未闭环不得发布 Play。
  - P2：
    - 历史会话查询、SessionSnapshot 独立历史表、跨设备同步、云备份与更多 OEM/语音引擎扩展矩阵。
- Human Decisions Needed：
  - 当前无阻塞产品决策；建议沿用最小路径：不为赶在 2026-10-01 前验 native 而擅自安装 JDK 或购买额度，额度恢复后用 EAS preview/development build 完成 Gate。
  - 若必须提前完成 native 验收，Human 需明确选择并授权“安装/配置本地 JDK + Android build toolchain”或“提供付费/其他构建通道”；planner 不替用户扩大环境与费用范围。
  - 若 R024 Stop Gate 触发，Human 需在“缩减为仅可见/实际播音期间保障”与“授权对 `specialUse` 的正式发布审查风险”中拍板；未拍板不得继续后台 FGS 发布路径。
  - 正式进入 Phase2 仍需 Human 明确口令“第二阶段，开发”；本文件写入不代表开发授权。
- Readiness Score（Plan Readiness Score / 计划成熟度，满分 100）：
  - 产品目标与用户需求（20）：19/20。增量目标、首要用户与失败体验已清晰；更广泛用户调研不属于本轮 hardening 必需项。
  - 核心方案完整性（20）：20/20。Native→Clock/Session→Runner→FGS Type default/fallback/Stop Gate→Lifecycle→矩阵→验收链完整，Path B 有受控入口。
  - 外部事实与竞品验证（20）：18/20。Round1 已用 Android/Expo/Google Play 官方资料核验关键平台事实并被本版吸收；EAS 额度与真机/OEM 行为仍待实证。
  - 技术可行性（15）：13/15。现有代码与测试资产支持增量方案；无 JDK 且 EAS 到 2026-10-01 才恢复，使 native 可行性只能在构建通道恢复后闭环。
  - 风险与异常场景（10）：10/10。覆盖 wall-clock、boot、模糊终止信号、API <30 fail-safe、通知拒绝、Doze、OEM、TTS、迁移、WakeLock 泄漏、FGS 类型与构建阻塞。
  - 开发范围与 DoD（10）：10/10。R001–R044、39 固定 P0 + 1 条件 P0 + 4 常规非阻塞 P1 + 1 条件 Release Blocker、DoD 和禁止项已一一映射。
  - 未决问题（5）：4/5。计划层 P0=0、当前 blocking P1=0；仅保留提前构建通道与 R024 Stop Gate 触发后的条件性 Human 决策。
  - 合计：94/100（planner 自评）
  - Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证
  - Gate 自检：分数达标；计划层未决 P0=0、当前 blocking P1=0。本文所列 39+1 P0 是 Phase2 实施优先级，不是计划缺口。Round1 的 P0-1/P0-2/blocking P1-1 已在计划中闭环，P1-2 已转为明确的条件 Release Blocker；当前仍等待 Research Reviewer Round2 独立复核，不自行进入 Human Gate。
- Research Review Round（第几轮/Reviewer 结论摘要）：Round 1 打回待 Round 2。Round1 结论为 81/100、P0=2、blocking P1=1；本 V1.2 已按要求修复 P0-1 保守终止信号、P0-2 FGS Type 框架 + default/fallback/Stop Gate、P1-1 R023 通知双分支，并将 P1-2 Play 发布要求明确为 `RB-PLAY-FGS`；下一步由 Research Reviewer 进行 Round2 复核。
- PLAN_GATE：IN_PROGRESS
