# B 路报告｜P025 拉伸语音播报 App｜需求差距与返工根因分析 V1.0

- 复盘对象：`/Users/zzymima0000/Developer/coding/1.Active/025-ing-拉伸语音播报 app`（symlink → `/Volumes/项目归档/025-ing-拉伸语音播报 app`）
- 项目身份：P025 / slug `stretch-routine-app` / GitHub `wanghoufan/p025-stretch-routine-app`（public）/ `1.Active` 在研
- 取证范围：全部 37 个 commit（`git log --all`）、docs/ 全量 83 个 md、README（含两份旧版备份）、HANDOFF、SDD 开发包、releases/、src/+modules/ 164 个源码文件；只读，未改任何项目文件
- 证据标记：**D** = 路径/hash/行可复核；**I** = 推断（附理由）；不足处标「未证实」
- 报告基线：git HEAD `8f8e43e`（2026-10-28），工作树干净（`git status` 空，实测）

---

## 1. 完整提交时间线与阶段划分

每日提交数（`git log --all --pretty=%ad --date=short | sort | uniq -c`，D）：09-18×5、09-19×2、09-21×2、09-24×2、**09-27×16**、09-28×2、10-03×1、10-05×1、10-07×1、10-09×2、10-27×1、10-28×2。共 37 commit。

### 阶段划分

| 阶段 | 时段 | 内容 | 关键证据 |
|---|---|---|---|
| P0 治理铺垫（未入库前史） | 09-12 ~ 09-17 | 治理模板落地、SDD 开发包（SPEC/PLAN/TASKS/开发宪法）、T005 TTS 尖刺、T006 后台尖刺。**此期产物全部随 09-18 首次提交才入库** | SDD 文件落款 2026-09-17（D：docs/plan/…SDD开发包…/…SPEC…V1.0.md 头部）；首次 commit `bc1f39f` 2026-09-18 08:34（D） |
| P1 V1.0 冲刺 | 09-18 | `bc1f39f` 一次入库 176 文件 +30695 行（含全部治理脚手架+SDD+V1 全量业务），154 tests；**爆发日 #1** | D：`git show bc1f39f --stat` |
| P2 加固与换皮 | 09-18 ~ 09-21 | Wave1 hardening `1114edb`（185 tests）→ V1.1 hardening+背景音 `42071f7`（244 tests）→ 大交接收工 → Motion Core UI 换皮 `65cd86a` → 图标修复 `1538868` | D：commit 序列；HANDOFF §1.2 |
| P3 真机联调与 v1.2.0 | 09-24 | v1.2.0：动作库 Picker 分组筛选＋流程分组＋**语音测试按钮**；出本地 release APK（90MB）；真机无声三重根因排查 | D：`90bd862`、releases/stretch-routine-v1.2.0-local.apk（9-24 13:36，实测存在）、HANDOFF §真机联调 |
| P4 爆发日 09-27 | 09-27 | 16 commit 单日：多语言×2、TASK-020 启动画面换肤、TASK-021 历史统计全链（R006→B1-B4→F1）、TTS 离线调研挂账、F2 首页分组对齐、jcp 清理。**爆发日 #2，单日占全仓 43%** | D：commit 序列；HANDOFF TASK-020/021 章节 |
| P5 收尾与分发 | 09-28 ~ 10-28 | 治理同步与文档（10-03/05/07）、公开仓摘除 ORCA 脚手架（10-09）、**蒲公英分发 v1.2.0 + 图标修复（10-27）**、治理收口（10-28） | D：`2957762`、CHANGELOG.md |

### 空档

- **09-28 → 10-03**（5 天无 commit）：D。
- **10-09 → 10-27**（18 天，全仓最长空档）：期间发生 2026-10-17 母版治理铺包（覆盖 README 等，见 R11），但零 commit；D：HANDOFF §治理规则更新通知·2026-10-17。
- 09-19 ~ 09-21、09-24 ~ 09-27 之间的 2~3 天空档属正常节奏，无证据表明阻塞。

---

## 2. TTS 方案的选择与更换

### 2.1 选择（09-17）

- T005 尖刺结论：V1 使用 **`expo-speech`**（走 Android 系统 TTS 引擎）作为唯一发声通道，理由＝Expo Go 兼容、无原生模块。**D**：docs/qa/android-tts-spike.md:9。
- 当时尖刺断言「离线可用（Constitution II）：满足——使用系统已安装的离线语音包」。**D**：android-tts-spike.md:16。此断言未在任何真机验证过（同文 §5 自认「真机音频待 T095」）。
- 代码层至今唯一实现：`src/services/tts/expoSpeechSpeaker.ts` + `ttsService.ts`（D：实测目录）；全仓源码 grep `sherpa` 零命中（D，实测）。

### 2.2 换过什么（更换全部发生在设备侧，代码从未换）

1. **09-18**：Expo Go + 设备侧 Sherpa xiao_ya（vits-piper）神经音，用户初听通过；发现「USB 线连着手机无声」铁律。**D**：HANDOFF §任务备注（音频铁律，含 09-27 失效标注）。
2. **09-24**：release 包真机「无声」，当时判定三重根因：媒体音量 0 ＋ sherpa 引擎无中文包（切 mibrain）＋ MIUI 录屏/投屏占用 `remote_submix`。**D**：HANDOFF §真机联调。
3. **09-27 深调研（权威结论）**：12 Pro 出厂 `tts_default_synth=null`，`expo-speech` 无处路由、**静默无声**；修复＝`settings put secure tts_default_synth com.xiaomi.mibrain.speech`。**mibrain 合成走网络**（logcat `AivsSDK ... http://119.147.123.233:80`）。**D**：HANDOFF §语音播报与「离线 TTS」现状；docs/qa/task021-真机第一轮.md §5/§8。
4. **离线路径全部否决**（09-27）：Google TTS 国行下不到中文包；sherpa-onnx+55MB 且 AISHELL-3 商用授权矛盾；xiao_ya 数据源 BZNSYP **不可商用**（选型永久否决）；eSpeak GPL 机械音。用户拍板「算了先这样，不折腾了」→ 挂账。**D**：HANDOFF 同节；commit `f9f5651`。

### 2.3 有无一次真实真机播报的证据

- **有，但分散且非专项**：
  - 09-18 用户亲耳初听（Expo Go + xiao_ya）——D：HANDOFF 任务备注（自述记录）；
  - 09-24 release 包真机联调「验收通过」+ 语音测试按钮——D：HANDOFF §真机联调（自述）；
  - 09-27 TASK-021 QA 在 12 Pro 上 logcat 实证 `SpeechSynthesizer onPlayFinish`——D：task021-真机第一轮.md:59。
- **弱点（I）**：①无专项 TTS QA 报告，T095（打断/蓝牙/来电）自 09-18 挂账至今未执行（D：android-tts-spike.md:45-50 挂账清单，仓内无后续闭环记录）；②播报可用的前提是「设备已正确设置 TTS 引擎且联网」——这是设备侧一次性设置，新装设备会复现静默无声（D：task021-真机第一轮.md §8 P2）；③**「离线优先」（SPEC G5/Constitution II）实际未达成**：验收机的播报链路依赖网络（I，由 mibrain 走网络的 logcat 证据 + 离线路径全否决推出）。

---

## 3. 需求差距清单 G1..Gn（用户要的 vs 实际交付的）

需求真源＝SDD SPEC（docs/plan/…SDD开发包…/…SPEC…V1.0.md，09-17）。以下按「高价值差距七问」格式给 Top 3，其余列差距卡。

### G1【最大差距】锁屏/后台持续播报

- **原来怎么说**：SPEC Core Promise「Define once. Press start. Put the phone down. Follow the voice until the routine is complete」；US1 Scenario 4 hands-free；FR-028/029/030；SC-004「真机后台/锁屏测试」是 V1 可发布硬条件（SPEC §11）。**D**：SPEC 各节。
- **后来实际怎样**：09-17 T006 即选方案 A（前台重建、无 FGS，Expo Go 兼容），代价明示「进程挂起期间到期的播报不发声、不回放」（D：docs/architecture/background-decision.md）；方案 B（FGS）触发条件写了「用户明确要求锁屏持续播报即升级」（同文件：26）。V1.1 整改计划把 FGS/Doze/WakeLock 列为 R022-R034（D：docs/plan/…整改计划…V1.1.md）；**截至 HEAD 全部未开工**，HANDOFF P0-5 挂账（D：HANDOFF §1.3/剩余 P0）。已做的仅 R006 最小切片（单调钟+boot 身份，为统计功能服务，明文「不等同完成 P0-5，也不证明 Doze/FGS 行为」，D：PRODUCT_PLAN_V1.3.md:42）。
- **差在哪里**：核心卖点场景（揣兜里锁屏跟练）从未被验证，甚至未实现。
- **为何本应提前思考**：SPEC 把它写成 SC-004 发布硬条件，但开发顺序把 native 排到最后；Expo Go 优先的技术选型（09-17）与核心承诺（09-17）在 Day 1 就内在冲突。
- **造成何种返工**：后台/锁屏验收（T062）从 09-17 挂账至今；TTS 可用性调研被迫绕开「锁屏场景」做；用户拿到的是「亮屏才稳」的产品。
- **下次普通人怎么说**：「我要锁屏放兜里也能一直听到语音报数，这是买这个 app 的唯一理由，先把这个做通再做别的功能。」
- **责任归属**：计划者应主动发现（SPEC 写了 SC-004 却没把它排进第一个 milestone）；开发者负责解决（方案 A 是合理首步，但 P0-5 拖 40 天无排期动作）。

### G2 离线语音

- **原来怎么说**：SPEC G5「Remain usable offline」+ SC-007；TTS 尖刺断言离线满足。D：SPEC §3/§10、android-tts-spike.md:16。
- **实际**：核心流程离线可用（D：PRODUCT_PLAN_V1.1.md:34「Runner 核心 100% 离线」），但**语音在验收机走网络**（G2.3 已证）；断网播报行为未实测（未证实）。
- **为何本应提前**：09-17 尖刺只验了接口层没验设备语音包存在性；国行小米无预装可用离线中文引擎是可提前查明的平台事实。
- **返工**：三轮无声排查（09-18/09-24/09-27）＋一整轮离线方案调研全部源于此。
- **下次怎么说**：「我家的小米手机有没有离线中文语音？先在我这台真机上放出声来再定方案。」
- **责任**：计划者应主动发现（选型 spike 必须含真机发声验证）；平台限制部分（mibrain 无离线）非任何人过错，但 09-17 的「满足」结论是不实验证。

### G3 计次/组数

- **原来怎么说**：SPEC 无任何「组数/reps/几组」需求（FR 全表无，D：grep FR-001..040）。**I**：用户原始诉求里若含「数几组」，未进入 SPEC。
- **实际**：无计次能力；README「能循环」实指流程连续跑＋背景音循环（D：src/features/settings/settingsModel.ts:41 背景音 loop；src/ 无 reps/sets 实现）。
- **差距**：典型拉伸场景「每个动作做 2 组」无处表达（只能复制动作行）。**I**：属需求澄清缺口而非实现缺陷——SPEC 有意未做。
- **下次怎么说**：「一个动作可能要做 2-3 组，能设置每组重复次数吗？」

### G4 换边（bilateral）

- **原来怎么说**：US4 + FR-013/FR-014（左右成对、对称时长、可单侧覆盖）。D：SPEC §5 US4。
- **实际**：已实现——`src/domain/routine/bilateral.ts`（D：实测存在）＋ SDD T020 测试；README 宣传「换边」播报（D：README.md.旧版-2026-10-12）。
- **残留**：双侧对称播报的真机听测证据未见（未证实，见 §8）。
- **结论**：基本达成，属正常迭代。

### G5 语音节奏

- **原来怎么说**：US7：TTS 开关、语速（device 支持可靠时）、倒计时预警、默认时长；「Settings MUST remain minimal」。D：SPEC US7。
- **实际**：语速可调（`speechRate`，D：src/features/settings/settingsModel.ts:33）＋ 5 秒预警每步一次（P1-2 判符合 US7 最小语义，D：android-v1-silent-install.md §4，含完整代码级论证）。
- **差距**：「逐秒倒数播报」明确不做（产品决策留痕，非缺陷）；**真机语速听感证据只有 09-24 自述**（未证实独立验证）。
- **结论**：达成度高。

### G6 语音失败静默吞掉（产品内隐患）

- `expoSpeechSpeaker.ts:19` 把 `onStopped` 当 `onDone`，且 expo-speech Android 实现丢弃 errorCode → 合成失败静默无声、「App 一切正常」。已发现**未修**（D：HANDOFF §TTS 专节末段「附带已发现的既有隐患（未修）」）。属技术债差距。

### G7 发布渠道与品牌资产

- SPEC Non-Goal 未涉及发布；实际 Play 轨道未进入（RB-PLAY-FGS 条件未触发，D：HANDOFF §1.3），10-27 走蒲公英分发（D：CHANGELOG.md、pgyer 短链 lashenyuyinbobao）。
- 品牌资产（图标/启动画面）拖到 09-27（TASK-020）与 10-27（蒲公英 ICON_ABSENT）才处理，且两次都因「默认图残留/原生目录不同步」返工（见 R1/R10）。

### G8 历史统计（反向差距：后来才明确的需求）

- 原 SPEC Non-Goal 不含训练统计；用户 09-27 追加「总共拉伸了多长时间…」（D：HANDOFF TASK-021 §用户诉求），走 Change C 三轮规划＋Human Gate 交付。属**正常产品认识演化**，且过程治理规范（R006 串行前置、真机两轮 QA 抓 P0），不是返工型差距。

---

## 4. 返工根因链

分类：**【需】需求变更 / 【架】架构缺陷 / 【验】验收缺失 / 【台】平台限制 / 【流】流程失误**。可预防/正常迭代/Agent·流程失误标注在每条末尾。

| # | 返工事件 | 证据 | 根因分类与链条 | 可预防？ |
|---|---|---|---|---|
| R1 | 图标修复（09-21 `1538868`）：release 包图标未变；09-27 再踩同坑（versionCode 手改未回写 → `INSTALL_FAILED_VERSION_DOWNGRADE`） | D：HANDOFF §收尾记一笔 09-21、§TASK-020「顺手修掉的既有 P1」 | 【台】+【流】根因：`android/` prebuild 产物已存在时 `expo run` 不重跑 prebuild，app.json 真源与原生目录脱节；两处坑补成一条「出包铁律」 | 可预防（Day 1 出包流程就该含 prebuild 检查） |
| R2 | V1.0 提交当天即 Wave1 大改（`1114edb`，09-18）：Clock 拆分、ActiveSession V2、Runner 改快照驱动 | D：整改计划 09-18 自列 9 条 V1.0 错误（含「Native Build 顺序错误」） | 【架】根因：尖刺只做单测级验证即定架构，计时/会话用近似实现；但整改本身是计划内动作 | 部分可预防（真机尖刺前置可少改一轮）；属可控迭代 |
| R3 | TASK-021-R006：`MonotonicClock` 实为 `Date.now()`、bootCount 为进程身份近似 → 新建 Kotlin 本地模块 `modules/stretch-runtime` | D：HANDOFF §R006；`git log -- modules/` 仅 `ac43ae6` | 【架】V1.0 已知挂账（非新错），被统计功能倒逼提前还债；真机四组跳钟+真重启验证后 PASS | 正常迭代（计划排期问题） |
| R4 | TASK-021-F1（P0）：9 个存量种子流程全落「未分类」；`repairSeededRoutines` 在 `missing.length===0` 早退永不回填 | D：task021-真机第一轮.md §2（完整根因链） | 【验】根因：数据迁移只测新装路径，升级路径真机第一轮才暴露；FAIL→F1→第二轮 PASS 闭环 | 可预防（迁移 DoD 应强制含「存量库升级」用例） |
| R5 | TASK-021-F2 首页「健身前后」凭空分组被用户识破，删组并改表驱动 | D：HANDOFF §F2（用户原话「这分类之前没明确过吧」）；routineGroups.ts:57 猜标签映射 | 【需】+【架】根因：早期设计允许「从标签猜显示分组」，凭空造了数据库里不存在的分类名；builder 首选「改数据迁移」的修法也是错的，停手上报后才改对 | 可预防（Day 1 问清「首页分组从哪来」） |
| R6 | TTS 无声三连排查（09-18 USB 铁律 → 09-24 三重根因 → 09-27 底层根因） | D：HANDOFF 三处（含 09-27 口径更正标注） | 【台】设备侧为主（MIUI/HyperOS），但代码隐患放大：`onStopped` 混用 + errorCode 被吞使「无声」表现为「一切正常」 | 平台部分不可预防；排查代价可通过 G6 修复大幅降低 |
| R7 | 背景音自然音→三首轻音乐（B-2，用户 09-18 修订） | D：HANDOFF §任务备注 B-2 | 【需】用户口味变更 | 正常迭代 |
| R8 | B-3③ 难度 chips → B-4 动态部位 chips 取代（09-19） | D：HANDOFF §B-4「取代 B-3③」 | 【需】交互设计认知演进（QA 真机 C-2 触发 3 条修正⑨⑩⑪） | 正常迭代 |
| R9 | 公开仓摘 ORCA 漏摘中文文件名，次日补刀 `7b92807` | D：commit message「修 git ls-files 转义漏摘」 | 【流】脚本/命令对中文路径转义未验证 | 可预防（产出断言：摘除后 grep 应为空） |
| R10 | 蒲公英 ICON_ABSENT（10-27 `2957762`）：webp 占位 + AGP9 资源路径缩短 | D：CHANGELOG.md 全条 | 【台】分发平台只认 png 位图 | 可预防（新分发渠道接入前先发一版探路包） |
| R11 | 产品 README 被治理铺包覆盖：`b0aa7ae`(10-07) 入库的产品版 README（2259B，含 3 张截图引用）在 10-17 铺包后被治理导航版顶掉，`8f8e43e`(10-28) 将治理版提交入库；备份文件 `README.md.旧版-2026-10-17` 内容也是旧治理版（19354B），产品版仅存于 git 历史 | D：`git show b0aa7ae:README.md`（产品版）、现行 README.md（治理导航）、`git show 8f8e43e --stat`（README +234 行）、README.md.旧版-2026-10-17 实读 | 【流】铺包规则自称「应用的 README.md 绝不会被藏（那是作品首页）」（D：README.md:95）却发生了覆盖——铺包与「实例层不碰」原则冲突，且备份机制备份的是错的版本 | 可预防（铺包前后 diff 实例层清单） |

**返工模式总结（I，基于上表）**：①最大可预防类＝「真机/存量场景不进 DoD」——R4/R6/T062/T095 同根因；②平台坑（R1/R6/R10）全部事后补铁律，说明本项目缺乏「出包/分发 checklist」前置；③需求变更类（R5/R7/R8）频次正常、治理留痕充分。

---

## 5. 与 020 拉伸换边 app、053 护眼监测的复用关系

- **本仓内证据：零直接引用**。全 docs/、README、经验一句话 grep「拉伸换边」「护眼」「020」「053」（排除本项目自身 TASK-018/020/021 等编号撞车）无命中。D：grep 实测（2026-10-31）。
- git remote/`.project.yaml` 亦无指向其它项目的字段。D：.project.yaml 实读。
- **间接同源（I）**：本项目与 020/053 共用同一 ORCA 治理模板体系（AGENTS.md、角色卡、账本、蒲公英分发惯例、Redmi 12 Pro 设备口径）——这是「模板层经验复用」，不是代码复用；且本仓无法证明哪些经验具体来自 020/053。
- **判定**：代码复用＝未证实；治理/设备经验同源＝I（模板同构，但无单向引用证据）。

---

## 6. 真机验收证据

**有的（D）**：
- 安装包：`releases/stretch-routine-v1.2.0-local.apk`（90,133,393B，09-24，实测存在）；EAS v1.0.0 APK 有完整 SHA-256 与 Build ID 记录（D：android-v1-silent-install.md §1）；v1.2.0 于 10-27 上蒲公英并有 `iconCheck.code=OK` 回执（D：CHANGELOG.md）。
- 截图：`docs/screenshots/` 3 张（首页/动作库/设置，10-07 随 `b0aa7ae` 入库）；根目录 `2026-10-27-拉伸语音播报-1.2.0.png`（370×370 1-bit，蒲公英二维码，D：`file` 实测）；TASK-020 逐帧录屏+PIL 像素统计（D：HANDOFF §TASK-020）。
- 验收记录：docs/qa/ 真机报告 10 份，覆盖两代验收设备（xagapro → 12 Pro `indq5xfi6hovay4d`，09-27 用户明确「只用这一台」）；有真实的 FAIL 记录（task021 第一轮 FAIL/P0=1 → F1 → PASS），不是全绿表演。D：task021-真机第一轮.md §6/§9。
- 用户参与痕迹：09-18 亲耳初听、09-27 Human Gate 批准 V1.3、09-27「算了先这样」拍板、09-27「只用这一台」指令。D：HANDOFF 各处。

**弱的（I/未证实）**：
- 无「首次发布用户签收」正式记录（治理体系要求存在，仓内未见签收文档）——未证实。
- 09-24「三台真机装机」「真机验收通过」均为开发侧自述，无设备截图/录屏随 QA 报告存档（v1.1.0 APK 已被 v1.2.0 覆盖丢失，D：releases/ 仅一个文件）。
- android-v1-silent-install 的截图指向 `/Users/.../Downloads/stretch-apk/shots/`（仓外，未核实现存）——D 路径存在、文件存在性未证实。

---

## 7. 文档与代码比例

- docs/ 内 md+jsonl 合计 **979,421 B**（83 个 md，D：`find docs -type f` 实测）；src/ + modules/ + App.tsx 源码 **821,231 B**（164 文件）。比值 ≈ **1.19 : 1**。
- 其中治理脚手架（docs/roles、prompts、templates、model、history、assets 等 54 文件）**315,307 B ≈ docs 的 32%**（D：wc 实测）；另有根目录 AGENTS.md 90,843B + 三份旧版备份 + 多份治理提示词旧版（根目录约 300KB 治理类文本，D：ls 实测）。**I**：真实业务文档（pm/qa/review/plan/architecture/handoff）≈ 665KB，业务文档：代码 ≈ 0.81 : 1——对一个 37 commit 的项目属「文档偏重」，但 QA/review 落盘与真机证据是真实产出，非纯流程开销。
- 治理开销的另一面：全仓 37 commit 中至少 12 个为纯治理/文档/清理（I：按 commit message 分拣）。

---

## 8. 未证实清单

1. T095（TTS 打断/蓝牙/来电/锁屏发声）真机实测：挂账自 09-18，仓内无闭环记录——**未证实完成**。
2. T062（后台/锁屏跨边界真机 QA）与 FGS/Doze/WakeLock 矩阵（R004、R022-R034）：明确未开工——**证实未做**。
3. 断网状态下的播报行为：无实测记录；「断网无声」是 mibrain 走网络的推断——**未证实**。
4. 用户正式发布签收记录：不存在——**未证实**（有 Gate 批准与口头拍板记录）。
5. 与 020/053 的代码/经验复用：本仓零证据——**未证实**（仅治理模板同源，I）。
6. 09-17 之前的用户原始需求（一句话诉求）：仓内无独立记录，SDD SPEC 是最早需求真源——**未证实原始表述**（I：SDD 由云端计划者产出，其输入未留档）。
7. 双侧（换边）对称播报的真机听测证据：未见专项记录——**未证实**。
8. `releases/stretch-routine-v1.1.0-local.apk`（HANDOFF 记录曾存在、装过三台机）：现已被 v1.2.0 覆盖——实物不可复核。
9. android-v1-silent-install 截图（仓外 Downloads 路径）：文件存在性未核实。
10. 「Expo Go + xiao_ya 用户初听通过」的用户身份确认：仅有开发侧记录，无用户署名确认——自述级证据。

---

## 附：本报告证据文件索引（相对项目根）

- 需求真源：`docs/plan/2026-09-17 丨 …SDD开发包 丨 V1.0/…SPEC-交接上下文 丨 V1.0.md`
- 架构决策：`docs/architecture/background-decision.md`
- TTS/后台尖刺：`docs/qa/android-tts-spike.md`、`docs/qa/android-background-spike.md`
- 真机证据：`docs/qa/android-v1-silent-install.md`、`docs/qa/task021-真机第一轮.md`、`docs/qa/task020-brand-splash.md`
- 计划基线：`docs/pm/PRODUCT_PLAN_V1.1.md`、`V1.3.md`；`docs/plan/…整改计划…V1.1.md`
- 交接权威：`docs/handoff/HANDOFF.md`（§TTS 专节为语音现状唯一权威段）
- 关键 commit：`bc1f39f`(V1) `1114edb` `42071f7` `65cd86a` `1538868` `90bd862` `ac43ae6` `2643c2c` `c00e82b` `f9f5651` `e3b367b` `4be0428` `b0aa7ae` `2957762` `8f8e43e`
