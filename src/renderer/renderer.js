const els = {
  ffmpegPath: document.querySelector('#ffmpegPath'),
  ffprobePath: document.querySelector('#ffprobePath'),
  mode: document.querySelector('#mode'),
  inputPath: document.querySelector('#inputPath'),
  outputPath: document.querySelector('#outputPath'),
  preset: document.querySelector('#preset'),
  crfField: document.querySelector('#crfField'),
  crf: document.querySelector('#crf'),
  startTime: document.querySelector('#startTime'),
  duration: document.querySelector('#duration'),
  fps: document.querySelector('#fps'),
  width: document.querySelector('#width'),
  gifFpsField: document.querySelector('#gifFpsField'),
  gifWidthField: document.querySelector('#gifWidthField'),
  durationHint: document.querySelector('#durationHint'),
  rawArgs: document.querySelector('#rawArgs'),
  presetFields: document.querySelector('#presetFields'),
  rawFields: document.querySelector('#rawFields'),
  pickInput: document.querySelector('#pickInput'),
  probeInput: document.querySelector('#probeInput'),
  pickOutput: document.querySelector('#pickOutput'),
  runJob: document.querySelector('#runJob'),
  stopJob: document.querySelector('#stopJob'),
  progressBar: document.querySelector('#progressBar'),
  status: document.querySelector('#status'),
  currentTime: document.querySelector('#currentTime'),
  logOutput: document.querySelector('#logOutput'),
  probeInfo: document.querySelector('#probeInfo'),
  templateButtons: Array.from(document.querySelectorAll('.chip[data-template]'))
};

function isRawMode() {
  return els.mode.value === 'raw';
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

async function refreshSuggestedOutput() {
  const inputPath = els.inputPath.value.trim();
  if (!inputPath) {
    return;
  }

  const suggestion = await window.ffmpegShell.suggestOutput({
    inputPath,
    preset: els.preset.value
  });

  if (!els.outputPath.value.trim()) {
    els.outputPath.value = suggestion;
  }
}

function updatePresetSpecificFields() {
  const preset = els.preset.value;
  const isVideo = preset === 'h264' || preset === 'h265';
  const isGif = preset === 'gif';

  els.crfField.style.display = isVideo ? 'grid' : 'none';
  els.gifFpsField.style.display = isGif ? 'grid' : 'none';
  els.gifWidthField.style.display = isGif ? 'grid' : 'none';
}

function updateModeFields() {
  const rawMode = isRawMode();
  els.presetFields.classList.toggle('hidden', rawMode);
  els.rawFields.classList.toggle('hidden', !rawMode);
  updatePresetSpecificFields();
}

function resetProgress() {
  els.progressBar.style.width = '0%';
  els.currentTime.textContent = '--:--';
}

function containsPlaceholder(rawArgs, placeholder) {
  return String(rawArgs || '').includes(placeholder);
}

function buildPayload() {
  const mode = els.mode.value;

  const payload = {
    mode,
    ffmpegPath: els.ffmpegPath.value.trim() || 'ffmpeg',
    ffprobePath: els.ffprobePath.value.trim() || 'ffprobe',
    inputPath: els.inputPath.value.trim(),
    outputPath: els.outputPath.value.trim()
  };

  if (mode === 'raw') {
    payload.rawArgs = els.rawArgs.value.trim();
    payload.duration = els.durationHint.value.trim();
    return payload;
  }

  payload.preset = els.preset.value;
  payload.startTime = els.startTime.value.trim();
  payload.duration = els.duration.value.trim();

  if (payload.preset === 'h264' || payload.preset === 'h265') {
    payload.crf = Number(els.crf.value || 23);
  }

  if (payload.preset === 'gif') {
    payload.fps = Number(els.fps.value || 12);
    payload.scaleWidth = Number(els.width.value || 480);
  }

  return payload;
}

function validatePayload(payload) {
  if (payload.mode === 'raw') {
    if (!payload.rawArgs) {
      throw new Error('原生命令模式需要填写 ffmpeg 参数');
    }

    if (containsPlaceholder(payload.rawArgs, '{input}') && !payload.inputPath) {
      throw new Error('原生命令参数包含 {input}，但输入文件为空');
    }

    if (containsPlaceholder(payload.rawArgs, '{output}') && !payload.outputPath) {
      throw new Error('原生命令参数包含 {output}，但输出文件为空');
    }

    return;
  }

  if (!payload.inputPath) {
    throw new Error('请先选择输入文件');
  }

  if (!payload.outputPath) {
    throw new Error('请先选择输出文件');
  }
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

els.pickInput.addEventListener('click', async () => {
  const chosen = await window.ffmpegShell.pickInput();
  if (!chosen) {
    return;
  }

  els.inputPath.value = chosen;
  await refreshSuggestedOutput();
});

els.pickOutput.addEventListener('click', async () => {
  const chosen = await window.ffmpegShell.pickOutput({
    inputPath: els.inputPath.value.trim(),
    preset: els.preset.value
  });

  if (chosen) {
    els.outputPath.value = chosen;
  }
});

els.probeInput.addEventListener('click', async () => {
  if (!els.inputPath.value.trim()) {
    setStatus('请先选择输入文件再探测', 'failed');
    return;
  }

  setStatus('正在探测输入文件...', 'running');

  try {
    const info = await window.ffmpegShell.probeInput({
      inputPath: els.inputPath.value.trim(),
      ffprobePath: els.ffprobePath.value.trim() || 'ffprobe'
    });

    els.probeInfo.textContent = renderProbeInfo(info);
    setStatus('探测完成', 'idle');
  } catch (error) {
    setStatus(error.message || '探测失败', 'failed');
  }
});

els.mode.addEventListener('change', async () => {
  updateModeFields();
  if (els.inputPath.value.trim() && !els.outputPath.value.trim()) {
    await refreshSuggestedOutput();
  }
});

els.preset.addEventListener('change', async () => {
  updatePresetSpecificFields();

  if (els.inputPath.value.trim()) {
    const suggestion = await window.ffmpegShell.suggestOutput({
      inputPath: els.inputPath.value.trim(),
      preset: els.preset.value
    });

    if (!isRawMode()) {
      els.outputPath.value = suggestion;
    }
  }
});

for (const button of els.templateButtons) {
  button.addEventListener('click', () => {
    const template = button.dataset.template || '';
    els.rawArgs.value = template;
    if (!els.outputPath.value.trim() && els.inputPath.value.trim()) {
      refreshSuggestedOutput();
    }
  });
}

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
    setStatus(state.mode === 'raw' ? '运行中（原生命令模式）' : '运行中', 'running');
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

updateModeFields();
resetProgress();
setBusy(false);
setStatus('空闲', 'idle');
