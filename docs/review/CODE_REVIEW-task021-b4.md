# CODE REVIEW

- Task：TASK-021-B4（完成页时长口径统一＋完成页/Runner 双语＋归档失败重试入口）
- Commit：未提交（工作区改动，与 B1/B2/B3 同树，见 `git status` @ 2026-09-27）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**打回**（P0=0；blocking P1=2；P2 三条记账）。HD-6 同源同口径与 archiveTerminal 改动本身判定合格，但「归档失败重试入口」这条 headline 交付对 STOPPED 会话不成立、且一条统计文案在该通知唯一显示路径上是假话——两处须回炉。

## 自证证据（复核员亲跑）

- `npm run typecheck`：0 错误。
- `npm test -- --runInBand`：**46 套件 / 341 用例全绿**（与自述一致）。
- 通读 `git diff`：`CompletionScreen.tsx`、`RunnerScreen.tsx`、`RunnerControls.tsx`、`runnerView.ts`、`runnerController.ts`、`sessionPersistence.ts`、`routes.ts`、`i18n.ts`（新增键段），及 B1 既有 `sessionHistoryRepository.ts`/`history.ts`/`runnerStats.ts` 全文。
- grep 全 CJK：两屏＋RunnerControls＋runner 服务层**零用户可见硬编码中文**（仅代码注释含中文）；`routes.ts` 的 `ROUTE_TITLES` 中文常量为既有遗留且**全仓零消费方**（标题已走 `t()`），P3 挂账即可，不记 B4。

## P0 / P1 Findings

- **P1-1（blocking）`stats.anomaly.archive-failed` 文案「可从完成页重试」在该通知唯一出现的路径上是假话**
  - 位置：`src/shared/i18n.ts`（zh `stats.anomaly.archive-failed`：'上次训练未能保存统计，可从完成页重试'；en 同义）。
  - 事实链：完成页重试期间（重试入口真实存在的唯一窗口）**不写任何异常通知**（`runnerController.archiveAndReport` 只把失败落 `terminalOutcome`）；`archive-failed` 通知唯一的产生路径是 recovery 丢弃终态行（`sessionRecovery` 'stored session is not active' → `anomalyCodeFromRecoveryReason` → `runnerController.load` 先记通知**随即清行**）。用户在统计页看到这条 caveat 时，行已清除、完成页重试入口已不存在——承诺永远无法兑现。
  - 违背：本轮任务正是修「对统计说假话」（旧「已完成的部分不会保存」刚被改掉），不能再留一句新的假话；V1.3 诚实叙事原则。
  - 期望改法（一行文案，双语言）：zh 改为「上次训练未能保存统计，该次未能计入」（或同义不承诺重试的表述）；en 改为 'Your last session could not be saved to statistics and was not counted'。
- **P1-2（blocking）STOPPED 会话归档失败无任何重试入口——DoD「可重试」半句对主动结束不成立**
  - 位置：`src/features/runner/screens/RunnerScreen.tsx:56-59`（`isStopped` → `navigation.reset('Home')`，**不等待 `terminalOutcome`**）＋ `runnerController.ts:274-285`（归档失败仅落 outcome，无人消费）。
  - 事实：B4 交付的「归档失败重试入口」挂在完成页，但只有 COMPLETED 进完成页；STOPPED（提前结束，HD-2 起 >0ms 可计入）归档失败时：行保留 ✓、不报成功 ✓、**当场无任何重试入口也无任何告知** ✗。后续只能靠两条 recovery 路径兜底（下次 start 替换时补归档成功 / 下次开 Runner 时按 archive-failed 丢弃并计 caveat）——数据最终不静默丢，但「归档失败保留会话与重试入口」（V1.3 DoD 原文）当场不成立。
  - 期望改法（二选一，TM 拍交互口径后实施）：① 最小改——STOPPED 也等 `terminalOutcome` 非 pending 后进完成页，复用同一 outcome/重试/排除显示（完成页文案已天然覆盖「提前结束也会计入」语义）；② STOPPED 归档失败时写 `archive-failed` 通知（但须先修 P1-1 文案）并由首页/统计页可见。①更符合「不新增入口」的本轮克制原则。

## 逐项判定（对应派工单复核重点）

1. **HD-6 同源同口径 ✓（含舍入一致性）**：完成页 `params.actionMs` ← `view.statsActionMs`（终态下＝`session.statsTotalStepMs`，`runnerView.ts:106-108` 终态不加相位）← 归档写入 `total_step_ms` 的同一字段 ← 统计页 `getTotals()`/`getRecent()` 同列。两端共用 `formatStatsDuration`（`statsFormat.ts:19` 统一 `Math.round`），无第二套算法、无 floor/round 分歧。测试真实跑到仓储层：retry 用例断言 `getTotals()==={20000,1}`（真 in-memory SQLite，非仅组件）；en 用例 summary '1 actions · 10s' 与总量同源。暂停扣减同口径：台账只经 `phaseElapsedMs`（`runnerTime.ts:21-30` 扣 `accumulatedPauseMs`）结算，`runnerStats.test.ts` 暂停用例（暂停 10 分钟后 END 只计 10s）亲证。Previous 重练另计不重计（同键累加，85.5s 用例亲证）。
2. **archiveTerminal 终态先落行 ✓（定性见主报告第④节）**：不导致重复归档（session_id 幂等先查后插）、不与 B1 幂等冲突（是其前置增强）；失败后行确为终态（completionStats 第 1 条断言 `stored?.state==='COMPLETED'`）。
3. **重试入口正确性 ✓（限 COMPLETED）**：重试走 `loadActive` → 终态行 → `archiveAndClear`（幂等，不会入账两次）；失败后行保留（测试断言）；状态反馈清楚（retrying 禁用按钮＋文案）。缺口见 P1-2。
4. **预期排除 vs 异常未混淆 ✓**：完成页排除文案只读 `outcome.reason` 映射 `stats.exclusion.*`（`CompletionScreen.tsx:98-104`），分流判断全部在 B1 `classifyTerminalSession`，UI 无自写判断；完成页任何分支都不出现 `stats.caveat.lowerThanActual`；测试断言排除场景 `listActiveAnomalies()==[]`。
5. **双语质量 ✓（除 P1-1 一条）**：键位中英一一对应；假话修正新表述**准确**（「若已有实际动作时间，提前结束也会计入统计」——说清了什么计入，且对 0ms 不做承诺）；`runner.elapsedTotal` 按 V1.3 风险条款明标「含转场」；en 用例经真实设置持久化语言后全字典渲染（真切字典非死文字）。grep 零硬编码。
6. **（B3 项，见 B3 报告）**
7. **越界 ✓（一处自陈越界，判合理）**：B4 改了 B1 文件 `sessionPersistence.ts`（自陈请求重点复核，定性见④）；`runnerController` 新增 `terminalOutcome` 通道为 HD-6「防先报成功」所必需；未重构两屏其他逻辑（diff 全部服务于本地化＋口径＋outcome）；未碰 R006 时钟（`modules/` 零改动、monotonic 调用未变）。同树中 StatsScreen/SettingsScreen/HomeScreen 改动属 B2/B5，不计 B4。
8. **测试成色 ✓**：B4 五条新测试全部真驱动 UI＋真库（重试闭环含真实故障注入→恢复→落库断言；排除用例断言零通知零累计；en 用例真切字典）。建议（P2-3）补一条同屏断言：完成页 summary 数字==`getTotals()` 显示值（当前为同源间接成立，无显式断言）。
9. **反例挑刺**：暂停扣减一致（见 1）；0ms 全跳过完成页显示「用时 0秒」＋「本次没有可计入的动作时间」（事实准确，观感可议，P2-1 记账不阻塞）；Previous 不重计（见 1）；终态后 tick 不会二次归档（`advanceRunner` 对终态返回原会话）。

## archiveTerminal「终态先落行」明确定性（复核重点②）

**判定：正确且必要，非重复归档源，与 B1 幂等设计互补。保留。**

- **改了什么**：`sessionPersistence.archiveTerminal`（`sessionPersistence.ts:71-82`）在调 `history.archiveAndClear` **之前**，先把终态会话（含最终 `statsTotalStepMs` 台账）`repository.save` 进 `active_session` 行；归档成功则同事务插历史＋清行，失败则事务回滚、行以**终态**留存。
- **为什么必须**：若不先落行，归档失败后行里还是陈旧的活跃相位——重试入口与 recovery 读到的会话不是「待归档的终态」，甚至可能被当作可恢复会话复活计时。先落行使「失败→重试」与「失败→app 被杀→recovery」两条路都看到一致的终态。
- **重复归档？不会**：`archiveAndClear` 以 `session_id` 幂等（先 SELECT 后插＋`clearActiveRow` 带 session_id 条件）；retry 集成测试证 `getTotals()==={20000,1}` 恰一条。
- **该归档的没归档？存在一个新窗口，B1 兜底已接住（P2-2 记账）**：save 成功→归档前进程被杀 → 下次开 Runner 时 recovery 按 archive-failed 丢弃＋caveat（有告知、不静默）；下次 start 替换时 `disposeReplacedSession` 则会**正确补归档**。两条 recovery 路径行为不一致（一条丢、一条补），建议 B1 后续统一为「终态行优先补归档」，本轮不阻塞。
- **边界小瑕（P2-3）**：若先落行的 save 本身失败（行缺失），重试路径 `loadActive` 为 none → 完成页落 `wall-date-untrusted` 状态显示「本次训练未能计入统计」——状态语义被借用（并非钟不可信），但文案事实正确、且该场景要求行先消失本就极端。记账即可。

## P2 / P3 Backlog Findings

- **P2-1** 0ms 会话（全跳过可自然到达 COMPLETED）完成页显示「共 N 个动作 · 用时 0秒」＋排除说明。事实准确，观感可议；建议 QA 真机看效果后再定是否弱化「用时 0秒」。
- **P2-2** 见「archiveTerminal 定性」：save→archive 间被杀的窗口，两条 recovery 路径不一致，建议统一补归档（B1 后续）。
- **P2-3** save 失败时重试路径复用 `wall-date-untrusted` 状态（见上）；建议后续为「行已不在」单设中性文案。
- **P3** `routes.ts` `ROUTE_TITLES` 全仓零消费方（遗留死常量，含中文），建议下次顺手清。

## 结论

HD-6 口径统一与 archiveTerminal 判定合格；**blocking P1 两条（P1-1 文案假话、P1-2 STOPPED 无重试入口）须回炉**，均是小改（一条 i18n、一处导航口径），回炉后免全量重审、仅需复核改动点。记账后可进 QA。

---

# Round 2（回炉复审，2026-09-27）

- 复核范围：仅 Round 1 两条 blocking P1 的闭环 + 新引入问题排查，未扩大范围。
- 自证证据（复核员亲跑）：`npm run typecheck` 0 错；`npx jest --runInBand` **46 套件 / 343 用例全绿**（341→343，只增不减）；通读 `RunnerScreen.tsx`、`CompletionScreen.tsx`、`runnerController.ts`、`runnerView.ts`、`sessionPersistence.ts`、`sessionRecovery.ts`、i18n 相关键段与 `completionStats.test.tsx` 全文；grep 全仓 `archive-failed`/`重试`/`retry` 消费链。

## 结论：**PASS（P0=0，blocking P1=0）**

## 两条 P1 闭环判定

- **P1-1 文案假话 ✓ 闭环**：zh `stats.anomaly.archive-failed`＝「上次训练未能保存统计，该次未能计入」、en＝'Your last session could not be saved to statistics and was not counted'（`i18n.ts:274/545`），只陈述事实、零重试承诺。全仓 `重试|retry` 复查：用户可见承诺仅剩 `completion.notCountedRetry`（zh「统计尚未保存，可重试保存。」/ en 同义），它**只在 `outcome.status==='failed'` 分支与重试按钮同块渲染**（`CompletionScreen.tsx:108-121`）——承诺有实物支撑，成立。过期注释已清（`CompletionScreen.tsx:36-43` 新注释如实描述「双终态共用唯一重试面」）。无别处残留假承诺。
- **P1-2 STOPPED 重试入口 ✓ 闭环（按 TM 拍板口径）**：`RunnerScreen.tsx:58-82` `isStopped` 分支不再直接 `reset('Home')`，先等 `terminalOutcome` 非 pending——`archived|excluded` → `reset('Home')`（成功零多余步骤，与旧行为一致）；`failed|wall-date-untrusted` → `replace('Completion')` 复用完成页，`failed` 显示既有重试入口（走 `retryArchive`，`archiveAndClear` 按 `session_id` 幂等）。`wall-date-untrusted` 只显示「未计入」不显示重试（正确：钟不可信无从重试）。重试成功后按「完成」`reset('Home')`（`CompletionScreen.tsx:131`），路径闭环——测试亲自跑到这一步（见下）。

## 六项逐条判定

1. **P1-1 ✓**：见上。zh/en 双语都已改，键位一一对应。
2. **P1-2 ✓**：失败分支重试入口真实可用（真 UI＋真库测试跑到 counted→totals→行清→回 Home 全链）；成功分支零多余步骤（测试显式断言 `completion-summary` 从未出现）；**`excluded` 算成功合理**——excluded 三种来源（升级前会话 / 0ms / ERROR 终态）都是**预期排除**：行已按设计清除、无损失、无可重试之事，弹完成页反而是多余一步，回首页正确（与 Round 1 第 4 项「预期排除≠异常」定性一致）。
3. **新引入问题排查 ✓（两条均无实害，见下节）**。
4. **测试成色 ✓**：两条新测试均真 UI（renderApp→真点按→真导航）＋真 in-memory SQLite，故障注入仅 mock `archiveAndClear` 一次 reject（单测无法令真 SQLite 稳定失败的合法注入点，重试时 `mockRestore` 走真库）。**「成功直达首页」确有 `queryByTestId('completion-summary')).toBeNull()` 显式断言**（`completionStats.test.tsx:61`）——「零多余步骤」的证据成立；失败用例断言了 stored 行保持 `STOPPED` 终态、重试后 `getTotals()==={15000,1}` 恰一条（幂等）。
5. **基线 ✓**：46 套件 / 343 用例全绿（+2），typecheck 0 错；diff 复查无旧测试被改绿（本轮改动未触碰任何既有测试）。
6. **越界 ✓**：`modules/`、`src/services/clock.ts`、`src/services/runtime/` 零改动（R006 未碰）；B1 数据层（`sessionHistoryRepository.ts`/`history.ts`）与 B3 文件本轮未再动；RunnerScreen 其余逻辑（控制条、播报、倒计时渲染）未重构，diff 全部服务于 P1-2 导航分流。

## 新引入问题判断（复核重点③）

- **ERROR 终态走重试入口——不误导，判安全**：`ERROR` 是 `TERMINAL_STATES` 声明的终态（`RunnerState.ts:30`），当前**无任何产生点**（全仓 grep 零写入方，属 R022-R034 预留）。真出现时：`apply` 对一切非 active 状态归档 → `classifyTerminalSession` 会把 ERROR 归为 `excluded(terminal-error)` → 正常路径回首页；仅当归档**失败**才进完成页，重试成功后显示的是中性的「本次训练出现异常，未计入统计」（测试 `completionStats.test.tsx:216-219` 亲证该文案），不是「已计入」假象。给重试入口反而是把遗留终态行收口（清行＋告知），比留着不管诚实。
- **outcome 永远 pending 的卡死风险——理论存在，无现实路径，不阻塞**：终态下 `terminalOutcome` 必然先被同步 patch 成 `pending`（`runnerController.ts:270`），随后 `archiveAndReport` 要么 resolve 要么 reject（`toCompletionOutcome` 对终态不可能返回 `not-terminal`，因为 `apply` 只对非 active 状态触发归档，`TERMINAL_STATES` 全部非 active）→ 必然落到四态之一。唯一理论漏洞是底层 SQLite promise 永不结算——与 Round 1 已放行的 COMPLETED 等待分支同一风险等级，无新增。**卡在 Runner 的另一入口也被堵死**：即便进程中途被杀留下终态行，`sessionRecovery.ts:59-61` 对一切非 active 行判 `discarded`（记 anomaly 后清行），终态行不可能在重启后被复活成「活会话」挂着不动。无需兜底超时。
- **重试成功→完成→回首页闭环 ✓**：测试 `completionStats.test.tsx:92-100` 全链亲证（retry→counted→行清→done→首页）。

## Round 2 结论

**B4 验收通过，可进 QA 真机验收。** P0=0、blocking P1=0。Round 1 的 P2-1（0秒观感）/P2-2（recovery 双路径不一致）/P2-3（wall-date-untrusted 语义借用）与 P3（`ROUTE_TITLES` 死常量）继续挂账，不阻塞。
