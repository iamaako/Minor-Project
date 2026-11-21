'use strict';

/**
 * timer.js — Exam Countdown Timer
 *
 * Server-authoritative: syncs with timer-sync events from the server.
 * Falls back to local counting if no sync received.
 */

const Timer = (() => {
  let totalSeconds    = 0;
  let remainingSeconds = 0;
  let intervalId      = null;
  let onExpireCallback = null;
  let isTicking       = false;
  // True until start() and after pause()/stop(). A server sync must not start or restart a halted timer.
  let halted          = true;

  const displayEl   = document.getElementById('timer-display');
  const progressEl  = document.getElementById('timer-progress');

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateUI() {
    if (!displayEl || !progressEl) return;

    displayEl.textContent = formatTime(remainingSeconds);

    const pct = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
    progressEl.style.width = `${Math.max(0, pct)}%`;

    // Warning states
    progressEl.classList.remove('warning', 'danger');
    displayEl.style.color = '';

    if (totalSeconds === 0) {
      // Special state: waiting for questions, no timer active
      progressEl.classList.remove('warning', 'danger');
      displayEl.style.color = '';
      displayEl.style.animation = '';
    } else if (remainingSeconds <= 120) {
      // < 2 min — red danger
      progressEl.classList.add('danger');
      displayEl.style.color = 'var(--clr-error)';
      displayEl.style.animation = 'blink-dot 0.5s step-end infinite';
    } else if (remainingSeconds <= 600) {
      // < 10 min — yellow warning
      progressEl.classList.add('warning');
      displayEl.style.color = 'var(--clr-warning)';
      displayEl.style.animation = '';
    } else {
      displayEl.style.animation = '';
    }
  }

  function tick() {
    if (!isTicking) return;
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    updateUI();

    if (remainingSeconds <= 0 && totalSeconds > 0) {
      stop();
      if (typeof onExpireCallback === 'function') {
        onExpireCallback();
      }
    }
  }

  function start(durationMinutes, onExpire) {
    stop(); // Clear any existing timer
    totalSeconds      = durationMinutes * 60;
    remainingSeconds  = totalSeconds;
    onExpireCallback  = onExpire;
    
    if (totalSeconds === 0) {
      isTicking = false;
      updateUI();
      return;
    }

    halted            = false;
    isTicking         = true;
    updateUI();
    intervalId = setInterval(tick, 1000);
  }

  function startWithRemaining(remaining, total, onExpire) {
    stop();
    totalSeconds = total;
    remainingSeconds = remaining;
    onExpireCallback = onExpire;
    
    if (remainingSeconds <= 0) {
      isTicking = false;
      updateUI();
      if (typeof onExpireCallback === 'function') onExpireCallback();
      return;
    }
    
    halted = false;
    isTicking = true;
    updateUI();
    intervalId = setInterval(tick, 1000);
  }

  function syncFromServer(data) {
    // data: { remainingSeconds: number, totalSeconds?: number }
    if (!data || !Number.isFinite(data.remainingSeconds)) return;
    if (data.totalSeconds) {
      totalSeconds = data.totalSeconds;
    }
    remainingSeconds = data.remainingSeconds;
    // Only an active timer is (re)started by a sync. A paused or stopped one stays halted.
    if (!halted && !isTicking && remainingSeconds > 0) {
      isTicking = true;
      intervalId = setInterval(tick, 1000);
    }
    updateUI();
  }

  function pause() {
    halted = true;
    isTicking = false;
    clearInterval(intervalId);
    intervalId = null;
  }

  function resume() {
    halted = false;
    if (!isTicking && remainingSeconds > 0) {
      isTicking = true;
      intervalId = setInterval(tick, 1000);
    }
  }

  function stop() {
    halted = true;
    isTicking = false;
    clearInterval(intervalId);
    intervalId = null;
  }

  function getRemainingSeconds() {
    return remainingSeconds;
  }

  return { start, startWithRemaining, stop, pause, resume, syncFromServer, getRemainingSeconds };
})();

window.Timer = Timer;
