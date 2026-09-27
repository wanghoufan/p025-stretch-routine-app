# CODE REVIEW｜TASK-021-F1 种子流程训练类型存量回填

- Task：`TASK-021-F1`（真机 QA P0 缺陷修复：存量 9 个种子流程全落「未分类」）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- 日期：2026-09-27
- 基线：`DEV_BASELINE=PRODUCT_PLAN_V1.3`；复核对象＝工作区未提交改动（`git diff HEAD`）＋新测试 `src/tests/repositories/migrationsV5.test.ts`
- 复核方式：只读复核＋独立重跑（`npm run typecheck` 0 错；`npm test` **47 套件 / 352 用例全绿**，与 builder 自述一致）；未跑 gradle、未装机、未改实现。

## 结论：**PASS**（P0=0，blocking P1=0）

**F1 验收通过，可装包复验。**

改动面核对（git status 实测）：`src/data/migrations/index.ts`（+46）、`src/data/seeds.ts`（+11/-2）、`src/tests/repositories/migrationsV4.test.ts`（+5/-2）、新增 `src/tests/repositories/migrationsV5.test.ts`、QA 报告。无越界。

---

## 逐项判定

### 1. 回填正确性（三处逐条比对）——✅ PASS

独立比对了三处，**逐条相等**（9/9）：

| 种子流程 | V1.3 文档（:24-32） | `SEED_TYPE_BACKFILL_V5`（migrations/index.ts:23-28） | `SEED_ROUTINES`（seeds.ts） |
|---|---|---|---|
| 晨起全身拉伸 | STRETCH_RELAX | STRETCH_RELAX | STRETCH_RELAX（:187） |
| 久坐办公族拉伸 | STRETCH_RELAX | STRETCH_RELAX | STRETCH_RELAX（:270） |
| 跑后下肢放松 | STRETCH_RELAX | STRETCH_RELAX | STRETCH_RELAX（:203） |
| 办公室久坐放松 | STRETCH_RELAX | STRETCH_RELAX | STRETCH_RELAX（:218） |
| 睡前全身放松 | STRETCH_RELAX | STRETCH_RELAX | STRETCH_RELAX（:238） |
| **5分钟快速热身** | **WARMUP** | **WARMUP** | **WARMUP**（:255） |
| 初级核心 | CORE | CORE | CORE（:291） |
| 中级核心 | CORE | CORE | CORE（:304） |
| 高级核心 | CORE | CORE | CORE（:318） |

重点确认：**「5分钟快速热身」＝WARMUP（热身）**，三处一致，无误配为 STRETCH_RELAX。且有 drift-guard 测试把三处锁死（migrationsV5.test.ts:66-77 同时断言 backfill≡V1.3 表≡SEED_ROUTINES），未来任一处漂移会当场红。

### 2. 幂等与安全性——✅ PASS

- **幂等**：双重保障——`runMigrations` 版本门槛（version ≤ current 直接跳过，migrations/index.ts:280）＋语句内 `training_type_id IS NULL` 守卫。测试实证：连跑两次仍 5，且**第二轮不重赋型**（含"跑完 v5 后用户手动置 NULL 再跑一次，保持 NULL"的最强断言，migrationsV5.test.ts:128-145）。
- **非 NULL 绝不覆盖**：用户已设类型（含 fresh-install 种子已写入的类型）不被动，测试覆盖（:95-109）。
- **v1/v2/v3 直升 v5**：`it.each([1,2,3])` 三条全过；v4 在同一 `runMigrations` 循环内先于 v5 执行（按 version 排序，:279），故 v5 的 UPDATE 执行时 `training_types` 三行已存在，FK 满足；种子行正确赋型（:147-166）。
- **`resetSchema()` 重建经 v5**：空表上 UPDATE 为安全 no-op，落在最新版本（:168-185）。

### 3. 误伤面——✅ PASS（取舍成立，无需加排除逻辑）

- 精确 `IN` 匹配：自建名、**尾随空格**（`'晨起全身拉伸 '`）、**前缀变体**（`'中级核心（复刻）'`）均不赋型，测试实证（:111-126）。名称在入库时已 `trim`（seeds.ts:495），所以"种子行存的是 trim 后名字、回填也按 trim 后名字匹配"两边口径一致。
- **「清除示范数据后自建同名」判可接受——我独立判断：成立，不需要排除逻辑**。理由：
  1. v5 是**一次性**迁移（版本门槛），只在那一次升级启动时生效；此后用户自建同名流程走实时写入路径（不猜），不存在持续误伤。
  2. 项目既有语义本就"同名即种子"——repair 补插与 clear-examples 都按这套名字匹配（seeds.ts:336、:717-718），v5 与既有口径一致。
  3. 即便误赋型，后果只是统计归类进对应桶（名为"5分钟快速热身"的自建流程归"热身"语义上反而合理），数据零损坏。
  4. 若加"只对未 clear 的库回填"（查 `seed_examples_cleared`），要为一次性事件增加 SQL 复杂度，收益趋近于零。**不建议加。**

### 4. 「NULL 一律回填」歧义影响面评估——✅ 可接受，**建议不加标记列**（产品取舍，TM 拍板）

**关键事实（复核中独立查实，修正 QA 报告 §3 的表述）**：v5 只在**升级到本版本的那一次启动**执行；`runMigrations` 对 version ≤ current 一律跳过（migrations/index.ts:280），生产代码无任何路径把 `user_version` 重置（`resetSchema()` 仅为 test/qa helper，App 启动链不调用——已核 App.tsx → initializeApp → initializeAppDatabase）。因此：

- **「用户主动改成未分类会在下次启动被回填覆盖」不成立**。v5 之后用户在编辑器选「未分类」（`TrainingTypeSelector` 的 `onChange(null)`，TrainingTypeSelector.tsx:83）保存的 NULL **永久保留**，之后每次启动 v5 都被跳过。
- 真实的唯一损失窗口：用户在 **v4 构建**上先把某流程设了类型、再主动改回「未分类」，然后跨 v4→v5 升级这一次——该 NULL 会被回填。而 v4 包（B1-B4 开发/QA 包）只装在 QA 设备上，**现网用户实际暴露面≈0**；且 v4 时种子行本来就是 NULL（缺陷态），"从未赋型"与"主动清空"在该时点无法区分是实现使然。
- **结论与建议**：不加标记列。为此加列需要又一次 schema 变更（v6）＋编辑器/存储链路改动，为一次性、近零暴露的窗口买单，成本收益不成比例。若未来产品明确要求"未分类选择永久尊重"，届时走 Change C 一并设计（新列＋新语义），不在 F1 范围内强行塞入。

### 5. 口径收窄注释——✅ PASS

收窄后的口径写进了**三处**，位置均恰当：
1. `migrations/index.ts:240-246`（v5 docblock「口径收窄（相对 B1 的「不凭名字猜」）」整段，含理由与后果边界）——后人读迁移第一眼就能看到；
2. `seeds.ts:80-84`（`SeedRoutineDefinition.trainingTypeId` 字段 docblock 的 Scope note）——定义真源处；
3. `seeds.ts:498-500`（`insertSeedRoutine` 写入点行内注释）——实时写入路径处，防止误改。

三处互相呼应且一致（实时写入不猜／一次性回填允许按名匹配），后人无论从哪个入口读都不会误读回旧口径。

### 6. 旧测试改动定性——✅ **机械适配，非削弱**（确定结论）

`migrationsV4.test.ts:179-187`：`toBe(4)` → `toBe(latestSchemaVersion())`。

定性依据：
- 旧断言 `toBe(4)` 隐含「v4 是最新版本」这一前提，v5 加入后该前提失效——**不改必红**，改动是被迫的机械适配。
- v4 幂等的**真实生产保障**是 `runMigrations` 的版本门槛＋每迁移一事务；测试里第二次 `runMigrations` 调用正是对这套机制的验证：版本稳定不回退、不重复赋型（`training_types=3` 断言保留）。v4 不存在"被单独重放"的生产路径，因此"v4 测试是否还能验证 v4 本身的幂等"的答案是：**能验证的正是生产中真正存在的那种幂等（整链重入为 no-op）**。
- 更强的防重放断言已由 v5 测试补上（"跑完置 NULL 再跑一次不被重填"，migrationsV5.test.ts:134-142）——这恰是旧 v4 测试从未覆盖过的场景，整体强度**上升**而非下降。

### 7. 越界检查——✅ 干净

git diff 实测：未改界面、归档算法、R006、B3/B4；**未动 `session_history`**（v5 语句只 UPDATE `routines`）；未动 `repairSeededRoutines` 行为本身（根因注释只写在 v5 docblock）。改动面与 TM 拍板方案 1-4 完全对齐。

### 8. 反例挑刺——✅ 未发现 P0/P1 级问题

- **事务原子性**：每个迁移的语句＋`PRAGMA user_version = N` 在**同一 `db.transaction`** 内（migrations/index.ts:283-289）。SQLite 的 `user_version` 写入是 journal 保护的头部落盘、随事务回滚（与事务内被忽略的 `PRAGMA foreign_keys` 不同——后者已正确放在事务外，:275）。部分失败＝全部回滚，**不会留半套回填数据、也不会出现"数据改了但版本没进"或反向**。
- **SQL 注入面**：v5 语句对 `typeId`/`name` 做字符串拼接，但全部是**编译期常量**（`SEED_TYPE_BACKFILL_V5` 字面量），无用户输入通道；名字不含引号。与 v1-v4 既有风格一致，判安全（记录在案，非缺陷）。
- **种子名重复**：实测 9 个种子名全部唯一；drift-guard 测试比较的是展平排序后的 [name,type] 全量数组，未来若种子定义出现重名/冲突会当场红。即使库里出现两条同名行（用户建重了），`IN` 匹配两行同赋型，行为一致合理。
- **FK 保护**：若未来有人改错 `typeId`，FK（v4 已建、启动时 `PRAGMA foreign_keys=ON`）会让事务失败并大声报错，符合"fail loudly instead of guessing"设计意图。
- **启动顺序**：迁移→`runSeeds`→`repairSeededRoutines`（createAppServices.ts:105-113）；fresh install 时 v5 对空表 no-op，种子直接带型写入；v5+ 库上 repair 补插的种子由定义带型（非 NULL），不会被 v5 二次处理。闭环。

## Builder 自述核验汇总

| 自述 | 核验结果 |
|---|---|
| v5 迁移＋幂等（连跑两次仍 5） | ✅ 代码＋测试双证 |
| 三重漂移护栏 | ✅ migrationsV5.test.ts:66-77 |
| 非 NULL 不覆盖／近似名不赋型 | ✅ 测试实证 |
| v1/v2/v3 直升 v5、resetSchema 重建 | ✅ it.each([1,2,3])＋重建测试 |
| v4 测试改 `latestSchemaVersion()` | ✅ 机械适配（见 §6） |
| 同名自建判可接受 | ✅ 独立判断成立（见 §3） |
| typecheck 0 错／47 套件 352 用例全绿 | ✅ 本机独立重跑一致 |

## 非阻塞备注（不要求本轮处理）

- P3｜QA 报告 `docs/qa/task021-真机第一轮.md` §3「用户主动改成未分类的选择会在下次启动被回填覆盖」表述过于保守：实际 v5 只跑一次，v5 之后的未分类选择**永久保留**（见本报告 §4）。建议 TM/QA 在装包复验时顺手更正一句，避免后续误判为持续覆盖。
- P3（既有，非本轮引入）｜`migrationsV4.test.ts` 的 `training_types=3` 断言对 `INSERT OR IGNORE` 天然不敏感，防重复插入强度有限；v5 的 rerun 测试已实质性补强，不需动。

## 心跳

- 目标：F1 复核（存量种子类型回填）
- 剩 P0：0
- 下一步：TM 收报告 → 装 12 Pro 复验（9 流程按 V1.3 分桶入统计）→ qa 复验通过后收口
