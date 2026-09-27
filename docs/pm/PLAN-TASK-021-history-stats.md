# PLAN｜TASK-021 历史统计（Round 3 收口，待 Research Reviewer 复审）

> 【neat-freak 2026-09-27 补注｜仅加收工状态指针，正文按写作时快照保留】本卡规划已**全部落地并放行**：`PRODUCT_PLAN_V1.3` 已建立并成为 `DEV_BASELINE`（取代本卡过渡口径「DEV_BASELINE 仍为 V1.2」）；Task Breakdown 各项全部完成——R006 PASS → B1～B4＋F1 → 真机 QA 两轮全过 → supervisor 复检放行（见 HANDOFF「TASK-021 历史统计功能」章节与 `docs/qa/task021-真机第一轮.md`、`docs/qa/task021-r006.md`）。真机验收设备以 **Redmi Note 12 Pro（`indq5xfi6hovay4d`）** 为准，正文中的 xagapro 为写作时旧口径；种子「既存同名不赋型」口径已被 F1 收窄（存量回填允许名字匹配，见 V1.3 实施补注）。

- DEV_BASELINE：当前仍为 `PRODUCT_PLAN_V1.2`；本卡不是新基线。
- CHANGE_REQUEST：**C**。
- PROJECT_PHASE：`PLAN_REOPEN_REQUIRED`（HANDOFF 已由 TM 登记）。
- Review Round：3。Round 2 Research Reviewer：P0=0、blocking P1=3、Readiness 74/100；用户 2026-09-27 已拍板 HD-1～HD-9。

## Product Goal

让用户在本机看到**从统计启用后可信归档的实际动作时间**：全部累计、按流程训练类型分开的拉伸／放松／核心训练累计，以及最近 10 条训练。每条流程只选一种独立训练类型；不从现有 `category` 或名称推断。旧版已清除的会话无法回溯，演示流程和不可信时段不入账。

## Current Stage

- Stage ID：`stretch-app-v11-ambient / TASK-021-history-stats`。
- Goal：锁定最小范围、可信时间源、终态归档与丢失告知，再形成可实施的新产品基线。
- **Change C 依据**：`PRODUCT_PLAN_V1.2.md:36` Out of Scope、`:68` 技术取舍、`:154` P2 首项均排除历史查询。即使只做总数，也新增历史查询和终态归档；上一轮判 B 错误。
- 路径：TM 局部暂停本任务 → Sol Planner 修订本卡 → Research Reviewer 复审 → TM 形成可审阅的 `PRODUCT_PLAN_V1.3` 级增量草案（将历史统计移入 Functional Scope，写清 Requirement/DoD）→ Readiness Gate → Human Approval → 批准的新 Plan 版本成为新 `DEV_BASELINE` → 用户明确进入开发 → Builder。本轮仅改本卡，不创建 V1.3。无需全量重跑 V1.1。
- **串行硬前置 HD-9=A／P1-A**：开发阶段先执行 `TASK-021-R006`（真实单调时钟＋真实 boot 身份的 R006 最小切片）。Builder 实作、Code Reviewer 复核、QA 真机改钟验收、Supervisor 复检，TM 记 PASS；**未 PASS 则统计 Builder 子任务 B1～B5 全部不得开工，不存在“隔离开发”例外**。R004、R022～R034 native hardening 保持原挂账。
- 已核实：`MonotonicClock.ts:36-42` 返回 `Date.now()`；`BootInfo.ts:29` 以进程创建时 `Date.now()` 近似 boot；`startRoutineService.ts:88-90` 身份不符即静默清行。`FakeMonotonicClock` 单测只验证理想端口逻辑，绝非真机证据。

## Stage P0（由 Planner 初定，TM 拍板）

- [x] 用户已拍板 HD-1～HD-9，本卡固化范围，不再把它们列为开放问题。
- [ ] Change C 新基线与 Human Gate 完成前不得实施统计代码；原 native P0 不因此消失。
- [ ] `TASK-021-R006` 先完成且真机改钟验证 PASS；**未通过则 B1～B5 不开工**。原 native P0 不因此消失。
- [ ] 预期排除与异常丢失分流；异常丢失不得静默，预期排除不触发统计缺口警示。
- [ ] COMPLETED 与实际动作时间 >0ms 的 STOPPED 原子归档并清活动会话，`session_id` 幂等；持久化成功后才显示“已计入”。失败保留可重试状态。
- [ ] 首发提供全部与分类累计、最近 10 条、单条删除及设置页清空统计；旧历史不可回溯，演示数据不入账。
- [ ] 完成页与统计页统一实际动作时间；完成页和 Runner 接双语，并修正 Runner 停止确认假文案。
- [ ] v4 additive migration、隔离库测试、类型检查、全量测试、xagapro 真机新包验收、Reviewer/QA/Supervisor 全链通过。

## In Scope

### 1. 流程级分类（HD-1=B、HD-5=B）

- 每条流程选一种独立 `training_type`：`STRETCH`（拉伸）、`RELAX`（放松）、`CORE`（核心训练）；未设置时为 `UNCLASSIFIED`（未分类）。流程编辑页提供选择；不做步骤级覆盖。统计展示全部累计和四类（含未分类）累计，四类之和等于全部。
- 9 个种子流程在开发时**逐条人工指定正确训练类型**并写入种子定义；新装机播种及 `repairSeededRoutines` 可确定由 App **新插入**的行使用定义。既存示范行因随机 ID、可改名，不能凭名称猜测；既存自建流程默认未分类，由用户在流程编辑页选择。`seed_examples_cleared` 后不复活种子。
- 会话开始时冻结流程类型，之后编辑流程不重写旧历史。**已知局限**：同一流程混合拉伸、核心等动作时，整场实际动作时间归入所选的一类，分类数字有偏差；统计页简短提示“混合流程按流程类型整体计入”。未来可增加步骤类型覆盖、升级快照及明细写入以精确拆分，但旧流程级记录不倒推拆分；本任务只留升级路径，不实施。
- **D 零分类已评估且被用户否决**：它只能回答总共练多久，不能回答拉伸／放松／核心各多久；未来无法准确回拆 D 时期的旧记录。C 复用 `category`／名称映射语义不可靠。`routines.bodypart` 与训练意图正交、可能多值，首发不做部位图。无图表库，趋势条后置。

### 2. R006 前置、有效时长与恢复（HD-9=A）

- `TASK-021-R006` 责任链：Builder 实作 Android 本地真实单调时钟 `nowElapsedMs()`（如 `elapsedRealtime()`）和可信 `getBootCount()`／等效 boot 身份；Code Reviewer 审源与 JS 接线；QA 在 xagapro **新构建真机包**上验证；Supervisor 复检，TM 记 PASS。Fake clock 单测不算闸门证据。
- **R006 DoD**：同一运行会话分别把系统时间前拨、后拨 **±1h 与 ±1d**，倒计时不回跳、不瞬间跳过阶段或直接完成、不丢会话，已跑动作时间不随墙钟跳变；覆盖暂停／恢复和后台回前台。`force-stop` 后同 boot 重开能可信恢复且不重复计时；真重启后正确识别 boot 改变，不把旧 elapsed 值误作本次运行，并给出可解释结果。记录包版本、设备、操作顺序、倒计时与恢复状态。任何一项失败即闸门 FAIL，B1～B5 不开工。

- **动作有效时长**只算动作阶段实跑毫秒；暂停与转场排除。`+10s` 只计跑到的部分，Skip 截至跳过瞬间，Previous 重练真实时间另计，双侧左右分别计。`completedPhaseMs` **含转场且 Previous 会按计划值重置**，完成页 `routineElapsedMs` 不能回推统计。这条保留上一轮正确判断。
- 复用 Runner 阶段时间函数，状态机返回本次事件新增的实际动作区间/毫秒，账本只消费一次；跨多边界逐段封顶。Builder 改代码前交 tick、Skip、Previous、Pause、Stop、Complete、后台 catch-up 的结算与持久化伪码，Code Reviewer 先审。不得新造 `Date.now()` 差值计时器。
- **当前构建不保证改系统时钟后时长正确**：Date.now 跳 +1h 可让 `advanceRunner` 一 tick 冲到 COMPLETED，把未练步骤按全额归档；跳 -1h 可在 `sessionRecovery.ts:82` 丢整场。因此 R006 真机改钟是**开发前置**，未通过连统计 Builder 都不得启动。Fake clock 只作纯函数证据。
- `BootInfo` 现在只是**进程身份近似**，进程死亡、系统回收、崩溃、Expo Go 重载均会按“跨 boot”丢弃，属于高频路径。R006 真实 boot 身份落地后须区分同 boot 进程重建与真重启：同 boot 审慎恢复持久化会话，真重启不得解释旧 elapsed 值。仍无法判别时保守丢弃并告知，不宣称恢复成功。FGS/Doze 等另有 native 挂账，统计上线只承诺真机验证过的运行条件。

### 3. 数据模型、归档与删除（HD-2=A、HD-4=清全部＋删单条）

- SQLite v4 仅新增 migration，不改 v1–v3；`resetSchema()` 测试辅助同步。`routines` 加可空 `training_type`。历史主表：`session_id` 主键、流程 ID／名称及类型快照、`COMPLETED/STOPPED`、开始／结束 wall 毫秒、`end_local_date`、非负 `total_step_ms`；分类明细表 `session_history_type_totals` 仅含 `STRETCH/RELAX/CORE/UNCLASSIFIED`，明细和等于主表总数。仅建 `idx_session_history_date(end_local_date, ended_at_wall_ms DESC)`；最近 10 条按 `ORDER BY ended_at_wall_ms DESC, session_id DESC LIMIT 10` 稳定排序。
- **一份步骤真源**：升现有 `SessionSnapshot` 到 v2，冻结会话开始时的流程训练类型，所有步骤继承该类型，不增步骤级覆盖。`decodeSnapshot` **显式接受 v1，解为 UNCLASSIFIED**，不得把既有活动场误判 corrupt。取消 `stats_state_json`，不另造步骤 JSON。
- 可变账本存 `active_session` 固定标量：`stats_total_step_ms INTEGER NOT NULL DEFAULT 0`、`stats_accounted_phase_ms INTEGER NOT NULL DEFAULT 0`、`stats_eligible INTEGER NOT NULL DEFAULT 0`，以及四个非负分类累计标量，各 `DEFAULT 0`。新会话显式 `stats_eligible=1`；既有活动行默认 0，保持 Runner 可恢复，但升级前训练不补造，终态只给**预期排除**的中性说明。`stats_accounted_phase_ms` 为当前动作阶段已结算水位；切阶段（含 Previous 重练）归零，累计总数只增。增量与活动会话原子保存。
- Repository 唯一终态入口 `archiveAndClear(session)`：结算末段 → 同事务插历史与分类明细 → 清活动行；`session_id` 重试不得重复。完成/结束 UI 等待提交后再给成功反馈。当前 `SessionPersistence.save()` 吞错、`RunnerController.apply()` fire-and-forget，终态链须可等待并返回错误。真实顺序风险是完成页**先渲染、后提交**；DELETE 后旧 UPDATE 影响 0 行并报错，不会复活会话。要串行化写队列，避免假成功。
- COMPLETED 及**实际动作时间 >0ms 的 STOPPED** 归档，后者最近记录标“提前结束”；0ms 不计。确认“结束当前并开始新的”时先归档旧场，成功后再新建；取消不变。ERROR／损坏／不可信恢复不计。归档失败保留会话及重试入口，不直接 `replace()` 覆盖。
- 设置页新增独立“清空全部统计”入口，二次确认后在事务内只清历史主表、分类明细及统计异常通知；不删 `routines`、`routine_steps`、动作库、活动会话或 `seed_examples_cleared`。统计页每条记录可二次确认后删单条；同事务删主表及明细，累计立即按剩余记录重算。删除不可撤销、会改变累计数字；“清除示范数据”入口及语义保持独立。
- `end_local_date` 在终态用结束 UTC 毫秒与 `getTimezoneOffset()` **纯算术**得 `YYYY-MM-DD`，避开 Hermes `Intl` 差异；跨午夜整场归结束日，保存后换时区旧记录不重排。不存 `end_utc_offset_min`（本期无读取方）。墙钟若倒退/无效且日期不可信，明确不归档或标待核实并告知，不猜。最近列表 `ORDER BY ended_at_wall_ms DESC, session_id DESC LIMIT 10`。
- 旧版单行 `active_session` 终态 `clear()` 已删除，无历史可补。示范流程只提供可运行内容，绝不插历史。迁移与故障注入用隔离 DB；覆盖安装不得卸载/清用户数据。

### 4. 结果提示与界面（HD-3=A、HD-6=A、HD-7=A、HD-8=做）

- **预期排除**（版本切换 `stats_eligible=0`、0ms、ERROR 或规则内不可计时段）使用中性、低权重的操作处说明，如“本次没有可计入的动作时间”“更新前开始的训练不计入新统计”；不弹全局警告、不产生“合计可能低于实际”的统计缺口标记。
- **异常丢失**（进程死亡导致不可恢复、boot 不符、12h stale、损坏／越界、不可信恢复、改钟异常、归档失败）先持久化原因和发生时间，再清可清的活动行；归档失败保留会话和重试入口。首页或统计页醒目但可关闭地提示“上次训练有一段未能计入统计”，附简明原因。统计页只在存在**未关闭的异常通知**时显示“合计可能低于实际练习”；关闭仅隐藏解释，不改累计。不知道丢失毫秒数就不伪造。
- 通知载体定为 v4 独立小表 `stats_anomaly_notice`（原因码、发生时间、已读／关闭位），纳入 migration 和 `resetSchema()`；预期排除不写该表。中英文案由原因码映射，不能只用易失 toast。通知持久化失败不得静默清活动行。
- xagapro 真机：起一场 → `force-stop`／重开 → 核同 boot 恢复或可见异常；再从首页点别的流程，异常仍须可见。真重启、12h stale、损坏／越界用受控测试补足；两类措辞与统计 caveat 分流有集成断言。
- 首页“我的流程”内容区加“历史统计”入口，进入独立页面；**不新增第 4 个常驻 tab**。统计页展示全部及分类累计、最近 10 条、单条删除、混合流程分类局限，并以中英双语声明“**数据仅保存在本机，不上传**”。无历史时说明旧记录不可回溯；卸载或清 App 数据会丢失本机记录，不设自动保留期／数量上限。
- **可见行为变更 HD-6=A**：完成页原“用时”取含转场 `routineElapsedMs`；本轮改为只显示与统计**同一累计源、同一单位和舍入规则的实际动作时间**，不含暂停和转场，保证两页数字一致。升级后完成页数字可能变小，这是显示口径迁移，不是用户数据被改坏；页面简短说明“只统计实际动作时间，暂停和转场不计”，中英双语且真机可见。Runner 顶部若保留含转场的经过时间，必须明标“流程已用（含转场）”，不可冒称统计值。
- 完成页提交成功才报“已计入统计”，失败报“尚未计入，请重试”；STOPPED >0ms 的返回首页反馈及最近记录如实标“提前结束”。`RunnerScreen.tsx:57` 的“已经完成的部分不会保存”改为“若已有实际动作时间，提前结束也会计入统计”，对 0ms 不作假承诺。
- `CompletionScreen.tsx`、`RunnerScreen.tsx` 硬编码中文接入既有中英字典；新增反馈、按钮、时长标签、停止确认随语言即时切换。**范围边界**：只做本地化、HD-6 必需的显示调整及停止确认假话修正，不顺手重构两屏其他状态机、导航或视觉结构。统计页沿用主题 token、读屏标签、触控目标 ≥48dp。

### 5. 最小 DoD

| 项 | 可验收证据 |
|---|---|
| R006 开发闸门 | 真 monotonic／boot 接线；xagapro 新包改钟 ±1h／±1d 时倒计时不回跳／跳变／丢会话，暂停、前后台恢复正常；同 boot 进程重启与真重启结果可解释；Reviewer、QA、Supervisor PASS 且 TM 记账后才派 B1～B5。 |
| 有效时长 | 暂停、转场、未跑到的 +10s 不计；Skip、Previous、双侧、跨多边界、后台恢复逐段无漏重；完成页与统计页显示同一实际动作时间。 |
| 归档 | COMPLETED、STOPPED >0ms 事务归档；STOPPED 最近标“提前结束”；0ms／ERROR 不计；故障不清会话／不报成功；重复 `session_id` 仅一条；替换先处置旧场。 |
| B 档流程分类 | 编辑页每流程选一类；9 个种子定义逐条预置；既存无法安全识别的示范行和自建行保留未分类；会话类型快照不随之后编辑改变；四类（含未分类）之和＝总数；混合流程局限可见。 |
| **D 档取舍（P1-B 留痕）** | **已评估并由用户否决，不属首发实施或验收分支。** D 仅给总时长，不能回答三类各多久，日后也无法精确回拆旧记录。若将来另起 Change C 重审，D 的独立 DoD 才是：单历史表、非负且单调 `total_step_ms`、稳定最近 10 条排序、无类型列／分类明细；不得用它替代本轮 B 档。 |
| 删除与隔离 | 统计页删单条、设置页二次确认清全部后累计立即正确；`seed_examples_cleared`、用户真实动作库／流程／活动会话不受影响；清示范流程不清统计。 |
| 提示分流 | `stats_eligible=0`、0ms、ERROR 为中性局部说明，统计 caveat 不出现；进程／boot／stale／损坏／归档失败为持久化异常提示，关闭只隐藏提示；通知写失败不能静默清行。 |
| 旧库与日期 | v1/v2/v3→v4 保留流程／设置与旧活动会话；v1 snapshot 解为未分类；旧场不补算；算术日期单测覆盖跨午夜、时区变化、负 offset；xagapro 验旧记录不重排／不崩。 |
| 页面与双语 | 首页入口、总数＋分类＋最近 10 条、旧历史不可回溯、本机不上传声明；完成页和 Runner 中英即时切换，停止假话已改；完成页数字变化说明真机可见，触控 ≥48dp。 |
| 质量 | `npm run typecheck`、`npm test -- --runInBand` exit 0；隔离库迁移／恢复演练；xagapro 新包／新 bundle 覆盖安装、离线运行；Code Reviewer／QA／Supervisor 通过。 |

## Out of Scope

- 旧会话回填、按名称或 `category` 猜类型、演示数据入历史、编辑历史类型/日期。后者破坏不可篡改性，**从 P1 候选删除**。
- 步骤级训练类型覆盖及旧记录回拆；日／周／月分桶、趋势条、打卡、目标率、部位平衡、训练备注、单次详情、复杂图表、云同步、账号、第三方健康写入、导出。
- 本任务实施 R004、R022～R034 等其他 native hardening；`TASK-021-R006` 只承担统计所需真实时钟和 boot 身份切片，不替代原 native P0 后续验收。
- 完成页与 Runner 的其他业务逻辑重构或视觉改版。
- 本轮不改 App 源码、DB 文件、基线计划或 HANDOFF，不 commit/push；只改本卡。

## Task Breakdown

| Task ID | Priority | Role | Status | Notes / DoD |
|---|---|---|---|---|
| TASK-021-C | P0 | TM／Planner／Research Reviewer／Human | IN_PROGRESS | 本卡 Round 3 复审→V1.3 草案→Readiness Gate→Human Gate；获批并明确进入开发后才派实现。 |
| TASK-021-R006 | **P0，B1～B5 串行硬前置** | **Builder（Android 切片）→Code Reviewer→QA 真机→Supervisor→TM** | NOT_STARTED | 真 monotonic＋boot 接线；xagapro 新包改钟 ±1h／±1d、同 boot 进程重启、真重启 DoD 通过并记 PASS。**FAIL／未验证＝B1～B5 不开工。** |
| TASK-021-B1 | P0 | Builder→Code Reviewer→QA→Supervisor | BLOCKED_BY_R006 | 结算伪码先审；v4、标量账本、事务归档、STOPPED>0ms、异常通知表；故障注入与幂等。 |
| TASK-021-B2 | P0 | Builder→Code Reviewer→QA→Supervisor | BLOCKED_BY_R006 | 查询、四类及总累计、最近 10 条、首页入口与独立统计页；离线、双语、48dp。 |
| TASK-021-B3 | P0 | Builder→Code Reviewer→QA→Supervisor | BLOCKED_BY_R006 | 9 个种子定义人工预置类型、流程编辑选择、既存行不猜；`seed_examples_cleared` 回归。 |
| TASK-021-B4 | P0 | Builder→Code Reviewer→QA→Supervisor | BLOCKED_BY_R006 | 完成页实际动作时间与统计一致；完成页＋Runner 双语、STOPPED 假话修正；真机验可见变化。 |
| TASK-021-B5 | P0 | Builder→Code Reviewer→QA→Supervisor | BLOCKED_BY_R006 | 统计页删单条、设置页清全部与二次确认；只动统计数据，不误伤真实流程和动作库。 |
| TASK-021-QA | P0 | QA | NOT_STARTED | 每 session 能力预检先 PASS；隔离库／全量测试、xagapro 新包真机、提示分流、改钟与清除安全逐项取证。 |
| TASK-021-S | P0 | Supervisor／TM | NOT_STARTED | 复检依赖闸门、Review/QA 证据与 DoD；全链通过后才可报告完成／发布。 |

## Risks

- **流程级分类偏差**：混合流程的整场时间只归一种类型；统计页明确提示，未来步骤级升级路径已占位，不能宣称逐动作精确拆分。
- **完成页数字变化**：原“用时”含转场，现改为实际动作时间，可能变小；页面说明迁移口径，不重写旧历史。
- **R006 硬前置可能拉长排期**：真实 native 时钟与 boot 身份需新包、真机改钟；未 PASS 则统计开发停在门外，不能用 fake clock 或“隔离开发”绕过。
- **后台保障挂账**：R004、R022～R034 未交付，不宣称所有 Doze／Deep Sleep 场景准确；同 boot 进程恢复仍须真机验。
- **异常丢失与旧历史**：stale、损坏、归档失败可少记，通知解释空洞但不伪造数；旧版已删会话无法回填。预期排除不产生统计缺口警示。
- **日期与本机保留**：Hermes Intl 不作日期依据；墙钟异常如实提示。无账号／云备份，卸载或清 App 数据会丢失本机统计。
- **HD-7=A 的范围扩张**：两既有屏幕接双语增加回归面，边界限本地化、完成页时长展示和停止确认事实修正，不顺手重构。

## Round 2 blocking P1 处置

| 项 | Round 3 处置 |
|---|---|
| P1-A | 用户选 HD-9=A；`TASK-021-R006` 落 Builder→Reviewer→QA 真机→Supervisor→TM 责任链及改钟 DoD；**R006 PASS 前 B1～B5 不开工**，取消“隔离开发可先行”。 |
| P1-B | DoD 保留 D 档专行，记已评估、用户否决、理由及仅未来重审适用的可测试断言；本轮唯一实施口径为 B。 |
| P1-C | 预期排除为低权重局部说明、无统计 caveat；异常丢失持久化、醒目可关闭且显示 caveat；通知写失败不能静默清行。 |
| 非阻塞 P1-D | 载体定为 v4 `stats_anomaly_notice` 小表，`resetSchema()` 同步；关闭提示仅隐藏 caveat，不改累计。 |

## Round 1 复核承接

Round 1 的三条 P0（假单调、跨进程静默丢场、Change B 误判）在 Round 2 已由 Research Reviewer 判为真闭环；七条 blocking P1 对应的 D 比较、算术日期、时长口径、双语、种子、单一快照真源、统计删除均在本轮决策后固化。原评审与证据留在 `docs/review/RESEARCH_REVIEW-task021-history-stats.md`，不重开已拍板事项。

## 已决策（用户 2026-09-27 拍板）

| ID | 决策及理由／影响 |
|---|---|
| HD-1 | **B 流程级分类**：每流程一种独立类型，回答三类各多久；接受混合流程偏差。D 已评估并否决，因为无法回答三类，未来旧记录也不能精确回拆；A 步骤级留升级路径。 |
| HD-2 | **A 半程计入并标注**：STOPPED 且实际动作 >0ms 计入，最近标“提前结束”；0ms 不计，符合“练了多久”。 |
| HD-3 | **A 首页入口**：从“我的流程”内容区进入独立统计页，不加第 4 个常驻 tab。 |
| HD-4 | **清全部＋删单条**：删除即时改变累计；和 `seed_examples_cleared` 隔离，不误伤真实动作库／流程。 |
| HD-5 | **B 种子预置类型**：9 个种子定义人工指定；自建默认未分类，由用户编辑。既存行不凭名字猜，App 新插入的种子行可安全赋型。 |
| HD-6 | **A 统一实际动作时间**：完成页改为与统计同一数字，不含暂停／转场；原可见“用时”会变，页面解释迁移。 |
| HD-7 | **A 完成页＋Runner 双语**：补本地化、STOPPED 假话修正及 HD-6 必需的显示改动；不扩大到重构。 |
| HD-8 | **做本机声明**：统计页中英双语显示“数据仅保存在本机，不上传”；不设保留期／数量上限。 |
| HD-9 | **A 先修 R006 再做统计**：真实时钟与 boot 身份先经真机改钟验证，未 PASS 时统计 Builder 不开工。 |

## Readiness 自评与下一步

- 自评 **90/100（Planner 暂定，非 Reviewer 判定）**：产品目标 19/20、核心方案 19/20、外部事实与竞品 13/20（沿用 Reviewer 已核证据，仍缺本项目独立用户反馈）、技术可行性 14/15、风险异常 10/10、范围／DoD 10/10、未决问题 5/5。三条 Round 2 blocking P1 已在计划文本中处置，九项用户决策均已固化；不宣称 R006 已实现或真机通过。
- 本卡达到 Planner 的 **≥90 自评门槛**，但不能自行宣布 Human Gate READY：还需 Research Reviewer Round 3 独立确认 P0=0、blocking P1=0、关键事实与核心假设合理；TM 再将认可内容并入 `PRODUCT_PLAN_V1.3` 级增量草案，依正典模板评 Readiness。Human Approval 与新 `DEV_BASELINE` 仍是实施前置。
- 剩余风险：R006 native 实作与真机改钟尚未发生；流程级分类偏差、旧历史不可回溯、本机清数据丢失已明示；其他 native hardening P0 仍在原挂账。
- 下一步：TM 派 Research Reviewer 复审；通过后形成 V1.3 增量草案并过 Readiness／Human Gate。获开发口令后，**先派 TASK-021-R006，真机 PASS 后才派 B1～B5**。
