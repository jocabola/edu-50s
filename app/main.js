import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })

  // In dev, point to 11ty dev server. In prod, load built index.
  /* const isDev = !app.isPackaged
  if (isDev) {
    win.loadURL('http://localhost:8080')
  } else {
    win.loadFile(path.join(__dirname, '../public/index.html'))
  } */
 win.loadFile(path.join(__dirname, '../public/index.html'));
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
