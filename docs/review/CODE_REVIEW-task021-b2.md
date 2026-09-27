# CODE REVIEW

- Task：TASK-021-B2（历史统计界面层：统计页＋首页入口＋清空统计＋7 条集成测试）
- Commit：未提交（工作区改动；B2 归属 = `src/features/stats/`、`historyStats.test.tsx`、`i18n.ts` stats.*/settings.*/home.historyStats 键、`HomeScreen`、`SettingsScreen`、`AppNavigator/routes`、`createAppServices` history 装配、`NoticeBanner` actionTestID）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**PASS**（P0=0；blocking P1=0；非阻塞 P2×3、P3×2 挂账）

> 环境说明：B1 回炉轮在同一工作区并行改动（`migrations/`、`sessionRepository`、`runnerMachine`、`startRoutineService`、`runnerController`、`sessionPersistence`、`seeds`、`Routine.ts`、`ActiveSession.ts`、`sessionMapper`、`routineMapper`、B1 相关测试）。本报告已按文件切割，只归因 B2 自己的 diff；B1 文件的问题（含其复核报告 P1-1~P1-3）不在本报告范围。

## 自证证据（复核员亲跑）

- `npm run typecheck`：exit 0，全仓 0 错。
- `npx jest --runInBand`：**43 套件 / 321 用例全绿**，exit 0（B1 复核时基线 42/314；B2 新增 1 套件 7 用例，与自述一致）。
- `git diff` 逐文件通读；`grep` 验证硬编码中文/色值、`stats.unit.*` 键使用、`ROUTE_TITLES` 消费者、`trainingType` 在 `features/routines` 的残留、tab 导航器存在性。
- `package.json` 零改动 → 无新依赖（无图表库，符合 V1.3 Out of Scope）。

## P0 / P1 Findings

- **P0：无。**
- **blocking P1：无。**

## 8 项复核重点逐条判定

### 1. 文案质量与诚实性 — PASS（P2×2 见下节逐条表）

- 硬编码漏网：`src/features/stats/` 目录零硬编码中文（唯一命中是 `statsFormat.ts:13` 的 UNITS 表，属"重复实现"而非"漏翻译"，见 P2-1）；`routes.ts:45` `ROUTE_TITLES.Stats: '历史统计'` 沿用全表既有模式且 grep 证实 `ROUTE_TITLES` 无任何 UI 消费者（仅定义处），不算漏网。
- 空状态：`stats.emptyDesc` 明确"统计从新版本开始记录；此前练习过的历史已无法找回，不计入本页数据"——**如实**，不会误导读成"你还没练过"；且 `sessionCount===0` 时不渲染总数/分类（测试断言 `stats-total-value`/`stats-type-unclassified` 为 null）。
- 英文：整体地道（"Statistics start recording from this new version"、"Data is stored on this device only — never uploaded"），无机翻味。

### 2. HD-4 隔离 — PASS

- `clearAllStats()`（`sessionHistoryRepository.ts:321-327`）只删 `session_history_steps` / `session_history` / `stats_anomaly_notice` 三表，不碰 `routines`、`routine_steps`、动作库、活动会话、`seed_version`/`seed_examples_cleared`。
- 点击路径推演：设置页两个破坏性入口**不同区块**——「清除示例数据」在示例数据卡，「清空统计数据」在新独立区块「训练统计」（danger 红按钮 + 描述 + accessibilityHint），确认弹窗标题/正文均不同且明写"流程、动作库和示例数据不受影响"。同屏并存可分辨。
- 集成测试同时断言：清空后 `getTotals()` 归零 **且** 自建流程 `routines.getById` 仍非空（`historyStats.test.tsx:277-281`），并回统计页确认空态。

### 3. criterion 正确性 — PASS

- caveat **只**由 `listActiveAnomalies()` 非空驱动（`StatsScreen.tsx:128`），UI 无任何自己判断排除的逻辑；预期排除（0ms/ERROR/not-eligible）在 B1 `classifyTerminalSession` 就不落 `stats_anomaly_notice`，测试 4 先断言无异常时无 banner。
- 关闭：`dismissAllAnomalies(wallClock.nowMs())` 只 `UPDATE ... SET dismissed_at_wall_ms`（`sessionHistoryRepository.ts:363-368`），不改任何累计；测试断言关闭后总数仍 50 秒。且关闭**持久化到 DB**（非仅本地 state），重进不复活。

### 4. 分类桶正确性 — PASS（P3-1 挂账）

- 类型名来自 `listTrainingTypes()`（表查询 `ORDER BY sort_order`），无硬编码列表；测试断言 `WARMUP` 桶显示"热身"证明表驱动。新插类型行无需改码即可显示（types.map + GROUP BY 双侧动态）。
- NULL 桶：`GROUP BY training_type_id` 天然单列 null 桶，UI 单独渲染为「未分类」（i18n 键），不混入任何类型。
- 总计=各桶之和：数据层精确成立（同一 SUM 口径）。测试 3 覆盖 50s+10s+50s=1分50秒。

### 5. 触控与主题 — PASS

- 可点区域全部走 `AppButton`（base `minHeight: MIN_TOUCH_SIZE`=48）：删除按钮（另有显式 minHeight 48）、caveat 关闭、首页入口、清空统计。≥48 达标。
- 颜色全部来自 `src/shared/theme.ts`（grep `'#` 零命中）；硬编码 `fontSize: 12/13` 为全仓既有模式（SettingsScreen:354 同款），非本轮违规。

### 6. 测试成色 — PASS（P2-2 见下）

- 7 条集成测试全走**真内存 SQLite + 真归档入口**（`archiveAndClear`），不 mock 仓库；唯一 spy 是 `Alert.alert`（系统弹窗，合法替身，仍执行 destructive onPress 真路径）。
- 分类聚合用例直接对 runner machine 驱动出真会话再归档，总数/桶/最近条目/提前结束标记全部断言。
- 「清空归零」同时断言自建流程完好（见第 2 条）。
- 「中英即时切换」：真按键切语言（settings-language-en）后导航进统计页断言英文文案＋表驱动英文名（Stretch & Relax / Core Training）＋英文时长格式；**但切换发生在统计页未挂载时**，见 P2-2。

### 7. 越界 — PASS

- 无 B3/B4 改动：`CompletionScreen`/`RunnerScreen` 零触碰；`features/routines` 内 grep `trainingType` 零命中（编辑器类型选择 UI 未偷做）。
- 未改 B1 数据层实现；`NoticeBanner` +5 行仅为可选 `actionTestID` 透传，向后兼容，属 B2 合理最小改动。
- `package.json` 零改动，无图表依赖。

### 8. 跳过的交付项 4 — 正当，无半成品

- 事实核实：`RoutineInput` 无 `trainingTypeId`、`features/routines` 无任何类型选择控件残留——UI 里不存在"存不进去的无效控件"，用户侧无困惑状态。
- 判断：B1 只有读路径（`listTrainingTypes`）时，做编辑器写 UI 确实会写不进去；跳过正当。B1 回炉轮正在补写路径，该缺口已有归属，B2 不留债。

## `stats.*` 中英文案逐条审读

| 键 | 中文 | 英文 | 判定 |
|---|---|---|---|
| home.historyStats | 历史统计 | History & Stats | OK |
| stats.title | 历史统计 | History & Stats | OK |
| stats.total | 累计有效时长 | Total Active Time | OK，"有效"呼应统计口径 |
| stats.sessionCount | 共 {count} 次训练 | Total sessions: {count} | OK |
| stats.byType | 按训练类型 | By Training Type | OK |
| stats.recent | 最近 10 条记录 | Last 10 Sessions | OK（不足 10 条时节标题仍如此，可接受；P3 可选） |
| stats.readError | 读取统计失败 | Failed to load statistics | OK |
| stats.emptyTitle | 暂无训练记录 | No training records yet | OK，中性不误导 |
| stats.emptyDesc | 统计从新版本开始记录；此前练习过的历史已无法找回，不计入本页数据。 | Statistics start recording from this new version. Sessions from before the update cannot be recovered and are not counted here. | OK，诚实达标（V1.3「空白不等于用户过去未练」落实） |
| stats.classificationNote | 流程级分类：混合流程的整场时长全部计入所选训练类型。 | Classification is per routine: a mixed routine contributes its whole session time to the selected training type. | OK，准确无歧义 |
| stats.localOnly | 数据仅保存在本机，不上传 | Data is stored on this device only — never uploaded | OK，HD-8 达标 |
| stats.deleteConfirmTitle | 删除这条记录 | Delete This Record | OK |
| stats.deleteConfirmMsg | 将删除这条训练记录及其时长，累计会随之重算。此操作不可撤销。 | This deletes the training record and its counted time; totals are recalculated. This action cannot be undone. | OK |
| stats.deleteError | 删除失败 | Delete failed | OK |
| stats.caveat.dismiss | 不再提示 | Dismiss | OK，"不再提示"比"关闭"更贴合持久化语义 |
| stats.unit.h/m/s | 小时/分/秒 | `h `/`m `/`s` | **P2-1**：6 个键全仓无消费者——`statsFormat.ts:12-15` 自带硬编码 UNITS 重复实现；且 en 值带尾随空格（`3600000` → "1h "）。修法二选一：① 删 6 个死键，UNITS 去尾随空格（`h: 'h'`，拼接处 `1h 5m` 补空格）；② statsFormat 改从 i18n 取单位 |
| stats.type.unclassified | 未分类 | Unclassified | OK |
| stats.endedEarly | 提前结束 | Ended early | OK，表述得体 |
| stats.exclusion.*（3×2） | 更新前开始的训练不计入新统计 等 | Sessions started before the update… 等 | **P2-3**：当前无 UI 消费者（预置给 B4 完成页中性说明）。文案本身 OK；挂账确认 B4 落地时使用，否则成死键 |
| stats.anomaly.recovery-boot-changed | 上次训练因设备重启，有一段未能计入统计 | Part of your last session could not be counted after the device restarted | OK |
| stats.anomaly.recovery-stale | 上次训练搁置太久，有一段未能计入统计 | Part of your last session was left too long and could not be counted | OK |
| stats.anomaly.recovery-corrupt | 上次训练数据异常，有一段未能计入统计 | Part of your last session was lost to a data error | OK |
| stats.anomaly.archive-failed | 上次训练未能保存统计，可从完成页重试 | Your last session was not saved to statistics; retry from the completion screen | **P2-4**：「完成页重试」入口在 B4 才存在，TASK-021 全链收口前是悬空指引；真机验收前必须确认 B4 落地该入口（或届时改文案） |
| stats.caveat.lowerThanActual | 存在未计入的异常，合计可能低于实际练习 | Some time was lost to an anomaly; totals may be lower than what you actually practised | OK，诚实不吓人 |
| settings.stats | 训练统计 | Training Statistics | OK |
| settings.statsDesc | 清空只删除训练记录与统计时长，不影响你的流程、动作库和示例数据。 | Clearing removes training records and counted time only. Your routines, action library and sample data are untouched. | OK，隔离声明明确 |
| settings.clearStats | 清空统计数据 | Clear Statistics | OK，与「清除示例数据」字面可分辨 |
| settings.clearStatsConfirmMsg | 将删除全部训练记录与统计时长，累计随之归零。流程、动作库和示例数据不受影响。此操作不可撤销。 | This deletes all training records and counted time; totals reset to zero. Routines, the action library and sample data are unaffected. This action cannot be undone. | OK |
| settings.clearStatsDone | 已清空全部训练统计。 | All training statistics cleared. | OK |
| settings.clearStatsError | 清空统计数据失败 | Failed to clear statistics | OK |

## 非阻塞挂账（P2×3 / P3×2，不打回）

- **P2-1** i18n `stats.unit.*` 死键＋`statsFormat.ts` 硬编码 UNITS 重复＋en 尾随空格（详见上表；建议 TM 顺手派 builder 一行小修，可与 B3/B4 同批）。
- **P2-2** `historyStats.test.tsx:294`「中英即时切换」用例是在统计页未挂载时切语言再进入；建议补一步"停留在统计页时按 settings-language 切换"的断言，才完全兑现"即时"二字（现行为因 LanguageContext 重渲染实际是即时的，测试证据不足而非行为缺陷）。
- **P2-3/P2-4** 见上表 `stats.exclusion.*`（B4 消费确认）与 `stats.anomaly.archive-failed`（B4 重试入口落地确认）——两条均为**真机验收前必须闭环**的时序挂账，非 B2 缺陷。
- **P3-1** `StatsScreen.tsx:166-178`：若 history 行的 `trainingTypeId` 在 `training_types` 表无对应行（类型行被删），该桶静默隐藏、显示桶之和 ≠ 总计。V1.3 已禁删已用类型，风险低；建议 B3 收口时加一行防御注释或 fallback 显示 type_id。
- **P3-2** `formatStatsDuration` 小时档丢秒（1h59m59s→"1小时59分"），各桶独立取整可使显示桶之和与显示总计相差分钟级（数据层精确相等不受影响）。大字展示可接受，挂账观感决策。

## 结论

**PASS**：P0=0、blocking P1=0。B2 交付与自述 9 条全部属实（测试 43/321 亲跑复现）；文案诚实性、HD-4 隔离、caveat 单一驱动源、表驱动分类、触控/主题合规、无越界、跳过交付项 4 正当且无半成品。5 条非阻塞挂账移交 TM 排期，其中 P2-3/P2-4 须在 TASK-021 真机验收前闭环。
