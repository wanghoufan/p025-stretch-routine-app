# A 路 · Day 1 重构叙事（V1.1，第二轮交叉核验）

- 项目：`/Users/zzymima0000/Developer/coding/1.Active/025-ing-拉伸语音播报 app`（37 提交，HEAD `8f8e43e`，2026-10-28 22:24）
- 本轮输入：本项目 `docs/retrospective/B-Gap-RootCause-V1.0.md`（22,435 B）与 `B-Gap-RootCause-V1.1.md`（24,123 B），以及我自己的 `A-Day1-Reconstruction-V1.0.md`（58,532 B / 567 行）
- 本轮性质：**只读取证**。未建/切分支、未 commit/push、未改代码、未部署、未装依赖、未构建；写操作仅限本文件
- 证据分级：**D** = 路径＋行号 / Git hash / 可复现命令输出；**I** = 基于 D 的推断（附理由）；不足处写「未证实」
- 工作树：`git status --short` 现仅 `?? docs/retrospective/`（未跟踪目录，本轮产物与 A/B 各版本都在其中）

---

## §0 修订说明

### 0.1 本轮读了什么、改了什么

相对 V1.0，本轮**没有重写时间线与 Day 1 反推**（V1.0 §1–§11 的 D 级事实经复核未被推翻），只做三件事：把 B 路两轮的结论逐条回到原始证据复算；修正 V1.0 里被证据否掉或说得过头的判断；把新发现的证据缺口补进交叉审查与终审素材。

V1.0 需修正的条目（编号 A-C）：

| 编号 | V1.0 原说法 | V1.1 修正 | 依据 |
|---|---|---|---|
| A-C1 | 离线四步链第 2 步「满足性由推断给出」 | 保留定性，补「该判定对 09-17 当时 eSpeak 环境为真」；缺陷是**未标设备前提、未列复验**，而非凭空捏造 | `docs/qa/android-tts-spike.md:16,42,45-50`；`docs/qa/v11-wave1-functional.md:5,22` |
| A-C2 | `onStopped` 当 `onDone`「是离线问题不易被发现的**直接原因**」 | 降级为「HANDOFF 09-27 复盘自述归因」；实际作用是**拉高排查成本**（09-24 已暴露无声），不是让问题永久隐身。另：行号应为 `expoSpeechSpeaker.ts:17`，V1.0 沿用 HANDOFF 的 `:19` 有 2 行偏移 | `docs/handoff/HANDOFF.md:254`；`src/services/tts/expoSpeechSpeaker.ts:17`；`HANDOFF.md:197` |
| A-C3 | 「SC-004 至今不可验收 → 不具备发布资格」 | 保留结论（SPEC §11 的发布条件含「real-device background/lock-screen QA is complete」），但限定 SC-004 条文只覆盖**计时与状态恢复**，不覆盖语音连续性；且 R006 已覆盖「后台/前台＋跨进程」，缺的是**锁屏与 Doze** | SDD SPEC `:484`、`:492-494`；`docs/qa/task021-r006.md:83` |
| A-C4 | 「`8f8e43e` 在同一提交里用 `.gitignore` 屏蔽了 `*.旧版-*`」 | **错**。`*.旧版-*` 自 `90bd862`（09-24，`.gitignore:3-4`）起已生效；`8f8e43e` 只是加了**第二份**（现 `.gitignore:93`）并扩大忽略集。「备份不进 git status」从 09-24 就成立，不是 10-28 才发生 | `git show 90bd862:.gitignore`；`git check-ignore -v README.md.旧版-2026-10-12` |
| A-C5 | 「两个 1.2.0 包靠 versionCode 可区分」 | 限定为**仅限这两个包**。`code 2` 至少被 09-18、09-21、09-24 三类产物共用；且 tag `v1.2.0` 指向 `1538868`，该提交包内是 **1.1.0/code2**，tag 名与版本不一致（V1.0 与 B 两轮都没发现） | `git show <hash>:app.json`；`git rev-parse v1.2.0` |
| A-C6 | 09-27「功能/修复类 10 个、治理文档类 6 个」 | **写反**。逐提交统计触及 `src/`、`modules/`、`App.tsx`、`app.json` 的只有 6 个，其余 10 个是文档/账本/口径类 | `git show --stat` 逐提交（见 §12 组 13） |
| A-C7 | `docs/qa/` 「9 份」 | 实为 **10 份**实质报告（另有 5 个模板及旧版备份，共 15 个文件）；V1.0 正文列举恰好 10 项，属算术笔误 | `ls docs/qa`（见 §12 组 14） |
| A-C8 | 10-27 重出包「iconCheck.code=OK 回执」 | 限定为 CHANGELOG **自述文字**；无构建号、无 SHA-256、无下载侧验读（与 B V1.1 的降级一致） | `CHANGELOG.md:19-21` |

### 0.2 对 B V1.1 八条核查结论的逐条处置

| # | B V1.1 结论 | 我的复算 | 处置 |
|---|---|---|---|
| 1 | TTS 三次漂移（eSpeak→xiao_ya→mibrain）通过，B V1.0 漏 eSpeak 段已补 | 三处原文均命中（`v11-wave1-functional.md:5,22`；`HANDOFF.md:169,170,197,243`） | **接受**，见 §12 组 1 |
| 2 | 离线四步链「通过，需限定」；09-17「满足」对当时 eSpeak 为真，缺陷是未标设备前提、未列复验 | `android-tts-spike.md:16` 无「待验证」标注；`:42` 只把语音包缺失归设备侧；`:45-50` 四项清单不含断网 | **接受该限定**，并写进 V1.1 §11′ 提示词（见 §12 组 2、A-C1） |
| 3 | 后台零实现通过 | `grep` 五关键词零命中（exit 1）；`docs/qa/` 无 `android-v1-background.md`、`android-v1-audio.md`；`HANDOFF.md:67` | **接受**，见 §12 组 4 |
| 4 | 计次合并为「用口播文案替代数据字段」 | `seeds.ts:163` 注释；`seed-content-v2.md:17` 与流程模板 7/8/9「每侧 8/10/10-12 次」；SPEC/PLAN `reps|组数` 零命中 | **接受**，见 §12 组 5 |
| 5 | README：`diff(b0aa7ae:README.md, README.md.旧版-2026-10-12)` 为空，10-12 备份是产品版唯一仓外副本；两次覆盖均未进 Git | 复跑 `diff` 为空、两份 MD5 均为 `22b3fcbd…`、均 2259 B；`git log --follow` 恰 4 提交 | **接受**；但 B 与我都要修正 `.gitignore` 归因（A-C4），见 §12 组 6 |
| 6 | versionCode：`90bd862`=2、`e3b367b`=3，但 1.1.0 与 1.2.0 首包同为 code 2 | 复核成立，且更广：`bc1f39f/1114edb/42071f7/65cd86a/1538868` 全部 1.1.0/code2；`c2393af/4be0428`（09-27 多语言）仍 1.2.0/code2 | **接受**；我的「可区分」需按 A-C5 限定，见 §12 组 7 |
| 7 | 未证实项：重叠 3 条；吸收 A1/A2/A3/A4/A11；保留 B 独有 5 条；蒲公英 `iconCheck=OK` 由「回执」降为 CHANGELOG 自述 | 18 条合并清单逐条可复核；`iconCheck` 仅 `CHANGELOG.md:20` 一处文字，全仓 SHA-256/Build ID 仅见于 09-17 的 EAS 包记录 | **接受**；本轮新增 2 条未证实项（tag 成因、10-27 包哈希） |
| 8 | 新增 G9–G12 逐条复算确认 | G9：设备三件套状态无任何 DoD 记录；G10：铺包按整目录覆盖、仓内无所有权规则；G11：设备记录冲突至少 4 处；G12：完成页数字仅代码证据且挂账无排期 | **接受**，分别见 §12 组 2、6、8、10 |

### 0.3 本轮可信度自评

- B V1.1 的 8 条结论中，**8 条与我的复算一致**，其中 2 条（`iconCheck`、README）本轮继续收紧措辞。
- 本轮新增**双方都未覆盖**的事实 4 条：tag `v1.2.0` 与包内版本不一致；`.gitignore` 的 `*.旧版-*` 实际自 09-24 生效；09-27 提交性质比例写反；`docs/qa` 实质报告 10 份。
- 因此本轮判定分布为：**A 成立 8、部分成立 3、B 成立 2、双方需修正 1**（共 14 组，五类判定中「不可证实」本轮未使用，见 §12）。

---

## §1 复核范围与方法

| 项 | 说明 |
|---|---|
| Git | `git log`（全部 37 提交，含时间戳）、`git show <hash>:<path>`（`app.json`、`.gitignore`、`README.md`）、`git show --stat`、`git log --follow`、`git rev-parse <tag>`、`git check-ignore -v`、`git status` |
| 文本 | `docs/qa/` 全量实读（10 份实质报告）、`docs/handoff/HANDOFF.md` 全文 279 行、SDD SPEC 关键节、`docs/pm/PRODUCT_PLAN_V1.1~V1.3`、`docs/architecture/background-decision.md`、`docs/plan/seed-content-v2.md`、`CHANGELOG.md` |
| 代码 | `src/services/tts/expoSpeechSpeaker.ts`、`src/data/seeds.ts`、`src/app/navigation/routes.ts`；仅读，不构建 |
| 统计 | `git log --shortstat` 求和（56,679 insertions）；逐日 `uniq -c`；逐提交 `--stat` 判断是否触及代码 |
| 未覆盖 | `node_modules/`、`android/`（本地构建副本，未入库）、`releases/` 内 APK 内容、仓外 `/tmp` 与 `~/Downloads` 历史证据 |

---

## §11′ Day 1 提示词修订补丁（相对 V1.0 §11，只列变更行）

> V1.0 §11 的提示词整体仍可用；以下四条必须替换或追加，否则会把已被证伪的前提带给新计划者。

1. **环境自检加设备基线**（替换 V1.0「第一天必须先解决的四件事」第 1 条）：
   > 先在目标真机上固定三件事并写进验收标准：`settings get secure tts_default_synth` 的当前值与设置命令、该引擎是否装了中文包、断网时能否出声。三件都是设备侧一次性状态，换机即失效；09-17 曾因只凭「系统已装离线包」就把离线判为满足，最终验收机走云合成。
2. **发布口径**（追加进「已经明确不做的」段）：
   > 锁屏/后台播报为零实现时，只允许「内测分发（蒲公英短链）」这一说法，不得写成「已发布」；SPEC 的 SC-004 与 §11 发布条件未满足，且不得用口头豁免代替书面记录。
3. **版本与 tag**（替换 V1.0「构建链路」里版本号那句）：
   > 版本真源三件套（`app.json` version/versionCode、`package.json` version、Git tag）目前不一致：`app.json` 1.2.0/code3、`package.json` 1.0.0、tag `v1.2.0` 指向包内 1.1.0/code2 的提交。第一天先指定唯一权威源，并在每次出包后回读包内 `versionName/versionCode`。
4. **验收数字**（替换 V1.0「验收判据」最后一句）：
   > 「看着对」的数字必须**并排对照**；只做代码级证据的项，必须同时写下第一次可复测的触发条件（例如下一次完整跑完一条流程的出包验收），否则不得计入通过。

---

## §12 交叉审查（14 组）

> 判定限五类：**A 成立 / B 成立 / 部分成立 / 双方需修正 / 不可证实**。每组给可复现命令或路径。

### 组 1｜TTS 设备侧漂移是三次还是两次

- **主张 A**（我 V1.0 §4.2）：三次漂移——09-18 系统默认 eSpeak → 同日 Sherpa `xiao_ya` → 09-24 起小米 `mibrain`；代码层从未接入 Sherpa。
- **主张 B**（B V1.0 §2.2 只写两段；B V1.1 §1 第 1 组）：V1.0 漏 eSpeak，已补齐；三次成立。
- **原始证据**（D）：`docs/qa/v11-wave1-functional.md:5`「TTS引擎：com.reecedunn.espeak（默认）」；`:22`「logcat 同期 eSpeak `nativeSetVoiceByProperties(language=cmn)`＋`nativeSynthesize`＋AudioTrack start」；`docs/handoff/HANDOFF.md:169`「Expo Go + Sherpa xiao_ya 神经音用户初听通过；eSpeak 仅备用」、`:170` 加「BZNSYP Non-commercial」失效标注；`HANDOFF.md:197`「sherpa 引擎无中文包（切 mibrain）」；`HANDOFF.md:243`「12 Pro 上系统只有小米 mibrain 一个 TTS 引擎……合成走网络」。全仓 `grep -ri sherpa src modules App.tsx` 零命中（D）。
- **判定：A 成立。** 三次漂移是设备侧事实，代码层唯一通道始终是 `expo-speech`；B V1.0 属覆盖缺失而非事实错误，B V1.1 已自纠。
- **仍不确定**：`xiao_ya` 是怎么装进系统并设为默认的（APK 来源、版本、模型变体，仓内零记录）；「用户初听通过」的用户身份只有开发侧自述。

### 组 2｜09-17「离线可用＝满足」的判定性质与设备限定

- **主张 A**（我 V1.0 §4.3 第 2 步）：满足性由**推断**给出、当天无设备取证，且没人把它当作待验证假设（SPIKE §6 清单无断网项）。
- **主张 B**（B V1.1 §2 C2）：定性成立但需限定——该「满足」对当时 eSpeak 设备**确为真**，缺陷是「以当时设备为真却写成普适结论、未标前提、未列复验」，预防点是判定必须附设备基线与复验条件。
- **原始证据**（D）：`docs/qa/android-tts-spike.md:16` 表格「离线可用（Constitution II）｜满足｜使用系统已安装的离线语音包，不依赖网络」，同行**无**「待验证」标注；`:42`「若手机未安装中文离线语音包……属设备侧问题」；`:45-50` 四项待验清单（中文朗读、锁屏、蓝牙/来电、TTS 关闭）不含断网；`docs/pm/PRODUCT_PLAN_V1.1.md:89` 有「核心流程断网可用」验收勾选项但未勾；全仓 `grep 断网|飞行模式` 只命中计划与 QA 的文字提及，**无一次断网播报用例**。eSpeak 为本地 formant 合成（I：由其引擎性质推定「09-17 判断在当时设备上成立」，未见断网实测记录）。
- **判定：A 成立（接受 B 的设备限定，作为补充而非反驳）。** 「推断」与「恰好为真」同时成立；A-C1 已改写措辞。
- **仍不确定**：写作尖刺时是否意识到设备差异（意图不可考）；eSpeak 在该机上的断网表现也从未被实测记录。

### 组 3｜`errorCode` 被吞是不是「离线问题不易被发现的直接原因」

- **主张 A**（我 V1.0 §4.3 第 4 步）：失败被代码静默吞掉是直接原因，原文见 `HANDOFF.md:254`。
- **主张 B**（B V1.1 §2 C3）：串联成立，但该句是 09-27 复盘**自述归因**而非实验证明；09-24 首次无声排查已暴露问题，吞噬的真实代价是「App 表现一切正常、拉高定位成本」。
- **原始证据**（D）：`docs/handoff/HANDOFF.md:254` 原文「`src/services/tts/expoSpeechSpeaker.ts:19` 把 `onStopped` 当作 `onDone`……丢弃了 TTS errorCode……这正是离线问题不容易被发现的直接原因」；`src/services/tts/expoSpeechSpeaker.ts:17` 实际为 `onStopped: options.onDone,`（该文件自 `bc1f39f` 至今 `onStopped` 恒在第 17 行，HANDOFF 的 `:19` 有 2 行偏移）；`HANDOFF.md:197` 记 09-24 已定性「speaker 音量 0＋sherpa 无中文包＋投屏劫持」；`docs/qa/task021-r006.md:87` 09-27 才查清 `tts_default_synth=null`。
- **判定：部分成立。** 引用准确、因果方向对，但「直接原因」是文档自述；实际时间线是问题在 09-24 已暴露、09-27 才找到底层根因，errorCode 吞噬抬高成本而非遮蔽。
- **仍不确定**：修掉 errorCode 吞噬能把 09-24 排查缩短多少（反事实，不可证）。

### 组 4｜后台零实现与发布闸门是否被绕开

- **主张 A**（我 V1.0 §5）：后台播报零实现；SC-004 不可验收 → 该产品理论上不具备发布资格，而 09-24/10-27 的实际出包与蒲公英分发**事实上绕开了闸门**（I）。
- **主张 B**（B V1.0 G1 / B V1.1 §1 第 3 组）：后台零实现通过，是最大差距；未讨论发布闸门与分发的关系。
- **原始证据**（D）：`grep -rn "ForegroundService\|expo-notifications\|notifee\|WakeLock\|startForeground" src modules app.json package.json` → 零命中（exit 1）；`ls docs/qa` 15 个文件中无 `android-v1-background.md`、`android-v1-audio.md`；`HANDOFF.md:67`「FGS、通知双分支、Doze/Deep Sleep、WakeLock……一项都没做」；SDD SPEC `:484`「SC-004 On a real supported Android device, background/lock-screen testing demonstrates correct session timing and state restoration」、`:492-494`「V1 is releasable only when……real-device Android background/lock-screen QA is complete」；`task021-r006.md:83`「Doze/深度睡眠未实测……本轮只覆盖『后台/前台』与『跨进程』」；全仓 `grep 豁免|SC-004` 在项目文档内**无任何 SC-004 豁免或放行记录**（命中的「豁免」都在治理规则与账本语境）。
- **判定：A 成立（须按 A-C3 限定）。** 发布闸门客观未满足、无书面豁免；但 SC-004 条文只管计时与恢复，语音连续属 FR-028 与 US1-4，不能把 SC-004 说成「静音即不可验收」。
- **仍不确定**：是否发生过口头豁免（无记录，无法证否）。

### 组 5｜计次是「漏做」还是「用内容替代功能」

- **主张 A**（我 V1.0 §6）：SPEC 有意排除；次数只进口播文案；做真计次的成本在「判定」而非 UI，会冲击 hands-free＋离线两条承诺。
- **主张 B**（B V1.0 G3）：SPEC 无 reps 需求，属需求澄清缺口，「每个动作做 2 组无处表达（只能复制动作行）」；B V1.1 合并为「用口播文案替代数据字段」。
- **原始证据**（D）：`src/data/seeds.ts:163` 注释 `// ---- core (reps, spoken cues) ----`；`grep -rn "reps\|sets" src/data src/domain src/data/migrations` 仅命中该注释行（放宽到整个 `src` 时其余命中均为 `assets`/`actionIcons` 等无关词）；`docs/plan/seed-content-v2.md:17`「核心动作（9个，播报含次数口令）」与流程模板 7/8/9「每侧 8 次 / 10 次 / 10-12 次」；SDD SPEC/PLAN `grep reps|组数|几组` 零命中。
- **判定：A 成立。** B V1.1 的合并表述与 A 一致；B V1.0 的「无处表达」不准确——次数在口播文本里，只是不建模、不统计。
- **仍不确定**：用户是否提出过「记次数」（`docs/qa/` 无相关反馈记录，不能断言没提）。

### 组 6｜README 事故：覆盖次数、产品版下落、`.gitignore` 归因

- **主张 A**（我 V1.0 §8）：两次覆盖（10-12、10-17）都没进 Git；`b0aa7ae` 是产品版最后一个提交；10-12 备份就是产品版；`8f8e43e` 把治理版入库并「用 `.gitignore` 屏蔽 `*.旧版-*`」。
- **主张 B**（B V1.0 R11）：只记 10-17 一次覆盖；「产品版仅存于 git 历史」；「备份机制备份的是错的版本」。B V1.1 §2 C1 全部自纠，并补「10-12 备份是 git 外唯一存世副本」。
- **原始证据**（D）：`git log --follow --oneline -- README.md` → 4 提交（`bc1f39f`、`99c6361`、`b0aa7ae`、`8f8e43e`），两次覆盖确未进 Git；`git show b0aa7ae:README.md | wc -c` = 2259，`README.md.旧版-2026-10-12` = 2259，`diff` 退出码 0，两份 MD5 均 `22b3fcbdbff4b762ba7ede6254d4ad5a`；`README.md.旧版-2026-10-17` = 19354 B，头部为「ORCA 治理模板分发版｜导航」；当前 `README.md` = 20839 B（与 `HEAD:README.md` 一致）；`README.en.md` = 2313 B，头部「# Stretching Voice-Broadcast App」，仍是产品英文版。
- **补充证据（本轮新发现，D）**：`git check-ignore -v README.md.旧版-2026-10-12` → `.gitignore:93:*.旧版-*`；但 `git show 90bd862:.gitignore` 的**第 3-4 行**已是「# 迁移整理备份……\n*.旧版-*」，即该规则自 **09-24** 起就生效。`8f8e43e` 的 `.gitignore` diff 只是在文件末尾再加一份并扩大忽略集（`scripts/orca-*`、`docs/prompts/` 等）。因此「备份从来不进 `git status`」早于 10-12 事故，并不是 10-28 才发生。
- **判定：部分成立。** 事故主链（两次覆盖、未进 Git、10-12 备份＝产品版、10-28 合法化入库）A 成立、B V1.1 自纠正确；但「`8f8e43e` 才屏蔽 `*.旧版-*`」这一子项**双方都需修正**，实际起点是 `90bd862`。
- **仍不确定**：两次覆盖的操作者与工具（A11，只有备份文件名与 mtime：10-12 备份 mtime 10-13 15:26、10-17 备份 mtime 10-18 14:24）；10-12 那次是否同属一次铺包（无任何治理通知记录）。

### 组 7｜`versionCode` 到底能不能区分版本

- **主张 A**（我 V1.0 §7.6 第 5 条）：两个 1.2.0 包（09-24 `code 2`、10-27 `code 3`）靠 `versionCode` 可区分，但没有文档并列记录。
- **主张 B**（B V1.1 §2 C4）：通过；并补「1.1.0 首包与 1.2.0 首包同为 `code 2`，`versionCode` 区分不了这两版」。
- **原始证据**（D）：`git show <hash>:app.json` 逐个取值——`bc1f39f/1114edb/42071f7/65cd86a/1538868` 均为 `1.1.0 / code 2`；`90bd862`（09-24）= `1.2.0 / code 2`；`c2393af`、`4be0428`（09-27 上午）= `1.2.0 / code 2`；`e3b367b`（09-27 10:32）起 = `1.2.0 / code 3`；HEAD = `1.2.0 / code 3`。`CHANGELOG.md:12`「`app.json` 的 version(1.2.0) / versionCode(3) 未改」。`git rev-parse v1.2.0` → `1538868`，而该提交包内是 `1.1.0 / code 2`。
- **判定：部分成立。** A 的「可区分」只在「两个 1.2.0 包」范围内为真，且 `code 2` 至少被 09-18（v1.1.0 本地包）、09-21（图标修复后重装三台的包）、09-24（v1.2.0 首包）三类产物共用；B 的补充成立。另：tag 与版本不一致是双方都未登记的第三处破绽。
- **仍不确定**：`v1.2.0` tag 为何打在 09-21 的图标修复提交上（是提前打版还是误打，无记录）；10-27 重出包的构建方式与哈希（未证实）。

### 组 8｜设备证据冲突是否需要统一基线卡

- **主张 A**（我 V1.0 附录 A2/A3）：同一序列号 `IN9LZTAYV4UGU4JF` 被记为 HyperOS V816/Android 14 与 Android 12/SDK 31，两者不能同时为真；`indq5xfi6hovay4d` 的机型标识跨文档不一致。我登记冲突、不代修正。
- **主张 B**（B V1.1 G11）：采纳，并指出 QA 报告缺统一设备基线卡，证据链可信度受损；预防是「每轮 QA 头部强制引用同一设备卡，版本字段以现场 `getprop` 为准」。
- **原始证据**（D）：`docs/qa/android-v1-silent-install.md:6`「Redmi 22041216UC（xagapro，HyperOS V816 / Android 14）」；`docs/qa/task020-brand-splash.md:28` 同一序列号记「12 / 31」；`HANDOFF.md:208`「xagapro(API31)」；`docs/pm/PRODUCT_PLAN_V1.1.md:8`「Redmi 22041216UC（HyperOS V816 / Android 14）」；`docs/qa/task020-brand-splash.md:29`「indq5xfi6hovay4d | ruby / 22101316C | 14 | 34」；`docs/qa/task021-r006.md` §0 记「机型 Redmi Note 12 Pro（`getprop ro.product.marketname` 实测）」；`HANDOFF.md:85`「`ruby`=Note12」。
- **判定：A 成立。** 冲突真实存在（至少 4 份文档在同一序列号上给出互斥的系统版本；机型命名在「ruby=Note12」与 marketname「Note 12 Pro」之间也对不上）。
- **仍不确定**：哪一处正确，需现场 `getprop ro.build.version.sdk` / `ro.product.marketname` 复核；若为 OTA 升级（12→14），「早记 14、晚记 12」与升级方向相悖，倾向至少一处笔误（I）。

### 组 9｜蒲公英分发有没有「回执」

- **主张 A**（我 V1.0 附录 A6 / §7.6 第 4 条）：回执不成链——无上传构建记录、无包哈希回读、无下载侧验签。
- **主张 B**（B V1.0 §6）：`v1.2.0` 于 10-27 上蒲公英并有 `iconCheck.code=OK` **回执**（D：`CHANGELOG.md`）；B V1.1 §2 C5 降级为「CHANGELOG 自述级文字」。
- **原始证据**（D）：`CHANGELOG.md:19-21`「`unzip -l …| grep mipmap…` 命中 5 个密度」「蒲公英 `iconCheck.code = OK`，落地页 `https://www.pgyer.com/lashenyuyinbobao` 图标正常」；全仓 `SHA-256|Build ID|构建号` 仅命中 `docs/qa/android-v1-silent-install.md:20,26`（09-17 的 EAS 包）；`git show --stat 2957762` 只动 2 个文件、0 个 `src/modules/app.json` 文件，原生资源改动按 `CHANGELOG.md:21` 自述「只存在于本机构建副本，未随本次提交入库」。
- **判定：A 成立（B V1.0 过强，V1.1 已自改）。** 需限定：`iconCheck.code=OK` 的**文字记录存在**，缺的是可独立复核的实物（构建号、SHA-256、下载侧验读）。
- **仍不确定**：10-27 包的真实哈希与上传元数据；短链背后当前版本是否为该包。

### 组 10｜「代码级放行」是一例还是常态

- **主张 A**（我 V1.0 §7.6 第 6 条 / §10.3 第 6 条）：完成页「用时」与统计页同源这一项只有代码证据，真机对照列 P2 挂账。
- **主张 B**（B V1.1 G12）：同向，并称该做法「**常态化**」，与「静态代码分析不能当运行测试」存在张力；预防是给代码级放行绑定强制复测触发条件。
- **原始证据**（D）：`docs/qa/task021-真机第一轮.md:76`「⚠️ 未取到直接对照……此项按代码级证据放行，真机对照列为 P2 挂账」；`:82` P2 挂账；`HANDOFF.md:236` 同一 P2；`grep 代码级 docs` 仅命中上述 4 处，**全仓仅此 1 例**；09-27 之后无业务代码提交（`12cef72`/`c00e82b` 是 09-28 的分组修复，`2957762` 只动 `android/` 与 CHANGELOG），`grep 完成页` 未见新增对照记录，挂账确实没有复测排期。
- **判定：双方需修正。** 实例成立、挂账无排期成立；「常态化」证据不足（1 例不等于常态），A 也应补一句「该挂账至今未闭环」。
- **仍不确定**：是否存在仓外（用户自行安装后）对该数字的复测。

### 组 11｜版本治理 R039 是否闭环

- **主张 A**（我 V1.0 §1.1）：`app.json` 1.2.0/code3 与 `package.json` 1.0.0 不一致，R039 未闭环。
- **主张 B**（B 两轮均未提及）。
- **原始证据**（D）：HEAD `app.json` `"version": "1.2.0"` / `"versionCode": 3`；`package.json:3` `"version": "1.0.0"`；该不一致早在 `docs/qa/v1.1-baseline.md:56-57` 就被记录并归入 R039；`docs/pm/PRODUCT_PLAN_V1.1.md:130`「R039 统一 package/app version、versionCode、tag、HANDOFF」；`docs/handoff/HANDOFF.md:191`「版本以 Git 历史为准」；tag `v1.2.0` → `1538868`（包内 1.1.0/code2）。
- **判定：A 成立（并补 tag 不一致这一新证据）。** R039 要求统一的四件里有三件仍不一致（package version、tag、`versionCode` 语义），B 两轮均漏。
- **仍不确定**：`package.json` 的 1.0.0 是遗留未改还是有意（无说明）；tag 打点的决策过程无记录。

### 组 12｜「计划文档沿用过期环境前提」是否成立

- **主张 A**（我 V1.0 §9 第 10 项）：V1.2 叙述是「无 JDK、只能等 EAS」，实际 09-18 已由用户批准安装 JDK17＋Android SDK，并在 TASK-015 打通本地构建出包；问题是计划文档未同步事实。
- **主张 B**（B V1.0 无相反表述；B V1.1 §2 C4 确认采纳为「计划与事实脱钩」例证）。
- **原始证据**（D）：`docs/handoff/HANDOFF.md:187`「本地构建授权（2026-09-18 用户明确批准）：brew 安装 JDK17 + Android SDK（约 3GB）」；`HANDOFF.md:55`「本地构建链打通 + 出包（TASK-015）……出 `releases/stretch-routine-v1.1.0-local.apk`……已装三台真机」；`HANDOFF.md:138` U-1 明说 V1.2 有「4 处描述与现状不符……因它是 DEV_BASELINE，改它属 Change C，TM 未擅改」；`docs/pm/PRODUCT_PLAN_V1.3.md:56` 明确「不能再沿用 V1.2『无 JDK／只能等 EAS』的阻塞叙述」。
- **判定：A 成立。** 且这条不是需求变化，是「事实已变、计划未同步、且因基线保护不能自行改」的治理型返工。
- **仍不确定**：无（证据自洽）。

### 组 13｜09-27 爆发日的提交性质比例

- **主张 A**（我 V1.0 §2 P5）：16 个提交里「功能/修复类 10 个、治理文档类 6 个」。
- **主张 B**（B V1.0 §7）：「全仓 37 commit 中至少 12 个为纯治理/文档/清理（I）」。
- **原始证据**（D）：`git show --stat` 逐提交判断是否触及 `src/`、`modules/`、`App.tsx`、`app.json`——09-27 的 16 个中只有 6 个：`4be0428`（11 文件）、`c2393af`（1）、`e3b367b`（2）、`ac43ae6`（11）、`c86e7bd`（45）、`2643c2c`（4）；其余 10 个零代码文件（含 `d0bebec` 的 R006 真机 QA 记录、`4fe097d` 规划、`7d9bf2f` 收口、3 条 jcp 洁癖）。全仓口径：37 个中 14 个触及代码，23 个不触及。
- **判定：B 成立（A 需修正）。** A 的「10 功能 / 6 治理」把两者写反；B 的「至少 12」保守成立，且可精确到 23。
- **仍不确定**：无（可复现）。

### 组 14｜`docs/qa/` 到底几份报告

- **主张 A**（我 V1.0 §0.2）：「`docs/qa/` 9 份」。
- **主张 B**（B V1.0 §6）：「docs/qa/ 真机报告 10 份」。
- **原始证据**（D）：`ls docs/qa` 共 15 个文件；其中实质报告 10 份：`android-background-spike.md`、`android-tts-spike.md`、`android-v1-silent-install.md`、`task018-dynamic-filter.md`、`task020-brand-splash.md`、`task021-r006.md`、`task021-真机第一轮.md`、`v1.1-baseline.md`、`v11-filter-ambient.md`、`v11-wave1-functional.md`；其余 5 个是 `BUGS.template.md` 及其 3 个旧版备份、`产品验收追踪矩阵.template.md`。
- **判定：B 成立（A 需修正）。** V1.0 正文列举恰好 10 项却写「9 份」，属算术笔误（A-C7）。
- **仍不确定**：无。

---

## §13 终审素材包（≤900 非空白字符）

<!-- BEGIN-SECTION-13 -->
P025 拉伸语音播报：37 提交，HEAD 8f8e43e。两天成形（09-18 单日 30,695 行、09-27 共 16 提交）、一周打磨、三周收尾，全仓新增 56,679 行。最大可预防缺口是锁屏/后台播报零实现：Core Promise、FR-028~032、SC-004 与 SPEC §11 发布闸门都在，FGS/Doze/WakeLock 一项未做，仓内无 SC-004 豁免记录，实际以蒲公英内测分发替代发布验收。第二缺口是离线承诺落空：宪法判离线，09-17 尖刺按当时 eSpeak 设备直接写「满足」，三次引擎漂移（eSpeak→xiao_ya→mibrain）无一次断网验证，验收机最终云合成；预防点是设备基线＋断网复验写进 DoD。第三缺口是 README：产品版被治理铺包两次覆盖（10-12、10-17，均未进 Git），唯一仓外副本 README.md.旧版-2026-10-12 与 b0aa7ae 逐字节一致（MD5 22b3fcbd…），10-28 治理版经 8f8e43e 入库；`*.旧版-*` 自 90bd862（09-24）起已在 .gitignore，备份从来不进 git status。版本治理 R039 未闭环：app.json 1.2.0/code3 对 package.json 1.0.0，tag v1.2.0 指向 1538868（包内 1.1.0/code2），code 2 被 09-18/09-21/09-24 三类产物共用。验收侧：唯一 FAIL→PASS 闭环是种子未分类→v5 回填→复测；完成页与统计页数字只有代码证据且 P2 无复测排期；同一序列号被记 Android 14 与 API31；蒲公英只有 CHANGELOG 自述。计次非漏做，是用口播文案替代数据字段。交叉审查 14 组：A 成立 8、部分成立 3、B 成立 2、双方需修正 1；未证实 18 项。
<!-- END-SECTION-13 -->

> 实测非空白字符数：**749**（含空白 824），上限 900，余量 151。统计方法：`python3` 读取本文件，取 `BEGIN-SECTION-13` 与 `END-SECTION-13` 之间正文，`"".join(text.split())` 后取长度；标注行本身不计入。

---

## 附录 A｜未证实 / 证据冲突清单（V1.1 合并版）

| # | 事项 | 状态 | 来源 |
|---|---|---|---|
| 1 | T095（TTS 打断/蓝牙/来电/锁屏发声）真机实测 | 证实未做，无闭环 | A/B 重叠 |
| 2 | T062 与 FGS/Doze/WakeLock 矩阵 | 证实未做 | A/B 重叠 |
| 3 | 断网状态下的播报行为 | 无实测记录——未证实 | B |
| 4 | 用户正式发布签收记录 | 无签收文档——未证实 | B |
| 5 | 与 020/053 的代码或经验复用 | 本仓零证据——未证实 | B |
| 6 | 09-17 之前用户原始需求表述 | 无独立记录——未证实 | B |
| 7 | 双侧换边对称播报真机听测 | 无专项记录——未证实 | B |
| 8 | `releases/stretch-routine-v1.1.0-local.apk` 实物 | 已被 v1.2.0 覆盖丢失 | B |
| 9 | `/tmp` 截图证据（`v11-wave1-functional.md:38` 等） | 确认已丢失 | A9 = B9 |
| 10 | 「xiao_ya 用户初听通过」的用户身份 | 开发自述级 | B |
| 11 | Sherpa `xiao_ya` 安装方式（APK 来源/版本/模型变体） | 未证实 | A1 |
| 12 | `IN9LZTAYV4UGU4JF` 系统版本（14 vs 12/API31） | 证据冲突，至少一处笔误（I） | A2 = B12 |
| 13 | `indq5xfi6hovay4d` 机型标识（ruby/22101316C vs marketname Note 12 Pro） | 证据冲突或同机异名 | A3 = B13 |
| 14 | 09-24 包的实际验收范围 | 无对应 QA 记录——未证实 | A4 = B14 |
| 15 | 10-27 重出包的构建方式与哈希；蒲公英上传元数据 | 未证实（仅 CHANGELOG 自述） | A5/A6 = B15 |
| 16 | 10-12 / 10-17 两次 README 覆盖的操作者与工具 | 未证实 | A11 = B16 |
| 17 | 37 提交之外的仓外实验（如 Sherpa 接入尝试） | 只能证明仓内没有——未证实 | A12 = B17 |
| 18 | `session_history_steps` 是否获 V1.3 schema 追认 | 待追认（review 在案） | A10 = B18 |
| 19 | **新增**：tag `v1.2.0` 为何打在 `1538868`（包内 1.1.0/code2） | 无记录——未证实 | 本轮新发现 |
| 20 | **新增**：10-27 包与本机 `android/` 构建副本的一致性 | 仓内无产物可核——未证实 | 本轮新发现 |

> 合并口径：B V1.1 的 18 条全部保留（编号对应见「来源」列），本轮新增 19、20 两条，故本轮称「未证实 18 项」时指 B V1.1 的 18 条口径；新增两条在终审素材中未单列。

---

## 附录 B｜本轮用到的可复现命令

```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/025-ing-拉伸语音播报 app"

# 规模与提交
git rev-list --count HEAD
git log --pretty=%ad --date=short | sort | uniq -c
git log --shortstat --format="" | awk '/changed/ {for(i=1;i<=NF;i++) if($i ~ /insertions/) ins+=$(i-1)} END{print ins}'

# TTS 三次漂移
sed -n '5p;22p' docs/qa/v11-wave1-functional.md
grep -n "espeak\|xiao_ya\|mibrain" docs/handoff/HANDOFF.md
grep -n "onStopped" src/services/tts/expoSpeechSpeaker.ts

# 离线判定与复验缺口
sed -n '14,18p;40,50p' docs/qa/android-tts-spike.md
grep -rn "断网\|飞行模式" docs/qa docs/pm docs/plan

# 后台零实现
grep -rn "ForegroundService\|expo-notifications\|notifee\|WakeLock\|startForeground" src modules app.json package.json; echo $?
ls docs/qa/

# 计次
sed -n '163p' src/data/seeds.ts
grep -rn "reps\|sets" src/data src/domain src/data/migrations
grep -rn "reps\|组数\|几组" docs/plan

# README 事故
git log --follow --oneline -- README.md
ls -l README*
git show b0aa7ae:README.md | wc -c
diff <(git show b0aa7ae:README.md) "README.md.旧版-2026-10-12"; echo $?
git show b0aa7ae:README.md | md5; md5 -q "README.md.旧版-2026-10-12"
git check-ignore -v README.md.旧版-2026-10-12
git show 90bd862:.gitignore | sed -n '1,5p'
git show 8f8e43e -- .gitignore

# 版本与 tag
for c in bc1f39f 90bd862 e3b367b c2393af 4be0428 8f8e43e; do
  echo "$c: $(git show ${c}:app.json | grep -E '\"version\"|versionCode' | tr '\n' ' ')"
done
grep -E '"version"|versionCode' app.json; grep -n '"version"' package.json
git tag -l; for t in $(git tag -l); do echo "$t -> $(git rev-parse --short $t)"; done
git show 1538868:app.json | grep -E '"version"|versionCode'

# 09-27 提交性质
for c in $(git log --format='%H %ad' --date=short | awk '$2=="2026-09-27"{print $1}'); do
  echo "$(git log -1 --format=%h $c) $(git show --stat --format='' $c | grep -cE 'src/|modules/|App\.tsx|app\.json')"
done

# 设备与分发回执
sed -n '1,10p' docs/qa/android-v1-silent-install.md
sed -n '26,32p' docs/qa/task020-brand-splash.md
grep -n "indq5xfi6hovay4d\|IN9LZTAYV4UGU4JF" docs/handoff/HANDOFF.md
cat -n CHANGELOG.md | sed -n '5,21p'
git show --stat 2957762
```

> 以上命令全部只读；本报告未修改任何既有文件、未建/切分支、未 commit、未 push、未构建、未安装依赖。
