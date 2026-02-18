import path from 'node:path';

const INPUT_PLACEHOLDER = '{input}';
const OUTPUT_PLACEHOLDER = '{output}';

const PRESET_OUTPUT_EXT = {
  h264: '.mp4',
  h265: '.mp4',
  mp3: '.mp3',
  gif: '.gif'
};

const VISUAL_PRESET_DEFAULTS = {
  h264: {
    videoCodec: 'libx264',
    speedPreset: 'medium',
    crf: 23,
    audioCodec: 'aac',
    audioBitrate: '192k'
  },
  h265: {
    videoCodec: 'libx265',
    speedPreset: 'medium',
    crf: 28,
    audioCodec: 'aac',
    audioBitrate: '160k'
  },
  mp3: {
    disableVideo: true,
    audioCodec: 'libmp3lame',
    audioQuality: '2'
  },
  gif: {
    disableAudio: true,
    fps: 12,
    scaleWidth: 480,
    loop: '0'
  }
};

const SAFE_PREVIEW_ARG_RE = /^[A-Za-z0-9_./:=+,-]+$/;

function pushTrimArgs(args, startTime, duration) {
  if (startTime) {
    args.push('-ss', String(startTime));
  }

  if (duration) {
    args.push('-t', String(duration));
  }
}

function buildPresetArgs(job) {
  const {
    preset,
    inputPath,
    outputPath,
    startTime,
    duration,
    crf = 23,
    fps = 12,
    scaleWidth = 480
  } = job;

  if (!inputPath || !outputPath) {
    throw new Error('inputPath and outputPath are required');
  }

  const args = ['-y'];
  pushTrimArgs(args, startTime, duration);
  args.push('-i', inputPath);

  switch (preset) {
    case 'h264':
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        String(crf),
        '-c:a',
        'aac',
        '-b:a',
        '192k'
      );
      break;

    case 'h265':
      args.push(
        '-c:v',
        'libx265',
        '-preset',
        'medium',
        '-crf',
        String(crf),
        '-c:a',
        'aac',
        '-b:a',
        '160k'
      );
      break;

    case 'mp3':
      args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
      break;

    case 'gif':
      args.push(
        '-vf',
        `fps=${Number(fps)},scale=${Number(scaleWidth)}:-1:flags=lanczos`,
        '-loop',
        '0'
      );
      break;

    default:
      throw new Error(`Unsupported preset: ${preset}`);
  }

  args.push(outputPath);
  return args;
}

function hasValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  return String(value).trim() !== '';
}

function textValue(value) {
  if (!hasValue(value)) {
    return '';
  }

  return String(value).trim();
}

function numberValue(value) {
  if (!hasValue(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pushOptionIfValue(args, key, value) {
  const text = textValue(value);
  if (!text) {
    return;
  }

  args.push(key, text);
}

function roundPositiveNumberOrNull(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export function splitCommandLine(commandLine) {
  const text = String(commandLine ?? '');
  const tokens = [];

  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  function pushCurrent() {
    if (current.length === 0) {
      return;
    }

    tokens.push(current);
    current = '';
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  if (escapeNext) {
    throw new Error('Invalid command line: trailing escape');
  }

  if (inSingleQuote || inDoubleQuote) {
    throw new Error('Invalid command line: unclosed quote');
  }

  pushCurrent();
  return tokens;
}

function buildRawArgs(job) {
  const rawArgsText = String(job.rawArgs ?? '').trim();
  if (!rawArgsText) {
    throw new Error('rawArgs is required for raw mode');
  }

  const tokens = splitCommandLine(rawArgsText);
  const needsInput = tokens.some((token) => token.includes(INPUT_PLACEHOLDER));
  const needsOutput = tokens.some((token) => token.includes(OUTPUT_PLACEHOLDER));

  if (needsInput && !job.inputPath) {
    throw new Error('inputPath is required because raw args contain {input}');
  }

  if (needsOutput && !job.outputPath) {
    throw new Error('outputPath is required because raw args contain {output}');
  }

  return tokens.map((token) => {
    return token
      .replaceAll(INPUT_PLACEHOLDER, String(job.inputPath ?? ''))
      .replaceAll(OUTPUT_PLACEHOLDER, String(job.outputPath ?? ''));
  });
}

function buildVisualArgs(job) {
  const inputPath = textValue(job.inputPath);
  const outputPath = textValue(job.outputPath);

  if (!inputPath || !outputPath) {
    throw new Error('inputPath and outputPath are required');
  }

  const preset = textValue(job.preset) || 'h264';
  const defaults = VISUAL_PRESET_DEFAULTS[preset] ?? VISUAL_PRESET_DEFAULTS.h264;
  const args = [];

  if (job.overwrite !== false) {
    args.push('-y');
  }

  pushTrimArgs(args, textValue(job.startTime), textValue(job.duration));
  args.push('-i', inputPath);

  const disableVideo = Boolean(job.disableVideo) || Boolean(defaults.disableVideo);
  const disableAudio = Boolean(job.disableAudio) || Boolean(defaults.disableAudio);

  const videoCodec = textValue(job.videoCodec) || textValue(defaults.videoCodec);
  const audioCodec = textValue(job.audioCodec) || textValue(defaults.audioCodec);

  if (disableVideo || videoCodec === 'none') {
    args.push('-vn');
  } else {
    if (videoCodec && videoCodec !== 'auto') {
      args.push('-c:v', videoCodec);
    }

    const speedPreset = textValue(job.speedPreset) || textValue(defaults.speedPreset);
    if (speedPreset && videoCodec !== 'copy') {
      args.push('-preset', speedPreset);
    }

    const crf = numberValue(job.crf);
    const defaultCrf = numberValue(defaults.crf);
    const finalCrf = crf ?? defaultCrf;
    if (Number.isFinite(finalCrf) && videoCodec !== 'copy') {
      args.push('-crf', String(finalCrf));
    }

    pushOptionIfValue(args, '-b:v', job.videoBitrate);
  }

  if (disableAudio || audioCodec === 'none') {
    args.push('-an');
  } else {
    if (audioCodec && audioCodec !== 'auto') {
      args.push('-c:a', audioCodec);
    }

    const audioBitrate = textValue(job.audioBitrate) || textValue(defaults.audioBitrate);
    if (audioBitrate) {
      args.push('-b:a', audioBitrate);
    }

    const audioQuality = textValue(job.audioQuality) || textValue(defaults.audioQuality);
    if (audioQuality) {
      args.push('-q:a', audioQuality);
    }

    const sampleRate = roundPositiveNumberOrNull(numberValue(job.sampleRate));
    if (sampleRate) {
      args.push('-ar', String(sampleRate));
    }

    const channels = roundPositiveNumberOrNull(numberValue(job.channels));
    if (channels) {
      args.push('-ac', String(channels));
    }
  }

  const filters = [];
  const fps = numberValue(job.fps) ?? numberValue(defaults.fps);
  if (Number.isFinite(fps) && fps > 0) {
    filters.push(`fps=${fps}`);
  }

  const scaleWidth = numberValue(job.scaleWidth) ?? numberValue(defaults.scaleWidth);
  const scaleHeight = numberValue(job.scaleHeight) ?? numberValue(defaults.scaleHeight);
  if (Number.isFinite(scaleWidth) || Number.isFinite(scaleHeight)) {
    const width = Number.isFinite(scaleWidth) ? Math.round(scaleWidth) : -1;
    const height = Number.isFinite(scaleHeight) ? Math.round(scaleHeight) : -1;
    filters.push(`scale=${width}:${height}:flags=lanczos`);
  }

  const customVideoFilter = textValue(job.videoFilter);
  if (customVideoFilter) {
    filters.push(customVideoFilter);
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  const loop = hasValue(job.loop) ? textValue(job.loop) : textValue(defaults.loop);
  if (loop) {
    args.push('-loop', loop);
  }

  pushOptionIfValue(args, '-pix_fmt', job.pixelFormat);

  if (job.movflagsFaststart) {
    args.push('-movflags', '+faststart');
  }

  const threads = roundPositiveNumberOrNull(numberValue(job.threads));
  if (threads) {
    args.push('-threads', String(threads));
  }

  pushOptionIfValue(args, '-f', job.format);
  pushOptionIfValue(args, '-map', job.map);

  if (Array.isArray(job.extraArgs)) {
    for (const option of job.extraArgs) {
      if (!option || option.enabled === false) {
        continue;
      }

      const keyRaw = textValue(option.key);
      if (!keyRaw) {
        continue;
      }

      const key = keyRaw.startsWith('-') ? keyRaw : `-${keyRaw}`;
      args.push(key);

      const value = textValue(option.value);
      if (value) {
        args.push(value);
      }
    }
  }

  args.push(outputPath);
  return args;
}

function quoteCommandArg(value) {
  const text = String(value ?? '');
  if (text.length === 0) {
    return '""';
  }

  if (SAFE_PREVIEW_ARG_RE.test(text)) {
    return text;
  }

  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function formatCommandPreview(binaryPath, args) {
  const command = [textValue(binaryPath) || 'ffmpeg', ...(Array.isArray(args) ? args : [])];
  return command.map((arg) => quoteCommandArg(arg)).join(' ');
}

export function buildFfmpegArgs(job) {
  const mode = job?.mode === 'raw' ? 'raw' : job?.mode === 'visual' ? 'visual' : 'preset';
  if (mode === 'raw') {
    return buildRawArgs(job ?? {});
  }

  if (mode === 'visual') {
    return buildVisualArgs(job ?? {});
  }

  return buildPresetArgs(job ?? {});
}

function parseHmsToSeconds(hmsText) {
  const hmsMatch = String(hmsText).trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!hmsMatch) {
    const fallback = Number(hmsText);
    return Number.isFinite(fallback) ? fallback : null;
  }

  const hours = Number(hmsMatch[1]);
  const minutes = Number(hmsMatch[2]);
  const seconds = Number(hmsMatch[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

export function parseProgress(stderrLine, durationSec) {
  const timeMatch = String(stderrLine).match(/time=\s*(\d{1,3}:\d{2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!timeMatch) {
    return null;
  }

  const currentTimeSec = parseHmsToSeconds(timeMatch[1]);
  if (currentTimeSec === null) {
    return null;
  }

  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      currentTimeSec,
      ratio: null
    };
  }

  return {
    currentTimeSec,
    ratio: Math.min(1, currentTimeSec / durationSec)
  };
}

export function parseTimeInput(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseHmsToSeconds(value);
}

export function suggestOutputPath(inputPath, preset) {
  if (!inputPath) {
    return '';
  }

  const parsed = path.parse(inputPath);
  const extension = PRESET_OUTPUT_EXT[preset] ?? '.mp4';
  return path.join(parsed.dir, `${parsed.name}_converted${extension}`);
}
