const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 280,
    height: 480,
    x: 1200,
    y: 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true, // 确保初始即置顶
    skipTaskbar: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 强制常驻最前，行为接近输入法小窗
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.on('blur', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      mainWindow.moveTop();
    }
  });

  remoteMain.enable(mainWindow.webContents);
  mainWindow.loadFile('index.html');
  
  // 允许窗口拖拽 (虽然Electron有-webkit-app-region: drag，但全透明窗口有时需辅助)
}

app.whenReady().then(createWindow);

// 处理配置加载/保存逻辑 (类似Python版的一键生成)
ipcMain.on('get-path', (event, fileName) => {
  event.returnValue = path.join(app.getPath('userData'), fileName);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
