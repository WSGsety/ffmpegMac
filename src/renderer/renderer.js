const els = {
  ffmpegPath: document.querySelector('#ffmpegPath'),
  ffprobePath: document.querySelector('#ffprobePath'),
  inputPath: document.querySelector('#inputPath'),
  outputPath: document.querySelector('#outputPath'),
  quickProfileGrid: document.querySelector('#quickProfileGrid'),
  quickProfileHint: document.querySelector('#quickProfileHint'),
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
  probeInfo: document.querySelector('#probeInfo'),
  floatingStack: document.querySelector('#floatingStack'),
  activityBanner: document.querySelector('#activityBanner'),
  activityText: document.querySelector('#activityText')
};

let lastSuggestedOutput = '';
let toastIdSeed = 0;
let currentStateStatus = 'idle';
let activeQuickProfile = '';
let applyingQuickProfile = false;

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

const QUICK_PROFILES = {
  social: {
    label: '社媒竖屏',
    hint: '已套用社媒竖屏：优先兼容与播放速度，可在模块里继续微调。',
    preset: 'h264',
    overrides: {
      speedPreset: 'fast',
      crf: '22',
      width: '1080',
      height: '1920',
      fps: '30',
      pixelFormat: 'yuv420p',
      movflagsFaststart: true,
      format: 'mp4',
      audioBitrate: '160k',
      disableVideo: false,
      disableAudio: false
    }
  },
  archive: {
    label: '压缩归档',
    hint: '已套用压缩归档：更高压缩比，适合存储与备份。',
    preset: 'h265',
    overrides: {
      speedPreset: 'slow',
      crf: '30',
      width: '',
      height: '',
      fps: '',
      pixelFormat: 'yuv420p',
      movflagsFaststart: false,
      format: 'mp4',
      audioBitrate: '128k',
      disableVideo: false,
      disableAudio: false
    }
  },
  audio: {
    label: '只导出音频',
    hint: '已套用音频提取：自动禁用视频轨并输出 MP3。',
    preset: 'mp3',
    overrides: {
      format: 'mp3',
      map: '',
      width: '',
      height: '',
      fps: '',
      pixelFormat: '',
      disableVideo: true,
      disableAudio: false,
      movflagsFaststart: false
    }
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

function showActivity(text) {
  if (!els.activityBanner || !els.activityText) {
    return;
  }

  els.activityText.textContent = text;
  els.activityBanner.classList.add('active');
}

function hideActivity() {
  if (!els.activityBanner) {
    return;
  }

  els.activityBanner.classList.remove('active');
}

function removeToast(node) {
  if (!(node instanceof HTMLElement) || !node.parentNode) {
    return;
  }

  node.classList.add('is-closing');
  setTimeout(() => {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }, 180);
}

function showToast(message, kind = 'info', options = {}) {
  if (!els.floatingStack) {
    return;
  }

  const text = textValue(message);
  if (!text) {
    return;
  }

  const toast = document.createElement('article');
  toast.className = `toast ${kind}`;
  toast.dataset.toastId = String(++toastIdSeed);

  const title = document.createElement('div');
  title.className = 'toast-title';
  title.textContent =
    options.title || (kind === 'error' ? '错误' : kind === 'success' ? '完成' : kind === 'warn' ? '注意' : '提示');

  const body = document.createElement('div');
  body.className = 'toast-message';
  body.textContent = text;

  toast.append(title, body);
  els.floatingStack.append(toast);

  const duration = Number.isFinite(options.duration) ? Number(options.duration) : kind === 'error' ? 5600 : 2600;
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
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

function applyFieldOverrides(overrides = {}) {
  for (const [fieldKey, fieldValue] of Object.entries(overrides)) {
    const field = els[fieldKey];
    if (!field) {
      continue;
    }

    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(fieldValue);
      continue;
    }

    field.value = textValue(fieldValue);
  }
}

function setQuickProfileState(profileKey = '') {
  activeQuickProfile = QUICK_PROFILES[profileKey] ? profileKey : '';

  if (els.quickProfileGrid) {
    const cards = Array.from(els.quickProfileGrid.querySelectorAll('.quick-profile-card'));
    for (const card of cards) {
      const key = card.getAttribute('data-profile') || '';
      card.classList.toggle('active', key === activeQuickProfile);
      card.setAttribute('aria-pressed', key === activeQuickProfile ? 'true' : 'false');
    }
  }

  if (!els.quickProfileHint) {
    return;
  }

  if (!activeQuickProfile) {
    els.quickProfileHint.textContent = '未套用快速场景，当前按模板默认值。';
    return;
  }

  els.quickProfileHint.textContent = QUICK_PROFILES[activeQuickProfile].hint;
}

function clearQuickProfileFromManualInput() {
  if (applyingQuickProfile || !activeQuickProfile) {
    return;
  }

  setQuickProfileState('');
}

async function applyQuickProfile(profileKey) {
  const profile = QUICK_PROFILES[profileKey];
  if (!profile) {
    return;
  }

  applyingQuickProfile = true;

  try {
    els.preset.value = profile.preset;
    applyPresetDefaults(profile.preset);
    applyFieldOverrides(profile.overrides);
    setQuickProfileState(profileKey);
    await refreshSuggestedOutput();
    scheduleCommandPreview();
    showToast(`已套用“${profile.label}”默认参数。`, 'success', { title: '快速场景' });
  } finally {
    applyingQuickProfile = false;
  }
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

if (els.quickProfileGrid) {
  els.quickProfileGrid.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const card = target.closest('[data-profile]');
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const profileKey = card.getAttribute('data-profile') || '';
    await applyQuickProfile(profileKey);
  });
}

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
  input.addEventListener('input', () => {
    clearQuickProfileFromManualInput();
    scheduleCommandPreview();
  });
  input.addEventListener('change', () => {
    clearQuickProfileFromManualInput();
    scheduleCommandPreview();
  });
}

els.preset.addEventListener('change', async () => {
  clearQuickProfileFromManualInput();
  applyPresetDefaults(els.preset.value);
  await refreshSuggestedOutput();
  scheduleCommandPreview();
});

els.inputPath.addEventListener('change', async () => {
  await refreshSuggestedOutput();
  scheduleCommandPreview();
});

els.pickInput.addEventListener('click', async () => {
  try {
    const chosen = await window.ffmpegShell.pickInput();
    if (!chosen) {
      return;
    }

    els.inputPath.value = chosen;
    await refreshSuggestedOutput();
    scheduleCommandPreview();
    showToast('输入文件已选择。', 'success', { title: '输入文件' });
  } catch (error) {
    const message = error?.message || '打开输入文件选择器失败';
    setStatus(message, 'failed');
    showToast(message, 'error', { title: '输入文件' });
  }
});

els.pickOutput.addEventListener('click', async () => {
  try {
    const chosen = await window.ffmpegShell.pickOutput({
      inputPath: textValue(els.inputPath.value),
      preset: els.preset.value
    });

    if (chosen) {
      els.outputPath.value = chosen;
      scheduleCommandPreview();
      showToast('输出文件路径已更新。', 'success', { title: '输出文件' });
    }
  } catch (error) {
    const message = error?.message || '打开输出文件选择器失败';
    setStatus(message, 'failed');
    showToast(message, 'error', { title: '输出文件' });
  }
});

els.probeInput.addEventListener('click', async () => {
  if (!textValue(els.inputPath.value)) {
    const message = '请先选择输入文件再探测';
    setStatus(message, 'failed');
    showToast(message, 'warn', { title: '媒体探测' });
    return;
  }

  setStatus('正在探测输入文件...', 'running');
  showActivity('正在探测媒体信息...');
  showToast('正在探测输入媒体，请稍候。', 'info', { title: '媒体探测', duration: 1800 });

  try {
    const info = await window.ffmpegShell.probeInput({
      inputPath: textValue(els.inputPath.value),
      ffprobePath: textValue(els.ffprobePath.value) || 'ffprobe'
    });

    els.probeInfo.textContent = renderProbeInfo(info);
    setStatus('探测完成', 'completed');
    showToast('探测完成，媒体信息已更新。', 'success', { title: '媒体探测' });
  } catch (error) {
    const message = error?.message || '探测失败';
    setStatus(message, 'failed');
    showToast(message, 'error', { title: '媒体探测', duration: 6400 });
  } finally {
    hideActivity();
  }
});

els.runJob.addEventListener('click', async () => {
  const payload = buildPayload();

  try {
    validatePayload(payload);
  } catch (error) {
    const message = error?.message || '参数配置无效';
    setStatus(message, 'failed');
    showToast(message, 'warn', { title: '参数校验' });
    return;
  }

  resetProgress();
  els.logOutput.textContent = '';

  try {
    await window.ffmpegShell.run(payload);
  } catch (error) {
    const message = error?.message || '无法启动 ffmpeg';
    setStatus(message, 'failed');
    hideActivity();
    showToast(message, 'error', { title: '任务启动', duration: 6400 });
  }
});

els.stopJob.addEventListener('click', async () => {
  await window.ffmpegShell.stop();
  showToast('已发送停止请求。', 'info', { title: '任务控制' });
});

window.ffmpegShell.onState((state) => {
  if (state.status === 'running') {
    setBusy(true);
    if (currentStateStatus !== 'running') {
      showActivity('FFmpeg 正在执行，请稍候...');
      showToast('任务已启动，正在执行中。', 'info', { title: '任务状态', duration: 1800 });
    }
    currentStateStatus = 'running';

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
    hideActivity();
    currentStateStatus = 'completed';
    setStatus('已完成', 'completed');
    showToast('转码任务已完成。', 'success', { title: '任务状态' });
    return;
  }

  if (state.status === 'stopped') {
    setBusy(false);
    hideActivity();
    currentStateStatus = 'stopped';
    setStatus('已停止', 'stopped');
    showToast('任务已停止。', 'warn', { title: '任务状态' });
    return;
  }

  if (state.status === 'failed') {
    setBusy(false);
    hideActivity();
    currentStateStatus = 'failed';
    const message = state.message ? `失败: ${state.message}` : '失败';
    setStatus(message, 'failed');
    showToast(message, 'error', { title: '任务状态', duration: 6800 });
    return;
  }

  setBusy(false);
  hideActivity();
  currentStateStatus = 'idle';
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
setQuickProfileState('');
resetProgress();
setBusy(false);
setStatus('空闲', 'idle');
setPreviewStatus('参数变化后自动刷新。', 'idle');
refreshCommandPreview();
