'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  analyze: (opts) => ipcRenderer.invoke('analyze', opts || {}),
  toggleCapture: () => ipcRenderer.invoke('toggle-capture'),
  getCaptureBounds: () => ipcRenderer.invoke('get-capture-bounds'),
  closeCapture: () => ipcRenderer.send('capture-close'),
  setCaptureClickThrough: (ignore) => ipcRenderer.send('capture-click-through', !!ignore),
  onStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('analysis-status', handler);
    return () => ipcRenderer.removeListener('analysis-status', handler);
  },
  onResult: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('analysis-result', handler);
    return () => ipcRenderer.removeListener('analysis-result', handler);
  },
  onPreview: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('capture-preview', handler);
    return () => ipcRenderer.removeListener('capture-preview', handler);
  },
});
