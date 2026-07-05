const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminAPI', {
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  getAdminCredentials: () => ipcRenderer.invoke('get-admin-credentials'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  startServer: (port) => ipcRenderer.invoke('start-server', port),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getConnectedClients: () => ipcRenderer.invoke('get-connected-clients'),
  generateAako: () => ipcRenderer.invoke('generate-aako'),

  onClientsUpdate: (callback) => {
    ipcRenderer.on('clients-update', (_event, clients) => callback(clients));
  },
  onServerStopped: (callback) => {
    ipcRenderer.on('server-stopped', () => callback());
  },
  onServerLog: (callback) => {
    ipcRenderer.on('server-log', (_event, msg) => callback(msg));
  }
});
