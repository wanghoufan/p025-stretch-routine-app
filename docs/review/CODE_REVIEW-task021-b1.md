# CODE REVIEW

- Task：TASK-021-B1（历史统计数据层：v4 迁移＋训练类型体系＋会话归档）
- Commit：未提交（工作区改动，19 修改 + 5 新增，见 `git status` @ 2026-09-27）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**打回**（P0=0；blocking P1=3；P2 若干）。归档/结算/迁移主体质量高，但 V1.3 明文要求的三处行为缺失/违背，须回炉后复审。

> 环境说明：复核期间 B2 已在同一工作区并行落盘（`src/features/stats/` 15:56–15:57 创建，`AppNavigator/routes/HomeScreen` 开始修改）。本报告所有结论均已与 B2 在写文件切割：typecheck 全仓 3 个错误全部位于 B2 的 `src/features/stats/`，B1 文件 0 错误；jest 全量不受 B2 文件影响（未被任何测试导入）。

## 自证证据（复核员亲跑）

- `npm run typecheck`：全仓 3 错，全部在 `src/features/stats/`（B2 在写文件）；剔除后 B1 改动 **0 错误**。
- `npm test`：**42 套件 / 314 用例全绿**，exit 0（与 builder 自述一致；基线 38/282）。
- `git diff` 逐文件通读 19 个修改文件＋5 个新增文件；grep 验证 `Date.now` 与硬编码。

## P0 / P1 Findings

- **P1-1（blocking）替换流程丢场：旧会话未归档也未落异常通知**
  - 位置：`src/features/runner/services/startRoutineService.ts:172-185`（`replaceWith`）→ `src/data/repositories/sessionRepository.ts:118-123`（`replace()` = 事务内裸 `DELETE` + `INSERT`）。
  - 事实：用户确认「结束当前并开始新的」时，旧会话（可能 `RUNNING` 且已结算出 >0ms 实际动作时间）被直接 DELETE，**不走 `archiveAndClear`、不写 `stats_anomaly_notice`**。
  - 违背：V1.3 DoD「**替换先归档旧场**」；V1.3 §3「替换流程先成功处置旧场再开始新场」；V1.3 实施闸门③「不在排除枚举内的一切未归档或丢失情形，一律按异常丢失处理」。这是当前唯一一条**枚举外的静默丢数路径**。
  - 期望改法：`replaceWith` 先对旧会话走一次 `applyRunnerControl(END)` 结算（得到终态＋台账），再 `archiveAndClear`（>0ms 计入并标「提前结束」，0ms 走预期排除），成功后再创建新会话；归档失败则保留旧行并中止新开（失败语义与主归档路径一致）。

- **P1-2（blocking）通知写失败后仍清行：违背「写通知失败不得静默清活动行」**
  - 位置：`src/features/runner/services/runnerController.ts:135-141`（discarded 分支）＋ `:249-262`（`recordAnomaly` 内部吞错）。
  - 事实：recovery 判 discarded（boot-changed/stale/not-active）时，先 `recordAnomaly`（**内部 try/catch 吞掉写失败**）再 `persistence.clear()`。通知写失败＋清行成功＝会话时间与通知双双静默丢失。
  - 违背：V1.3 DoD「**写通知失败不能静默清行**」；且与 builder 自述第 6 条「通知写失败会抛错、调用方不清行」**不符**——该承诺只在 `startRoutineService.ts:98-106`（写失败 `return null` 保行）成立，controller 路径不成立。
  - 期望改法：discarded 分支去掉吞错：通知写失败时**不清行**并按失败路径处理（同 start service 口径）；corrupt 分支行已被 `loadActive` fail-safe 清掉，可保留吞错但补注释说明顺序。

- **P1-3（blocking）墙钟倒退（ended<started）无任何分支：违背「日期不可信不猜」**
  - 位置：`src/domain/statistics/history.ts:95-113`（`classifyTerminalSession` 无日期可信度判断）＋ `src/data/repositories/sessionHistoryRepository.ts:168-182`。
  - 事实：R006 已真机证实改钟不会丢会话（±1h/±1d 会话连续），因此「开始后把系统时钟往前拨」是可达路径；此时 `endWallMs < snapshot.capturedAtWallMs`，`end_local_date` 按被拨动的墙钟照算入库，**无「不归档」也无「标待核实并告知」**。
  - 违背：V1.3 §3「墙钟若倒退/无效且日期不可信，明确**不归档或标待核实并告知，不猜**」。builder 自陈偏差③承认未做，但这是基线明文要求，不是可选优化。
  - 期望改法（最小）：归档前检测 `endWallMs < startedAtWallMs`，命中则不归档＋写异常通知（建议扩封闭枚举加一个 reason code，如 `wall-date-untrusted`，additive），由 B2 的既有 caveat 机制告知；或按「待核实」标记归档。二选一，须与 TM 确认口径后实施。

## P2 / P3 Backlog Findings

- **P2-1** `runnerStats.ts` 的结算函数存在**双结算脚枪**：对同一未转移的相位连调两次 `settleCurrentPhase` 会重复入账（无水位标量兜底，见偏差①判定）。当前唯一调用点都在状态机转移内部且结算后立即换相位，无实际路径；但将来任何人新增结算入口都会重计。建议在 `runnerStats.ts` 头注释加显式警告（「只许在 runnerMachine 转移内部调用，结算后必须换相位」），或将来加每相位水位。
- **P2-2** 唯一索引 `idx_session_history_date(end_local_date, ended_at_wall_ms DESC)` 与最近记录查询 `ORDER BY ended_at_wall_ms DESC, session_id DESC`（`sessionHistoryRepository.ts:282-291`）**不匹配**（查询既不按 end_local_date 过滤也不排序）。V1.3 文本自身矛盾（§3 同时写了这个索引和这个排序）。本地小表无实感，建议随下一次 Change B 顺手把基线索引定义改为 `(ended_at_wall_ms DESC, session_id DESC)`，本轮不改。
- **P2-3** `session_history_steps` 逐步明细表超出 V1.3「Data / API」的 schema 清单（V1.3 只定义了主行；逐步实际动作时间属「步骤级拆分」数据基础，V1.3 Out of Scope 明言不做步骤级拆分）。派工单已列明此交付且测试覆盖良好，判**可保留**，但须 TM 在 HANDOFF 记一笔追认（含：它是 `sum(明细)==总计` 构造保证的载体、是未来步骤级升级路径的落点、本期无 UI 消费方）。
- **P2-4** 终态链仍 fire-and-forget（`runnerController.ts:220` `void this.persist(session)`），归档失败仅走 `onError` 且 `useRunner.ts:53-57` 未接 `onError`，用户无感知。builder 已注明「completion UI wiring lands in TASK-021-B4」；**须在 B4 派工里显式列为待办**（可等待＋失败重试入口），否则挂账丢失。
- **P2-5** `sessionHistoryRepository.recordAnomaly`（:330）`wallMs` 缺省回落 `Date.now()`。仅用于通知展示时间、不涉时长，可接受；建议调用方显式传 `wallMs` 保持口径统一。
- **P2-6** 治理注记：B2 在 B1 复核关闭前已并行写码，两者共用一个未提交工作区，回炉时 builder 与 B2 需协调改动面（尤其 `createAppServices.ts`、`i18n.ts` 两处共享文件），避免互相覆盖。

## 九项复核重点逐条判定

1. **归档正确性（最高优先）— 判定：结算构造保证成立，无漏计/重计路径**。
   `sum(明细)==总计` 是构造保证而非测试凑数：`applySettlement`（`runnerStats.ts:59-75`）让 `statsTotalStepMs` 与 ledger 同一函数内同增，存取层无第二写入点；归档明细直接由 ledger 投影（`sessionHistoryRepository.ts:124-145`）。逐路径核验：满跑（advanceRunner 边界内先 `settleCompletedPhase` 再换相位）、后台追帧跨多边界（while 循环逐相位各结一次，overflow 传入下一相位封顶——`runnerStats.test.ts` 覆盖）、Skip（只结实际跑到部分，`runnerMachine.ts:303`）、Previous 双跑（同 key 累加，测试证明 85,500ms 账目吻合）、+10s 半程（clamp 到实际跑到的 35s）、暂停后 END（`phaseElapsedMs` 冻结在 `pausedAtElapsedMs`，暂停 10 分钟后 END 仍只结 10s——测试覆盖）、转场中 END（结 0，转场本就不计）、0ms 结束（空 ledger→预期排除）。**「转场结算 0」不漏动作时间**：Pause/Resume 只发生在动作相位内时，暂停时长被 `accumulatedPauseMs` 折算剔除、动作时间不受影响；转场期间本来就不该计。guard 耗尽场景不双结（循环退出时未结算的相位下一 tick 再结）。
2. **原子性与守卫 — 判定：成立**。`DELETE FROM active_session WHERE id=1 AND session_id=?`（`sessionHistoryRepository.ts:149-151`）带 session_id 守卫，并发替换后新会话不会被误删；故障注入是**真实事务内炸的**（`failingAt` 包装真实 `node:sqlite` 的 `run`，`transaction` 走真 BEGIN/COMMIT/ROLLBACK，`nodeSqlDatabase.ts:37-47`），测试证明回滚零残留＋重试恰好一条（`sessionHistoryRepository.test.ts:167-199`）。幂等由主键＋事务内先查后插保证（测试覆盖二次归档仍 1 条）。生产端 `expo-sqlite` 的 `withTransactionAsync` 同为真事务。
3. **与 R006 的耦合 — 判定：无破口**。时长来源全部为单调相位函数（`runnerTime.phaseElapsedMs/phaseTotalMs`），输入 `nowElapsedMs` 由 `MonotonicClock` 注入；grep 证实 `src/features/runner/**` 零 `Date.now()`；墙钟只出现在展示字段（`endWallMs`、通知发生时间）。未发现任何回落墙钟的计时路径。
4. **可扩展性 — 判定：表驱动为真**。扩展测试真跑了聚合：插入 `LOWER_BODY` 类型行→归档该类型会话→断言聚合桶含它且总和 200,000ms（不是只数行数，`sessionHistoryRepository.test.ts:291-320`）。聚合走 `GROUP BY training_type_id` 无代码枚举。UI 侧 grep 无任何 `STRETCH_RELAX/WARMUP/CORE` 硬编码（B1 无 UI）。
5. **数据安全 — 判定：隔离成立**。`deleteRecord`/`clearAllStats` 只触 `session_history`/`session_history_steps`/`stats_anomaly_notice`；测试断言删后 routines=9、actions=59、`seed_version`='1'、`seed_examples_cleared` 不存在（`sessionHistoryRepository.test.ts:339-375`）。CASCADE 推演：`session_history_steps → session_history ON DELETE CASCADE` 只向下作用于统计子表，用户表无任何 FK 指向统计表；且 `deleteRecord` 显式先删子表，不依赖 CASCADE（`PRAGMA foreign_keys` 关闭时也安全）。`routines.training_type_id` 的 FK 只约束类型引用存在性，删历史不触碰。
6. **旧测试改动 — 判定：确系机械适配，无放宽**。逐 diff 核验：`migrationsV2.test.ts`/`migrationsV3.test.ts` 仅删了与紧邻 `toBe(latestSchemaVersion())` 语义重复的 `toBe(3)` 断言、幂等测试 `3→latestSchemaVersion()`（当时 latest=3，断言强度不变）；`sessionRepository.test.ts` 夹具补 4 个新必填字段；`testContext.ts` 注入 history 依赖。**零行为断言被改绿**。
7. **4 处自陈偏差**：①不建 `stats_accounted_phase_ms` 水位标量——**可接受**（结构性防双结成立、死列无消费方；代价见 P2-1 脚枪，须补注释）；②快照未升 v2——**不是偏差**（V1.3 明文「不新增第二份步骤真源」、类型冻结在 `active_session.training_type_id` 标量正是基线方案；PLAN 卡旧 v2 方案已被 V1.3 取代）；③拨钟 ended<started 无分支——**不可接受**，升格为 P1-3（见上）；④`duplicateRoutine` 副本不继承类型——**可接受**（副本默认 NULL=未分类，与「不猜」一致，编辑器写入是 B3 范围）。
8. **越界 — 判定：无实质越界**。R006 时钟/boot 代码（`MonotonicClock`/`BootInfo`/`modules/stretch-runtime`）零改动；无 B2 界面（`src/features/stats/` 系并行 B2 所写，非 builder-B1 交付）；`seeds.ts` 的 9 条映射属 B3 数据活提前做，但派工单已含此文件、映射经测试逐条断言等于 V1.3 表（含「5分钟快速热身」=WARMUP），判合规并建议 B3 复用该测试。业务规则（流程/动作库语义）未动。
9. **反例挑刺**：①`ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT 0/'{}'` 在老库上由 SQLite 回填默认值，V3→V4 测试实测旧活动行落 `stats_eligible=0`/`ledger='{}'`、解码为不合资格而非 corrupt（`migrationsV4.test.ts:94-130`）；V1→V4 全链也测了。②FK 在 `PRAGMA foreign_keys=ON` 下由 `runMigrations` 入口统一开启（`migrations/index.ts:229`），且有 FK 拒插坏类型行的负向测试；`resetSchema` 按子表先删排序。③i18n `stats.*` 11 键中英齐全，B1 无 UI 故尚无消费方（B2 接线），不算缺陷但 B2 须真用。④`localDateFromWallMs` 纯算术在负 offset（UTC-5→offset=300）与跨年下经 UTC 分量取值均正确（`wallMs - offset*60000` 语义核对无误）；offset 逐行冻结、换时区不重排有测试。⑤`getRecent` 负数/非整 limit 有 clamp。真正挑出来的问题就是 P1-1/2/3 与 P2 清单。

## 给 B2 的接口判定

**够开工，无阻塞缺口**。`services.history` 提供：`getTotals`（总累计＋场次）、`getTotalsByType`（含 NULL=未分类桶，桶和=总数）、`getRecent(limit)`（含 `endedEarly` 供「提前结束」标）、`listTrainingTypes`（中英名＋排序，供类型桶显示名）、`listActiveAnomalies`/`dismissAllAnomalies`（caveat「合计可能低于实际」的门控与关闭）、`getStepDetails`（本期 UI 无消费方，留升级路径）。文案键 `stats.*` 已中英齐备。

给 B2 的三条使用注记：①类型桶显示名须 `getTotalsByType` × `listTrainingTypes` 自行拼接，NULL 桶用 `stats.type.unclassified`；防御性兜底一个「归档类型不在表内」的显示分支（基线禁删类型，风险低）。②「关闭」只有一个 `dismissAllAnomalies`，B2 的关闭按钮映射到它即可，勿假设逐条关闭。③异常原因→文案走 `stats.anomaly.<reasonCode>` 键名映射，勿内联。

## 结论

打回。P0=0；**blocking P1=3**（P1-1 替换丢场、P1-2 通知写失败仍清行、P1-3 墙钟倒退无分支）。三处都是 V1.3 明文要求、且改动面小（合计约几十行＋测试）。修完由 code-reviewer 复审通过后再进 QA。其余交付（结算构造保证、原子性、幂等、迁移、表驱动、删除隔离、旧测试适配）判定合格，返工时不要推倒。

---

# Round 2（回炉复审，2026-09-27）

- Task：TASK-021-B1 回炉（Round 2）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**PASS**（P0=0；blocking P1=0；P2 挂账 6 条全部非阻塞）

## 自证证据（复核员亲跑）

- `npm run typecheck`：**全仓 0 错**（Round 1 时 B2 并行文件有 3 错，本轮已消，B1/B2 一并干净）。
- `npm test`：**44 套件 / 330 用例全绿**，exit 0（Round 1 为 42/314；增量＝回炉新增 `runnerControllerDiscard.test.ts` 2 例＋B2 并行的 `historyStats.test.tsx` 14 例，无一变红）。
- Round 1 三条 P1 的修复源码逐行通读＋对应新测试逐条核对；`git diff` 旧测试文件复核；`Date.now`、`STRETCH_RELAX/WARMUP/CORE`、`sessions.replace(` 全仓 grep。
- 工作区切割：`src/features/stats/`（B2 界面）与 `AppNavigator/routes/HomeScreen/SettingsScreen/NoticeBanner` 改动系 B2 并行落盘，非 B1 交付，本报告不评判其质量；全仓 typecheck/test 已连带 B2 一并验证通过。

## Round 1 三条 blocking P1 逐条闭环验证

- **P1-1 替换丢场 — 闭环**。`startRoutineService.ts:157-184` 新增 `disposeReplacedSession`：同 boot 旧会话先 `applyRunnerControl(END)` 结算再 `archiveAndClear`；跨 boot 先 `recordAnomaly` 后清行；任一步失败抛错 → `replaceWith` 捕获返回 `failed`，旧行保留、新会话不创建。`sessionRepository.replace()`（裸 DELETE+INSERT）降级为低层原语并加注释，全仓 grep 确认生产代码零调用（仅自身测试）。测试覆盖 4 条路径：>0ms 归档为 STOPPED「提前结束」（`startRoutineService.test.ts:206-242`，断言 totals=5000＋endedEarly）、0ms 走预期排除不写通知（:244-260）、归档失败中止替换且重试恰好一次（:262-301，故障注入打在真事务的 `INSERT INTO session_history`）、跨 boot 先记损失再清行（:303-328）。
- **P1-2 通知写失败仍清行 — 闭环**。`runnerController.ts:268-273` `recordAnomaly` 去掉吞错（注释明示契约）；`load()` discarded 分支（:143-156）先 `await recordAnomaly` 后 `clear()`，写失败异常上抛 → 外层 catch 置 `status:'error'`、**行不清**。新测试 `runnerControllerDiscard.test.ts` 两例：正常路径通知先落库再清行（reasonCode=recovery-boot-changed、sessionId 对应）；注入 `recordAnomaly` 抛错后断言行仍在、errorMessage 含原因、通知表为空。corrupt 分支保留吞错但补了顺序注释（行已被 loadActive fail-safe 清掉，无可保护对象），与 Round 1 期望改法一致。
- **P1-3 墙钟倒退无分支 — 闭环**。`sessionHistoryRepository.ts:193-208` 新增 `wall-date-untrusted` 分支：`endWallMs < snapshot.capturedAtWallMs` 时不归档、先写异常通知（带 session_id 去重，重试不叠条）再清活动行，返回 `{kind:'wall-date-untrusted'}`。封闭枚举 `StatsAnomalyReasonCode` additive 扩展（`history.ts:154`），i18n `stats.anomaly.wall-date-untrusted` 中英齐全（测试 `sessionHistoryRepository.test.ts:293-295` 真调 translate 断言非键名）。测试覆盖：拒绝归档＋通知落库＋行清（:265-297）、重试去重＋通知写失败保行（:300-331，故障注入打在真事务的 `stats_anomaly_notice`）。采用了 Round 1 建议的「不归档＋异常告知」选项，符合 V1.3 §3「不猜」。

## 九项复核重点（Round 2 复验结论）

1. **归档正确性 — 维持成立**。结算核心本轮未动（`runnerStats.ts` 双写不变量＋`runnerMachine.ts` 转移内结算）；新增回归测试把 Round 1 核过的各路径固化（满跑 50s、追帧跨边界、Skip 半程 10s、Previous 双跑 85.5s、+10s 半程 35s、暂停 10 分钟后 END 仍只计 10s、转场 END 计步不计算、0ms 空账本、恢复重放不双结——`runnerStats.test.ts` 全数在案）。复核重点里「转场结算 0 是否漏掉 Pause/Resume 期间动作时间」再次推演：暂停时长由 `phaseElapsedMs` 的 `accumulatedPauseMs` 折算剔除（`runnerTime.ts:21-30`），暂停期间本就无动作时间可计；转场不属动作。**无漏计/重计路径**。
2. **原子性与守卫 — 维持成立**。`clearActiveRow` 守卫 `WHERE id=1 AND session_id=?` 未动；本轮新增的 P1-1 故障注入同样走真 `node:sqlite` 事务（非 mock），替换中止＋重试恰好一次已测。**成立**。
3. **与 R006 耦合 — 维持成立**。全仓 grep `Date.now()`：计时路径零命中（仅 WallClock 展示钟、recordAnomaly 展示时间兜底、id 生成、i18n 替换、B2 设置页 key）；`disposeReplacedSession` 的结算输入同为注入的 `monotonic.nowElapsedMs()`。**无破口**。
4. **可扩展性 — 维持成立**。聚合走 `GROUP BY training_type_id`；`LOWER_BODY` 扩展测试断言聚合桶含它且总和 150,000ms（真跑聚合非数行数）。UI 侧（含 B2 新界面）grep `STRETCH_RELAX/WARMUP/CORE` 零业务硬编码——命中只在迁移种子行、seeds 定义（V1.3 映射表本体）与测试。**表驱动为真**。
5. **数据安全 — 维持成立**。`deleteRecord`/`clearAllStats` 只触三张统计表；测试断言删后 routines=9、`seed_version`='1'、`seed_examples_cleared` 不存在。**隔离成立**。
6. **旧测试改动 — 维持 Round 1 定性：确系机械适配，零放宽**。逐 diff 复核：`migrationsV2/V3.test.ts` 只删了与紧邻 `toBe(latestSchemaVersion())` 语义重复的 `toBe(3)`、幂等断言改跟随 `latestSchemaVersion()`；`sessionRepository.test.ts` 夹具补 4 个新必填字段；`testContext.ts` 注入 history 依赖。**无行为断言被改绿**。
7. **4 处自陈偏差 — 复审口径**：①不建 `stats_accounted_phase_ms` 水位标量——**维持可接受**（结构性只结一次成立；P2-1 的脚枪风险已按 Round 1 建议在 `runnerStats.ts` 头注释与 `RunnerResult.settled` 文档两处显式声明「只在转移内部调用、调用方不得消费 settled 数字」）；②快照未升 v2——**不是偏差**（V1.3 明文单一标量方案）；③拨钟倒退——**已实现，闭环为 P1-3**；④`duplicateRoutine` 副本不继承类型——**可接受**（NULL=未分类，B3 编辑器写入）。
8. **越界 — 无**。R006 时钟/boot 代码（`MonotonicClock`/`BootInfo`/`modules/stretch-runtime`）零改动；B1 未做 B2 界面（stats 屏系 B2 并行）；`routineRepository` 的 create/update 透传 `trainingTypeId` 属数据层 plumbing（seeds 需要），测试覆盖 create/update 保留语义，合规；业务规则未动。
9. **反例挑刺**：①V3→V4 老库默认值回填有测试（旧活动行落 `stats_eligible=0`/`ledger='{}'`，解码为不合资格而非 corrupt，`migrationsV4.test.ts:94-130`）；V1→V4 全链亦有。②FK 在 `runMigrations` 入口统一开启＋坏类型行拒插负向测试；`resetSchema` 子表先删。③i18n `stats.*` 中英齐全且 B2 屏已在消费；`wall-date-untrusted` 键有真调 translate 断言。④`localDateFromWallMs` 负 offset/跨午夜有测试且语义核对无误。⑤`getRecent` limit 有 clamp。本轮未挑出新的 P1 级问题。

## 给 B2 的接口判定（Round 2 更新）

**够用，且已被 B2 实际消费验证**：`historyStats.test.tsx` 全绿证明 `getTotals`/`getTotalsByType`/`getRecent`/`listTrainingTypes`/`deleteRecord`/`clearAllStats`/`listActiveAnomalies`/`dismissAllAnomalies` 支撑了统计页全部已写断言。无阻塞缺口。两点注记维持：①类型桶显示名须 `getTotalsByType` × `listTrainingTypes` 自拼，NULL 桶用 `stats.type.unclassified`；②`stats.exclusion.*` 三键的消费方是 **B4**（完成页读 `ArchiveOutcome.reason`），B2 勿误接到统计页。

## P2 挂账（全部非阻塞，随下游任务闭环）

- **P2-1**（维持）结算脚枪风险靠注释约束；若将来有人在转移外新增结算入口会重计，B3/B4 派工时须重申该约束。
- **P2-2**（维持）`idx_session_history_date` 与 `getRecent` 排序不匹配，随下次 Change B 改基线定义。
- **P2-3**（维持）`session_history_steps` 超 V1.3 schema 清单，**TM 须在 HANDOFF 记一笔追认**（Round 1 已提，未见落笔）。
- **P2-4**（维持）终态链 fire-and-forget＋`useRunner` 未接 `onError`，**B4 派工须显式列「可等待归档＋失败重试入口」**。
- **P2-5**（维持）`recordAnomaly` 的 `wallMs` 缺省回落 `Date.now()`，建议调用方显式传。
- **P2-6**（升级提醒）B2 已从「开始写」推进到「测试全绿」，B1/B2 共享文件（`createAppServices.ts`、`i18n.ts`）本轮未冲突，但两者都未提交——**commit 应一次性或按 TM 指定顺序进行，避免拆分归属混乱**。

## 结论（Round 2）

**PASS。P0=0；blocking P1=0。** 三条 Round 1 blocking P1 全部真实闭环（源码＋真事务故障注入测试双重证据），无新引入缺陷，旧测试改动维持「机械适配」定性。B1 数据层可交 QA；建议 QA 侧覆盖替换流程与拨钟回拨场景的真机取证（与 R006 改钟手法同源）。
