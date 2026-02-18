import path from 'node:path';

const INPUT_PLACEHOLDER = '{input}';
const OUTPUT_PLACEHOLDER = '{output}';

const PRESET_OUTPUT_EXT = {
  h264: '.mp4',
  h265: '.mp4',
  mp3: '.mp3',
  gif: '.gif'
};

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

export function buildFfmpegArgs(job) {
  const mode = job?.mode === 'raw' ? 'raw' : 'preset';
  if (mode === 'raw') {
    return buildRawArgs(job ?? {});
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
