'use strict';

/**
 * webcamProctor.js — Real-Time On-Device AI Webcam Proctoring
 *
 * Uses lightweight on-device Face-API models (TinyFaceDetector + FaceLandmark68)
 * completely OFFLINE in the Electron renderer.
 *
 * Capabilities:
 * - Detects head turning left/right (looking beside at neighbor)
 * - Tracks continuous duration (triggers after 1.5 - 2s of looking away)
 * - Captures evidentiary snapshot and alerts the Teacher Admin Server
 * - Provides an XP-themed floating Picture-in-Picture (PiP) window
 */

const WebcamProctor = (() => {
  let isRunning = false;
  let videoStream = null;
  let animFrameId = null;
  let intervalTimer = null;

  // DOM Elements
  let pipBox = null;
  let pipTitlebar = null;
  let btnMin = null;
  let videoEl = null;
  let canvasEl = null;
  let statusDot = null;
  let statusText = null;

  // State Tracking
  let lookingAsideDirection = null; // 'LEFT', 'RIGHT', null
  let asideStartTime = 0;
  let lastViolationTime = 0;
  let totalViolations = 0;
  const ASIDE_WARNING_THRESHOLD_MS = 1000; // 1 second: warning indicator
  const ASIDE_VIOLATION_THRESHOLD_MS = 2000; // 2 seconds: log official violation
  const VIOLATION_COOLDOWN_MS = 4500; // 4.5s cooldown between consecutive snapshots

  let isModelsLoaded = false;
  let isModelLoading = false;

  function _bindElements() {
    if (!pipBox) pipBox = document.getElementById('webcam-pip');
    if (!pipTitlebar) pipTitlebar = document.getElementById('webcam-pip-titlebar');
    if (!btnMin) btnMin = document.getElementById('btn-toggle-webcam');
    if (!videoEl) videoEl = document.getElementById('webcam-video');
    if (!canvasEl) canvasEl = document.getElementById('webcam-overlay');
    if (!statusDot) statusDot = document.getElementById('webcam-status-dot');
    if (!statusText) statusText = document.getElementById('webcam-status-text');
  }

  async function _ensureBackend() {
    if (typeof faceapi === 'undefined' || !faceapi.tf) return;
    try {
      await faceapi.tf.setBackend('webgl');
      await faceapi.tf.ready();
      console.log('[WebcamProctor] WebGL backend initialized successfully.');
      return;
    } catch (e) {
      console.warn('[WebcamProctor] WebGL unavailable, falling back to CPU backend:', e.message);
    }

    try {
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      console.log('[WebcamProctor] CPU backend initialized successfully.');
    } catch (err) {
      console.error('[WebcamProctor] CPU backend initialization error:', err);
    }
  }

  async function init() {
    console.log('[WebcamProctor] Initializing...');
    _bindElements();
    _setupDraggable();
    _setupMinimize();

    // Start background model loading
    _loadModels().catch(err => {
      console.warn('[WebcamProctor] Background model preload note:', err.message);
    });
  }

  async function _loadModels() {
    if (isModelsLoaded || isModelLoading) return;
    if (typeof faceapi === 'undefined') {
      console.warn('[WebcamProctor] faceapi is not available yet.');
      return;
    }

    isModelLoading = true;
    await _ensureBackend();

    console.log('[WebcamProctor] Loading offline AI models from ./assets/models...');
    try {
      const MODEL_PATH = './assets/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH)
      ]);
      isModelsLoaded = true;
      console.log('[WebcamProctor] Offline face detection models ready.');
      if (isRunning) {
        _updateStatus('green', '● Proctoring Active');
      }
    } catch (err) {
      console.error('[WebcamProctor] Error loading models:', err);
    } finally {
      isModelLoading = false;
    }
  }

  async function start() {
    console.log('[WebcamProctor] start() invoked');
    _bindElements();

    if (pipBox) {
      pipBox.classList.remove('hidden');
      pipBox.style.display = 'block';
      pipBox.style.visibility = 'visible';
    }

    if (isRunning) {
      console.log('[WebcamProctor] Already running.');
      return;
    }

    _updateStatus('yellow', 'Starting Camera...');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is unavailable');
      }

      videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 20 }
        },
        audio: false
      });

      if (videoEl) {
        videoEl.srcObject = videoStream;
        await new Promise((resolve) => {
          videoEl.onloadedmetadata = () => {
            videoEl.play().catch(e => console.warn('Play error:', e));
            resolve();
          };
        });
      }

      isRunning = true;
      _updateStatus('green', isModelsLoaded ? '● Proctoring Active' : 'Loading AI Engine...');

      if (!isModelsLoaded) {
        _loadModels().then(() => {
          if (isRunning) {
            _updateStatus('green', '● Proctoring Active');
            _startDetectionLoop();
          }
        });
      } else {
        _startDetectionLoop();
      }

      console.log('[WebcamProctor] Live monitoring successfully initialized.');
    } catch (err) {
      console.warn('[WebcamProctor] Camera access notice:', err.message);
      _updateStatus('yellow', 'No Camera / In Use');
    }
  }

  function stop() {
    isRunning = false;
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (videoStream) {
      try {
        videoStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      videoStream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    _clearCanvas();
    if (pipBox) {
      pipBox.classList.add('hidden');
    }
    console.log('[WebcamProctor] Live monitoring stopped.');
  }

  // ── Detection Loop (Runs every ~130ms for 7-8 FPS to maintain near-zero CPU impact) ──
  function _startDetectionLoop() {
    if (intervalTimer) clearInterval(intervalTimer);

    intervalTimer = setInterval(async () => {
      if (!isRunning || !isModelsLoaded || !videoEl || videoEl.paused || videoEl.ended) return;

      try {
        const detectorOptions = new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: 0.5
        });

        const detection = await faceapi
          .detectSingleFace(videoEl, detectorOptions)
          .withFaceLandmarks(false);

        _processDetection(detection);
      } catch (err) {
        // Silently catch individual frame errors
      }
    }, 130);
  }

  // ── Head Pose & Looking Aside Analysis ──
  function _processDetection(detection) {
    if (!canvasEl || !videoEl) return;

    const displaySize = { width: videoEl.offsetWidth || 214, height: videoEl.offsetHeight || 150 };
    canvasEl.width = displaySize.width;
    canvasEl.height = displaySize.height;

    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const now = Date.now();

    if (!detection) {
      // No face currently visible
      _setBoxState('warning-state');
      _updateStatus('yellow', 'No Face in View');
      asideStartTime = 0;
      lookingAsideDirection = null;
      return;
    }

    const landmarks = detection.landmarks;
    const positions = landmarks.positions;

    // Landmark references:
    // 30: Nose tip
    // 36: Right eye outer corner (subject's perspective: left)
    // 45: Left eye outer corner (subject's perspective: right)
    const nose = positions[30];
    const eyeR = positions[36]; // in frame X
    const eyeL = positions[45]; // in frame X

    const eyeMidX = (eyeR.x + eyeL.x) / 2;
    const eyeDist = Math.abs(eyeL.x - eyeR.x);

    // Euclidean distance from nose to both eye outer corners
    const distToR = Math.hypot(nose.x - eyeR.x, nose.y - eyeR.y);
    const distToL = Math.hypot(eyeL.x - nose.x, eyeL.y - nose.y);
    const symmetry = distToR / (distToL + 1e-5);
    const noseOffset = (nose.x - eyeMidX) / (eyeDist + 1e-5);

    // Direction calculation:
    // When subject turns head to their RIGHT (towards right neighbor):
    // In camera image (unmirrored), nose moves rightwards towards eyeL -> noseOffset > 0.16, symmetry > 1.65
    // When subject turns head to their LEFT (towards left neighbor):
    // In camera image, nose moves leftwards towards eyeR -> noseOffset < -0.16, symmetry < 0.60
    let currentDirection = 'CENTER';

    if (noseOffset > 0.16 || symmetry > 1.65) {
      currentDirection = 'RIGHT';
    } else if (noseOffset < -0.16 || symmetry < 0.60) {
      currentDirection = 'LEFT';
    }

    // ── Evaluate Duration & Violations ──
    if (currentDirection !== 'CENTER') {
      if (lookingAsideDirection !== currentDirection) {
        lookingAsideDirection = currentDirection;
        asideStartTime = now;
      }

      const elapsed = now - asideStartTime;

      if (elapsed >= ASIDE_VIOLATION_THRESHOLD_MS) {
        // Severe violation: Student has been looking beside at their neighbor
        _setBoxState('violation-state');
        _updateStatus('red', `🚨 Looking ${currentDirection}! (${(elapsed / 1000).toFixed(1)}s)`);

        if (now - lastViolationTime > VIOLATION_COOLDOWN_MS) {
          lastViolationTime = now;
          _triggerViolation(currentDirection, elapsed);
        }
      } else if (elapsed >= ASIDE_WARNING_THRESHOLD_MS) {
        _setBoxState('warning-state');
        _updateStatus('yellow', `⚠ Looking ${currentDirection} (${(elapsed / 1000).toFixed(1)}s)`);
      }
    } else {
      // Facing screen properly
      lookingAsideDirection = null;
      asideStartTime = 0;
      _setBoxState('');
      _updateStatus('green', '● Facing Screen (Normal)');
    }

    // ── Draw Visual Feedback Overlay on Canvas ──
    _drawOverlay(ctx, detection.alignedRect._box, currentDirection, displaySize);
  }

  function _drawOverlay(ctx, box, direction, displaySize) {
    if (!box) return;

    // Rescale box from video internal coordinates (320x240) to display canvas size
    const scaleX = displaySize.width / (videoEl.videoWidth || 320);
    const scaleY = displaySize.height / (videoEl.videoHeight || 240);

    // Because video is mirrored via CSS scaleX(-1), mirror canvas box horizontally so it aligns
    const rawX = box._x * scaleX;
    const rawY = box._y * scaleY;
    const boxW = box._width * scaleX;
    const boxH = box._height * scaleY;
    const mirroredX = displaySize.width - rawX - boxW;

    ctx.save();
    ctx.lineWidth = 2;

    if (direction === 'CENTER') {
      ctx.strokeStyle = '#22c55e'; // Green
      ctx.fillStyle = '#22c55e';
    } else if (lookingAsideDirection && (Date.now() - asideStartTime >= ASIDE_VIOLATION_THRESHOLD_MS)) {
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.fillStyle = '#ef4444';
    } else {
      ctx.strokeStyle = '#f59e0b'; // Amber
      ctx.fillStyle = '#f59e0b';
    }

    // Draw Face Bounding Box
    ctx.strokeRect(mirroredX, rawY, boxW, boxH);

    // Direction Label Pill
    ctx.font = 'bold 10px Tahoma, sans-serif';
    const label = direction === 'CENTER' 
      ? '✓ SCREEN FOCUS' 
      : `⚠ LOOKING ${direction}`;
    const textWidth = ctx.measureText(label).width;

    ctx.fillRect(mirroredX, Math.max(0, rawY - 16), textWidth + 8, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, mirroredX + 4, Math.max(12, rawY - 4));

    ctx.restore();
  }

  function _triggerViolation(direction, durationMs) {
    totalViolations++;
    console.warn(`[WebcamProctor] Violation #${totalViolations}: Looking ${direction} for ${(durationMs / 1000).toFixed(1)}s`);

    // Capture evidentiary snapshot from webcam
    const snapshot = _captureSnapshot();

    // 1. Send to Electron Main Process -> Server
    if (window.examAPI && window.examAPI.reportWebcamViolation) {
      window.examAPI.reportWebcamViolation({
        type: 'LOOKING_BESIDE',
        direction: direction,
        durationSeconds: Math.round(durationMs / 1000),
        snapshot: snapshot,
        violationCount: totalViolations,
        timestamp: Date.now()
      });
    }

    // 2. Update status bar violations count
    const statusViolationsEl = document.getElementById('status-violations');
    if (statusViolationsEl) {
      statusViolationsEl.textContent = `⚠ ${totalViolations}`;
      statusViolationsEl.style.color = '#dc2626';
      statusViolationsEl.style.fontWeight = 'bold';
    }

    // 3. Show warning banner
    _showWarningToast(`Warning: Looking away or at your neighbor (${direction}) is prohibited. Violation recorded.`);
  }

  function _captureSnapshot() {
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 320;
      snapCanvas.height = 240;
      const snapCtx = snapCanvas.getContext('2d');
      snapCtx.drawImage(videoEl, 0, 0, 320, 240);
      return snapCanvas.toDataURL('image/jpeg', 0.55);
    } catch (e) {
      return null;
    }
  }

  function _showWarningToast(message) {
    let banner = document.getElementById('webcam-warning-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'webcam-warning-banner';
      banner.style.cssText = `
        position: fixed;
        top: 65px;
        left: 50%;
        transform: translateX(-50%);
        background: #ef4444;
        color: white;
        padding: 8px 16px;
        border: 2px solid #b91c1c;
        border-radius: 4px;
        font-family: 'Tahoma', sans-serif;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(banner);
    }

    banner.innerHTML = `<span>🚨</span> <span>${message}</span>`;
    banner.style.display = 'flex';
    banner.style.opacity = '1';

    setTimeout(() => {
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; }, 300);
    }, 3500);
  }

  function _updateStatus(dotColor, text) {
    if (statusDot) {
      statusDot.className = `webcam-status-dot ${dotColor}`;
    }
    if (statusText) {
      statusText.textContent = text;
    }
  }

  function _setBoxState(stateClass) {
    if (!pipBox) return;
    pipBox.classList.remove('warning-state', 'violation-state');
    if (stateClass) {
      pipBox.classList.add(stateClass);
    }
  }

  function _clearCanvas() {
    if (canvasEl) {
      const ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  // ── Drag & Drop UI Setup ──
  function _setupDraggable() {
    if (!pipTitlebar || !pipBox) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    pipTitlebar.addEventListener('mousedown', (e) => {
      if (e.target === btnMin) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = pipBox.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Switch from bottom/right to top/left positioning for smooth drag
      pipBox.style.bottom = 'auto';
      pipBox.style.right = 'auto';
      pipBox.style.left = `${initialLeft}px`;
      pipBox.style.top = `${initialTop}px`;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // Restrict within viewport bounds
      const maxLeft = window.innerWidth - pipBox.offsetWidth - 10;
      const maxTop = window.innerHeight - pipBox.offsetHeight - 30;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      pipBox.style.left = `${newLeft}px`;
      pipBox.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // ── Minimize Toggle ──
  function _setupMinimize() {
    if (!btnMin || !pipBox) return;
    btnMin.addEventListener('click', (e) => {
      e.stopPropagation();
      pipBox.classList.toggle('minimized');
      btnMin.textContent = pipBox.classList.contains('minimized') ? '□' : '_';
    });
  }

  return {
    init,
    start,
    stop,
    getViolationCount: () => totalViolations
  };
})();

// Explicitly attach to window
window.WebcamProctor = WebcamProctor;
console.log('[WebcamProctor] Module loaded and attached to window.');
