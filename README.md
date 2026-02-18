# FFmpeg 图形工具

基于 **Tauri + Rust** 的跨平台 FFmpeg 桌面应用（macOS / Windows / Linux）。

目标：
- 基础流程可直接用（输入输出、裁剪、预设）
- 高级参数按模块展开（视频 / 音频 / 封装执行）
- 全程可视化，实时命令预览、日志、进度和浮层提示

## 功能概览

- 输入文件 / 输出文件原生系统对话框选择
- 内置 `ffprobe` 媒体探测（容器、时长、码率、流信息）
- 转码模板：`H.264` / `H.265` / `MP3` / `GIF`
- 常用一键场景：`社媒竖屏` / `压缩归档` / `只导出音频`
- 所有参数可选，留空即不传
- 实时命令预览 + 实时日志 + 进度条 + 状态提示

## 环境要求

- Node.js 18+
- Rust stable（`cargo` / `rustc`）
- 已安装 `ffmpeg` 与 `ffprobe`

macOS 推荐：

```bash
brew install ffmpeg
```

## 本地开发

```bash
npm install
npm run dev
```

这会启动 Tauri 桌面窗口（不是浏览器标签页）。

## 本地打包

### macOS

```bash
npm run dist:mac
```

产物在 `release/` 目录：

- `FFmpeg_GUI_Tool_<version>_<arch>.dmg`
- `FFmpeg_GUI_Tool_<version>_<arch>.zip`

`dist:mac` 内部流程是：
1. 先用 Tauri 生成 `.app`
2. 再用 `hdiutil` 生成简化版 `.dmg`

### 通用构建（当前系统）

```bash
npm run dist
```

## 测试

```bash
npm test
```

包含：
- Node 测试（UI 结构、前端桥接、样式、参数逻辑）
- Rust 测试（命令分词、输出路径建议、进度解析）

## GitHub Release 三平台安装包

仓库已包含工作流：

- `.github/workflows/release.yml`

触发方式：
- 在 GitHub 创建并发布 Release（`published`）

工作流会自动：
- 在 macOS / Windows / Linux 三个平台构建 Tauri 安装包
- 将构建产物上传到当前 Release

说明：
- Release 页面自带源码压缩包（Source code zip/tar.gz）
- 工作流上传的是三平台安装包/可执行产物

## 使用流程

1. 在“基础流程设置”选择快速场景（可选）
2. 选择输入文件和输出文件
3. 设置起始时间 / 时长（可选）
4. 需要精细控制时，展开“模块高级设置”
5. 查看“命令预览”后执行

## 常见问题

### 1) 探测报 `ENOENT`（找不到 ffprobe）

- 先安装 FFmpeg（含 ffprobe）
- 或在界面里填写 `ffprobe` 完整路径（例如 `/opt/homebrew/bin/ffprobe`）

### 2) 从哪里看错误

- 顶部浮层提示
- 实时进度状态
- FFmpeg 日志面板
- 启动应用的终端输出

## 项目结构

```text
src/
  renderer/index.html     # UI 结构
  renderer/styles.css     # UI 样式
  renderer/renderer.js    # 页面交互逻辑
  renderer/tauri-bridge.js# 前端到 Tauri 命令桥接
  core/job.js             # JS 侧命令逻辑与测试基准
src-tauri/
  src/main.rs             # Rust 后端命令、ffmpeg 执行、事件推送
  tauri.conf.json         # Tauri 应用与打包配置
  Cargo.toml              # Rust 依赖
.github/workflows/
  release.yml             # GitHub Release 三平台自动构建
scripts/
  build-macos-bundles.sh  # 本地 macOS app/dmg/zip 打包脚本
test/
  *.test.js               # Node 测试
```
