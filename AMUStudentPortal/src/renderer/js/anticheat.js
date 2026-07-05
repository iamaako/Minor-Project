'use strict';

/**
 * anticheat.js — Anti-Cheat Security Module
 *
 * Tracks focus loss, blocks context menus, prevents
 * text selection outside the editor, and reports
 * violations to the main process.
 */

const AntiCheat = (() => {
  let violationCount   = 0;
  let isActive         = false;
  let isLocked         = false;
  const MAX_VIOLATIONS = 3;

  const warnOverlay    = document.getElementById('warn-overlay');
  const warnMessage    = document.getElementById('warn-message');
  const warnOkBtn      = document.getElementById('btn-warn-ok');
  const violationsEl   = document.getElementById('status-violations');

  // ── Activate (call after login succeeds) ─────────────

  function activate() {
    isActive = true;
    violationCount = 0;
    _updateViolationDisplay();

    // Visibility change API (tab switching, minimize)
    document.addEventListener('visibilitychange', _onVisibilityChange);

    // Disable right-click context menu everywhere
    document.addEventListener('contextmenu', _blockContextMenu, true);

    // Block keyboard shortcuts that could escape the app
    document.addEventListener('keydown', _blockKeys, true);

    // Prevent text selection outside the editor area
    document.addEventListener('selectstart', _restrictSelection, true);

    // Block drag-and-drop (could be used to drop files)
    document.addEventListener('dragover',  (e) => e.preventDefault(), true);
    document.addEventListener('drop',      (e) => e.preventDefault(), true);

    // Wire OK button on the warning dialog
    if (warnOkBtn) {
      warnOkBtn.addEventListener('click', _dismissWarning);
    }

    console.log('[AntiCheat] Active');
  }

  function deactivate() {
    isActive = false;
    document.removeEventListener('visibilitychange', _onVisibilityChange);
    document.removeEventListener('contextmenu', _blockContextMenu, true);
    document.removeEventListener('keydown', _blockKeys, true);
    document.removeEventListener('selectstart', _restrictSelection, true);
  }

  // ── Lock / Unlock (teacher command) ──────────────────

  function lock(message) {
    isLocked = true;
    const lockOverlay = document.getElementById('lock-overlay');
    const lockMsg     = document.getElementById('lock-message');
    if (lockOverlay) lockOverlay.classList.remove('hidden');
    if (lockMsg && message) lockMsg.textContent = message;
  }

  function unlock() {
    isLocked = false;
    const lockOverlay = document.getElementById('lock-overlay');
    if (lockOverlay) lockOverlay.classList.add('hidden');
  }

  // ── Receive focus-loss from main process ─────────────

  function onFocusLostFromMain(data) {
    if (!isActive) return;
    violationCount = data.violationCount || violationCount + 1;
    _triggerViolation(`Window focus was lost. Violation ${violationCount} of ${MAX_VIOLATIONS}.`);
  }

  // ── Internal: Visibility change ──────────────────────

  function _onVisibilityChange() {
    if (!isActive || isLocked) return;
    if (document.visibilityState === 'hidden') {
      violationCount++;
      // Report to main process
      if (window.examAPI) {
        window.examAPI.reportFocusLoss();
      }
      _triggerViolation(`Tab/window was hidden or minimized. Violation ${violationCount} of ${MAX_VIOLATIONS}.`);
    }
  }

  function _triggerViolation(message) {
    _updateViolationDisplay();
    _showWarning(message);
  }

  // ── Internal: Block context menu ─────────────────────

  function _blockContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // ── Internal: Block dangerous key combos ─────────────

  function _blockKeys(e) {
    if (!isActive) return;
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const alt  = e.altKey;

    const blocked = (
      (alt  && key === 'Tab') ||
      (alt  && key === 'F4') ||
      (ctrl && key === 'w') ||
      (ctrl && key === 'W') ||
      (ctrl && key === 'n') ||
      (ctrl && key === 'N') ||
      (ctrl && key === 't') ||
      (ctrl && key === 'T') ||
      (ctrl && e.shiftKey && key === 'I') ||
      (ctrl && e.shiftKey && key === 'J') ||
      key === 'F12' ||
      key === 'F11' ||
      (ctrl && key === 'r') ||
      (ctrl && key === 'R')
    );

    if (blocked) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ── Internal: Restrict selection outside editor ───────

  function _restrictSelection(e) {
    // Allow selection inside the monaco container and terminal output
    const allowed = ['monaco-container', 'terminal-output', 'question-panel-content'];
    let node = e.target;
    while (node && node !== document.body) {
      if (node.id && allowed.includes(node.id)) return; // Allow
      if (node.classList && (node.classList.contains('xp-input') || node.classList.contains('io-value'))) return;
      node = node.parentNode;
    }
    e.preventDefault();
  }

  // ── Internal: Show warning dialog ─────────────────────

  function _showWarning(message) {
    if (!warnOverlay || !warnMessage) return;

    let fullMessage = message;

    if (violationCount >= MAX_VIOLATIONS) {
      fullMessage = `⚠ FINAL WARNING ⚠\n\n${message}\n\nYou have reached the maximum violation limit. Your activity is being closely monitored and will be reported to the invigilator.`;
      if (warnMessage) warnMessage.style.color = 'var(--clr-error)';
    } else {
      if (warnMessage) warnMessage.style.color = '';
    }

    warnMessage.textContent = fullMessage;
    warnOverlay.classList.remove('hidden');
  }

  function _dismissWarning() {
    if (warnOverlay) warnOverlay.classList.add('hidden');
  }

  // ── Internal: Update violation counter in status bar ──

  function _updateViolationDisplay() {
    if (violationsEl) {
      violationsEl.textContent = `⚠ ${violationCount}`;
      violationsEl.style.color = violationCount > 0 ? 'var(--clr-error)' : '';
      violationsEl.title = `Focus violations: ${violationCount}`;
    }
  }

  function getViolationCount() {
    return violationCount;
  }

  return { activate, deactivate, lock, unlock, onFocusLostFromMain, getViolationCount };
})();

window.AntiCheat = AntiCheat;
