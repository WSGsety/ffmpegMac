import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFfmpegArgs,
  formatSpawnError,
  formatCommandPreview,
  parseProgress,
  resolveExecutablePath,
  splitCommandLine,
  suggestOutputPath
} from '../src/core/job.js';

test('buildFfmpegArgs for h264 preset', () => {
  const args = buildFfmpegArgs({
    preset: 'h264',
    inputPath: '/tmp/input.mov',
    outputPath: '/tmp/output.mp4',
    crf: 23
  });

  assert.deepEqual(args, [
    '-y',
    '-i',
    '/tmp/input.mov',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '/tmp/output.mp4'
  ]);
});

test('buildFfmpegArgs for mp3 preset with trimming', () => {
  const args = buildFfmpegArgs({
    preset: 'mp3',
    inputPath: '/tmp/input.mp4',
    outputPath: '/tmp/output.mp3',
    startTime: '00:00:05',
    duration: '15'
  });

  assert.deepEqual(args, [
    '-y',
    '-ss',
    '00:00:05',
    '-t',
    '15',
    '-i',
    '/tmp/input.mp4',
    '-vn',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    '/tmp/output.mp3'
  ]);
});

test('buildFfmpegArgs for gif preset', () => {
  const args = buildFfmpegArgs({
    preset: 'gif',
    inputPath: '/tmp/input.mp4',
    outputPath: '/tmp/output.gif',
    fps: 12,
    scaleWidth: 480,
    startTime: '3',
    duration: '4'
  });

  assert.deepEqual(args, [
    '-y',
    '-ss',
    '3',
    '-t',
    '4',
    '-i',
    '/tmp/input.mp4',
    '-vf',
    'fps=12,scale=480:-1:flags=lanczos',
    '-loop',
    '0',
    '/tmp/output.gif'
  ]);
});

test('parseProgress extracts progress ratio from ffmpeg stderr', () => {
  const progress = parseProgress(
    'frame=  240 fps=30 q=28.0 size=    1024kB time=00:00:10.00 bitrate= 838.9kbits/s speed=1.0x',
    40
  );

  assert.equal(progress.currentTimeSec, 10);
  assert.equal(progress.ratio, 0.25);
});

test('splitCommandLine handles quotes and escaped quotes', () => {
  const args = splitCommandLine(
    '-i "{input}" -vf "scale=1280:-1,format=yuv420p" -metadata "title=My Clip" "{output}"'
  );

  assert.deepEqual(args, [
    '-i',
    '{input}',
    '-vf',
    'scale=1280:-1,format=yuv420p',
    '-metadata',
    'title=My Clip',
    '{output}'
  ]);
});

test('buildFfmpegArgs supports raw mode for all ffmpeg options', () => {
  const args = buildFfmpegArgs({
    mode: 'raw',
    rawArgs: '-y -i {input} -map 0:v -c:v libvpx-vp9 -b:v 2M {output}',
    inputPath: '/tmp/in.mov',
    outputPath: '/tmp/out.webm'
  });

  assert.deepEqual(args, [
    '-y',
    '-i',
    '/tmp/in.mov',
    '-map',
    '0:v',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '2M',
    '/tmp/out.webm'
  ]);
});

test('buildFfmpegArgs raw mode validates required placeholder inputs', () => {
  assert.throws(
    () =>
      buildFfmpegArgs({
        mode: 'raw',
        rawArgs: '-i {input} -f null -'
      }),
    /inputPath is required/
  );
});

test('buildFfmpegArgs supports visual mode with optional advanced args', () => {
  const args = buildFfmpegArgs({
    mode: 'visual',
    preset: 'h265',
    inputPath: '/tmp/input source.mov',
    outputPath: '/tmp/output file.mp4',
    startTime: '3',
    duration: '12',
    crf: 26,
    speedPreset: 'slow',
    fps: 24,
    scaleWidth: 1280,
    pixelFormat: 'yuv420p',
    movflagsFaststart: true,
    threads: 4,
    extraArgs: [
      { key: '-metadata', value: 'title=Sample Clip' },
      { key: '-map', value: '0:v:0' }
    ]
  });

  assert.deepEqual(args, [
    '-y',
    '-ss',
    '3',
    '-t',
    '12',
    '-i',
    '/tmp/input source.mov',
    '-c:v',
    'libx265',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-vf',
    'fps=24,scale=1280:-1:flags=lanczos',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-threads',
    '4',
    '-metadata',
    'title=Sample Clip',
    '-map',
    '0:v:0',
    '/tmp/output file.mp4'
  ]);
});

test('formatCommandPreview quotes arguments with spaces', () => {
  const text = formatCommandPreview('ffmpeg', ['-i', '/tmp/in file.mov', '-c:v', 'libx264', '/tmp/out file.mp4']);
  assert.equal(text, 'ffmpeg -i "/tmp/in file.mov" -c:v libx264 "/tmp/out file.mp4"');
});

test('resolveExecutablePath falls back to common Homebrew paths', () => {
  const resolved = resolveExecutablePath('ffprobe', 'ffprobe', (candidate) => {
    return candidate === '/opt/homebrew/bin/ffprobe';
  });

  assert.equal(resolved, '/opt/homebrew/bin/ffprobe');
});

test('resolveExecutablePath keeps explicit custom path as-is', () => {
  const resolved = resolveExecutablePath('/custom/bin/ffprobe', 'ffprobe', () => false);
  assert.equal(resolved, '/custom/bin/ffprobe');
});

test('formatSpawnError gives actionable hint for missing ffprobe binary', () => {
  const message = formatSpawnError(
    { code: 'ENOENT', message: 'spawn ffprobe ENOENT' },
    'ffprobe',
    'ffprobe'
  );

  assert.match(message, /未找到 ffprobe 可执行文件/);
  assert.match(message, /brew install ffmpeg/);
  assert.match(message, /\/opt\/homebrew\/bin\/ffprobe/);
});

test('suggestOutputPath chooses extension and avoids collisions', () => {
  assert.equal(
    suggestOutputPath('/Users/me/video.mov', 'h264'),
    '/Users/me/video_converted.mp4'
  );

  assert.equal(
    suggestOutputPath('/Users/me/audio.mp3', 'mp3'),
    '/Users/me/audio_converted.mp3'
  );
});
