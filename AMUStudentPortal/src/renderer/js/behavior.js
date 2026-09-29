'use strict';

/**
 * behavior.js — Statistical & Keystroke Behavioral Analytics (Option 1: Without Model)
 *
 * Tracks:
 * - Keystroke Flight Time & Cadence (Variance/Jitter)
 * - Real-time WPM & Typing Bursts
 * - Idle-then-Burst Anomalies (Peeking / copying neighbor's screen)
 * - Typo & Backspace Correction Ratio (Flawless typing vs Organic coding)
 * - Bulk Paste / Injection Insertion
 *
 * Generates a dynamic Suspicion Score (0-100%) and sends live telemetry
 * to the teacher server.
 */

const StudentBehavior = (() => {
  let isActive = false;
  let lastKeystrokeTime = 0;
  let lastActivityTime = Date.now();
  let keyIntervals = []; // last 35 intervals in ms
  const MAX_INTERVALS = 35;

  let windowCharCount = 0;
  let windowBackspaceCount = 0;
  let totalKeysInSession = 0;
  let totalBackspacesInSession = 0;

  let suspicionScore = 0;
  let detectedAnomalies = [];
  let recentAnomalyList = [];
  let heartbeatInterval = null;

  // Idle tracking
  let maxIdleObserved = 0;
  let wasLongIdle = false;
  let idleThresholdSeconds = 60; // 60s idle before checking burst

  // Editor hook for paste/bulk change detection
  let lastEditorLength = 0;
  let lastEditorChangeTime = Date.now();

  function init() {
    console.log('[StudentBehavior] Initialized.');
  }

  function activate() {
    if (isActive) return;
    isActive = true;
    lastActivityTime = Date.now();
    lastKeystrokeTime = Date.now();
    suspicionScore = 0;
    detectedAnomalies = [];
    recentAnomalyList = [];

    // Listen to keyboard events globally inside document
    document.addEventListener('keydown', _onKeyDown, true);

    // Heartbeat: compute metrics & report to server every 8s
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(_evaluateAndReport, 8000);

    console.log('[StudentBehavior] Active — Monitoring keystroke dynamics.');
  }

  function deactivate() {
    isActive = false;
    document.removeEventListener('keydown', _onKeyDown, true);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  function _onKeyDown(e) {
    if (!isActive) return;

    const now = Date.now();
    const idleSeconds = Math.floor((now - lastActivityTime) / 1000);

    // Check if coming out of a long idle
    if (idleSeconds >= idleThresholdSeconds) {
      wasLongIdle = true;
      maxIdleObserved = idleSeconds;
    }

    lastActivityTime = now;

    // Track interval between keystrokes
    if (lastKeystrokeTime > 0) {
      const delta = now - lastKeystrokeTime;
      if (delta < 3000) { // ignore pauses > 3s as intervals
        keyIntervals.push(delta);
        if (keyIntervals.length > MAX_INTERVALS) {
          keyIntervals.shift();
        }
      }
    }
    lastKeystrokeTime = now;

    // Track keys
    totalKeysInSession++;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      windowBackspaceCount++;
      totalBackspacesInSession++;
    } else if (e.key.length === 1) {
      windowCharCount++;
    }

    // Detect burst coming right after long idle
    if (wasLongIdle && windowCharCount >= 60) {
      const anomalyMsg = `Burst Typing (${windowCharCount} chars) immediately after ${maxIdleObserved}s idle`;
      _flagAnomaly(anomalyMsg, 35);
      wasLongIdle = false;
    }
  }

  // Hook called by Monaco Editor on content change
  function notifyEditorChange(newLength) {
    if (!isActive) return;
    const now = Date.now();
    const deltaChars = newLength - lastEditorLength;
    const deltaTime = now - lastEditorChangeTime;

    // Large insertion in a single tick without typing
    if (deltaChars >= 40 && deltaTime < 50) {
      _flagAnomaly(`Sudden code injection (+${deltaChars} characters in ${deltaTime}ms)`, 45);
    }

    lastEditorLength = newLength;
    lastEditorChangeTime = now;
  }

  function _flagAnomaly(description, scorePenalty) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${description}`;
    
    // Avoid spamming exact same anomaly within 15 seconds
    if (!recentAnomalyList.some(a => a.desc === description && (Date.now() - a.time < 15000))) {
      recentAnomalyList.push({ desc: description, time: Date.now() });
      detectedAnomalies.unshift(entry);
      if (detectedAnomalies.length > 8) detectedAnomalies.pop();

      suspicionScore = Math.min(100, suspicionScore + scorePenalty);
      console.warn(`[StudentBehavior] ⚠️ Anomaly Flagged: ${description} (Score: ${suspicionScore})`);

      // Trigger immediate report on high score spike
      _sendReport(description);
    }
  }

  function _calculateMetrics() {
    const now = Date.now();
    const idleSeconds = Math.max(0, Math.floor((now - lastActivityTime) / 1000));

    // Calculate rolling WPM (chars typed in last 8s / 5 / (8 / 60))
    const wpm = Math.round((windowCharCount / 5) / (8 / 60));

    // Calculate Backspace / Error Correction Ratio
    const totalKeys = windowCharCount + windowBackspaceCount;
    const backspaceRatio = totalKeys > 0 ? Math.round((windowBackspaceCount / totalKeys) * 100) : 0;

    // Calculate Keystroke Flight-Time Variance
    let meanInterval = 0;
    let variance = 0;
    if (keyIntervals.length >= 5) {
      const sum = keyIntervals.reduce((a, b) => a + b, 0);
      meanInterval = sum / keyIntervals.length;
      const squaredDiffs = keyIntervals.map(i => Math.pow(i - meanInterval, 2));
      variance = Math.round(Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / keyIntervals.length));
    }

    // Heuristic 1: Unnatural typing speed (> 140 WPM continuous)
    if (wpm >= 140 && windowCharCount >= 70) {
      _flagAnomaly(`Abnormally high typing speed (${wpm} WPM)`, 25);
    }

    // Heuristic 2: Flawless transcription (Fast typing >= 65 WPM with 0 backspaces/corrections)
    if (wpm >= 65 && windowCharCount >= 100 && backspaceRatio === 0) {
      _flagAnomaly(`Unnatural zero-error transcription rhythm (0% backspaces across ${windowCharCount} chars)`, 30);
    }

    // Heuristic 3: Robotic cadence (Variance < 12ms with at least 15 keystrokes)
    if (keyIntervals.length >= 15 && variance < 12 && meanInterval > 30) {
      _flagAnomaly(`Mechanical typing cadence detected (Keystroke variance: ${variance}ms)`, 25);
    }

    // Reset window counters for next 8s interval
    windowCharCount = 0;
    windowBackspaceCount = 0;

    // Decay score gently if student behaves normally
    if (detectedAnomalies.length === 0 || idleSeconds < 60) {
      suspicionScore = Math.max(0, suspicionScore - 2);
    }

    let riskLevel = 'NORMAL';
    if (suspicionScore >= 60) riskLevel = 'HIGH_RISK';
    else if (suspicionScore >= 25) riskLevel = 'UNUSUAL';

    return {
      wpm,
      idleSeconds,
      keystrokeVariance: variance,
      backspaceRatio,
      suspicionScore,
      riskLevel,
      anomalies: detectedAnomalies.slice(0, 5)
    };
  }

  function _evaluateAndReport() {
    if (!isActive) return;
    const metrics = _calculateMetrics();
    _sendReport(null, metrics);
  }

  function _sendReport(alertAnomaly = null, computedMetrics = null) {
    const metrics = computedMetrics || _calculateMetrics();
    const payload = {
      ...metrics,
      alertAnomaly: alertAnomaly || null
    };

    if (window.examAPI && typeof window.examAPI.reportBehavior === 'function') {
      window.examAPI.reportBehavior(payload);
    }
  }

  return {
    init,
    activate,
    deactivate,
    notifyEditorChange,
    getSuspicionScore: () => suspicionScore,
    getAnomalies: () => [...detectedAnomalies]
  };
})();

window.StudentBehavior = StudentBehavior;
