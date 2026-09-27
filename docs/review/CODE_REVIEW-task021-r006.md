# CODE REVIEW

- Task: TASK-021-R006 修复单调时钟与真 boot 身份
- Commit: 工作区未提交改动（builder 交付轮 R006；基线 = main @ TASK-020 收尾后）
- Reviewer: code-reviewer（codebuddy/glm-5.3-flash，独立 session）
- Result: **打回**（1 条 blocking P1：原生模块降级路径零日志且查找结果不缓存；改法明确、单文件小改，TM 可按 A 类小改快速回炉后送 QA）

## P0 / P1 Findings

### P1-1（blocking）：原生模块不可用时静默降级，零日志、查找结果不缓存（复核重点 ⑤，风险真实存在）

- 位置与证据：
  - `src/services/runtime/StretchRuntime.ts:45`（`catch { return null; }` 静默吞掉加载异常）
  - `src/services/runtime/StretchRuntime.ts:52-54`（`nativeNowElapsedMs()` 返回 null 无任何提示）
  - `src/services/clock/MonotonicClock.ts:60`（`nativeNowElapsedMs() ?? highResolutionElapsedMs()` 静默切源）
  - `src/services/runtime/BootInfo.ts`（`DeviceBootInfoProvider.getBootCount()` 回退随机进程身份，同样零提示）
  - 三个文件 grep `console|warn|log` 均为零命中（本轮实测）。
- 危害链：release APK 上若模块意外未链接/加载失败 → 单调时钟静默退到 `performance.now()`（不含深度睡眠补时）＋ boot 身份静默退到随机进程身份（杀进程即丢会话）→ 统计数字错而不可知，恰恰复活了本任务要消灭的故障模式，且比 `Date.now()` 时代更难发现（时间仍"看起来单调"）。
- 次生风险（同源）：`loadStretchRuntime()` 每次调用都重新 `require`，查找结果不缓存。若原生侧出现瞬态失败，同进程内会在 `elapsedRealtime`（CLOCK_BOOTTIME，含深睡）与 `performance.now()`（steady_clock = CLOCK_MONOTONIC，不含深睡）两个**不同纪元**之间切换，`nowElapsedMs()` 可能时间倒流，触发 `sessionRecovery` 的 'phase start is in the future' 误判。方向是 fail-safe（丢弃会话），不造成假续播，但属可避免的退化。
- 改法（单文件闭环）：
  1. `StretchRuntime.ts`：把 `loadStretchRuntime()` 的结果缓存到模块级变量（成功与失败都缓存——失败也缓存，杜绝反复查找与混源）；
  2. 首次回退（模块为 null）时 `console.warn` 一次（含原因：absent / invalid shape / exception），后续不再刷屏。
- 判 blocking 的理由：本任务是统计功能的串行硬前置，"时间源可信且可信可观测"是其核心目标；观测性缺失不是锦上添花项。修复成本约 10 行，不构成延期理由。

## P2 / P3 Backlog Findings

- **P2-1（T7 定性，复核重点 ⑦ 的落档）**：真重启后"丢弃会话、不自动续播"是**既有策略**，非本次新引入——`src/features/runner/services/sessionRecovery.ts:66-68`（bootCount 变更 → `discarded`）与 `src/features/runner/services/startRoutineService.ts:87-91`（不匹配即静默 `clear()`）均不在本次 diff、未被改动；本次只把身份来源从"每次进程重启必变"的 `Date.now()` 换成"真重启才变"的 `BOOT_COUNT`，让既有 fail-safe 从"过度触发"收敛为"精确触发"。因此 T7 缺的是**既有策略在真身份下照常工作的 UI 层演示证据**（锁屏合成输入受限所致），不是新功能正确性证据。定性：**非阻塞 P2 挂账**，待用户解锁后由 QA 补拍归档；**不阻塞统计功能开工**（前提：QA 轮对"同 boot 杀进程恢复"与"真重启丢弃"两条路径完成取证，取不到的按本条口径挂账）。
- **P2-2**：Expo Go 验收口径须写明——Expo Go 下 boot 身份=随机进程身份（杀进程即丢，与旧行为一致）、单调时钟不含深睡补时；**跳钟连续性可在 Expo Go 验**，**深度睡眠补时 / 同 boot 恢复 / 真重启丢弃必须 release APK 验**。项目历史多用 Expo Go 验收，此口径不写明会产生假失败（恢复类用例在 Expo Go 必然"失败"）或假通过。
- **P2-3**：真机证据（±1h/±1d 四组跳钟连续、前后台连续、同 boot 恢复 3:34→4:56 精确追赶、`boot_count 157→158`）全部为 builder 自述，仓内无原始命令输出留档，reviewer 无法独立复核"谁测的、怎么测的"。要求 QA 轮按四组跳钟逐组归档复验，boot_count 变化用 `adb shell settings get global boot_count` 前后取值留痕。
- **P3-1**：`nativeTimeSource.test.ts` 未覆盖 `highResolutionElapsedMs()` 两个来源都缺失时的 throw 路径（`MonotonicClock.ts:53-55`）；现有 10 条已在文件头诚实声明"只钉 source selection、不充当设备证据"，其中两条主要验证 mock 返回值（wiring 级），可接受。非必改。
- **P3-2**：`getBootCount()` 每次调用都走原生读取（不缓存）——OEM 限制场景返回 -1 是静态的，一致性无虞；仅记录，非必改。

## 八项复核重点逐条判定

1. **正确性（API level / 降级）**：✅ 属实。`minSdkVersion` 实测 = 24（`node_modules/expo-modules-autolinking/.../ExpoRootProjectPlugin.kt:53`，catalog 默认 24，项目未覆写）；`Settings.Global.BOOT_COUNT` 自 API 24 起可用，与 minSdk 恰好对齐，无需 Build.VERSION 分支。Kotlin 侧 `Settings.Global.getInt(resolver, name, -1)` 带 default＋catch Exception → -1，JS 侧 `Number.isInteger && >=0` 把 -1 转 null → 保守回退，正确。`requireOptionalNativeModule` 缺席返回 null 不抛错（builder 用法正确），Expo Go 不会崩。
2. **越界检查**：✅ 无越界。diff 仅 `.gitignore` / `createAppServices.ts`（组装根换实现）/ clock 两文件 / BootInfo / 新增模块与测试；无统计功能代码、无业务逻辑/动作库/语音/UI 改动。`sessionRecovery.ts`、`startRoutineService.ts` 未动。`docs/pm/PRODUCT_PLAN_V1.3.md` 保持未跟踪未触碰。改名（ExpoGo* → Device*）无残留引用（grep 零命中，typecheck 0 错）。
3. **.gitignore 安全性**：✅ 安全。`git check-ignore -v` 实测：`modules/stretch-runtime/android/build/**` → 命中 `.gitignore:52 **/android/build/`（忽略 ✅）；`modules/stretch-runtime/android/src/.../StretchRuntimeModule.kt` → 不命中任何规则（**会进仓 ✅**）；根 `android/app/build.gradle` 等仍命中 `/android/`（忽略不变 ✅）。全仓无其他裸 `android/` 目录依赖旧贪婪行为（node_modules/releases 自身已被忽略）。
4. **performance.now 诚实性**：✅ 声称在 RN 0.86.3 上成立。实测：`ReactCommon/react/timing/primitives.h` 底层 `std::chrono::steady_clock`（Android = CLOCK_MONOTONIC）；`ReactCommon/jsitooling/react/runtime/JSRuntimeBindings.cpp:38-53` 的 `bindNativePerformanceNow` 由 `JSIExecutor.cpp:90` 在每个 JSI runtime（含 Hermes）无条件绑定，故 RN 内 `performance.now` 不会落到 `setUpPerformance.js:27` 的 `Date.now` 兜底。行为差异（Expo Go 无深睡补时＋随机 boot 身份）见 P2-2，须写进 QA 口径。
5. **降级静默风险**：⚠️ **真实存在**——见 P1-1，这是本次打回的唯一 blocking 项。
6. **测试成色**：✅ 合格。`git diff --stat -- src/tests` 为空（未偷改任何旧测试）；全量 `npx jest` 实测 37 套件 / 273 用例全绿，与基线 36/263 差异恰为 +1 套件 / +10 用例，全部来自新增文件。测试钉的是"来源选择"契约（原生在→走原生、原生缺→走 RN 高分辨率钟、-1 哨兵→保守身份、Date.now 零调用），文件头明确声明不充当设备证据，成色诚实。
7. **T7 定性**：见 P2-1 —— **非阻塞 P2，不阻塞统计开工**。
8. **反例挑刺**：真机四组跳钟/追赶/boot_count 证据均为自述无留档 → P2-3 要求 QA 逐项归档复验；混源纪元风险 → P1-1 改法一并解决（失败也缓存）；`WallClock.ts:19` 的 `Date.now()` 属墙钟 port 本职用途，不违"计时路径不用 Date.now"的承诺。

## 统计功能开工前置（本报告结论下）

1. builder 按 P1-1 单文件回炉（缓存查找结果＋首次回退 warn），reviewer 快速复审；
2. QA 真机轮归档复验：四组跳钟、前后台、同 boot 恢复、真重启 boot_count 取值留痕（P2-3），Expo Go / release APK 按口径分工（P2-2）；
3. T7 按非阻塞挂账（P2-1），用户解锁后补拍 UI 证据即可，不算本任务 DoD 缺口。

---

# Round 2（回炉复审，2026-09-27）

- 范围：只判 P1-1 是否闭环，不扩大范围。
- 自证：`npm run typecheck` 0 错；全量 `npx jest` **38 套件 / 282 用例全绿**（3.5s）；`git diff --stat` 复核。
- Result: **PASS**（P0=0 / blocking P1=0）

## 六项复审判定

1. **P1-1 真闭环 ✅**：`StretchRuntime.ts:76-78` 三个模块级变量（`resolved`/`cachedModule`/`fallbackWarned`），`loadStretchRuntime()`（:85-96）`resolved` 即返缓存，成功缓存模块实例、失败缓存 `null`——同进程来源恒定。warn 通道 `warnFallbackOnce()`（:102-113）自身有 `fallbackWarned` 守卫，且只在首次 lookup 失败时被调用（之后 `resolved=true` 根本不再进该分支），双重防刷屏。**无第二条静默通道**：`lookupNativeModule()`（:55-73）三条失败路径（absent :60 / shape invalid :66 / throw :71）全部带 reason 汇入同一个 warn，测试逐条钉死（`stretchRuntimeFallback.test.ts:110-134`）。非阻塞观察（不计缺陷）：模块形状合格但单次调用返回 NaN 时，`nativeNowElapsedMs()`（:126-133）按值校验静默回 null——这是调用级值校验非查找降级，且 `elapsedRealtime` 返回非数值不是现实失败模式，挂账即可。
2. **混源纪元消除 ✅**：`MonotonicClock.ts` 的 `nativeNowElapsedMs() ?? highResolutionElapsedMs()` 中 `??` 只在 null 时触发，而缓存后 null 与否是进程常量——CLOCK_BOOTTIME 与 CLOCK_MONOTONIC 不可能同进程交替。测试 `stretchRuntimeFallback.test.ts:41-54` 钉死「模块中途变可用也不翻源」。
3. **旧测试改动定性：可接受**。详见下节。
4. **新增测试验证行为 ✅**：`stretchRuntimeFallback.test.ts` 用 `requireOptionalNativeModuleMock` 调用次数（:38 :46 :53 :61 :71 :145）断言生产代码「只查找一次」，用 `console.warn` spy 计数（:88 :116 :130）断言「只 warn 一次」——验证的是 `StretchRuntime.ts` 的缓存与告警行为，不是 mock 自己。
5. **基线只增不减 ✅**：38/282 全绿（Round 1 为 37/273；＋1 套件＋9 用例全部来自新增 `stretchRuntimeFallback.test.ts`）。tracked 测试文件仅 `setup.ts` 被改——纯新增 `beforeEach(() => __resetStretchRuntimeLookupForTest())`（测试隔离必需，零断言改动；builder 自述未提，属诚实范围内的必要基建，记录在案）。其余 272 条既有用例零改动，实测佐证。
6. **无越界 ✅**：Round 2 新增改动仅 `StretchRuntime.ts`（新文件）＋两测试文件＋setup.ts 重置钩子；Round 1 已审的 diff（`.gitignore`/`createAppServices.ts`/clock 两文件/`BootInfo.ts`）内容未变。`MonotonicClock`/`BootInfo` 对外接口语义未动；无统计功能代码、无设备状态操作、`docs/pm/PRODUCT_PLAN_V1.3.md` 未触碰。

## 旧测试改动明确定性（nativeTimeSource.test.ts:87-97「real reboot」）

**可接受——是修正模拟手法，不是放宽断言。** 逐项核对：

- 断言值一字未动：`expect(...).toBe(157)`（:89）与 `expect(...).toBe(158)`（:96）与改前完全一致，无 `toBeTruthy()` 类弱化、无断言删除。
- 改的只是模拟机制：原版靠同进程内替换 mock 模块对象（157→158）模拟重启——那正是本轮 P1-1 要消灭的「同进程切源」动作，加模块级缓存后该手法必然失效；改后用 `__resetStretchRuntimeLookupForTest()`（:94）跨进程边界，与「真重启＝新进程＝缓存自然重解析」的生产语义严格对应。改后版本实际上**更强**：它额外钉住了「BOOT_COUNT 变化只在跨进程时被观察到」这一新契约。
- 备注：该文件本身是 R006 Round 1 新增（未跟踪文件），非仓库历史测试，不在「旧测试不动」红线范围内。

## 结论

**R006 验收通过，统计功能可以开工。** P2-1（T7 UI 证据）、P2-2（Expo Go 口径）、P2-3（真机证据归档）维持挂账，移交 QA 轮执行。
