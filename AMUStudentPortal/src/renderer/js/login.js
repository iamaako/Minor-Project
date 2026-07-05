'use strict';

/**
 * login.js — Login Dialog Logic
 *
 * Handles the classic Windows XP logon dialog:
 * - Roll number + exam password input
 * - Caps lock detection
 * - Communicates with main process via examAPI.authenticate()
 * - Shows XP-style error messages on failure
 */

const Login = (() => {
  const rollInput     = document.getElementById('input-roll');
  const passInput     = document.getElementById('input-password');
  const loginBtn      = document.getElementById('btn-login');
  const loginError    = document.getElementById('login-error');
  const loginErrText  = document.getElementById('login-error-text');
  const loginBody     = document.getElementById('login-body');
  const loginSpinner  = document.getElementById('login-spinner');
  const capsWarn      = document.getElementById('capslock-warn');
  const clientIpEl    = document.getElementById('login-client-ip');

  let onSuccessCallback = null;

  // ── Public: Initialize ────────────────────────────────

  async function init(onSuccess) {
    onSuccessCallback = onSuccess;

    // Populate seat IP
    if (window.examAPI && clientIpEl) {
      const ip = await window.examAPI.getClientIP();
      clientIpEl.textContent = ip || '—';
    }

    // Enter key submits form
    rollInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
    passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') _submit(); });

    // Auto-uppercase roll number
    rollInput.addEventListener('input', () => {
      rollInput.value = rollInput.value.toUpperCase();
    });

    // Login button
    loginBtn.addEventListener('click', _submit);

    // Caps lock detection
    passInput.addEventListener('keyup', _checkCapsLock);
    document.addEventListener('keydown', _checkCapsLock);

    // Listen for auth result from main process
    if (window.examAPI) {
      window.examAPI.onAuthResult((result) => {
        _handleAuthResult(result);
      });
    }

    // Auto-focus roll number
    setTimeout(() => rollInput.focus(), 100);
  }

  // ── Internal: Submit ──────────────────────────────────

  async function _submit() {
    const roll     = rollInput.value.trim();
    const password = passInput.value;

    // Client-side validation
    if (!roll) {
      _showError('Please enter your Roll Number.');
      rollInput.focus();
      return;
    }
    if (!password) {
      _showError('Please enter the Exam Password.');
      passInput.focus();
      return;
    }

    _setLoading(true);
    _hideError();

    try {
      const result = await window.examAPI.authenticate(roll, password);
      _handleAuthResult(result);
    } catch (err) {
      _setLoading(false);
      _showError('Connection error. Please check your network and try again.');
    }
  }

  // ── Internal: Handle auth result ──────────────────────

  function _handleAuthResult(result) {
    _setLoading(false);

    if (result && result.success) {
      // Store student info for display
      _hideError();
      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback(result);
      }
    } else {
      const msg = (result && result.message) || 'Invalid credentials. Please try again.';
      _showError(msg);
      passInput.value = '';
      passInput.focus();
      // Shake animation
      const win = document.querySelector('.login-window');
      if (win) {
        win.style.animation = 'none';
        setTimeout(() => { win.style.animation = ''; }, 10);
      }
    }
  }

  // ── Internal: Error display ───────────────────────────

  function _showError(message) {
    if (loginError)   loginError.classList.remove('hidden');
    if (loginErrText) loginErrText.textContent = message;
  }

  function _hideError() {
    if (loginError) loginError.classList.add('hidden');
  }

  // ── Internal: Loading state ───────────────────────────

  function _setLoading(loading) {
    if (loginBtn)    loginBtn.disabled = loading;
    if (loginSpinner) loginSpinner.style.display = loading ? 'inline-block' : 'none';
    if (loginBody)   loginBody.classList.toggle('loading', loading);
  }

  // ── Internal: Caps lock detection ────────────────────

  function _checkCapsLock(e) {
    if (!capsWarn) return;
    // getModifierState is reliable for caps lock
    if (e.getModifierState && typeof e.getModifierState === 'function') {
      const caps = e.getModifierState('CapsLock');
      capsWarn.classList.toggle('visible', caps);
    }
  }

  return { init };
})();

window.Login = Login;
