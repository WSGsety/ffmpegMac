function ensureTauriApi() {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const listen = tauri?.event?.listen;

  if (!invoke || !listen) {
    throw new Error('当前运行环境不是 Tauri。请使用 `npm run dev` 启动桌面应用。');
  }

  return { invoke, listen };
}

function bindEvent(eventName, callback) {
  const { listen } = ensureTauriApi();
  let unlisten = null;
  let cancelled = false;

  listen(eventName, (event) => {
    if (cancelled) {
      return;
    }

    callback(event.payload);
  }).then((stopListening) => {
    if (cancelled) {
      stopListening();
      return;
    }

    unlisten = stopListening;
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}

function invokeCommand(command, payload = undefined) {
  const { invoke } = ensureTauriApi();
  if (payload === undefined) {
    return invoke(command);
  }

  return invoke(command, { payload });
}

window.ffmpegShell = {
  pickInput: () => invokeCommand('pick_input'),
  pickOutput: (payload) => invokeCommand('pick_output', payload),
  suggestOutput: (payload) => invokeCommand('suggest_output', payload),
  probeInput: (payload) => invokeCommand('probe_input', payload),
  preview: (payload) => invokeCommand('preview', payload),
  run: (payload) => invokeCommand('run_ffmpeg', payload),
  stop: () => invokeCommand('stop_ffmpeg'),
  onState: (callback) => bindEvent('ffmpeg:state', callback),
  onProgress: (callback) => bindEvent('ffmpeg:progress', callback),
  onLog: (callback) => bindEvent('ffmpeg:log', callback)
};
