# CODE REVIEW

- Task: TASK-020 启动画面从 Expo 默认框架换成品牌皮肤
- Commit: c2393af（工作区未提交 diff，4 文件：App.tsx / app.json / package.json / package-lock.json；android/ 为未跟踪 prebuild 产物，已实读核对）
- Reviewer: code-reviewer（本窗口 subagent，独立上下文）
- Result: **过（PASS）**——P0=0，blocking P1=0；2 条 P2 挂账 + 4 条 P3，均不阻塞放行

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 复核方式与独立验证（不照抄 builder 自述）

1. **「旧 splash 是死配置」— 成立。** 三重证据：① 全仓 grep（src/ + App.tsx + app.json）确认除 app.json 外无任何代码引用 splash；② 实读插件源码 `node_modules/expo-splash-screen/plugin/build/withSplashScreen.js`：`if (props != null)` 才进 mods，props 仅来自 plugins 数组第二元素，**不回退读顶层 `config.splash`**——改动前 package.json 无 expo-splash-screen，顶层 splash 在本 SDK 布局下不被任何环节消费；③ 目检 `assets/splash-icon.png` 确为 Expo 靶心图（1024×1024），与「残留 Expo 默认」叙述一致。
2. **expo-splash-screen 是 SDK 内置版本 — 成立。** `node_modules/expo/bundledNativeModules.json` 中恰为 `~57.0.9`，实装 57.0.9，package.json 精确匹配。
3. **Android 12+ 不需手写 values-v31 — 成立。** `expo-splash-screen/android/build.gradle:19` 依赖 `androidx.core:core-splashscreen:1.2.0`，其 AAR 内置 v31 资源将 compat 属性（`windowSplashScreenBackground` / `windowSplashScreenAnimatedIcon`，无 android: 前缀）映射到平台属性。项目 res 确无 values-v31；styles.xml 的 `Theme.App.SplashScreen` parent 到 `Theme.SplashScreen`，`postSplashScreenTheme→AppTheme`；AndroidManifest activity theme 正确指向；MainActivity.kt 含生成块 `SplashScreenManager.registerOnActivity(this)`。
4. **imageWidth:100 不被圆形遮罩切角 — 结论成立，表述有小瑕疵。** 实测产物：drawable 基准画布 288dp（mdpi 288px → xxxhdpi 1152px），100dp 内容居中（插件源码 canvasSize=288×multiplier、size=100×multiplier，与产物像素一致）。Android 12+ 无背景图标遮罩圆直径 192dp（半径 96dp），100dp 方图**半对角线** 70.7dp < 96dp → 不切角。builder 写「对角线 70.7dp」实为半对角线（对角线 141.4dp），结论不受影响。12- 设备 androidx 图标视图为 288dp（`splashscreen_icon_size_no_background=288dp`，AAR 实测），无遮罩，同样安全。
5. **防闪烁挂载机制 — 成立。** `SplashScreenManager.kt` 用 OnPreDraw 返回 false 挂屏直至 `hide()`；`preventAutoHideAsync()` 在模块作用域先行注册（早于首帧）；`hideAsync` 仅在 `boot.status` 离开 loading 后的 requestAnimationFrame 中调用（App.tsx:64-72），此时 BootScreen 已 commit。三层背景一致：colors.xml `#041B3D` == theme `colors.background #041B3D` == BootScreen，无白/黑帧路径。**错误分支同样释放 splash**（effect 不区分 error），不会把失败原因盖死。
6. **自报副作用属实。** drawable 均为新图（xxhdpi 864×864 目检 = motion-core 图标居中透明画布）；`values-night/colors.xml` 为空 `<resources/>` 无暗色漂移；`expo_splash_screen_resize_mode=contain` 已写入 strings.xml。

## DoD 覆盖度

| DoD | 判定 | 证据 |
|---|---|---|
| ① 原生 splash 换肤且 12+ 正确 | **MET**（静态复核全过，最终以 QA 真机目检为准） | colors.xml #041B3D；styles.xml parent 链正确；drawable 目检为新图；12+ 属性映射链（androidx AAR v31 资源）核实 |
| ② iOS 侧正确 | **MET（配置层）** | 项目无 `ios/` 目录（HANDOFF 定位 Android-only）；app.json 插件 props + 顶层 splash 均已指向新图与 #041B3D，未来 `prebuild -p ios` 将生成正确 storyboard；当前无 iOS 构建物可验，真机无从谈起 |
| ③ App boot 屏同套皮肤无跳变 | **MET**（静态判定，偏移量待真机确认，见 P3-2） | 图源同文件（App.tsx:22 本地 require `./assets/motion-core-icon.png`，与 app.json 插件同源，1024×1024）；尺寸同为 100dp（app.json `imageWidth:100` ↔ App.tsx `BRAND_ICON_SIZE=100`）；两者均屏幕居中（boot 容器 alignItems+justifyContent center；原生画布居中） |
| ④ 防闪烁持续到 DB 初始化完成 | **MET** | preventAutoHide 先行注册；hideAsync 仅在 status≠loading 后调用；错误分支也放行（App.tsx:74-75 error 仍渲染 BootScreen，随后 splash 释放露出错误文案）；initializeApp 永不 resolve 的极端场景 splash 常驻显示品牌（非白屏），可接受 |

## 视觉一致性结论（本次需求核心价值）

**确定结论：一致。** 原生 splash 与 JS boot 屏共用同一 PNG 文件、同一 100dp 显示尺寸、同一屏幕中心位置、同一 #041B3D 底色。12+ 遮罩圆不会切角（70.7dp < 96dp）；12- androidx 以 288dp 画布原样呈现 100dp 内容。交接瞬间（splash 释放）两侧像素级同肤，理论上不可感知。

## P0 / P1 Findings

- 无。

## P2 / P3 Backlog Findings

- **P2-1｜app.json「双写」实为「一个真源 + 一个死配置」，需一句话文档化。** 实证：插件 props 是原生 prebuild 唯一输入（withSplashScreen.js 不回退读顶层 splash）；顶层 `splash` 块在本 SDK 布局下不被原生构建消费（仅 Expo Go/web 场景可能读取）。两处同时存在会误导后来者「改顶层就生效」。不构成正确性缺陷，但必须记录维护口径：**原生 splash 真源 = `plugins.expo-splash-screen`；改任一处须同步另一处**。是否直接删除顶层 splash（若确认不再用 Expo Go 看启动画面）请 TM/用户拍板，不属本轮回滚范围。
- **P2-2｜`BRAND_ICON_SIZE=100`（App.tsx:24）与 app.json `imageWidth:100` 是手工同步的数值耦合。** 注释已声明对应关系，接受；不建议加运行时校验（过度工程）。挂账即可。
- **P3-1｜App.tsx:19 `void SplashScreen.preventAutoHideAsync()`** 的 promise rejection 未接，web/异常场景会产生 unhandled rejection 警告（不崩溃）。可选 `.catch(() => {})`，非必须。
- **P3-2｜pre-API-35 非 edge-to-edge 设备上**，JS boot 图标垂直中心可能比原生 splash 低约状态栏高度一半（~10dp，内容区不含状态栏所致）；目标机均为 Android 12+，且 API 35+ 强制 edge-to-edge 后无此差。幅度与可见性交 QA 真机确认。
- **P3-3｜builder 自述措辞**：「100dp 图对角线 70.7dp」应为「半对角线 70.7dp」，结论正确，仅记录。
- **P3-4｜`assets/splash-icon.png` 已无引用**（builder 自报故意保留）。死资源，后续可清理，本轮不强求（避免 scope creep）。

## 越界与回归检查

- diff 仅 4 文件，未触碰业务逻辑 / DB / 语音 / 计时 ✓
- 新依赖仅 expo-splash-screen（SDK 内置版本，见验证 2）✓
- 无 secrets、无 `git add -A`、未 commit/push ✓
- 可回滚性良好：revert 4 文件 + 删 android/ 重跑 prebuild 即回旧状（android/ 未跟踪）✓
- 测试安全：集成测试经 `src/tests/support/renderApp.tsx` 直接挂 AppNavigator，不经 App.tsx，无需 jest mock splash 模块 ✓
- 自证：`npm run typecheck` 0 错；`npm test` **36 suites / 263 tests 全绿**。
