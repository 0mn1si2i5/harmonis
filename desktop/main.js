import { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { acquireLibraryLock, migrateLegacyLibrary, isLocalURL, isExternalURL } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
app.setName('Harmonis');
let window,
  server,
  store,
  releaseLock,
  origin,
  library,
  quitting = false,
  preparingQuit = false;
if (process.env.HARMONIS_PROFILE_DIR) app.setPath('userData', path.resolve(process.env.HARMONIS_PROFILE_DIR));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(boot)
    .catch(error => {
      dialog.showErrorBox('Harmonis 无法启动', error.message);
      app.exit(1);
    });
}

function activeJobs() {
  return store?.data.jobs.filter(j => ['running', 'queued'].includes(j.status)) || [];
}
function trusted(event) {
  return window && event.sender === window.webContents && isLocalURL(event.senderFrame?.url, origin);
}
async function openExternal(url) {
  if (isExternalURL(url)) await shell.openExternal(url);
}

async function boot() {
  library = process.env.HARMONIS_DATA_DIR || path.join(app.getPath('userData'), 'library');
  const legacy = path.join(app.getPath('appData'), 'Shengjian');
  if (!process.env.HARMONIS_DATA_DIR) {
    const missing = await fs.access(path.join(library, 'library.json')).then(
      () => false,
      () => true
    );
    if (missing) {
      const old = await fetch('http://127.0.0.1:4317/api/health', { signal: AbortSignal.timeout(1000) })
        .then(r => r.json())
        .catch(() => null);
      if (old?.app === 'shengjian')
        throw new Error(
          '检测到旧版声间网页服务正在运行。请先停止旧服务，再重新打开 App；旧数据会自动复制并保留备份。'
        );
      await migrateLegacyLibrary(legacy, library);
    }
  }
  releaseLock = await acquireLibraryLock(library);
  process.env.HARMONIS_MEDIA_DIR = app.isPackaged
    ? path.join(process.resourcesPath, 'media')
    : path.join(root, 'vendor', 'darwin-' + process.arch);
  if (app.isPackaged) process.env.HARMONIS_SYNTH_DIR = path.join(process.resourcesPath, 'synth');
  // Finder launches have a minimal PATH. Optional Python can still be discovered.
  process.env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH]
    .filter(Boolean)
    .join(path.delimiter);
  const token = randomBytes(32).toString('hex');
  const { createApp } = await import('../src/server.js');
  const service = createApp({ dataDir: library, sessionToken: token });
  store = service.store;
  const preferencesFile = path.join(app.getPath('userData'), 'desktop.json');
  const preferences = await fs
    .readFile(preferencesFile, 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));
  const preferredPort =
    Number.isInteger(preferences.port) && preferences.port > 1024 && preferences.port < 65536
      ? preferences.port
      : 4318;
  const listen = port =>
    new Promise((resolve, reject) => {
      const candidate = service.app.listen(port, '127.0.0.1', () => resolve(candidate));
      candidate.once('error', reject);
    });
  server = await listen(preferredPort).catch(e => {
    if (e.code !== 'EADDRINUSE') throw e;
    return listen(0);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  await fs.writeFile(preferencesFile, JSON.stringify({ port: server.address().port }), { mode: 0o600 });
  const ses = session.fromPartition('persist:harmonis');
  await ses.cookies.set({
    url: origin,
    name: 'harmonis-session',
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    const allowedAudio = !details?.mediaType || details.mediaType === 'audio';
    return (
      contents === window?.webContents &&
      isLocalURL(requestingOrigin, origin) &&
      permission === 'media' &&
      allowedAudio
    );
  });
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (
      contents !== window?.webContents ||
      !isLocalURL(details.requestingUrl || contents.getURL(), origin) ||
      permission !== 'media' ||
      details.mediaTypes?.includes('video')
    )
      return callback(false);
    try {
      callback(
        process.platform === 'darwin' ? await systemPreferences.askForMediaAccess('microphone') : true
      );
    } catch {
      callback(false);
    }
  });
  ses.on('will-download', (event, item) => {
    if (!isLocalURL(item.getURL(), origin)) {
      event.preventDefault();
      return;
    }
    item.setSaveDialogOptions({
      title: '导出音频',
      defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())),
    });
  });
  ipcMain.handle('select-script-folder', async event => {
    if (!trusted(event)) throw new Error('不允许的请求');
    const selected = await dialog.showOpenDialog(window, {
      title: '选择克隆稿文件夹',
      properties: ['openDirectory'],
    });
    return selected.canceled ? null : selected.filePaths[0];
  });
  ipcMain.handle('open-data-folder', async event => {
    if (!trusted(event)) throw new Error('不允许的请求');
    return shell.openPath(library);
  });
  app.setAboutPanelOptions({
    applicationName: 'Harmonis · 声间',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Harmonis contributors',
    credits: 'Voice & music workbench. Uses FFmpeg and LAME under LGPL. See Help → Third-party notices.',
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Harmonis',
        submenu: [
          { role: 'about', label: '关于 Harmonis' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: '退出 Harmonis' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '显示',
        submenu: [
          { role: 'reload' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
      {
        label: '帮助',
        submenu: [
          { label: '使用指南', click: () => openExternal('https://github.com/0mn1si2i5/harmonis#readme') },
          { label: '打开本机数据目录', click: () => shell.openPath(library) },
          {
            label: '第三方软件声明',
            click: () =>
              shell.openPath(
                path.join(app.isPackaged ? process.resourcesPath : root, 'THIRD_PARTY_NOTICES.md')
              ),
          },
          { label: '反馈问题', click: () => openExternal('https://github.com/0mn1si2i5/harmonis/issues') },
        ],
      },
    ])
  );
  createWindow(ses);
  app.on('activate', () => {
    if (!window) createWindow(ses);
    else window.show();
  });
}

function createWindow(ses) {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#f5f6f8',
    title: 'Harmonis · 声间',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isLocalURL(url, origin)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => {
    if (!quitting && process.platform === 'darwin') {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    window = null;
  });
  window.once('ready-to-show', () => window.show());
  window.loadURL(origin);
}

app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  if (preparingQuit) return;
  if (activeJobs().length) {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: '还有任务正在运行',
      message: '退出会中断本机等待；供应商可能已经开始计费。',
      detail: '建议等待任务完成。强制退出后，请先核对供应商记录再重试。',
      buttons: ['继续等待', '仍然退出'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice !== 1) return;
  }
  preparingQuit = true;
  (async () => {
    if (window && !window.webContents.isDestroyed()) {
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            ipcMain.removeListener('draft-flushed', done);
            reject(new Error('保存超时'));
          }, 10000);
          function done(event, error) {
            if (!trusted(event)) return;
            clearTimeout(timer);
            ipcMain.removeListener('draft-flushed', done);
            error ? reject(new Error(error)) : resolve();
          }
          ipcMain.on('draft-flushed', done);
          window.webContents.send('flush-draft');
        });
      } catch (error) {
        preparingQuit = false;
        dialog.showErrorBox('草稿尚未保存，已取消退出', error.message);
        window.show();
        return;
      }
    }
    quitting = true;
    server?.closeAllConnections();
    await new Promise(resolve => (server ? server.close(resolve) : resolve()));
    await releaseLock?.();
    app.quit();
  })().catch(() => app.exit(1));
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
