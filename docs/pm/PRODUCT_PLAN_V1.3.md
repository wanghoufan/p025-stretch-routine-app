# PRODUCT_PLAN｜V1.3 历史统计增量基线草案

- Plan Version：`PRODUCT_PLAN_V1.3`；局部取代 `PRODUCT_PLAN_V1.2` 的历史统计排除条款，其余不冲突的 V1.0／V1.2 要求继续有效。本文已获 Human Gate 批准（2026-09-27），**即新 `DEV_BASELINE`**；本文不宣称任何开发或真机验收已经完成。
- PROJECT_PHASE：`DEVELOP`（2026-09-27 Human Gate 批准本文并获用户开发口令后进入；批准前本文曾处 `WAITING_HUMAN_APPROVAL`；治理字段以 HANDOFF 当前值为准）。
- Product Goal：在保留现有离线拉伸语音流程的基础上，让用户查看**统计启用后可信归档的实际动作时间**：全部累计、按流程训练类型累计、最近 10 条；诚实标明提前结束、旧历史不可回溯和异常丢失。`TASK-021-R006` 真实单调时钟与 boot 身份先行，真机通过后才开发统计。
- Target Users：在 Android 手机上用语音完成拉伸、热身或核心流程，并希望回看自己练习时间的本机用户；首轮可验设备为 **indq5xfi6hovay4d（Redmi Note 12 Pro，API 34）**（用户 2026-09-27 明确：本项目的真机验收只用这一台，不要用别的手机；此前误在 Redmi Note 11T Pro+ 上取证的部分结论以 12 Pro 复核为准）。
- Problem：当前只有单例 `active_session`，终态清行，没有可查的历史。当前 JS `MonotonicClock` 实为 `Date.now()`，`BootInfo` 以进程创建时间近似 boot；改系统时间可能跳阶段或丢会话，进程重建可能被误判为重启。直接累计会把未练时间记入或静默漏记。既有 `category` 混合场景与部位，不能可靠表示训练类型；完成页原“用时”含转场，也与拟统计口径不同。
- Core Value：只展示有可信时间源、可解释归档来源的本机练习时长；用户可按独立流程类型看累计及最近记录，并能单删或清空统计，不影响流程和动作库。
- User Flow：
  1. 用户可在流程编辑页选择一种训练类型；自建流程默认“未分类”。新播种的 9 个流程按正文映射表预置；既存流程不凭名称、旧标签或 `category` 猜类型。
  2. 启动流程时冻结所选类型；Runner 继续按现有快照运行。暂停、转场不计动作时间；Skip、Previous、双侧与 `+10s` 只按实际跑过的动作毫秒结算。
  3. 完成或主动结束时，`COMPLETED` 及实际动作时间大于 0ms 的 `STOPPED` 在同一事务内归档并清活动会话；后者标“提前结束”。0ms 不入历史。落盘成功后才显示已计入，失败保留重试入口。
  4. 首页“我的流程”内容区进入独立“历史统计”页，不加第 4 个常驻 tab。统计页显示全部累计、各类型与未分类累计、最近 10 条，以及混合流程的分类局限和本机保存声明。
  5. 用户可在统计页二次确认后删单条，在设置页二次确认后清空全部统计；累计随剩余记录重算。统计删除与清示范数据互不影响。
- Functional Scope：
  - **V1.3 取代 V1.2 `Out of Scope` 原第 36 行**“不建立 SessionSnapshot 历史表或两张 snapshot 表；V1.1 没有历史会话查询需求”中的**历史查询排除**：本轮纳入单独的会话历史归档与查询；仍不建立两张步骤 snapshot 表，运行步骤真源保持现有 `SessionSnapshot`。
  - **V1.3 取代 V1.2 `Key Assumptions` 原第 68 行**“一个 ActiveSession 足够，V1.1 不需要历史会话查询”：仍只允许一个活动会话，但终态另存历史，多场会话可查询；不能再以单例活动表推断历史无需求。
  - **V1.3 取代 V1.2 `P2` 原第 154 行首项**“历史会话查询、SessionSnapshot 独立历史表……”中的**历史查询延期**：历史查询升为本轮 Functional Scope／P0；跨设备同步、云备份及更多 OEM／语音引擎矩阵仍留 P2。不把运行时 `SessionSnapshot` 复制为第二套历史步骤真源。
  - **训练类型体系（HD-1、HD-5）**：首版仅预置三类 `拉伸放松`、`热身`、`核心训练`；`拉伸` 与 `放松` 是同一类。用 `training_types` 独立表或语义等价的可迁移配置表承载稳定 `type_id`、中英显示名、排序与启用状态；`routines.training_type_id` 可空，`NULL` 显示为“未分类”，**未分类不是第四个预置类别**。UI 类型选项、统计分组从表查询，不用三值封闭 enum、switch 或硬编码列表。新增 `上肢训练`／`下肢训练`／`平衡训练` 时可由以后版本的 additive migration 预置新行，旧 `type_id` 与历史标签保留。**推荐随版本预置，不在 V1.3 做用户自建入口**：当前类型要作为所有用户可比的统计轴；用户自建须额外解决改名、合并、删除与历史归属，成本与本轮最小范围不相称。未来可另立需求增加自建，不需改动现有记录结构。流程编辑器只选一类，混合流程整场归入所选类；统计页提示由此产生的分类偏差。步骤级覆盖（原 A 档）保留升级路径，旧流程级历史不能准确回拆。
  - **9 个种子流程固定映射（按定义写入，不运行时猜名；仅 App 新插入的种子可安全赋型）**：

    | 种子流程 | `training_type_id`／显示名 |
    |---|---|
    | 晨起全身拉伸 | `STRETCH_RELAX`／拉伸放松 |
    | 久坐办公族拉伸 | `STRETCH_RELAX`／拉伸放松 |
    | 跑后下肢放松 | `STRETCH_RELAX`／拉伸放松 |
    | 办公室久坐放松 | `STRETCH_RELAX`／拉伸放松 |
    | 睡前全身放松 | `STRETCH_RELAX`／拉伸放松 |
    | 5分钟快速热身 | `WARMUP`／热身 |
    | 初级核心 | `CORE`／核心训练 |
    | 中级核心 | `CORE`／核心训练 |
    | 高级核心 | `CORE`／核心训练 |

    既存示范行即使同名也不自动赋型，因为随机 ID、用户改名及历史修复无法证明归属；用户可在编辑页自行选。`seed_examples_cleared` 后绝不复活种子。用户自建流程默认未分类。

    【2026-09-27 实施补注（neat-freak 记，依据 supervisor 放行的 `TASK-021-F1`，详见 HANDOFF「TASK-021 历史统计功能」与 `docs/qa/task021-真机第一轮.md` §2）】上句口径已被 F1 收窄：真机 QA 第一轮抓出 P0——存量 9 个种子流程全部落「未分类」，分类维度对存量用户失效；修复为 **v5 迁移按种子流程名一次性回填 `training_type_id`**（只填 NULL、不覆盖用户已设），口径收窄为「**实时新增／复制不凭名字猜，存量回填允许名字匹配**」。当前口径以本补注与 HANDOFF 为准。
  - **HD-2～HD-8**：>0ms 的主动结束归档并标“提前结束”；首页入口而非新 tab；单删与清全部；9 种子按表预置；完成页“用时”改为与统计同源、同单位和舍入的实际动作时间（不含暂停与转场）；完成页及 Runner 接中英双语，停止确认改掉“已经完成的部分不会保存”的假话；统计页中英双语写“数据仅保存在本机，不上传”。完成页和 Runner 仅做本地化、HD-6 所需显示调整和停止文案事实修正，不重构两屏其他逻辑。
  - **三条实施闸门**：① `TASK-021-R006` Builder→Code Reviewer→QA 新包真机手动改钟→Supervisor→TM 记 PASS 为 B1～B5 的**串行硬前置**；FAIL／未验证时 B1～B5 均不得开工，无“隔离开发”例外。② **D 档否决留痕**：只做总时长的 D 档已由用户否决，因为不能回答各类练了多久，且旧记录无法精确回拆；不是本轮实现或验收分支，将来重审须另走 Change C。③ **排除／异常分流**：预期排除是封闭枚举 `stats_eligible=0`（升级前已开始的会话）、实际动作时长 `0ms`、终态 `ERROR`，只给中性局部说明，不设统计缺口警示；**不在该枚举内的一切未归档或丢失情形，一律按异常丢失处理**，先持久化原因与时间，醒目可关闭提示，存在未关闭通知时显示“合计可能低于实际练习”。归档失败保留会话与重试入口，通知写入失败不得静默清活动行。
  - 统计只依赖本机 SQLite；最近 10 条稳定排序，分类累计与总累计从可信历史记录计算。旧会话已清行，**不能回溯或补造**；空白不等于用户过去未练。演示流程不自动生成历史记录；卸载或清 App 数据会失去本机统计，不承诺自动备份。
- Out of Scope：不回填旧历史，不按流程名／`category`／部位猜训练类型，不给既存行自动赋型，不做用户自建训练类别入口；不做步骤级拆分、旧记录回拆、日周月趋势、图表、打卡、目标率、部位平衡、备注、单次详情、导出、账号、云同步、健康平台写入或传感器指标。无图表库，不为本轮引入图表库。R004 与 R022–R034 等其他 native hardening 不借本任务宣称完成；完成页／Runner 其他逻辑与视觉重构不在本轮。
- Technical Approach：
  - **优先级**：P0-5 的 native hardening 仍挂账；其中 R006 的真实单调时钟／boot 身份最小切片因历史统计已有明确需求方、Task ID、串行排期和真机 Gate，**现在先执行，不再称“待排期”**。R004、R022–R034 仍按原计划独立排期与验收。R006 切片不等同完成整个 P0-5，也不证明 Doze／FGS 行为。
  - **V1.2 过期环境叙述逐项更正（旧文件保留历史、不修改）**：① `Problem` 的“当前机器无 JDK、native build 有排期阻塞”现为 JDK17＋Android SDK 已装、本地出包链已通；② `Technical Approach / Build/QA` 的“只能先写 TS、native Gate 默认等 10-01 EAS”现为可走本地构建并做新包真机 QA，仍须本任务实际出包取证；③ `Key Assumptions` 的“EAS 免费额度若未恢复即构建阻塞”不再是本轮必要依赖，EAS 只作备用；④ `Risks` 的“无 JDK＋额度不可用导致当前构建阻塞”改为**R006 实作与真机改钟尚未通过**的技术／验收风险。V1.2 末尾 `PLAN_GATE=IN_PROGRESS` 是该旧文件当时的文内状态，不作为当前治理字段；HANDOFF 的 `WAITING_HUMAN_APPROVAL / READY_FOR_HUMAN_REVIEW` 与本草案当前状态一致。
  - **R006 Gate DoD**：Android 本地 `elapsedRealtime()` 语义及真实 boot 身份接入权威时钟端口；12 Pro（`indq5xfi6hovay4d`） **新构建包**执行改钟。唯一操作口径：系统设置 → 系统 → 日期和时间 → 关闭自动确定时间 → **手动**分别前拨／后拨 ±1h、±1d，每次立即记录设备时间与 Runner 倒计时、顶部已用时间读数；未 root 零售机不以 `adb shell date` 设钟（通常 Permission denied）。每次倒计时与**顶部已用时间**连续、不回跳、不跨阶段或瞬间完成、不丢会话，覆盖暂停／恢复及后台回前台；此阶段不要求观测 B1 尚未实现的“已跑动作时间”。`force-stop` 后同 boot 重开可信恢复且不重复计时；真重启后识别 boot 改变，不把旧 elapsed 当成本次运行，现有可见错误提示给出可解释结果；**跨入口持久化异常通知属于 B1 DoD**。记录包版本、设备、操作序列与视频；Reviewer、QA、Supervisor PASS 并由 TM 记账后才解锁 B1～B5。Fake clock 单测不得替代真机 Gate。
  - **B1 先审结算伪码**：Builder 在改代码前列出 tick、Skip、Previous、Pause、Stop、Complete、后台 catch-up 的结算与持久化顺序，Code Reviewer 先审。每段只累计动作阶段实跑毫秒，跨边界逐段封顶；`+10s` 只计真正运行到的部分，双侧各记，Previous 重练时间另计。既有 `completedPhaseMs` 含转场且可被 Previous 的计划值覆盖，禁止从它或完成页旧 `routineElapsedMs` 回推统计；禁止另造墙钟差值计时器。
  - **单一权威源**：现有 `SessionSnapshot` 继续是步骤列表唯一真源；不新增 `stats_state_json` 或历史步骤副本。流程类型在会话开始时冻结为 `active_session.training_type_id` **一个可空分类标量**，不再设每类一个 active_session 累计列；`stats_total_step_ms`、`stats_accounted_phase_ms`、`stats_eligible` 为独立计时／资格标量。旧活动行默认 `stats_eligible=0`，仍可恢复但不补算。现有 v1 snapshot 按原版本显式解码，不能因新增分类误判 corrupt。阶段水位随阶段切换归零，累计总数只增；状态与累计原子保存。
  - **数据与终态**：SQLite v4 additive migration 增 `training_types`、`routines.training_type_id`、活动会话上述标量、`session_history`、`stats_anomaly_notice`，并同步测试辅助 `resetSchema()`；不改 v1–v3。历史行以 `session_id` 为幂等主键，保存流程 ID／名称及类型快照、`COMPLETED/STOPPED`、开始／结束 wall 毫秒、结束日及非负 `total_step_ms`。B 档每场仅一种类型，**历史主行一个 `training_type_id` 即可**，不建冗余类型累计明细表；新类别天然按 `type_id` 聚合。历史类型 ID 不可因流程之后编辑而改变；已使用的类型行不可删除或复用 ID。最近记录按 `ended_at_wall_ms DESC, session_id DESC LIMIT 10`；只建一个与查询匹配的时间索引。`end_local_date` 于终态以 UTC 毫秒和设备 offset 做纯算术，不依赖 Hermes `Intl`；跨午夜整场归结束日，换时区后旧记录不重排。日期不可信则异常告知，不猜。
  - **原子归档与删除**：`archiveAndClear(session)` 结算末段后在一事务内插历史、清活动行；`session_id` 重试只留一条。成功提交后才能显示“已计入”；持久化异常保留活动会话和重试入口。将当前吞错／fire-and-forget 的终态链改为可等待，防完成页先报成功。替换流程先成功处置旧场再开始新场。单条删除只删该历史行；清全部只删历史及统计异常通知；均不碰 `routines`、`routine_steps`、真实动作库、活动会话、设置或 `seed_examples_cleared`。
- Data / API：无新远端 API／云服务。`training_types(type_id TEXT PRIMARY KEY, name_zh, name_en, sort_order, is_active)` 起始只插 `STRETCH_RELAX/WARMUP/CORE` 三行；新增类型通过后续版本 migration 插行，界面与 `GROUP BY type_id` 动态读取。`routines.training_type_id`、`active_session.training_type_id`、`session_history.training_type_id` 均可空，NULL 形成“未分类”展示桶；类型引用用稳定 ID，删除限制保障旧历史可读。`active_session` 另加 `stats_total_step_ms`／`stats_accounted_phase_ms`／`stats_eligible`；`session_history` 有 `session_id`、流程快照标识和名称、终态、wall 时间、结束日、总动作毫秒；`stats_anomaly_notice` 有原因码、发生时间、关闭位。读接口返回总数、按类型聚合、最近 10 条；写接口提供幂等归档、单删、清全部和异常通知关闭，均为本地 SQLite 操作。分类显示名由类型表取中英字段；未分类由 i18n 字典提供。
- Key Assumptions：旧版没有历史表且终态清活动会话，已丢旧会话不可回溯；`Date.now()` 回退时钟不是单调源，R006 实作与真机验证**尚未发生**；当前单例 ActiveSession 仍够表示“正在练的一场”，历史需独立表；流程级类型可回答用户要的类别累计，但混合流程有已知分类偏差；本地 SQLite 支持 additive v4、事务及聚合，运行时可先用无图表的文本卡片呈现。关键实施假设由 R006 真机 Gate、隔离库 migration／归档测试和 12 Pro（`indq5xfi6hovay4d`） 新包验证，不把计划推断写成已通过。
- Competitor / Research Summary：
  - **本轮新核外部资料，2026-09-27，均为产品方官方页面**：[华为《查看运动健康 App 运动记录详情》](https://consumer.huawei.com/cn/support/content/zh-cn01057412/)写明从首页运动记录卡片进入、按“所有运动”或具体运动类型查看总数据（含总时长）、查看单次记录、长按删单条；[华为《在运动健康 App 查看健身记录》](https://consumer.huawei.com/cn/support/content/zh-cn15892856/)写明健身课程记录可由“运动记录”或“健身→运动时长”进入。这证明**入口、类型总量、最近单次记录和删除**是可理解的统计形态；不证明用户要求所有华为指标。
  - [小米运动健康云服务接口官方文档](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2328)的运动记录例子分别给 `startTime`、`endTime`、`sportKey` 与 `sportTime`（有效运动时长，秒）；[小米官方支持页](https://www.mi.com/global/support/faq/details/KA-170830/)说明单次运动记录可查看心率、步频、配速、热量等。这支持**有效时长须与起止墙钟分开存**、按运动类型汇总的设计；传感器派生指标需要本项目没有的数据源，故不采纳。小米接口只是竞品公开形态证据，**本项目不接入云 API**。
  - **取舍／推论**：采用“首页入口→全部与类型累计→最近 10 条→按条删除”的轻量形态，统一完成页与统计页的实际动作时间口径；保留本机离线、双语隐私声明，不复制华为／小米的穿戴设备、云同步、轨迹、心率和图表。官方页面证明功能形态存在，**不是本项目用户访谈或真机实测**；类别命名与热身归属以本项目用户已批准决策为准。
- Risks：
  - R006 是真 native 切片，需新包与手动改钟；未 PASS 则统计开发停在硬门外。当前 JDK17＋Android SDK 已就绪、本地 APK 构建链已通，不能再沿用 V1.2“无 JDK／只能等 EAS”的阻塞叙述；仍需实际构建并在 12 Pro（`indq5xfi6hovay4d`） 验证。
  - R004／R022–R034 的 FGS、Doze、WakeLock 和版本矩阵仍属 P0-5 挂账；本轮统计不承诺未验证的后台时段精度。进程终止、boot 不符、12h stale、损坏／越界、墙钟日期异常、归档失败可能少记，走持久化异常提示，不伪造毫秒。
  - 混合流程整场归一类有分类偏差；页面提示。新类别若改名或停用，稳定 ID 和历史显示名策略须保住旧记录；V1.3 不删除已用类型。既存种子保持未分类可能需逐个手动编辑，这是不猜测既存行的代价。
  - 完成页“用时”从含转场改成实际动作时间后可能变小；页面中英说明“只统计实际动作时间，暂停和转场不计”。Runner 顶部若继续含转场，明确标“流程已用（含转场）”，不得冒称统计值。
  - 旧历史已删除不可回补；卸载、清 App 数据或主动清空会失去本机统计。删除前二次确认，空状态如实告知；统计异常通知不得被预期排除分支吞掉。
- DoD：
  - [ ] `TASK-021-R006` 真 native 时钟／boot 接线完成，新包在 12 Pro（`indq5xfi6hovay4d`） 依**系统设置手动改钟** ±1h／±1d 的全序列取证；Runner 倒计时和顶部已用时间连续，同 boot 重开／真重启判定符合上文；Code Reviewer、QA、Supervisor PASS，TM 记账后 B1～B5 才开工。R006 不以前置阶段尚不存在的“已跑动作时间”作断言；B1 负责持久化异常通知。
  - [ ] `training_types` 首版**恰好三行**且可由后续 migration 加新行，不存在三值封闭代码枚举；编辑页从表取选项，自建默认未分类。9 个新种子定义的 `training_type_id` **与 Functional Scope 映射表逐条相等**，特别断言“5分钟快速热身”=`WARMUP`；既存行不自动赋型、清示范后不复活。
  - [ ] 流程类型在会话开始时冻结，之后编辑流程不改历史；活动会话只有一个分类标量、没有每类累计列或第二份步骤 JSON。总累计＝各已预置／后增类型桶＋未分类桶之和；混合流程偏差提示可见。未来插入测试类型行无需改统计分支即可展示。
  - [ ] 暂停、转场、未跑到的 `+10s` 不计；Skip、Previous、双侧、跨多边界及后台恢复按实际动作区间结算无漏重。完成页与统计页对同一场显示同源、同单位、同舍入的实际动作时间，数字变化说明可见。
  - [ ] `COMPLETED` 与 `STOPPED` 且 >0ms 事务归档，后者显示“提前结束”；0ms／ERROR／升级前不合资格会话不计。重复 `session_id` 仅一条；归档失败不清活动行、不报成功并可重试；替换先归档旧场。演示流程不生成历史。
  - [ ] 预期排除只含 `stats_eligible=0`、0ms、ERROR；枚举外未归档一律异常，原因与时间先持久化，通知可关闭且关闭不改累计；写通知失败不能静默清行。首页或统计页能看到异常，未关闭时显示合计 caveat；两类文案有中英集成断言。
  - [ ] v1/v2/v3→v4 additive migration 保留动作／流程／设置／活动会话，`resetSchema()` 同步；旧活动会话不补算、不误判 snapshot corrupt。结束日算术覆盖跨午夜与时区测试，最近 10 条按时间＋ID 稳定排序。
  - [ ] 首页内容区入口进独立统计页、无第 4 常驻 tab；总数、类别、最近 10 条、旧历史不可回溯和“数据仅保存在本机，不上传”中英可见。统计页单删与设置页清全部均二次确认，累计即时重算；`seed_examples_cleared`、真实动作库／流程／活动会话均保持不变。
  - [ ] 完成页＋Runner 的既有硬编码文本接入双语，停止确认不再声称已完成部分不会保存；只涉及本地化、HD-6 显示和该假话修正。`npm run typecheck`、`npm test -- --runInBand` 通过；隔离库迁移／故障注入、12 Pro（`indq5xfi6hovay4d`） 新包离线与覆盖安装真机验收、Code Reviewer／QA／Supervisor 全链通过。
- P0 / P1 / P2：
  - P0（非做不可）：Change C 基线与 Human Gate；`TASK-021-R006` 串行硬闸门；B1 可信结算／v4／归档／异常通知；B2 累计与最近 10 条及首页入口；B3 表驱动类别、编辑器与种子映射；B4 完成页／Runner 时长与双语；B5 单删／清全部；隔离库和 12 Pro（`indq5xfi6hovay4d`） 真机验收。P0-5 原 native hardening 持续挂账，其中 R006 最小切片现在先排，R004／R022–R034 不随本轮关闭。
  - P1（blocking / 非 blocking 注明）：计划层 blocking P1=0。D 档否决只留决策记录，不作为实施分支；发布时如触发 V1.2 的 `RB-PLAY-FGS`，仍按原条件 Release Blocker 执行。无新增本轮 blocking P1。
  - P2：步骤级分类与旧记录不可回拆说明的未来升级、日周月趋势／图表／部位平衡／打卡／备注／导出、用户自建类别、跨设备同步及更多 OEM／语音引擎矩阵。本轮不做。
- Human Decisions Needed：**无新的产品选项待拍板**。用户已定三类与 9 种子映射，以及 HD-1～HD-9；D 档已否决，不再重问。治理动作仅剩 TM 按 Human Gate 正式批准本 V1.3 草案后登记 `PLAN_VERSION=PRODUCT_PLAN_V1.3`、`DEV_BASELINE=PRODUCT_PLAN_V1.3`、`PLAN_GATE=APPROVED`、`PROJECT_PHASE=DEVELOP`、`CHANGE_REQUEST=NONE`；批准前本文件仍是草案。R024 未来若触发原有 FGS Stop Gate，沿用 V1.2 条件决策，不是本轮开放问题。
- Readiness Score（Plan Readiness Score / 计划成熟度，满分 100）：
  - 产品目标与用户需求（20）：19/20。12 项已定，旧历史、混合流程和本机限制已如实告知；未做独立目标用户访谈。
  - 核心方案完整性（20）：19/20。三类表驱动、单场类型快照、计时／归档／删除／异常路径闭合；native 实作尚待 Gate。
  - 外部事实与竞品验证（20）：16/20。本轮独立核查华为两份官方支持页及小米官方接口／支持页，证实首页入口、类型总时长、单次记录、删除及有效时长与墙钟分离的公开形态；没有把竞品说明当本项目用户反馈或实测。
  - 技术可行性（15）：14/15。本地 JDK／SDK／出包能力已就绪，v4／事务／动态分组可实施；真实 native 时钟仍需新包验收。
  - 风险与异常场景（10）：9/10。封闭排除枚举、异常兜底与持久化提示覆盖已知漏数路径；OEM 长后台仍属挂账。
  - 开发范围与 DoD（10）：9/10。映射逐条断言、R006 可观测读数、删除隔离与真机验收明确；完成前不得宣称通过。
  - 未决问题（5）：5/5。产品选择已定；仅剩正式 Human Gate 与实施验证。
  - 合计：**91/100（Planner 对 V1.3 草案的自评，不沿用 V1.2 的 94；Research Reviewer 尚未独立评此文件）**。
  - Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证。**计划层** P0 未决=0、blocking P1=0；上列实施 P0 是开发待办，不计为计划缺口。关键产品事实已由代码与本轮官方资料核查；R006 实际是否通过留给串行真机 Gate，不把它伪写成当前事实。
- Research Review Round（第几轮/Reviewer 结论摘要）：TASK-021 局部计划经 Research Reviewer Round 3 判 PASS（该卡 76/100，P0=0、blocking P1=0；PASS 仅表示可作为 V1.3 输入，**不是 V1.3 的独立评分**）。本草案已补新外部证据，收口其五条 P2，待按治理流程评审／批准。
- PLAN_GATE：`APPROVED`（用户 2026-09-27 于 Human Gate 批准，并明确口令`第二阶段，开发`）。本文件即成为新 `DEV_BASELINE`。
