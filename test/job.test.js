import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFfmpegArgs, parseProgress, splitCommandLine, suggestOutputPath } from '../src/core/job.js';

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
