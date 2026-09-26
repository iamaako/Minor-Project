'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Script — The ONLY bridge between Node.js and the renderer.
 *
 * Security: The renderer process has NO access to Node.js APIs.
 * Only these explicitly whitelisted functions are exposed via contextBridge.
 */
contextBridge.exposeInMainWorld('examAPI', {

  // ── Code Execution (Interactive) ──
  startInteractive: (code, language) =>
    ipcRenderer.invoke('start-interactive', { code, language }),

  sendTerminalInput: (text) =>
    ipcRenderer.send('terminal-input', text),

  stopInteractive: () =>
    ipcRenderer.send('stop-interactive'),

  onTerminalOutput: (callback) =>
    ipcRenderer.on('terminal-output', (_event, data) => callback(data)),

  onTerminalError: (callback) =>
    ipcRenderer.on('terminal-error', (_event, data) => callback(data)),

  onTerminalExit: (callback) =>
    ipcRenderer.on('terminal-exit', (_event, data) => callback(data)),

  // ── Authentication ──
  authenticate: (rollNumber, examPassword) =>
    ipcRenderer.invoke('authenticate', { rollNumber, examPassword }),

  // ── Network & Connection ──
  connectToServer: (ip, port) => ipcRenderer.invoke('connect-server', { ip, port }),

  getClientIP: () => ipcRenderer.invoke('get-client-ip'),
  getSystemNumber: () => ipcRenderer.invoke('get-system-number'),
  saveSystemNumber: (num) => ipcRenderer.invoke('save-system-number', num),

  // ── Code Submission ──
  submitCode: (questionId, code, language) =>
    ipcRenderer.invoke('submit-code', { questionId, code, language }),

  // ── Workspace File System ──
  listWorkspace: () => ipcRenderer.invoke('list-workspace'),
  readWorkspace: (filename) => ipcRenderer.invoke('read-workspace', filename),
  writeWorkspace: (filename, content) => ipcRenderer.invoke('write-workspace', { filename, content }),
  deleteWorkspace: (filename) => ipcRenderer.invoke('delete-workspace', filename),
  clearWorkspace: () => ipcRenderer.invoke('clear-workspace'),

  // ── Setup & License ──
  manualLicenseBrowse: (sysNum) => ipcRenderer.invoke('manual-license-browse', sysNum),
  onUsbInserted: (callback) => ipcRenderer.on('usb-inserted', () => callback()),
  onLicenseProcessing: (callback) => ipcRenderer.on('license-processing', () => callback()),
  onLicenseSuccess: (callback) => ipcRenderer.on('license-success', () => callback()),
  onLicenseError: (callback) => ipcRenderer.on('license-error', (_event, msg) => callback(msg)),
  onSystemNumberUpdated: (callback) => ipcRenderer.on('system-number-updated', (_event, num) => callback(num)),

  finalSubmitAll: (codeBuffers, rollNumber) =>
    ipcRenderer.invoke('final-submit-all', { codeBuffers, rollNumber }),

  // ── Server Event Listeners (one-way: main → renderer) ──
  onExamEvent: (callback) => {
    ipcRenderer.on('exam-event', (_event, data) => callback(data));
  },

  onConnectionStatus: (callback) => {
    ipcRenderer.on('connection-status', (_event, status) => callback(status));
  },

  onTimerSync: (callback) => {
    ipcRenderer.on('timer-sync', (_event, timeData) => callback(timeData));
  },

  onQuestionsLoaded: (callback) => {
    ipcRenderer.on('questions-loaded', (_event, questions) => callback(questions));
  },

  onAuthResult: (callback) => {
    ipcRenderer.on('auth-result', (_event, result) => callback(result));
  },

  onInvigilatorEvent: (callback) => {
    ipcRenderer.on('invigilator-event', (_event, data) => callback(data));
  },

  // ── Anti-Cheat Reporting (renderer → main) ──
  reportFocusLoss: () => ipcRenderer.send('report-focus-loss'),

  // ── App Info ──
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
});
