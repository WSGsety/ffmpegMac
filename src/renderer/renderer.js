const els = {
  ffmpegPath: document.querySelector('#ffmpegPath'),
  ffprobePath: document.querySelector('#ffprobePath'),
  inputPath: document.querySelector('#inputPath'),
  outputPath: document.querySelector('#outputPath'),
  preset: document.querySelector('#preset'),
  startTime: document.querySelector('#startTime'),
  duration: document.querySelector('#duration'),
  overwrite: document.querySelector('#overwrite'),
  crf: document.querySelector('#crf'),
  speedPreset: document.querySelector('#speedPreset'),
  videoCodec: document.querySelector('#videoCodec'),
  audioCodec: document.querySelector('#audioCodec'),
  pixelFormat: document.querySelector('#pixelFormat'),
  videoBitrate: document.querySelector('#videoBitrate'),
  audioBitrate: document.querySelector('#audioBitrate'),
  audioQuality: document.querySelector('#audioQuality'),
  fps: document.querySelector('#fps'),
  width: document.querySelector('#width'),
  height: document.querySelector('#height'),
  sampleRate: document.querySelector('#sampleRate'),
  channels: document.querySelector('#channels'),
  threads: document.querySelector('#threads'),
  format: document.querySelector('#format'),
  map: document.querySelector('#map'),
  loop: document.querySelector('#loop'),
  videoFilter: document.querySelector('#videoFilter'),
  movflagsFaststart: document.querySelector('#movflagsFaststart'),
  disableVideo: document.querySelector('#disableVideo'),
  disableAudio: document.querySelector('#disableAudio'),
  addExtraArg: document.querySelector('#addExtraArg'),
  extraArgsRows: document.querySelector('#extraArgsRows'),
  commandPreview: document.querySelector('#commandPreview'),
  previewStatus: document.querySelector('#previewStatus'),
  pickInput: document.querySelector('#pickInput'),
  probeInput: document.querySelector('#probeInput'),
  pickOutput: document.querySelector('#pickOutput'),
  runJob: document.querySelector('#runJob'),
  stopJob: document.querySelector('#stopJob'),
  progressBar: document.querySelector('#progressBar'),
  status: document.querySelector('#status'),
  currentTime: document.querySelector('#currentTime'),
  logOutput: document.querySelector('#logOutput'),
  probeInfo: document.querySelector('#probeInfo')
};

let lastSuggestedOutput = '';

const PRESET_DEFAULTS = {
  h264: {
    crf: '23',
    speedPreset: 'medium',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    audioBitrate: '192k',
    audioQuality: '',
    disableVideo: false,
    disableAudio: false,
    fps: '',
    width: '',
    height: '',
    loop: ''
  },
  h265: {
    crf: '28',
    speedPreset: 'medium',
    videoCodec: 'libx265',
    audioCodec: 'aac',
    audioBitrate: '160k',
    audioQuality: '',
    disableVideo: false,
    disableAudio: false,
    fps: '',
    width: '',
    height: '',
    loop: ''
  },
  mp3: {
    crf: '',
    speedPreset: '',
    videoCodec: 'none',
    audioCodec: 'libmp3lame',
    audioBitrate: '',
    audioQuality: '2',
    disableVideo: true,
    disableAudio: false,
    fps: '',
    width: '',
    height: '',
    loop: ''
  },
  gif: {
    crf: '',
    speedPreset: '',
    videoCodec: '',
    audioCodec: 'none',
    audioBitrate: '',
    audioQuality: '',
    disableVideo: false,
    disableAudio: true,
    fps: '12',
    width: '480',
    height: '',
    loop: '0'
  }
};

function textValue(value) {
  return String(value ?? '').trim();
}

function optionalNumber(value) {
  const text = textValue(value);
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

function setBusy(running) {
  els.runJob.disabled = running;
  els.stopJob.disabled = !running;
  els.probeInput.disabled = running;
}

function setStatus(text, kind = 'idle') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

function setPreviewStatus(text, kind = 'idle') {
  els.previewStatus.textContent = text;
  els.previewStatus.className = `preview-status ${kind}`;
}

function formatSeconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--:--';
  }

  const total = Math.max(0, Math.floor(Number(value)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '未知';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function appendLog(line) {
  const all = `${els.logOutput.textContent}${line}\n`;
  const kept = all.split('\n').slice(-550).join('\n');
  els.logOutput.textContent = kept;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function resetProgress() {
  els.progressBar.style.width = '0%';
  els.currentTime.textContent = '--:--';
}

function renderProbeInfo(data) {
  const lines = [
    `文件: ${data.file || '未知'}`,
    `格式: ${data.formatName || '未知'}`,
    `时长: ${typeof data.durationSec === 'number' ? `${data.durationSec.toFixed(2)} 秒` : '未知'}`,
    `大小: ${formatBytes(data.sizeBytes)}`,
    `码率: ${Number.isFinite(data.bitRate) ? `${Math.round(data.bitRate / 1000)} kb/s` : '未知'}`,
    '',
    '流信息:'
  ];

  if (!Array.isArray(data.streams) || data.streams.length === 0) {
    lines.push('  （无）');
    return lines.join('\n');
  }

  for (const stream of data.streams) {
    const parts = [`#${stream.index}`, stream.codecType || '未知', stream.codecName || '未知'];

    if (stream.width && stream.height) {
      parts.push(`${stream.width}x${stream.height}`);
    }

    if (stream.sampleRate) {
      parts.push(`${stream.sampleRate} Hz`);
    }

    if (stream.channels) {
      parts.push(`${stream.channels} 声道`);
    }

    if (stream.bitRate) {
      parts.push(`${Math.round(Number(stream.bitRate) / 1000)} kb/s`);
    }

    lines.push(`  - ${parts.join(' | ')}`);
  }

  return lines.join('\n');
}

function createExtraArgRow(initial = {}) {
  const row = document.createElement('div');
  row.className = 'extra-row';

  const keyInput = document.createElement('input');
  keyInput.className = 'extra-key';
  keyInput.type = 'text';
  keyInput.placeholder = '参数名，例如 -metadata';
  keyInput.value = textValue(initial.key);

  const valueInput = document.createElement('input');
  valueInput.className = 'extra-value';
  valueInput.type = 'text';
  valueInput.placeholder = '参数值，可选';
  valueInput.value = textValue(initial.value);

  const removeButton = document.createElement('button');
  removeButton.className = 'btn btn-ghost';
  removeButton.type = 'button';
  removeButton.dataset.action = 'remove-extra-arg';
  removeButton.textContent = '移除';

  row.append(keyInput, valueInput, removeButton);
  return row;
}

function collectExtraArgs() {
  const rows = Array.from(els.extraArgsRows.querySelectorAll('.extra-row'));
  const args = [];

  for (const row of rows) {
    const key = textValue(row.querySelector('.extra-key')?.value);
    const value = textValue(row.querySelector('.extra-value')?.value);

    if (!key) {
      continue;
    }

    args.push({ key, value });
  }

  return args;
}

function buildPayload() {
  return {
    mode: 'visual',
    ffmpegPath: textValue(els.ffmpegPath.value) || 'ffmpeg',
    ffprobePath: textValue(els.ffprobePath.value) || 'ffprobe',
    inputPath: textValue(els.inputPath.value),
    outputPath: textValue(els.outputPath.value),
    preset: els.preset.value,
    startTime: textValue(els.startTime.value),
    duration: textValue(els.duration.value),
    overwrite: Boolean(els.overwrite.checked),
    crf: optionalNumber(els.crf.value),
    speedPreset: els.speedPreset.value,
    videoCodec: els.videoCodec.value,
    audioCodec: els.audioCodec.value,
    pixelFormat: textValue(els.pixelFormat.value),
    videoBitrate: textValue(els.videoBitrate.value),
    audioBitrate: textValue(els.audioBitrate.value),
    audioQuality: textValue(els.audioQuality.value),
    fps: optionalNumber(els.fps.value),
    scaleWidth: optionalNumber(els.width.value),
    scaleHeight: optionalNumber(els.height.value),
    sampleRate: optionalNumber(els.sampleRate.value),
    channels: optionalNumber(els.channels.value),
    threads: optionalNumber(els.threads.value),
    format: textValue(els.format.value),
    map: textValue(els.map.value),
    loop: textValue(els.loop.value),
    videoFilter: textValue(els.videoFilter.value),
    movflagsFaststart: Boolean(els.movflagsFaststart.checked),
    disableVideo: Boolean(els.disableVideo.checked),
    disableAudio: Boolean(els.disableAudio.checked),
    extraArgs: collectExtraArgs()
  };
}

function validatePayload(payload) {
  if (!payload.inputPath) {
    throw new Error('请先选择输入文件');
  }

  if (!payload.outputPath) {
    throw new Error('请先选择输出文件');
  }
}

async function refreshSuggestedOutput() {
  const inputPath = textValue(els.inputPath.value);
  if (!inputPath) {
    return;
  }

  const suggestion = await window.ffmpegShell.suggestOutput({
    inputPath,
    preset: els.preset.value
  });

  const currentOutput = textValue(els.outputPath.value);
  if (!currentOutput || currentOutput === lastSuggestedOutput) {
    els.outputPath.value = suggestion;
  }

  lastSuggestedOutput = suggestion;
}

function applyPresetDefaults(preset) {
  const defaults = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.h264;

  els.crf.value = defaults.crf;
  els.speedPreset.value = defaults.speedPreset;
  els.videoCodec.value = defaults.videoCodec;
  els.audioCodec.value = defaults.audioCodec;
  els.audioBitrate.value = defaults.audioBitrate;
  els.audioQuality.value = defaults.audioQuality;
  els.disableVideo.checked = defaults.disableVideo;
  els.disableAudio.checked = defaults.disableAudio;
  els.fps.value = defaults.fps;
  els.width.value = defaults.width;
  els.height.value = defaults.height;
  els.loop.value = defaults.loop;
}

async function refreshCommandPreview() {
  const payload = buildPayload();

  try {
    const preview = await window.ffmpegShell.preview(payload);
    els.commandPreview.textContent = preview.command;
    setPreviewStatus('预览已更新，执行时将使用该命令。', 'ok');
  } catch (error) {
    const message = error?.message || '参数配置有误，无法生成命令。';
    setPreviewStatus(message, 'warn');
    els.commandPreview.textContent = 'ffmpeg ...';
  }
}

const scheduleCommandPreview = debounce(() => {
  refreshCommandPreview();
}, 180);

els.addExtraArg.addEventListener('click', () => {
  els.extraArgsRows.append(createExtraArgRow());
  scheduleCommandPreview();
});

els.extraArgsRows.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action !== 'remove-extra-arg') {
    return;
  }

  const row = target.closest('.extra-row');
  if (row) {
    row.remove();
    scheduleCommandPreview();
  }
});

els.extraArgsRows.addEventListener('input', () => {
  scheduleCommandPreview();
});

const watchedInputs = [
  els.ffmpegPath,
  els.ffprobePath,
  els.inputPath,
  els.outputPath,
  els.startTime,
  els.duration,
  els.crf,
  els.speedPreset,
  els.videoCodec,
  els.audioCodec,
  els.pixelFormat,
  els.videoBitrate,
  els.audioBitrate,
  els.audioQuality,
  els.fps,
  els.width,
  els.height,
  els.sampleRate,
  els.channels,
  els.threads,
  els.format,
  els.map,
  els.loop,
  els.videoFilter,
  els.overwrite,
  els.movflagsFaststart,
  els.disableVideo,
  els.disableAudio
];

for (const input of watchedInputs) {
  input.addEventListener('input', scheduleCommandPreview);
  input.addEventListener('change', scheduleCommandPreview);
}

els.preset.addEventListener('change', async () => {
  applyPresetDefaults(els.preset.value);
  await refreshSuggestedOutput();
  scheduleCommandPreview();
});

els.inputPath.addEventListener('change', async () => {
  await refreshSuggestedOutput();
  scheduleCommandPreview();
});

els.pickInput.addEventListener('click', async () => {
  const chosen = await window.ffmpegShell.pickInput();
  if (!chosen) {
    return;
  }

  els.inputPath.value = chosen;
  await refreshSuggestedOutput();
  scheduleCommandPreview();
});

els.pickOutput.addEventListener('click', async () => {
  const chosen = await window.ffmpegShell.pickOutput({
    inputPath: textValue(els.inputPath.value),
    preset: els.preset.value
  });

  if (chosen) {
    els.outputPath.value = chosen;
    scheduleCommandPreview();
  }
});

els.probeInput.addEventListener('click', async () => {
  if (!textValue(els.inputPath.value)) {
    setStatus('请先选择输入文件再探测', 'failed');
    return;
  }

  setStatus('正在探测输入文件...', 'running');

  try {
    const info = await window.ffmpegShell.probeInput({
      inputPath: textValue(els.inputPath.value),
      ffprobePath: textValue(els.ffprobePath.value) || 'ffprobe'
    });

    els.probeInfo.textContent = renderProbeInfo(info);
    setStatus('探测完成', 'idle');
  } catch (error) {
    setStatus(error.message || '探测失败', 'failed');
  }
});

els.runJob.addEventListener('click', async () => {
  const payload = buildPayload();

  try {
    validatePayload(payload);
  } catch (error) {
    setStatus(error.message || '参数配置无效', 'failed');
    return;
  }

  resetProgress();
  els.logOutput.textContent = '';

  try {
    await window.ffmpegShell.run(payload);
  } catch (error) {
    setStatus(error.message || '无法启动 ffmpeg', 'failed');
  }
});

els.stopJob.addEventListener('click', async () => {
  await window.ffmpegShell.stop();
});

window.ffmpegShell.onState((state) => {
  if (state.status === 'running') {
    setBusy(true);

    if (state.mode === 'visual') {
      setStatus('运行中（可视化配置）', 'running');
    } else if (state.mode === 'raw') {
      setStatus('运行中（原生命令模式）', 'running');
    } else {
      setStatus('运行中', 'running');
    }

    appendLog(`$ ${state.args}`);
    return;
  }

  if (state.status === 'completed') {
    setBusy(false);
    setStatus('已完成', 'completed');
    return;
  }

  if (state.status === 'stopped') {
    setBusy(false);
    setStatus('已停止', 'stopped');
    return;
  }

  if (state.status === 'failed') {
    setBusy(false);
    setStatus(state.message ? `失败: ${state.message}` : '失败', 'failed');
    return;
  }

  setBusy(false);
  setStatus('空闲', 'idle');
});

window.ffmpegShell.onProgress((data) => {
  if (typeof data.currentTimeSec === 'number') {
    els.currentTime.textContent = formatSeconds(data.currentTimeSec);
  }

  if (typeof data.ratio === 'number') {
    const percentage = Math.max(0, Math.min(100, Math.round(data.ratio * 100)));
    els.progressBar.style.width = `${percentage}%`;
  }
});

window.ffmpegShell.onLog((line) => {
  appendLog(line);
});

els.extraArgsRows.append(createExtraArgRow());
applyPresetDefaults(els.preset.value);
resetProgress();
setBusy(false);
setStatus('空闲', 'idle');
setPreviewStatus('参数变化后自动刷新。', 'idle');
refreshCommandPreview();
