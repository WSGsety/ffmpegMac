# FFmpeg 图形工具

一个面向 macOS 的 FFmpeg 桌面工具（Electron 实现），支持“预设模式”和“原生命令模式”两种操作方式。

## 功能

- 选择输入/输出文件
- 内置 `ffprobe` 探测（容器/时长/码率/流信息）
- 4 个常用预设
  - `H.264 MP4`（通用）
  - `H.265 MP4`（更小体积）
  - `抽取 MP3`
  - `转 GIF`
- `原生命令模式`：直接输入任意 ffmpeg 参数（支持 `{input}`、`{output}` 占位符）
- 可选裁剪参数：开始时间、时长
- 实时日志与进度显示
- 一键停止当前任务

## 环境要求

- macOS
- Node.js 18+
- 已安装 `ffmpeg` 和 `ffprobe`

安装 ffmpeg（Homebrew）：

```bash
brew install ffmpeg
```

## 启动

```bash
npm install
npm run dev
```

> 如果 `ffmpeg` / `ffprobe` 不在 `PATH`，请在界面里填写完整路径，例如 `/opt/homebrew/bin/ffmpeg`、`/opt/homebrew/bin/ffprobe`。

## 原生命令模式说明

切到 `原生命令模式` 后，你可以写任意 ffmpeg 参数组合，例如：

```bash
-y -i {input} -map 0:v -c:v libsvtav1 -crf 32 -preset 6 -c:a libopus -b:a 128k {output}
```

说明：
- 这是完整 ffmpeg 参数面，不做白名单限制
- 若使用 `{input}` / `{output}`，界面里需要填写对应路径
- 不用占位符也可以，直接写完整参数即可

## 测试

```bash
npm test
```

当前测试覆盖核心逻辑：

- 预设命令参数拼装
- 原生命令参数分词与构建
- 进度行解析
- 默认输出路径推导

## 项目结构

```text
src/
  core/job.js         # ffmpeg 参数构建、进度解析、输出路径建议
  main/main.js        # Electron 主进程 + IPC + ffmpeg 子进程执行
  main/preload.js     # 安全桥接 API
  renderer/index.html # UI 页面
  renderer/styles.css # 样式
  renderer/renderer.js# 页面交互逻辑
test/
  job.test.js         # 核心逻辑测试
```

## 后续可扩展

- 任务队列与批处理
- 自定义 ffmpeg 参数模板
- 历史任务记录
- 输出预览（播放/打开目录）
