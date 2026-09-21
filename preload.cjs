const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("signalTV", {
  isDesktop: true,
  platform: process.platform,
  setProxy: (rules) => ipcRenderer.invoke("net:set-proxy", rules),
});
