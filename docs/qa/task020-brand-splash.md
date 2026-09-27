# TASK-020 启动画面换肤 · 真机 QA

- Task：`TASK-020-splash-brand-skin`
- Stage：025-ing-拉伸语音播报 app（DEV_BASELINE=PRODUCT_PLAN_V1.2）
- CHANGE_REQUEST：`B`（局部 UI 换肤，不召 Planner）
- 日期：2026-09-27
- QA 执行通道：**本窗口 bash 直驱 adb**（按 `USER_MODEL_OVERRIDE.md` qa 行「真机 QA 走本窗口 bash 直驱」分支；开窗口模型 `opencode-go/space-bunny-free`，note 记分支，supervisor 不记偏离）
- 结论：**PASS**（P0=0，blocking P1=0；另有 1 条 QA 发现的 P1 已在链内修完复验通过）

## 0. 真机 QA 会话能力预检

本轮走 adb/录屏通道，不走原生 CUA（computer use）通道，故 CUA 专项预检项（`mcp__cua_repl.js` 注入、Orca Runtime capabilities/permissions、读屏/点击/输入/滚动位移）**不适用**。按实际情况如实记录，不套用不存在的结论：

| 预检项 | 结果 |
|---|---|
| adb 可用 | PASS（`/opt/homebrew/bin/adb`） |
| 设备在线 | PASS（3 台，见下表） |
| 构建工具链 | PASS（`~/android-toolchain/android-env.zsh`，JDK 17 + SDK，含 ndk 27.1.12297006，未触发 NDK 下载） |
| 出包 | PASS（`npx expo prebuild -p android --no-install` → `android/./gradlew :app:assembleRelease`，53s，BUILD SUCCESSFUL） |
| 装包 | PASS（三台均 `adb install -r` Success，**全程未卸载**，用户数据零丢失） |
| 录屏取证 | PASS（`adb shell screenrecord` + `ffmpeg -vf fps=30` 逐帧 + PIL 像素统计，非截图猜测） |
| 允许进入正式 QA | **YES** |

## 1. 验收设备

| 序列号 | 型号 | Android | SDK | 装机结果 |
|---|---|---|---|---|
| IN9LZTAYV4UGU4JF | xagapro / 22041216UC | 12 | 31 | Success（主真机，本次重点取证） |
| indq5xfi6hovay4d | ruby / 22101316C | 14 | 34 | Success |
| 192.168.31.104:5555 | pearl / 23054RA19C | 15 | 35 | Success（首次取证时该机停在通知栏，唤醒+dismiss-keyguard 后重取，不采信首轮无效证据） |

## 2. 逐帧证据（xagapro，冷启动全程 204 帧 @30fps）

`adb shell am force-stop` → 静置 2s → `screenrecord` 全程录制 → `am start` 冷启动 → 逐帧 PIL 采样中心像素与全屏均值。

| 帧段 | 采样结果 | 判定 |
|---|---|---|
| f001–f022 | 全屏 (252,240,224) 米色 | **桌面壁纸**，非 App 闪白（录屏起点用户仍在桌面） |
| f023–f025 | 均值渐变 (243,232,216)→(147,147,147) | 桌面到 App 的系统窗口过渡 |
| f026–f031 | 中心 (3,25,59) 渐稳 | **#041B3D 深蓝底已生效**，无白/无黑 |
| f032–f047 | 中心 (31,232,251) 青色 | **品牌图标淡入**（motion-core 青蓝拉伸小人），已目检确认非 Expo 靶心图 |
| f048+ | 回深蓝 | 主页内容淡入，**图标原位淡出、无跳变** |

- **纯白帧：0**（f001–f022 经采样确认为桌面壁纸 RGB，非 App 窗口）
- **纯黑帧：0**
- 全程主内容区唯一底色为 `#041B3D` 及其渐变过渡
- 冷启动 `am start -W` 实测 **TotalTime 526ms**（pearl 台），无 splash 卡死、无白屏死锁

## 3. DoD 逐条判定

| DoD | 判定 | 证据 |
|---|---|---|
| ① 原生 splash 换肤且 Android 12+ 正确 | **MET** | 三台真机（API 31/34/35）逐帧确认：#041B3D 底 + motion-core 图标；`res/values/colors.xml` `splashscreen_background=#041B3D`；`styles.xml` `Theme.App.SplashScreen` parent 链正确；`drawable-*/splashscreen_logo.png` 目检为新图 |
| ② iOS 侧正确 | **MET（配置层）** | 本仓库无 `ios/` 工程（CNG，Android-only），app.json 插件 props 平台无关，未来 prebuild 即正确。**无 iOS 真机证据，如实标注** |
| ③ App boot 屏同套皮肤、无跳变 | **MET（跳变已消除）／文字项记 P3** | splash 与 App boot 屏同一图源、同 100dp、同居中，过渡帧证实图标原位淡出。但「Motion Core 拉伸」字样在真机上**从未被看到**——本地 DB 初始化 <100ms，`hideAsync` 立即执行，boot 屏一闪即过。观感上无跳变（优于预期），但字样未实际露出 |
| ④ 防闪烁至 DB 初始化完成 | **MET** | 全程无白/黑闪；`preventAutoHideAsync` 生效，splash 挂到初始化完成才释放；错误分支亦放行（代码层由 code-reviewer 核） |

## 4. BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注 |
|---|---|---:|---|---|---|---|
| TASK020-B1 | **P1** | 否 | `adb install -r app-release.apk` | **FIXED（链内修完复验通过）** | TASK-020 | `INSTALL_FAILED_VERSION_DOWNGRADE`（2 < 3）。根因：2026-09-27 09:04 的一次构建手工改了未跟踪的 `android/app/build.gradle` 的 versionCode=3 未回写 app.json，prebuild 又重置为 2。**修法：app.json versionCode 2→3（唯一真源）**，未用 `-d`、未卸载绕过 |
| TASK020-B2 | P3 | 否 | 冷启动逐帧 | OPEN | — | splash 期间底部系统导航栏约 130ms 为纯黑（f026–f029，nav=(0,0,0)）。主内容区不受影响。属 Android 12+ 系统 splash 固有行为，非本项目代码可控 |
| TASK020-B3 | P3 | 否 | 冷启动逐帧 | OPEN | — | 「Motion Core 拉伸」字样因 DB 初始化过快未被看到（同 DoD③）。若产品希望品牌文字露出，需加 splash 最短显示时长——**属观感决策，未擅自加** |
| TASK020-B4 | P3 | 否 | 目检 splash 帧 | OPEN | — | 图标自带浅蓝圆角方块底，在 #041B3D 上可见方形边界。若要更干净需换无底透明图标，属素材级微调 |

## 5. 附带修掉的既有缺陷（非本需求引入，QA 阻塞项）

TASK020-B1 的 versionCode 冲突是本次装机时才暴露的既有缺陷（早于 TASK-020）。它会阻塞**每一次**后续装机，故在链内修掉。口径建议落 `docs/sop/android.md`（prebuild/CNG 规范位）：**app.json 是版本号唯一真源，`android/app/build.gradle` 是 prebuild 派生件且被 gitignore，禁手改**。

出包注意：本项目 `android/` 已存在时 `expo run:android` 不重跑 prebuild（2026-09-21 图标修复已踩过同坑），**出包前必须先 `npx expo prebuild --platform android`**，否则 gradle 仍按旧 versionCode 打包。

## 6. 回归

- 数据无损：xagapro 覆盖安装后主页仍为「共 10 个流程」，三衰和/晨起全身拉伸/睡前全身放松等用户数据完好（未卸载、未清数据）
- `npm run typecheck`：0 error
- `npm test`：36 套件 / 263 用例全绿（与 2026-09-24 基线一致）
- 业务逻辑/数据库/语音/计时：本次 diff 未触碰

## 7. 结论

**PASS**。P0=0，blocking P1=0（P1 一条已链内修完复验通过）。放行至 supervisor 复检。

> 证据文件（录屏与逐帧 PNG）落在 `/tmp`（`qa_splash.mp4`、`splashframes/`、`sf_indq5xfi6hovay4d/`、`sf3/`），**未入库**，避免图片体积污染仓库；需要复现可按本文件第 2 节命令重跑。
