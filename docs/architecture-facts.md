# 架构与构建事实（architecture facts）

> 只放长期有效的事实，不放进展与待办。HANDOFF 只留指针。

## 1. 两套产物（同一产品，两条链）

| 产物 | 位置 | 说明 |
|---|---|---|
| 原生 APK | `android/app/build/outputs/apk/release/app-release.apk` | Expo SDK 57 + RN 0.86.3 + TS + 本地 SQLite + TTS；包名 `com.stretchroutine.v1`；当前 1.2.0(3) |
| PWA | `web/`（原生 ES Modules，无构建） | 部署到 GitHub Pages `wanghoufan/p025-stretch-cues-pwa`，线上 `https://wanghoufan.github.io/p025-stretch-cues-pwa/` |

- **两条链互不包含**：改 `web/` 不会进入 APK；改 `src/` 不会进入 PWA。判断「最新版」必须先确定说的是哪一条。
- `web/` 目前**未纳入 git 跟踪**（`?? web/`），PWA 改动只存在于工作区。

## 2. 原生 APK 构建链

- 本地真链 `~/android-toolchain/`（JDK 17 + Android SDK，android-36 / build-tools 35+36 / NDK 27.1.12297006）；出包前设 `JAVA_HOME`、`ANDROID_HOME`。
- **出包前必须 `npx expo prebuild --platform android` 再 gradle**：`android/` 已存在时 `expo run:android` 不重跑 prebuild，否则按旧 versionCode 打包，表现为「修复没生效」。
- `versionCode` 真源是 `app.json`；手改 `android/app/build.gradle` 会被 prebuild 覆盖。
- 产物按惯例拷成 `releases/stretch-routine-vX.Y.Z-local.apk`（`releases/` 被 git 忽略）。

## 3. 数据层（原生）

- SQLite 迁移 v4/v5：`training_types`、`session_history` / `session_history_steps` / `stats_anomaly_notice`。
- 归档算法内嵌状态机转移，`sum(明细) == 总计` 是构造保证；原子事务 + 幂等 + 封闭枚举分流。
- 统计口径 = 实际动作时间（不含暂停/转场），完成页与统计页同源。
- 流程级分类（一场混合流程整场算一类）。
- 首页分组真源 = `training_types` 表（表驱动），不再按 `category` 标签猜。

## 4. 过渡/休息规则（2026-11-10 按原版建模，PWA 已落地）

原版依据：`src/domain/routine/runnerTransitions.ts`、`runnerTime.ts`、`runnerMachine.ts`、`seeds.ts`。

- 非最后一步才有过渡；默认 5 秒；核心三步 45/30/20 秒。
- 过渡期用 TTS 播一次「下一个，X」（英文 `Next, X`），可跳过；+10 秒提示只在动作阶段触发。
- 统计不含过渡；总时长 = Σ动作 + Σ过渡（最后一步不加）。
- PWA 落点：`seed.js` 的 `restSec`（9 条流程 5/5/5/5/5/5/45/30/20，合计 3415s，与原版逐条差值 0）、`app.js` 的 `phase === 'rest'` 状态、`voice.js` 的 `step.clip` 覆盖；语音片段 `next-<clip>` 共 384 条。

## 5. PWA 结构

- `web/index.html` + `js/{app,seed,i18n,voice}.js` + `styles.css` + `sw.js` + `audio/` + `voice-samples/`。
- 存储：IndexedDB（routines / history / settings / meta）。
- Service Worker 预缓存：当前 `stretch-pwa-v7`；新增静态资源必须同步进 ASSETS 并升 cache 版本。
- 语音：8 音色（zh: xiaoxiao/xiaoyi/yunxi/yunjian；en: aria/jenny/guy/andrew），由 `.local/gen_audio_edge.py` 用 edge-tts 生成。
- manifest 本地化：`manifest.webmanifest`（中文 `拉伸播报·pwa`）+ `manifest.en.webmanifest`（英文 `Stretch Cues`）；`index.html` 的 `link#manifest-link` 由 `app.js` 按界面语言切换，同时改 `apple-mobile-web-app-title` 与 `document.title`。

## 6. 部署

- 部署仓 `/tmp/p025-pwa` → GitHub Pages；rsync `web/` 时**必须 `--exclude '.git'`**。
- 线上核对：`manifest.en.webmanifest` HTTP 200、`sw.js` 版本号、`index.html` 含 `id="manifest-link"`。

## 7. 语音与 TTS 现状

- 12 Pro 上系统只有小米 mibrain 一个 TTS 引擎，合成**走网络**；联网时正常。
- 出厂 `tts_default_synth` 可能为空 → `expo-speech` 静默无声。排查任何「没声音」：先查 `tts_default_synth`，再杀录屏/投屏进程，再查 USB 线。
- 历史「Sherpa xiao_ya 初听通过」**不可商用**（BZNSYP Non-commercial）。
- 真离线需自带引擎（约 +55MB）且 AISHELL-3 授权有矛盾，用户已决定暂不处理。

## 8. 设备口径

- 现行真机验收：Redmi Note 12 Pro（`indq5xfi6hovay4d`，Android 14）。
- 其余在线设备：Redmi Note 12T Pro（`UKCESWB67PUO7LPB`）、Redmi Note 11 5G（`WGBMXWDIAIFMPFCQ`）。
- 所有 adb 命令必须带 `-s`（多设备在线）。
- HyperOS 装机：USB 安装确认框等倒计时走完再点「继续安装」。
