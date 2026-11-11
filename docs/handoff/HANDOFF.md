# HANDOFF｜拉伸语音播报 App（暂停/恢复用，先读我）

> 历史全文（2026-09-19–2026-11-11）已归档：`docs/archive/HANDOFF-历史正文-2026-09-19至2026-11-11.md`。

## §0 常驻指针

- Captured at：2026-11-11 15:10
- PROJECT_PHASE：**DEVELOP**
- PLAN_VERSION：以 `docs/pm/PRODUCT_PLAN_V1.3.md` 为需求真源（V1.3，READINESS **91**，GATE **APPROVED**，DEV_BASELINE **V1.3**）
- CHANGE_REQUEST：**NONE**
- Stage ID：`stretch-app-v11-ambient`
- 剩 P0：P0-5 native R004-R006 / R022-R034（FGS / Doze / Android 版本矩阵）待排期
- 架构与构建事实：`docs/architecture-facts.md`
- 风险：`docs/risks.md`
- 踩坑真源：根 `经验一句话.md`（本项目惯例，等价于 agent.md）
- 本轮复盘结论：`经验一句话.md` 的 2026-11-11 条目 + `docs/risks.md`

### 恢复读盘（全体系唯一顺序）

1. `AGENTS.md`；2. `docs/roles/` 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。冲突才扩大读。

## §1 当前进展

- **原生 App**：1.2.0(3) 已覆盖安装并启动确认（Redmi Note 12T Pro / Note 11 5G / Note 12 Pro 三台），无崩溃、无 ANR；已登记版本台账（commit `78a0787-dirty`）。
- **PWA**：过渡/休息已按原版规则建模落地（9 条流程总时长与原版逐条差值 0，合计 3415s，384 条过渡语音）；英文界面桌面名已本地化（`Stretch Cues`，真机实测无截断）。线上 HEAD `22f5dbc`，SW `stretch-pwa-v7`。
- 两条产物链**互不包含**：PWA 的过渡/休息与英文名改动**未进入 APK**（详见 `docs/risks.md` R1）。

## §2 下一步

1. 待用户决定：是否把 PWA 的过渡/休息改动**重打包进原生 APK**（需 bump versionCode，出包前先 `npx expo prebuild --platform android`）。
2. 待用户决定：`web/` 是否纳入 git 跟踪（当前整目录 untracked，改动无历史）。

## §3 未完成

- P0-5 native hardening（R004 起）未开工，建议单开 Wave。
- TASK-017 背景音试听按钮：已实现未收口，挂起。
- 版本台账中包路径仍指向旧目录 `/Users/zzymima0000/Developer/coding/1.Active/...`，与现路径 `/Volumes/项目归档/...` 不一致，待下次登记时纠正（`docs/risks.md` R3）。
- 本轮复盘产物未提交：仓库 `git status` 含 `M .gitignore`、`?? web/`、`?? VERSION.md`、`?? docs/retrospective/`；按项目规矩 commit/push 需用户明确指令，**本次未提交**。
- 待用户回复：自动化候选 A1、skill 候选 S1（见本轮复盘对话）。
- 治理门禁存量红（非本轮引入，`node scripts/model/check-ledger.mjs docs/model` 可复现）：两账 result 漂移 8 处、`docs/qa/产品验收追踪矩阵.md` 缺失导致 `ACCEPTED-BLOCK`、`PRODUCT_PLAN_V1.3` 缺「APP 基础能力声明」（`APP-BASELINE-MISSING`）。

## §4 红线

1. 所有 adb 命令必须带 `-s <serial>`；多台在线，不带会打错机器。
2. 真机功能验收只用 Redmi Note 12 Pro（`indq5xfi6hovay4d`）；其余设备不经点名不做功能验收。
3. 覆盖安装只用 `adb install -r`，禁 `uninstall` / `pm clear` / `-d` 降级。
4. commit / push 必须用户明确指令。
5. 出包前必须 `npx expo prebuild --platform android`，否则按旧 versionCode 打包。
6. 排查「没声音」顺：`tts_default_synth` → 录屏/投屏进程 → USB 线。
7. 设备序列号不进报告正文，用「设备序号 + 型号」指代。

## §5 三日流水

- **2026-11-11**：PWA 过渡/休息补全并部署（`8f47402`），英文桌面名（`22f5dbc`），真机验证桌面标签完整；三机 APK 1.2.0(3) 广播推送 + 启动确认 + 版本台账登记；阶段复盘。
- **2026-11-10**：过渡/休息建模与语音生成（384 条），`SEED_VERSION` 递增，SW 升 v7。
- **2026-11-09**：`78a0787` 接入当前版本真实界面截图（原生 APK 最后一次构建基线为 10-27）。

## §6 接续提示词

先读本文件 §0–§6 与 `docs/architecture-facts.md`、`docs/risks.md`，再按 §2 等我拍板要不要把过渡/休息打进 APK。
