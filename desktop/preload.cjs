const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'harmonisDesktop',
  Object.freeze({
    selectScriptFolder: () => ipcRenderer.invoke('select-script-folder'),
    openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
    onBeforeQuit: handler =>
      ipcRenderer.on('flush-draft', async () => {
        try {
          await handler();
          ipcRenderer.send('draft-flushed', null);
        } catch (error) {
          ipcRenderer.send('draft-flushed', String(error.message));
        }
      }),
  })
);
