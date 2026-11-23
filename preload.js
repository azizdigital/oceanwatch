'use strict';
/* Monsoon EYE / Sentinel OceanWATCH (PC) - the only desktop features the page can reach. Everything else goes through /api on the local server,
   which is the same for the desktop window and the phone. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcDesktop', {
  desktop: true,
  info: () => { try { return ipcRenderer.sendSync('mc:info') || {}; } catch (e) { return {}; } },
  lan: () => { try { return ipcRenderer.sendSync('mc:lan') || []; } catch (e) { return []; } },
  openExternal: url => ipcRenderer.invoke('mc:openExternal', String(url)),
  importOriginal: () => ipcRenderer.invoke('mc:importOriginal'),
  openDataDir: () => ipcRenderer.invoke('mc:openDataDir'),
  clearSiteData: () => ipcRenderer.invoke('mc:clearSiteData'),
  savePdf: name => ipcRenderer.invoke('mc:savePdf', String(name || '')),
  adblockInfo: webContentsId => ipcRenderer.invoke('mc:adblockInfo', +webContentsId || 0),
  adblockUpdate: () => ipcRenderer.invoke('mc:adblockUpdate'),
  relayTest: (url, key, targets) => ipcRenderer.invoke('mc:relayTest', String(url || ''), String(key || ''), Array.isArray(targets) ? targets.slice(0, 12).map(t => ({ id: String(t.id), url: String(t.url) })) : []),
  onShortcut: cb => ipcRenderer.on('mc:shortcut', (e, a) => { try { cb(a); } catch (err) { /* */ } }),
  onNav: cb => ipcRenderer.on('mc:nav', (e, v) => { try { cb(v); } catch (err) { /* */ } })
});
