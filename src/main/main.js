import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFfmpegArgs,
  formatSpawnError,
  formatCommandPreview,
  parseProgress,
  parseTimeInput,
  resolveExecutablePath,
  suggestOutputPath
} from '../core/job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let activeTask = null;

function sendState(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ffmpeg:state', payload);
}

function sendLog(line) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ffmpeg:log', line);
}

function sendProgress(progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ffmpeg:progress', progress);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 880,
    minWidth: 960,
    minHeight: 720,
    title: 'FFmpeg 图形工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function cleanupActiveTask() {
  activeTask = null;
}

function runCommand(binaryPath, args, options = {}) {
  const toolName = options.toolName === 'ffprobe' ? 'ffprobe' : 'ffmpeg';
  const configuredPath = options.configuredPath || binaryPath;

  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.once('error', (error) => {
      reject(new Error(formatSpawnError(error, toolName, configuredPath)));
    });

    proc.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${binaryPath} 退出码 ${code}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function probeMedia(ffprobePath, inputPath) {
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath];
  const result = await runCommand(ffprobePath, args, {
    toolName: 'ffprobe',
    configuredPath: ffprobePath
  });

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error('ffprobe 返回了无效的 JSON 输出');
  }

  const durationSec = Number(parsed?.format?.duration);
  const sizeBytes = Number(parsed?.format?.size);
  const bitRate = Number(parsed?.format?.bit_rate);

  return {
    file: inputPath,
    formatName: parsed?.format?.format_name ?? '',
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
    streams: Array.isArray(parsed?.streams)
      ? parsed.streams.map((stream) => ({
          index: stream.index,
          codecType: stream.codec_type,
          codecName: stream.codec_name,
          width: stream.width,
          height: stream.height,
          sampleRate: stream.sample_rate,
          channels: stream.channels,
          bitRate: stream.bit_rate
        }))
      : []
  };
}

async function resolveDurationSec(payload) {
  const manualDuration = parseTimeInput(payload?.duration);
  if (manualDuration && manualDuration > 0) {
    return manualDuration;
  }

  if (!payload?.inputPath) {
    return null;
  }

  const ffprobePath = resolveExecutablePath(payload?.ffprobePath || 'ffprobe', 'ffprobe', (candidate) => {
    return fs.existsSync(candidate);
  });

  try {
    const metadata = await probeMedia(ffprobePath, payload.inputPath);
    return metadata.durationSec;
  } catch {
    return null;
  }
}

ipcMain.handle('dialog:pick-input', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择源媒体文件',
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  } catch (error) {
    throw new Error(`打开输入文件选择器失败: ${error?.message || 'unknown error'}`);
  }
});

ipcMain.handle('dialog:pick-output', async (_event, payload) => {
  try {
    const inputPath = payload?.inputPath ?? '';
    const preset = payload?.preset ?? 'h264';
    const suggested = suggestOutputPath(inputPath, preset);
    const options = {
      title: '选择输出文件'
    };

    if (suggested) {
      options.defaultPath = suggested;
    }

    const result = await dialog.showSaveDialog(mainWindow, options);

    if (result.canceled) {
      return null;
    }

    return result.filePath ?? null;
  } catch (error) {
    throw new Error(`打开输出文件选择器失败: ${error?.message || 'unknown error'}`);
  }
});

ipcMain.handle('ffmpeg:suggest-output', async (_event, payload) => {
  return suggestOutputPath(payload?.inputPath ?? '', payload?.preset ?? 'h264');
});

ipcMain.handle('ffmpeg:probe-input', async (_event, payload) => {
  const inputPath = payload?.inputPath?.trim();
  if (!inputPath) {
    throw new Error('缺少 inputPath 参数');
  }

  const ffprobePath = resolveExecutablePath(payload?.ffprobePath || 'ffprobe', 'ffprobe', (candidate) => {
    return fs.existsSync(candidate);
  });
  return probeMedia(ffprobePath, inputPath);
});

ipcMain.handle('ffmpeg:preview', async (_event, payload) => {
  const ffmpegPath = (payload?.ffmpegPath || 'ffmpeg').trim() || 'ffmpeg';
  const previewPayload = {
    ...(payload ?? {}),
    inputPath: payload?.inputPath?.trim() || '{input}',
    outputPath: payload?.outputPath?.trim() || '{output}'
  };
  const args = buildFfmpegArgs(previewPayload);

  return {
    args,
    command: formatCommandPreview(ffmpegPath, args)
  };
});

ipcMain.handle('ffmpeg:run', async (_event, payload) => {
  if (activeTask) {
    throw new Error('当前已有任务在运行，请先停止后再启动新任务。');
  }

  const ffmpegPath = resolveExecutablePath(payload?.ffmpegPath || 'ffmpeg', 'ffmpeg', (candidate) => {
    return fs.existsSync(candidate);
  });
  const args = buildFfmpegArgs(payload ?? {});
  const durationSec = await resolveDurationSec(payload ?? {});
  const mode = payload?.mode === 'raw' ? 'raw' : payload?.mode === 'visual' ? 'visual' : 'preset';

  sendState({
    status: 'running',
    mode,
    args: formatCommandPreview(ffmpegPath, args)
  });

  const proc = spawn(ffmpegPath, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  activeTask = {
    proc,
    stderrBuffer: '',
    durationSec
  };

  proc.once('error', (error) => {
    sendState({
      status: 'failed',
      message: formatSpawnError(error, 'ffmpeg', ffmpegPath)
    });
    cleanupActiveTask();
  });

  proc.stderr.on('data', (chunk) => {
    if (!activeTask || activeTask.proc !== proc) {
      return;
    }

    activeTask.stderrBuffer += chunk.toString();
    const lines = activeTask.stderrBuffer.split(/\r?\n/);
    activeTask.stderrBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      sendLog(line);
      const progress = parseProgress(line, activeTask.durationSec);
      if (progress) {
        sendProgress(progress);
      }
    }
  });

  proc.once('close', (code, signal) => {
    if (!activeTask || activeTask.proc !== proc) {
      return;
    }

    if (signal === 'SIGTERM') {
      sendState({ status: 'stopped' });
      cleanupActiveTask();
      return;
    }

    if (code === 0) {
      sendProgress({ ratio: 1, currentTimeSec: activeTask?.durationSec ?? null });
      sendState({ status: 'completed' });
      cleanupActiveTask();
      return;
    }

    sendState({ status: 'failed', message: `ffmpeg 退出码 ${code}` });
    cleanupActiveTask();
  });

  return true;
});

ipcMain.handle('ffmpeg:stop', async () => {
  if (!activeTask) {
    return false;
  }

  activeTask.proc.kill('SIGTERM');
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
