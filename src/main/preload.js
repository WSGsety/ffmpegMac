import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ffmpegShell', {
  pickInput: () => ipcRenderer.invoke('dialog:pick-input'),
  pickOutput: (payload) => ipcRenderer.invoke('dialog:pick-output', payload),
  suggestOutput: (payload) => ipcRenderer.invoke('ffmpeg:suggest-output', payload),
  probeInput: (payload) => ipcRenderer.invoke('ffmpeg:probe-input', payload),
  preview: (payload) => ipcRenderer.invoke('ffmpeg:preview', payload),
  run: (payload) => ipcRenderer.invoke('ffmpeg:run', payload),
  stop: () => ipcRenderer.invoke('ffmpeg:stop'),
  onState: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ffmpeg:state', listener);
    return () => ipcRenderer.removeListener('ffmpeg:state', listener);
  },
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ffmpeg:progress', listener);
    return () => ipcRenderer.removeListener('ffmpeg:progress', listener);
  },
  onLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ffmpeg:log', listener);
    return () => ipcRenderer.removeListener('ffmpeg:log', listener);
  }
});
