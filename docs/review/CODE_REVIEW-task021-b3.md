# CODE REVIEW

- Task：TASK-021-B3（流程编辑器训练类型选择）
- Commit：未提交（工作区改动，与 B1/B2/B4 同树，见 `git status` @ 2026-09-27）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**PASS**（P0=0；blocking P1=0；P2 两条记账）

## 自证证据（复核员亲跑）

- `npm run typecheck`：0 错误（全仓）。
- `npm test -- --runInBand`：**46 套件 / 341 用例全绿**，exit 0（与 builder 自述一致）。
- 通读 `git diff`：`RoutineEditorScreen.tsx`、`useRoutineDraft.ts`、`saveRoutine.ts`、`routineRepository.ts`（trainingTypeId 契约段）、`TrainingTypeSelector.tsx`（新文件）。
- grep 全 CJK：`TrainingTypeSelector.tsx` 仅注释含「未分类」，无用户可见硬编码；`src/features/routines/` 下 `routineGroups.ts` 的「热身/核心」是既有首页场景分组（category 体系），与训练类型无关，不属本轮越界。

## 逐项核验

1. **真表驱动 ✓**：选项唯一来源是 `services.history.listTrainingTypes()`（`TrainingTypeSelector.tsx:29-48`），加一个 i18n 提供的「未分类」选择桶。集成测试 `trainingTypeEditor.test.tsx:53-83` 向表插入 `LOWER_BODY/下肢训练` 行后断言 UI 出现该 chip——硬编码三值列表不可能通过此测试。grep「拉伸放松/热身/核心训练」零命中（既有 routineGroups 除外，无关）。
2. **新建默认未分类 ✓**：`useRoutineDraft.ts` `createEmptyDraft` → `trainingTypeId: null`；测试断言默认路径落库 NULL。
3. **编辑回显 ✓**：`toDraft` 读 `loaded.routine.trainingTypeId ?? null`；测试 `expectSelected('CORE')` 回显成立。
4. **「省略 vs 显式 null」语义 ✓ 且 UI 可区分**：仓储层契约 `'trainingTypeId' in input ? … : existing`（`routineRepository.ts` update 段，与 tag 字段同款）；编辑器**恒显式传**（`useRoutineDraft.ts` save 段注释「never an omission」），用户表达「改成未分类」＝点专用「未分类」chip（`onChange(null)`，testID `routine-type-unclassified`）。集成测试第 3、4 条分别断言显式 null 改判与省略字段保留现值——两条语义都被真实落库断言覆盖。
5. **混合流程整场算一类说明 ✓**：`editor.trainingTypeHint` 中英文案齐备，测试双语言断言。
6. **9 种子映射逐条相等 ✓**：`seedTrainingTypes.test.ts` 与 `trainingTypeEditor.test.tsx:205-229` 双层断言——定义层逐条相等＋全名集合无多无少；落库层逐条相等（含「5分钟快速热身」=`WARMUP`）；编辑器 UI 层逐个渲染并断言选中态；另覆盖「既存同名行不赋型」「清示范不复活」「修复重建带型」。
7. **数据层零改动说法核实**：`routineRepository.ts` 的 trainingTypeId 读写段是 B1 列基础上的编辑器契约补全（omitted-vs-null 判别），属 B3 分内；未触碰归档/迁移/时钟。

## P2 / P3 Backlog Findings

- **P2-1** `listTrainingTypes()` 不过滤 `is_active`（`sessionHistoryRepository.ts:281-300`，SELECT 无 `WHERE is_active=1`）。当前三行全 active 无实感；将来 migration 停用某类型后，编辑器仍会把它列为可选。建议在停用机制真正引入前补过滤或记 HANDOFF 挂账（归属 B1/B3 共用接口，TM 定）。
- **P2-2** `TrainingTypeSelector` 表读取失败时静默降级为只剩「未分类」（`:38-44`），无错误提示、无重试。降级本身正确（不发明选项），但用户会以为「只有未分类可选」。低频路径，建议挂账：失败时给一条可重试的局部提示。

## 结论

B3 交付与 V1.3 HD-1/HD-5 及派工单逐条对得上，测试成色真实（真库＋真 UI＋逐条相等断言）。**PASS，可进 QA。**
