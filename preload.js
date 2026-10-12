'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // 配置
  getConfig: () => ipcRenderer.invoke('pet:getConfig'),
  setConfig: (patch) => ipcRenderer.invoke('pet:setConfig', patch),

  // 窗口行为
  setUiState: (open) => ipcRenderer.send('pet:uiState', open),
  dragStart: () => ipcRenderer.send('pet:dragStart'),
  dragEnd: () => ipcRenderer.send('pet:dragEnd'),
  setLookEnabled: (value) => ipcRenderer.send('pet:setLookEnabled', value),
  hide: () => ipcRenderer.send('pet:hide'),
  quit: () => ipcRenderer.send('pet:quit'),
  openConfig: () => ipcRenderer.send('pet:openConfig'),
  notify: (payload) => ipcRenderer.send('pet:notify', payload),

  // 对话
  chat: (text) => ipcRenderer.invoke('pet:chat', text),

  // 主进程推送
  onAnim: (cb) => ipcRenderer.on('pet:anim', (_e, name) => cb(name)),
  onLook: (cb) => ipcRenderer.on('pet:look', (_e, index) => cb(index)),
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, payload) => cb(payload)),
  onRemind: (cb) => ipcRenderer.on('pet:remind', (_e, payload) => cb(payload)),
});
