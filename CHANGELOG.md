# CHANGELOG

本文件为项目变更说明正典：每次改动并交付后追加一条（改了什么 / 为什么 / 影响谁 / 怎么验）。

## 2026-10-27 ｜ 修复蒲公英列表字母占位图（ICON_ABSENT）

- 改了什么
  - `android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/` 新增 `ic_launcher.png` 与 `ic_launcher_round.png`（48 / 72 / 96 / 144 / 192），由 `assets/motion-core-icon.png` 缩放生成。
  - 删除同目录 `ic_launcher.webp` 与 `ic_launcher_round.webp`，避免同名 png + webp 触发重复资源编译失败。
  - `android/gradle.properties` 追加 `android.enableResourceOptimizations=false`，关闭 AGP 的 `--shorten-resource-paths`。
  - 保留 `ic_launcher_foreground / background / monochrome` 与 `mipmap-anydpi-v26/*.xml` 不变。
  - 未执行 `expo prebuild`；`app.json` 的 version(1.2.0) / versionCode(3) 未改。
- 为什么
  - 蒲公英只识别 APK 内的 `res/mipmap-*/ic_launcher.png` 位图。此前只有 webp，列表显示字母占位图（ICON_ABSENT）。
  - AGP 9 在 release 默认缩短资源路径（`res/-A.png` 形式），会让预检同样判为 ICON_ABSENT，故一并关闭。
- 影响谁
  - 仅 Android 打包产物与分发页图标展示；无 JS/业务逻辑改动。
- 怎么验
  - `unzip -l app-release.apk | grep -E "mipmap-.*ic_launcher\.png"` 命中 5 个密度。
  - 蒲公英 `iconCheck.code = OK`，落地页 `https://www.pgyer.com/lashenyuyinbobao` 图标正常。
  - 注：`android/` 按项目治理被 `.gitignore` 排除，上述原生资源改动只存在于本机构建副本，未随本次提交入库。
