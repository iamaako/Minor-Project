'use strict';

/**
 * socket.js — Server Connection Status (Renderer Side)
 *
 * The actual Socket.io connection lives in the main process.
 * This module manages the UI representation of connection state
 * and routes incoming server events to the right app handlers.
 */

const SocketBridge = (() => {
  let isConnected = false;
  let isMockMode  = false;

  // DOM elements for connection status
  const connDotLogin  = document.getElementById('login-conn-dot');
  const connDotStatus = document.getElementById('status-conn-dot');
  const connTextEl    = document.getElementById('status-conn-text');

  let initialized = false;

  function init() {
    // init() runs on every "Connect" click; register the IPC listener only once.
    if (initialized) return;
    if (!window.examAPI) {
      console.error('[SocketBridge] examAPI not available — preload may have failed.');
      return;
    }

    initialized = true;

    // Connection status updates from main process
    window.examAPI.onConnectionStatus((status) => {
      isConnected = status.connected;
      isMockMode  = status.mock || false;
      _updateConnectionUI(status);
    });
  }

  function _updateConnectionUI(status) {
    // Login screen dot
    if (connDotLogin) {
      connDotLogin.classList.remove('connected', 'connecting');
      if (status.connected) {
        connDotLogin.classList.add('connected');
      }
    }

    // Status bar dot + text
    if (connDotStatus) {
      connDotStatus.classList.remove('connected', 'connecting');
      if (status.connected) {
        connDotStatus.classList.add('connected');
      }
    }

    if (connTextEl) {
      if (status.connected && isMockMode) {
        connTextEl.textContent = 'Mock Mode';
        connTextEl.style.color = 'var(--clr-warning)';
      } else if (status.connected) {
        connTextEl.textContent = 'Connected';
        connTextEl.style.color = 'var(--clr-success)';
      } else if (status.error) {
        connTextEl.textContent = 'Connection Failed';
        connTextEl.style.color = 'var(--clr-error)';
      } else {
        connTextEl.textContent = 'Connecting...';
        connTextEl.style.color = '';
      }
    }

    // Update connecting screen status text
    const connectStatusEl = document.getElementById('connect-status');
    if (connectStatusEl) {
      if (status.connected) {
        connectStatusEl.textContent = 'Connected! Loading login screen...';
        connectStatusEl.style.color = 'var(--clr-success)';
      } else if (status.error) {
        connectStatusEl.textContent = `Error: Failed to connect`;
        connectStatusEl.style.color = 'var(--clr-error)';
      }
    }
  }

  function getConnectionState() {
    return { isConnected, isMockMode };
  }

  return { init, getConnectionState };
})();

window.SocketBridge = SocketBridge;
