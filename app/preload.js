// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire Electron API.
// See https://www.electronjs.org/docs/latest/tutorial/context-isolation
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // Add your IPC bridges here
  // Example: send: (channel, data) => ipcRenderer.send(channel, data)
})
