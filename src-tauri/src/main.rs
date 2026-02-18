#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::Lazy;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const INPUT_PLACEHOLDER: &str = "{input}";
const OUTPUT_PLACEHOLDER: &str = "{output}";

static ACTIVE_TASK: Lazy<Mutex<Option<RunningTask>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone)]
struct RunningTask {
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct PickOutputPayload {
    input_path: Option<String>,
    preset: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ProbePayload {
    input_path: Option<String>,
    ffprobe_path: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtraArg {
    key: Option<String>,
    value: Option<String>,
    enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct JobPayload {
    mode: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
    input_path: Option<String>,
    output_path: Option<String>,
    raw_args: Option<String>,
    preset: Option<String>,
    start_time: Option<String>,
    duration: Option<String>,
    overwrite: Option<bool>,
    crf: Option<f64>,
    speed_preset: Option<String>,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    pixel_format: Option<String>,
    video_bitrate: Option<String>,
    audio_bitrate: Option<String>,
    audio_quality: Option<String>,
    fps: Option<f64>,
    scale_width: Option<f64>,
    scale_height: Option<f64>,
    sample_rate: Option<f64>,
    channels: Option<f64>,
    threads: Option<f64>,
    format: Option<String>,
    #[serde(rename = "map")]
    map_field: Option<String>,
    #[serde(rename = "loop")]
    loop_value: Option<String>,
    video_filter: Option<String>,
    movflags_faststart: Option<bool>,
    disable_video: Option<bool>,
    disable_audio: Option<bool>,
    extra_args: Option<Vec<ExtraArg>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewResponse {
    args: Vec<String>,
    command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeStream {
    index: Option<u64>,
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u64>,
    height: Option<u64>,
    sample_rate: Option<u64>,
    channels: Option<u64>,
    bit_rate: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeInfo {
    file: String,
    format_name: String,
    duration_sec: Option<f64>,
    size_bytes: Option<f64>,
    bit_rate: Option<f64>,
    streams: Vec<ProbeStream>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    ratio: Option<f64>,
    current_time_sec: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StateEvent {
    status: String,
    mode: Option<String>,
    args: Option<String>,
    message: Option<String>,
}

impl StateEvent {
    fn running(mode: String, args: String) -> Self {
        Self {
            status: "running".to_string(),
            mode: Some(mode),
            args: Some(args),
            message: None,
        }
    }

    fn completed() -> Self {
        Self {
            status: "completed".to_string(),
            mode: None,
            args: None,
            message: None,
        }
    }

    fn stopped() -> Self {
        Self {
            status: "stopped".to_string(),
            mode: None,
            args: None,
            message: None,
        }
    }

    fn failed(message: String) -> Self {
        Self {
            status: "failed".to_string(),
            mode: None,
            args: None,
            message: Some(message),
        }
    }
}

#[derive(Clone, Default)]
struct VisualPresetDefaults {
    video_codec: Option<&'static str>,
    speed_preset: Option<&'static str>,
    crf: Option<f64>,
    audio_codec: Option<&'static str>,
    audio_bitrate: Option<&'static str>,
    audio_quality: Option<&'static str>,
    disable_video: bool,
    disable_audio: bool,
    fps: Option<f64>,
    scale_width: Option<f64>,
    scale_height: Option<f64>,
    loop_value: Option<&'static str>,
}

fn text_from_option(value: &Option<String>) -> String {
    value
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn has_text(value: &str) -> bool {
    !value.trim().is_empty()
}

fn round_positive(value: Option<f64>) -> Option<i64> {
    let number = value?;
    if !number.is_finite() || number <= 0.0 {
        return None;
    }

    Some(number.round() as i64)
}

fn push_trim_args(args: &mut Vec<String>, start_time: &str, duration: &str) {
    if has_text(start_time) {
        args.push("-ss".to_string());
        args.push(start_time.to_string());
    }

    if has_text(duration) {
        args.push("-t".to_string());
        args.push(duration.to_string());
    }
}

fn push_option_if_value(args: &mut Vec<String>, key: &str, value: &Option<String>) {
    let text = text_from_option(value);
    if !has_text(&text) {
        return;
    }

    args.push(key.to_string());
    args.push(text);
}

fn visual_defaults(preset: &str) -> VisualPresetDefaults {
    match preset {
        "h265" => VisualPresetDefaults {
            video_codec: Some("libx265"),
            speed_preset: Some("medium"),
            crf: Some(28.0),
            audio_codec: Some("aac"),
            audio_bitrate: Some("160k"),
            ..Default::default()
        },
        "mp3" => VisualPresetDefaults {
            audio_codec: Some("libmp3lame"),
            audio_quality: Some("2"),
            disable_video: true,
            ..Default::default()
        },
        "gif" => VisualPresetDefaults {
            disable_audio: true,
            fps: Some(12.0),
            scale_width: Some(480.0),
            loop_value: Some("0"),
            ..Default::default()
        },
        _ => VisualPresetDefaults {
            video_codec: Some("libx264"),
            speed_preset: Some("medium"),
            crf: Some(23.0),
            audio_codec: Some("aac"),
            audio_bitrate: Some("192k"),
            ..Default::default()
        },
    }
}

fn parse_hms_to_seconds(text: &str) -> Option<f64> {
    let trimmed = text.trim();
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() == 3 {
        let hours = parts[0].parse::<f64>().ok()?;
        let minutes = parts[1].parse::<f64>().ok()?;
        let seconds = parts[2].parse::<f64>().ok()?;
        return Some(hours * 3600.0 + minutes * 60.0 + seconds);
    }

    trimmed.parse::<f64>().ok()
}

fn parse_time_input(value: &Option<String>) -> Option<f64> {
    let text = text_from_option(value);
    if !has_text(&text) {
        return None;
    }

    parse_hms_to_seconds(&text)
}

fn parse_progress(line: &str, duration_sec: Option<f64>) -> Option<ProgressEvent> {
    let time_index = line.find("time=")?;
    let tail = &line[(time_index + 5)..];
    let time_token = tail.split_whitespace().next()?;
    let current_time_sec = parse_hms_to_seconds(time_token)?;

    let ratio = match duration_sec {
        Some(duration) if duration.is_finite() && duration > 0.0 => {
            Some((current_time_sec / duration).clamp(0.0, 1.0))
        }
        _ => None,
    };

    Some(ProgressEvent {
        ratio,
        current_time_sec: Some(current_time_sec),
    })
}

fn split_command_line(command_line: &str) -> Result<Vec<String>, String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escape_next = false;

    let push_current = |tokens: &mut Vec<String>, current: &mut String| {
        if current.is_empty() {
            return;
        }

        tokens.push(current.clone());
        current.clear();
    };

    for ch in command_line.chars() {
        if escape_next {
            current.push(ch);
            escape_next = false;
            continue;
        }

        if ch == '\\' && !in_single_quote {
            escape_next = true;
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }

        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }

        if ch.is_whitespace() && !in_single_quote && !in_double_quote {
            push_current(&mut tokens, &mut current);
            continue;
        }

        current.push(ch);
    }

    if escape_next {
        return Err("Invalid command line: trailing escape".to_string());
    }

    if in_single_quote || in_double_quote {
        return Err("Invalid command line: unclosed quote".to_string());
    }

    push_current(&mut tokens, &mut current);
    Ok(tokens)
}

fn build_raw_args(job: &JobPayload) -> Result<Vec<String>, String> {
    let raw_args = text_from_option(&job.raw_args);
    if !has_text(&raw_args) {
        return Err("rawArgs is required for raw mode".to_string());
    }

    let tokens = split_command_line(&raw_args)?;
    let input_path = text_from_option(&job.input_path);
    let output_path = text_from_option(&job.output_path);

    let needs_input = tokens.iter().any(|token| token.contains(INPUT_PLACEHOLDER));
    let needs_output = tokens.iter().any(|token| token.contains(OUTPUT_PLACEHOLDER));

    if needs_input && !has_text(&input_path) {
        return Err("inputPath is required because raw args contain {input}".to_string());
    }

    if needs_output && !has_text(&output_path) {
        return Err("outputPath is required because raw args contain {output}".to_string());
    }

    Ok(tokens
        .iter()
        .map(|token| {
            token
                .replace(INPUT_PLACEHOLDER, &input_path)
                .replace(OUTPUT_PLACEHOLDER, &output_path)
        })
        .collect())
}

fn build_preset_args(job: &JobPayload) -> Result<Vec<String>, String> {
    let preset = {
        let text = text_from_option(&job.preset);
        if has_text(&text) {
            text
        } else {
            "h264".to_string()
        }
    };

    let input_path = text_from_option(&job.input_path);
    let output_path = text_from_option(&job.output_path);

    if !has_text(&input_path) || !has_text(&output_path) {
        return Err("inputPath and outputPath are required".to_string());
    }

    let start_time = text_from_option(&job.start_time);
    let duration = text_from_option(&job.duration);
    let mut args = vec!["-y".to_string()];
    push_trim_args(&mut args, &start_time, &duration);
    args.push("-i".to_string());
    args.push(input_path);

    match preset.as_str() {
        "h264" => {
            let crf = job.crf.unwrap_or(23.0).round() as i64;
            args.extend([
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]);
        }
        "h265" => {
            let crf = job.crf.unwrap_or(28.0).round() as i64;
            args.extend([
                "-c:v".to_string(),
                "libx265".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "160k".to_string(),
            ]);
        }
        "mp3" => {
            args.extend([
                "-vn".to_string(),
                "-c:a".to_string(),
                "libmp3lame".to_string(),
                "-q:a".to_string(),
                "2".to_string(),
            ]);
        }
        "gif" => {
            let fps = round_positive(job.fps).unwrap_or(12);
            let width = round_positive(job.scale_width).unwrap_or(480);
            args.extend([
                "-vf".to_string(),
                format!("fps={fps},scale={width}:-1:flags=lanczos"),
                "-loop".to_string(),
                "0".to_string(),
            ]);
        }
        _ => return Err(format!("Unsupported preset: {preset}")),
    }

    args.push(output_path);
    Ok(args)
}

fn build_visual_args(job: &JobPayload) -> Result<Vec<String>, String> {
    let input_path = text_from_option(&job.input_path);
    let output_path = text_from_option(&job.output_path);

    if !has_text(&input_path) || !has_text(&output_path) {
        return Err("inputPath and outputPath are required".to_string());
    }

    let preset = {
        let text = text_from_option(&job.preset);
        if has_text(&text) {
            text
        } else {
            "h264".to_string()
        }
    };

    let defaults = visual_defaults(&preset);
    let start_time = text_from_option(&job.start_time);
    let duration = text_from_option(&job.duration);

    let mut args = Vec::<String>::new();

    if job.overwrite.unwrap_or(true) {
        args.push("-y".to_string());
    }

    push_trim_args(&mut args, &start_time, &duration);
    args.push("-i".to_string());
    args.push(input_path);

    let disable_video = job.disable_video.unwrap_or(false) || defaults.disable_video;
    let disable_audio = job.disable_audio.unwrap_or(false) || defaults.disable_audio;

    let video_codec = {
        let explicit = text_from_option(&job.video_codec);
        if has_text(&explicit) {
            explicit
        } else {
            defaults.video_codec.unwrap_or_default().to_string()
        }
    };

    let audio_codec = {
        let explicit = text_from_option(&job.audio_codec);
        if has_text(&explicit) {
            explicit
        } else {
            defaults.audio_codec.unwrap_or_default().to_string()
        }
    };

    if disable_video || video_codec == "none" {
        args.push("-vn".to_string());
    } else {
        if has_text(&video_codec) && video_codec != "auto" {
            args.push("-c:v".to_string());
            args.push(video_codec.clone());
        }

        let speed_preset = {
            let explicit = text_from_option(&job.speed_preset);
            if has_text(&explicit) {
                explicit
            } else {
                defaults.speed_preset.unwrap_or_default().to_string()
            }
        };

        if has_text(&speed_preset) && video_codec != "copy" {
            args.push("-preset".to_string());
            args.push(speed_preset);
        }

        let crf = job.crf.or(defaults.crf);
        if let Some(crf_value) = crf {
            if crf_value.is_finite() && video_codec != "copy" {
                args.push("-crf".to_string());
                args.push((crf_value.round() as i64).to_string());
            }
        }

        push_option_if_value(&mut args, "-b:v", &job.video_bitrate);
    }

    if disable_audio || audio_codec == "none" {
        args.push("-an".to_string());
    } else {
        if has_text(&audio_codec) && audio_codec != "auto" {
            args.push("-c:a".to_string());
            args.push(audio_codec);
        }

        let audio_bitrate = {
            let explicit = text_from_option(&job.audio_bitrate);
            if has_text(&explicit) {
                explicit
            } else {
                defaults.audio_bitrate.unwrap_or_default().to_string()
            }
        };

        if has_text(&audio_bitrate) {
            args.push("-b:a".to_string());
            args.push(audio_bitrate);
        }

        let audio_quality = {
            let explicit = text_from_option(&job.audio_quality);
            if has_text(&explicit) {
                explicit
            } else {
                defaults.audio_quality.unwrap_or_default().to_string()
            }
        };

        if has_text(&audio_quality) {
            args.push("-q:a".to_string());
            args.push(audio_quality);
        }

        if let Some(sample_rate) = round_positive(job.sample_rate) {
            args.push("-ar".to_string());
            args.push(sample_rate.to_string());
        }

        if let Some(channels) = round_positive(job.channels) {
            args.push("-ac".to_string());
            args.push(channels.to_string());
        }
    }

    let mut filters: Vec<String> = Vec::new();

    if let Some(fps) = job.fps.or(defaults.fps) {
        if fps.is_finite() && fps > 0.0 {
            filters.push(format!("fps={}", fps.round() as i64));
        }
    }

    let scale_width = job.scale_width.or(defaults.scale_width);
    let scale_height = job.scale_height.or(defaults.scale_height);

    if scale_width.is_some() || scale_height.is_some() {
        let width = round_positive(scale_width).unwrap_or(-1);
        let height = round_positive(scale_height).unwrap_or(-1);
        filters.push(format!("scale={width}:{height}:flags=lanczos"));
    }

    let video_filter = text_from_option(&job.video_filter);
    if has_text(&video_filter) {
        filters.push(video_filter);
    }

    if !filters.is_empty() {
        args.push("-vf".to_string());
        args.push(filters.join(","));
    }

    let loop_value = {
        let explicit = text_from_option(&job.loop_value);
        if has_text(&explicit) {
            explicit
        } else {
            defaults.loop_value.unwrap_or_default().to_string()
        }
    };

    if has_text(&loop_value) {
        args.push("-loop".to_string());
        args.push(loop_value);
    }

    push_option_if_value(&mut args, "-pix_fmt", &job.pixel_format);

    if job.movflags_faststart.unwrap_or(false) {
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
    }

    if let Some(threads) = round_positive(job.threads) {
        args.push("-threads".to_string());
        args.push(threads.to_string());
    }

    push_option_if_value(&mut args, "-f", &job.format);
    push_option_if_value(&mut args, "-map", &job.map_field);

    if let Some(extra_args) = &job.extra_args {
        for option in extra_args {
            if option.enabled == Some(false) {
                continue;
            }

            let key_raw = text_from_option(&option.key);
            if !has_text(&key_raw) {
                continue;
            }

            let key = if key_raw.starts_with('-') {
                key_raw
            } else {
                format!("-{key_raw}")
            };

            args.push(key);

            let value = text_from_option(&option.value);
            if has_text(&value) {
                args.push(value);
            }
        }
    }

    args.push(output_path);
    Ok(args)
}

fn build_ffmpeg_args(job: &JobPayload) -> Result<Vec<String>, String> {
    let mode = text_from_option(&job.mode);
    if mode == "raw" {
        return build_raw_args(job);
    }

    if mode == "visual" {
        return build_visual_args(job);
    }

    build_preset_args(job)
}

fn is_safe_preview_arg(text: &str) -> bool {
    text.chars().all(|ch| {
        ch.is_ascii_alphanumeric()
            || ch == '_'
            || ch == '.'
            || ch == '/'
            || ch == ':'
            || ch == '='
            || ch == '+'
            || ch == ','
            || ch == '-'
    })
}

fn quote_command_arg(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }

    if is_safe_preview_arg(value) {
        return value.to_string();
    }

    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
    )
}

fn format_command_preview(binary_path: &str, args: &[String]) -> String {
    let binary = if has_text(binary_path) {
        binary_path.trim()
    } else {
        "ffmpeg"
    };

    let mut command: Vec<String> = vec![quote_command_arg(binary)];
    command.extend(args.iter().map(|arg| quote_command_arg(arg)));
    command.join(" ")
}

fn extension_for_preset(preset: &str) -> &'static str {
    match preset {
        "mp3" => ".mp3",
        "gif" => ".gif",
        _ => ".mp4",
    }
}

fn suggest_output_path(input_path: &str, preset: &str) -> String {
    if !has_text(input_path) {
        return String::new();
    }

    let source = Path::new(input_path);
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| has_text(value))
        .unwrap_or("output");

    let file_name = format!("{stem}_converted{}", extension_for_preset(preset));

    match source.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(file_name).to_string_lossy().to_string(),
        _ => file_name,
    }
}

fn is_explicit_path(path: &str) -> bool {
    path.contains('/') || path.contains('\\') || path.starts_with('.')
}

fn resolve_executable_path(raw_path: Option<&str>, tool_name: &str) -> String {
    let fallback = if tool_name == "ffprobe" {
        "ffprobe"
    } else {
        "ffmpeg"
    };

    let configured = raw_path
        .map(|value| value.trim().to_string())
        .filter(|value| has_text(value))
        .unwrap_or_else(|| fallback.to_string());

    if is_explicit_path(&configured) {
        return configured;
    }

    let candidates: &[&str] = if tool_name == "ffprobe" {
        &["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"]
    } else {
        &["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
    };

    for candidate in candidates {
        if Path::new(candidate).exists() {
            return (*candidate).to_string();
        }
    }

    configured
}

fn format_spawn_error(error: &std::io::Error, tool_name: &str, configured_path: &str) -> String {
    let name = if tool_name == "ffprobe" {
        "ffprobe"
    } else {
        "ffmpeg"
    };

    if error.kind() == std::io::ErrorKind::NotFound {
        let example = if cfg!(target_os = "windows") {
            format!("C:\\\\ffmpeg\\\\bin\\\\{name}.exe")
        } else {
            format!("/opt/homebrew/bin/{name}")
        };

        return format!(
            "未找到 {name} 可执行文件。请先安装 FFmpeg（brew install ffmpeg），或在界面里填写 {name} 的完整路径（例如 {example}）。当前配置：{configured_path}"
        );
    }

    error.to_string()
}

fn value_to_f64(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::String(text)) => text.parse::<f64>().ok(),
        _ => None,
    }
}

fn value_to_u64(value: Option<&Value>) -> Option<u64> {
    value_to_f64(value).and_then(|number| {
        if number.is_finite() && number >= 0.0 {
            Some(number.round() as u64)
        } else {
            None
        }
    })
}

fn run_command(binary_path: &str, args: &[String], tool_name: &str, configured_path: &str) -> Result<(String, String), String> {
    let output = Command::new(binary_path)
        .args(args)
        .output()
        .map_err(|error| format_spawn_error(&error, tool_name, configured_path))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let error_message = stderr.trim();
        if has_text(error_message) {
            return Err(error_message.to_string());
        }

        return Err(format!("{tool_name} 退出码 {}", output.status.code().unwrap_or(-1)));
    }

    Ok((stdout, stderr))
}

fn probe_media(ffprobe_path: &str, configured_path: &str, input_path: &str) -> Result<ProbeInfo, String> {
    let args = vec![
        "-v".to_string(),
        "error".to_string(),
        "-print_format".to_string(),
        "json".to_string(),
        "-show_format".to_string(),
        "-show_streams".to_string(),
        input_path.to_string(),
    ];

    let (stdout, _) = run_command(ffprobe_path, &args, "ffprobe", configured_path)?;
    let parsed: Value = serde_json::from_str(&stdout)
        .map_err(|_| "ffprobe 返回了无效的 JSON 输出".to_string())?;

    let format_node = parsed.get("format");
    let streams_node = parsed.get("streams").and_then(|value| value.as_array());

    let streams = streams_node
        .map(|list| {
            list
                .iter()
                .map(|stream| ProbeStream {
                    index: stream.get("index").and_then(|value| value.as_u64()),
                    codec_type: stream
                        .get("codec_type")
                        .and_then(|value| value.as_str())
                        .map(|value| value.to_string()),
                    codec_name: stream
                        .get("codec_name")
                        .and_then(|value| value.as_str())
                        .map(|value| value.to_string()),
                    width: value_to_u64(stream.get("width")),
                    height: value_to_u64(stream.get("height")),
                    sample_rate: value_to_u64(stream.get("sample_rate")),
                    channels: value_to_u64(stream.get("channels")),
                    bit_rate: value_to_f64(stream.get("bit_rate")),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(ProbeInfo {
        file: input_path.to_string(),
        format_name: format_node
            .and_then(|value| value.get("format_name"))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        duration_sec: value_to_f64(format_node.and_then(|value| value.get("duration"))),
        size_bytes: value_to_f64(format_node.and_then(|value| value.get("size"))),
        bit_rate: value_to_f64(format_node.and_then(|value| value.get("bit_rate"))),
        streams,
    })
}

fn resolve_duration_sec(payload: &JobPayload) -> Option<f64> {
    if let Some(duration) = parse_time_input(&payload.duration) {
        if duration > 0.0 {
            return Some(duration);
        }
    }

    let input_path = text_from_option(&payload.input_path);
    if !has_text(&input_path) {
        return None;
    }

    let configured_ffprobe = text_from_option(&payload.ffprobe_path);
    let ffprobe_path = resolve_executable_path(Some(configured_ffprobe.as_str()), "ffprobe");

    probe_media(&ffprobe_path, configured_ffprobe.as_str(), &input_path)
        .ok()
        .and_then(|info| info.duration_sec)
}

fn emit_state(app: &AppHandle, payload: StateEvent) {
    let _ = app.emit("ffmpeg:state", payload);
}

fn clear_active_task(target: &Arc<Mutex<Child>>) {
    if let Ok(mut guard) = ACTIVE_TASK.lock() {
        if let Some(current) = guard.as_ref() {
            if Arc::ptr_eq(&current.child, target) {
                *guard = None;
            }
        }
    }
}

fn wait_for_exit(child_ref: &Arc<Mutex<Child>>) -> Result<ExitStatus, String> {
    loop {
        let status = {
            let mut child = child_ref
                .lock()
                .map_err(|_| "任务进程锁不可用".to_string())?;
            child.try_wait().map_err(|error| error.to_string())?
        };

        if let Some(status) = status {
            return Ok(status);
        }

        thread::sleep(Duration::from_millis(120));
    }
}

fn stream_child_logs(app: &AppHandle, child_ref: &Arc<Mutex<Child>>, duration_sec: Option<f64>) {
    let stderr_pipe = {
        let mut child = match child_ref.lock() {
            Ok(child) => child,
            Err(_) => return,
        };
        child.stderr.take()
    };

    let Some(stderr_pipe) = stderr_pipe else {
        return;
    };

    let reader = BufReader::new(stderr_pipe);
    for line in reader.lines().map_while(Result::ok) {
        if !has_text(&line) {
            continue;
        }

        let _ = app.emit("ffmpeg:log", line.clone());
        if let Some(progress) = parse_progress(&line, duration_sec) {
            let _ = app.emit("ffmpeg:progress", progress);
        }
    }
}

#[tauri::command]
fn pick_input() -> Result<Option<String>, String> {
    Ok(FileDialog::new()
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_output(payload: PickOutputPayload) -> Result<Option<String>, String> {
    let input_path = text_from_option(&payload.input_path);
    let preset = {
        let text = text_from_option(&payload.preset);
        if has_text(&text) {
            text
        } else {
            "h264".to_string()
        }
    };

    let suggested = suggest_output_path(&input_path, &preset);
    let mut dialog = FileDialog::new();

    if has_text(&suggested) {
        let suggested_path = PathBuf::from(&suggested);
        if let Some(parent) = suggested_path.parent() {
            dialog = dialog.set_directory(parent);
        }

        if let Some(file_name) = suggested_path.file_name().and_then(|value| value.to_str()) {
            dialog = dialog.set_file_name(file_name);
        }
    }

    Ok(dialog
        .save_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn suggest_output(payload: PickOutputPayload) -> Result<String, String> {
    let input_path = text_from_option(&payload.input_path);
    let preset = {
        let text = text_from_option(&payload.preset);
        if has_text(&text) {
            text
        } else {
            "h264".to_string()
        }
    };

    Ok(suggest_output_path(&input_path, &preset))
}

#[tauri::command]
fn probe_input(payload: ProbePayload) -> Result<ProbeInfo, String> {
    let input_path = text_from_option(&payload.input_path);
    if !has_text(&input_path) {
        return Err("缺少 inputPath 参数".to_string());
    }

    let configured_ffprobe = text_from_option(&payload.ffprobe_path);
    let ffprobe_path = resolve_executable_path(Some(configured_ffprobe.as_str()), "ffprobe");
    probe_media(&ffprobe_path, configured_ffprobe.as_str(), &input_path)
}

#[tauri::command]
fn preview(payload: JobPayload) -> Result<PreviewResponse, String> {
    let ffmpeg_path = {
        let text = text_from_option(&payload.ffmpeg_path);
        if has_text(&text) {
            text
        } else {
            "ffmpeg".to_string()
        }
    };

    let mut preview_payload = payload.clone();
    if !has_text(&text_from_option(&preview_payload.input_path)) {
        preview_payload.input_path = Some(INPUT_PLACEHOLDER.to_string());
    }

    if !has_text(&text_from_option(&preview_payload.output_path)) {
        preview_payload.output_path = Some(OUTPUT_PLACEHOLDER.to_string());
    }

    let args = build_ffmpeg_args(&preview_payload)?;
    let command = format_command_preview(&ffmpeg_path, &args);

    Ok(PreviewResponse { args, command })
}

#[tauri::command]
fn run_ffmpeg(app: AppHandle, payload: JobPayload) -> Result<bool, String> {
    {
        let guard = ACTIVE_TASK
            .lock()
            .map_err(|_| "任务状态锁不可用".to_string())?;

        if guard.is_some() {
            return Err("当前已有任务在运行，请先停止后再启动新任务。".to_string());
        }
    }

    let configured_ffmpeg = text_from_option(&payload.ffmpeg_path);
    let ffmpeg_path = resolve_executable_path(Some(configured_ffmpeg.as_str()), "ffmpeg");
    let args = build_ffmpeg_args(&payload)?;
    let duration_sec = resolve_duration_sec(&payload);

    let mode = match text_from_option(&payload.mode).as_str() {
        "raw" => "raw".to_string(),
        "visual" => "visual".to_string(),
        _ => "preset".to_string(),
    };

    let command_preview = format_command_preview(&ffmpeg_path, &args);
    emit_state(&app, StateEvent::running(mode, command_preview));

    let process = Command::new(&ffmpeg_path)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format_spawn_error(&error, "ffmpeg", configured_ffmpeg.as_str()))?;

    if process.stderr.is_none() {
        return Err("ffmpeg stderr 管道初始化失败".to_string());
    }

    let child_ref = Arc::new(Mutex::new(process));
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut guard = ACTIVE_TASK
            .lock()
            .map_err(|_| "任务状态锁不可用".to_string())?;
        *guard = Some(RunningTask {
            child: child_ref.clone(),
            cancelled: cancelled.clone(),
        });
    }

    thread::spawn(move || {
        stream_child_logs(&app, &child_ref, duration_sec);

        let wait_result = wait_for_exit(&child_ref);
        match wait_result {
            Ok(status) => {
                if cancelled.load(Ordering::SeqCst) {
                    emit_state(&app, StateEvent::stopped());
                } else if status.success() {
                    let _ = app.emit(
                        "ffmpeg:progress",
                        ProgressEvent {
                            ratio: Some(1.0),
                            current_time_sec: duration_sec,
                        },
                    );
                    emit_state(&app, StateEvent::completed());
                } else {
                    let exit_code = status
                        .code()
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    emit_state(&app, StateEvent::failed(format!("ffmpeg 退出码 {exit_code}")));
                }
            }
            Err(message) => {
                emit_state(&app, StateEvent::failed(message));
            }
        }

        clear_active_task(&child_ref);
    });

    Ok(true)
}

#[tauri::command]
fn stop_ffmpeg() -> Result<bool, String> {
    let running = {
        let guard = ACTIVE_TASK
            .lock()
            .map_err(|_| "任务状态锁不可用".to_string())?;
        guard.clone()
    };

    let Some(task) = running else {
        return Ok(false);
    };

    task.cancelled.store(true, Ordering::SeqCst);

    if let Ok(mut child) = task.child.lock() {
        let _ = child.kill();
    }

    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            pick_input,
            pick_output,
            suggest_output,
            probe_input,
            preview,
            run_ffmpeg,
            stop_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_command_line_handles_quotes() {
        let parsed = split_command_line(r#"-i "{input}" -vf "scale=1280:-1,format=yuv420p" "{output}""#)
            .expect("parse failed");

        assert_eq!(
            parsed,
            vec![
                "-i".to_string(),
                "{input}".to_string(),
                "-vf".to_string(),
                "scale=1280:-1,format=yuv420p".to_string(),
                "{output}".to_string(),
            ]
        );
    }

    #[test]
    fn suggest_output_path_uses_preset_extension() {
        assert_eq!(
            suggest_output_path("/Users/me/video.mov", "h264"),
            "/Users/me/video_converted.mp4"
        );
        assert_eq!(
            suggest_output_path("/Users/me/audio.wav", "mp3"),
            "/Users/me/audio_converted.mp3"
        );
    }

    #[test]
    fn parse_progress_extracts_ratio() {
        let progress = parse_progress(
            "frame=  240 fps=30 q=28.0 size=    1024kB time=00:00:10.00 bitrate= 838.9kbits/s speed=1.0x",
            Some(40.0),
        )
        .expect("progress missing");

        assert_eq!(progress.current_time_sec, Some(10.0));
        assert_eq!(progress.ratio, Some(0.25));
    }
}
