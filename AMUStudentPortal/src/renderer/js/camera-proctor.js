'use strict';

/**
 * camera-proctor.js — Real-Time Adaptive AI Proctoring Camera
 * 
 * Features:
 * 1. Instant, Live Detection:
 *    - 🟢 "Looking at Screen" (Facing center)
 *    - 🟡 "Looking Left ⚠️" (Head turned left)
 *    - 🟡 "Looking Right ⚠️" (Head turned right)
 *    - 🔴 "No Face Detected 🔴" (Student absent / covered camera)
 * 2. Visual Tracking Overlay:
 *    - Real-time face bounding box with eye & nose feature points.
 * 3. 100% Offline & Ultra-Lightweight:
 *    - Operates with 0 external network dependencies.
 *    - Adaptive luminance thresholding & facial feature asymmetry analysis.
 *    - Samples at ~6 FPS (160ms) with a tiny 80x80 crop, consuming < 2% CPU.
 */

const CameraProctor = (() => {
  let isRunning = false;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let widgetEl = null;
  let statusBadgeEl = null;
  let statusTextEl = null;
  let stream = null;
  let loopTimer = null;

  // Offscreen processing canvas for instant pixel analysis
  let procCanvas = null;
  let procCtx = null;
  const CROP_DIM = 80;

  // Native FaceDetector instance (if supported by Chromium)
  let nativeDetector = null;
  let hasNativeDetector = false;

  // State & Tracking counters
  let currentState = 'INITIALIZING';
  let consecutiveLeftCount = 0;
  let consecutiveRightCount = 0;
  let consecutiveAbsentCount = 0;

  // Debounce for sending violation reports to Teacher Admin (not for UI)
  const WARN_POSE_TICKS = 12;   // ~2.0 seconds continuous looking away
  const ALERT_ABSENT_TICKS = 14; // ~2.3 seconds continuous absent
  let lastAnomalyReportTime = 0;
  let isMinimized = false;

  // ── Initialize DOM elements ──────────────────────────────

  function init() {
    widgetEl = document.getElementById('proctor-cam-widget');
    videoEl = document.getElementById('proctor-cam-video');
    canvasEl = document.getElementById('proctor-cam-canvas');
    statusBadgeEl = document.getElementById('proctor-status-badge');
    statusTextEl = document.getElementById('proctor-status-text');

    if (canvasEl) {
      ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    }

    procCanvas = document.createElement('canvas');
    procCanvas.width = CROP_DIM;
    procCanvas.height = CROP_DIM;
    procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

    // Initialize native Shape Detection API if present
    if (typeof window.FaceDetector === 'function') {
      try {
        nativeDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        hasNativeDetector = true;
        console.log('[CameraProctor] Native FaceDetector available.');
      } catch (e) {
        hasNativeDetector = false;
      }
    }

    const btnToggle = document.getElementById('btn-toggle-cam-size');
    if (btnToggle) {
      btnToggle.addEventListener('click', toggleMinimize);
    }

    _setupDraggable();
    console.log('[CameraProctor] Initialized.');
  }

  // ── Start Proctoring Stream ──────────────────────────────

  async function start() {
    if (isRunning) return;
    if (!widgetEl) init();

    if (widgetEl) {
      widgetEl.classList.remove('hidden');
    }

    _updateStatus('INITIALIZING', 'Starting Camera...');

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 15 }
        },
        audio: false
      });

      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play();
      }

      isRunning = true;
      consecutiveLeftCount = 0;
      consecutiveRightCount = 0;
      consecutiveAbsentCount = 0;

      if (canvasEl && videoEl) {
        canvasEl.width = videoEl.videoWidth || 320;
        canvasEl.height = videoEl.videoHeight || 240;
      }

      // Live processing loop at ~6 FPS (160ms interval)
      loopTimer = setInterval(_processFrame, 160);
      console.log('[CameraProctor] Live proctoring running at 160ms interval.');

    } catch (err) {
      console.warn('[CameraProctor] Webcam error:', err.name, err.message);
      _updateStatus('UNAVAILABLE', 'Camera Unavailable');
    }
  }

  // ── Stop Proctoring Stream ───────────────────────────────

  function stop() {
    isRunning = false;
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }

    if (stream) {
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      stream = null;
    }

    if (videoEl) {
      videoEl.srcObject = null;
    }

    if (ctx && canvasEl) {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }

    if (widgetEl) {
      widgetEl.classList.add('hidden');
    }

    console.log('[CameraProctor] Proctoring stopped.');
  }

  // ── Core Frame Processing Loop ───────────────────────────

  async function _processFrame() {
    if (!isRunning || !videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return;
    }

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (canvasEl.width !== vw || canvasEl.height !== vh) {
      canvasEl.width = vw;
      canvasEl.height = vh;
    }

    let faceBox = null;

    // 1. Detect face bounding box using native detector if available
    if (hasNativeDetector && nativeDetector) {
      try {
        const faces = await nativeDetector.detect(videoEl);
        if (faces && faces.length > 0) {
          faceBox = faces[0].boundingBox;
        }
      } catch (e) {
        hasNativeDetector = false;
      }
    }

    // 2. Fallback to skin clustering if native detector found nothing
    if (!faceBox) {
      faceBox = _findFaceBoxWithSkin();
    }

    let detectedState = 'ABSENT';
    let poseResult = null;

    if (!faceBox) {
      detectedState = 'ABSENT';
    } else {
      // Analyze facial features & head pose inside faceBox
      poseResult = _analyzeFacePose(faceBox);
      detectedState = poseResult.state;
    }

    // Immediately update UI with live state
    _applyLiveState(detectedState);

    // Draw visual feedback box and tracked feature markers on canvas
    _drawOverlay(detectedState, faceBox, poseResult ? poseResult.features : null);
  }

  // ── Adaptive Head Pose (Yaw) Analyzer ────────────────────

  function _analyzeFacePose(box) {
    if (!videoEl || !procCtx) return { state: 'ABSENT', yawScore: 0 };

    const vw = videoEl.videoWidth || 320;
    const vh = videoEl.videoHeight || 240;

    // Constrain box within video bounds
    const bx = Math.max(0, Math.floor(box.x));
    const by = Math.max(0, Math.floor(box.y));
    const bw = Math.min(vw - bx, Math.floor(box.width));
    const bh = Math.min(vh - by, Math.floor(box.height));

    if (bw < 30 || bh < 30) {
      return { state: 'ABSENT', yawScore: 0 };
    }

    // Draw cropped face into CROP_DIM x CROP_DIM buffer
    procCanvas.width = CROP_DIM;
    procCanvas.height = CROP_DIM;
    procCtx.drawImage(videoEl, bx, by, bw, bh, 0, 0, CROP_DIM, CROP_DIM);

    const imgData = procCtx.getImageData(0, 0, CROP_DIM, CROP_DIM);
    const data = imgData.data;

    // Compute average luminance
    let sumLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avgLum = sumLum / (CROP_DIM * CROP_DIM);
    // Dark feature threshold (eyes, eyebrows, nostrils, shadows)
    const darkThresh = Math.max(35, avgLum * 0.76);

    // Eye band: y between 20% and 55% of the face
    const eyeY1 = Math.floor(CROP_DIM * 0.20);
    const eyeY2 = Math.floor(CROP_DIM * 0.55);

    let leftWeight = 0, leftSumX = 0, leftSumY = 0;
    let rightWeight = 0, rightSumX = 0, rightSumY = 0;
    const midX = CROP_DIM / 2;

    for (let y = eyeY1; y < eyeY2; y++) {
      for (let x = 6; x < CROP_DIM - 6; x++) {
        const idx = (y * CROP_DIM + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < darkThresh) {
          const w = darkThresh - lum;
          if (x < midX) {
            leftWeight += w;
            leftSumX += x * w;
            leftSumY += y * w;
          } else {
            rightWeight += w;
            rightSumX += x * w;
            rightSumY += y * w;
          }
        }
      }
    }

    // Mid-face / Nose region: y between 38% and 68%, x between 30% and 70%
    let noseWeight = 0, noseSumX = 0, noseSumY = 0;
    const noseY1 = Math.floor(CROP_DIM * 0.38);
    const noseY2 = Math.floor(CROP_DIM * 0.68);
    const noseX1 = Math.floor(CROP_DIM * 0.28);
    const noseX2 = Math.floor(CROP_DIM * 0.72);

    for (let y = noseY1; y < noseY2; y++) {
      for (let x = noseX1; x < noseX2; x++) {
        const idx = (y * CROP_DIM + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < darkThresh) {
          const w = darkThresh - lum;
          noseWeight += w;
          noseSumX += x * w;
          noseSumY += y * w;
        }
      }
    }

    const totalEyeFeatures = leftWeight + rightWeight;
    if (totalEyeFeatures < 25) {
      // Too few features to determine pose
      return { state: 'NORMAL', yawScore: 0 };
    }

    // Calculate eye centroids
    const leftEyeX = leftWeight > 0 ? (leftSumX / leftWeight) : (CROP_DIM * 0.28);
    const leftEyeY = leftWeight > 0 ? (leftSumY / leftWeight) : (eyeY1 + 10);
    const rightEyeX = rightWeight > 0 ? (rightSumX / rightWeight) : (CROP_DIM * 0.72);
    const rightEyeY = rightWeight > 0 ? (rightSumY / rightWeight) : (eyeY1 + 10);

    // Calculate nose centroid
    const noseX = noseWeight > 0 ? (noseSumX / noseWeight) : midX;
    const noseY = noseWeight > 0 ? (noseSumY / noseWeight) : (noseY1 + 12);

    // Midpoint between eyes and relative nose shift
    const eyeMidX = (leftEyeX + rightEyeX) / 2;
    const eyeSpan = Math.max(12, rightEyeX - leftEyeX);
    const noseOffsetRatio = (noseX - eyeMidX) / eyeSpan;

    // Feature mass balance between left and right sides
    const massBalance = (leftWeight - rightWeight) / totalEyeFeatures;

    // Overall dark feature centroid across upper face
    let allWeight = 0, allSumX = 0;
    for (let y = eyeY1; y < noseY2; y++) {
      for (let x = 6; x < CROP_DIM - 6; x++) {
        const idx = (y * CROP_DIM + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < darkThresh) {
          const w = darkThresh - lum;
          allWeight += w;
          allSumX += x * w;
        }
      }
    }
    const allCentroidNorm = allWeight > 0 ? ((allSumX / allWeight) / CROP_DIM) - 0.5 : 0;

    // Composite Yaw Score (-1.0 to +1.0)
    // NOTE: On mirrored display, when student turns towards their LEFT,
    // features shift towards video right (positive offset).
    const yawScore = (noseOffsetRatio * 0.6) + (allCentroidNorm * 0.9) - (massBalance * 0.3);

    // Check profile turns (where one side turns significantly away)
    const profileLeft = (rightWeight > leftWeight * 2.5) || (noseOffsetRatio > 0.18);
    const profileRight = (leftWeight > rightWeight * 2.5) || (noseOffsetRatio < -0.18);

    let state = 'NORMAL';
    if (yawScore > 0.12 || profileLeft) {
      state = 'LOOKING_LEFT';
    } else if (yawScore < -0.12 || profileRight) {
      state = 'LOOKING_RIGHT';
    } else {
      state = 'NORMAL';
    }

    return {
      state,
      yawScore,
      features: {
        leftEye:  { x: bx + (leftEyeX / CROP_DIM) * bw,  y: by + (leftEyeY / CROP_DIM) * bh },
        rightEye: { x: bx + (rightEyeX / CROP_DIM) * bw, y: by + (rightEyeY / CROP_DIM) * bh },
        nose:     { x: bx + (noseX / CROP_DIM) * bw,      y: by + (noseY / CROP_DIM) * bh }
      }
    };
  }

  // ── Fallback Skin & Face Region Finder ───────────────────

  function _findFaceBoxWithSkin() {
    if (!videoEl || !procCtx) return null;

    const vw = videoEl.videoWidth || 320;
    const vh = videoEl.videoHeight || 240;
    const SW = 120;
    const SH = 90;

    procCanvas.width = SW;
    procCanvas.height = SH;
    procCtx.drawImage(videoEl, 0, 0, SW, SH);
    const imgData = procCtx.getImageData(0, 0, SW, SH);
    const data = imgData.data;

    let minX = SW, maxX = 0, minY = SH, maxY = 0;
    let skinCount = 0;

    // Fast multi-color-space skin detection
    for (let y = 0; y < SH; y += 2) {
      for (let x = 0; x < SW; x += 2) {
        const idx = (y * SW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r > 50 && g > 30 && b > 20 && r > g && (r - g) > 8) {
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          if (cb >= 75 && cb <= 138 && cr >= 128 && cr <= 182) {
            skinCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }

    // If skin pixels are less than ~100 points, no face is present
    if (skinCount < 100) {
      return null;
    }

    const scaleX = vw / SW;
    const scaleY = vh / SH;
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;

    return {
      x: Math.max(0, (minX - padX) * scaleX),
      y: Math.max(0, (minY - padY) * scaleY),
      width: Math.min(vw, ((maxX - minX) + padX * 2) * scaleX),
      height: Math.min(vh, ((maxY - minY) + padY * 2) * scaleY)
    };
  }

  // ── Live State Application (Instant UI + Debounced Violation)

  function _applyLiveState(rawState) {
    // 1. Update UI text and badge IMMEDIATELY on every frame
    if (rawState === 'NORMAL') {
      consecutiveLeftCount = 0;
      consecutiveRightCount = 0;
      consecutiveAbsentCount = 0;
      _updateStatus('NORMAL', 'Looking at Screen');

    } else if (rawState === 'LOOKING_LEFT') {
      consecutiveLeftCount++;
      consecutiveRightCount = 0;
      consecutiveAbsentCount = 0;
      _updateStatus('LOOKING_LEFT', 'Looking Left ⚠️');

      // Debounced violation triggered only after > 2.0s continuous looking away
      if (consecutiveLeftCount >= WARN_POSE_TICKS) {
        _reportViolation('Looking away from screen (Left)');
        consecutiveLeftCount = WARN_POSE_TICKS - 6;
      }

    } else if (rawState === 'LOOKING_RIGHT') {
      consecutiveRightCount++;
      consecutiveLeftCount = 0;
      consecutiveAbsentCount = 0;
      _updateStatus('LOOKING_RIGHT', 'Looking Right ⚠️');

      // Debounced violation triggered only after > 2.0s continuous looking away
      if (consecutiveRightCount >= WARN_POSE_TICKS) {
        _reportViolation('Looking away from screen (Right)');
        consecutiveRightCount = WARN_POSE_TICKS - 6;
      }

    } else if (rawState === 'ABSENT') {
      consecutiveAbsentCount++;
      consecutiveLeftCount = 0;
      consecutiveRightCount = 0;
      _updateStatus('ABSENT', 'No Face Detected 🔴');

      // Debounced violation triggered only after > 2.3s continuous absence
      if (consecutiveAbsentCount >= ALERT_ABSENT_TICKS) {
        _reportViolation('Student absent / Face not detected');
        consecutiveAbsentCount = ALERT_ABSENT_TICKS - 6;
      }
    }
  }

  // ── Status Badge UI Updater ──────────────────────────────

  function _updateStatus(state, message) {
    currentState = state;
    if (!statusBadgeEl || !statusTextEl) return;

    statusTextEl.textContent = message;
    statusBadgeEl.className = 'proctor-status ' + state.toLowerCase();

    const dotEl = document.querySelector('.proctor-cam-dot');
    if (dotEl) {
      if (state === 'NORMAL') {
        dotEl.style.background = '#22c55e'; // green
        dotEl.style.boxShadow = '0 0 6px #22c55e';
      } else if (state === 'LOOKING_LEFT' || state === 'LOOKING_RIGHT') {
        dotEl.style.background = '#eab308'; // yellow
        dotEl.style.boxShadow = '0 0 6px #eab308';
      } else if (state === 'ABSENT') {
        dotEl.style.background = '#dc2626'; // red
        dotEl.style.boxShadow = '0 0 6px #dc2626';
      }
    }
  }

  // ── Draw Visual Overlay on Canvas ────────────────────────

  function _drawOverlay(state, faceBox, features) {
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const w = canvasEl.width;
    const h = canvasEl.height;

    // Pick box color based on live state
    let strokeColor = '#22c55e'; // green
    if (state === 'LOOKING_LEFT' || state === 'LOOKING_RIGHT') {
      strokeColor = '#eab308'; // yellow
    } else if (state === 'ABSENT') {
      strokeColor = '#ef4444'; // red
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor;

    if (faceBox) {
      // Draw tracked face bounding box
      ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);

      // Draw tracked facial feature markers
      if (features) {
        // Eyes (green dots)
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(features.leftEye.x, features.leftEye.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(features.rightEye.x, features.rightEye.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Nose (yellow dot)
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(features.nose.x, features.nose.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state === 'ABSENT') {
      // Draw red dashed warning border when no face is found
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.setLineDash([]);
    }
  }

  // ── Report to AntiCheat / StudentBehavior ─────────────────

  function _reportViolation(description) {
    const now = Date.now();
    if (now - lastAnomalyReportTime < 7000) return; // Rate limit 7s
    lastAnomalyReportTime = now;

    console.warn(`[CameraProctor] ⚠️ Anomaly Flagged: ${description}`);

    if (window.StudentBehavior && typeof window.StudentBehavior.flagCameraAnomaly === 'function') {
      try {
        window.StudentBehavior.flagCameraAnomaly(description, 20);
      } catch (e) {}
    }

    if (window.Terminal && typeof window.Terminal.warn === 'function') {
      window.Terminal.warn(`⚠ Camera Alert: ${description}`);
    }
  }

  // ── Minimize / Expand Widget ─────────────────────────────

  function toggleMinimize() {
    isMinimized = !isMinimized;
    if (!widgetEl) return;

    const bodyEl = document.getElementById('proctor-cam-body');
    const btnToggle = document.getElementById('btn-toggle-cam-size');

    if (isMinimized) {
      widgetEl.classList.add('minimized');
      if (bodyEl) bodyEl.style.display = 'none';
      if (btnToggle) btnToggle.textContent = '🗖';
    } else {
      widgetEl.classList.remove('minimized');
      if (bodyEl) bodyEl.style.display = 'flex';
      if (btnToggle) btnToggle.textContent = '🗕';
    }
  }

  // ── Draggable UI Support ─────────────────────────────────

  function _setupDraggable() {
    const header = document.getElementById('proctor-cam-header');
    if (!header || !widgetEl) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = widgetEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      widgetEl.style.right = 'auto';
      widgetEl.style.bottom = 'auto';
      widgetEl.style.left = `${initialLeft}px`;
      widgetEl.style.top = `${initialTop}px`;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      widgetEl.style.left = `${Math.max(10, Math.min(window.innerWidth - widgetEl.offsetWidth - 10, initialLeft + dx))}px`;
      widgetEl.style.top = `${Math.max(10, Math.min(window.innerHeight - widgetEl.offsetHeight - 10, initialTop + dy))}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  return {
    init,
    start,
    stop,
    toggleMinimize,
    getState: () => currentState
  };
})();

window.CameraProctor = CameraProctor;
