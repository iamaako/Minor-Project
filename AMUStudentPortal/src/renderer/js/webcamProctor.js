'use strict';

/**
 * webcamProctor.js — On-device AI webcam proctoring (100% offline)
 *
 * Engine: MediaPipe Face Landmarker (478 landmarks incl. iris + blendshapes),
 * loaded from node_modules (wasm) and assets/models (face_landmarker.task).
 * The math lives in gaze.js (ProctorGaze).
 *
 * Detects and reports to the Teacher Admin Server:
 *   LOOKING_BESIDE   head and/or eyes turned left/right (direction = student's own side)
 *   LOOKING_DOWN     head/eyes pointing down for a long time (phone / notes)
 *   FACE_ABSENT      no face in view
 *   CAMERA_COVERED   no face and the frame is black
 *   CAMERA_LOST      stream ended / frozen (unplugged, disabled)
 *   CAMERA_UNAVAILABLE / ENGINE_FAILED   proctoring could not start
 *
 * Each student is calibrated for ~2s ("look at the screen") so that camera
 * position and sitting posture do not matter.
 */

const WebcamProctor = (() => {
  const CFG = {
    FRAME_INTERVAL_MS: 100,        // ~10 FPS
    WARN_MS: 1000,                 // yellow indicator
    VIOLATION_MS: 2000,            // official violation (left/right)
    DOWN_WARN_MS: 4000,
    DOWN_VIOLATION_MS: 8000,       // looking down is normal while typing, so it needs longer
    AWAY_GRACE_MS: 700,            // short return to centre (blink, jitter) does not reset the timer
    COOLDOWN_MS: 4500,             // between two violations of the same type
    ABSENT_VIOLATION_MS: 3000,
    ABSENT_COOLDOWN_MS: 15000,
    PROFILE_LOSS_YAW_DEG: 20,      // face lost while already turned this far => still "looking aside"
    PROFILE_LOSS_MS: 3000,
    STALL_MS: 3000,                // no new video frame for this long => camera lost
    SYSTEM_REPORT_COOLDOWN_MS: 60000,
    RETRY_MS: 5000,
    DARK_LUMINANCE: 20,            // 0-255 average, below this the lens is covered
    SMOOTHING: 0.5,                // EMA factor
    CAL_SAMPLES: 15,
    CAL_MIN_SAMPLES: 5,
    CAL_TIMEOUT_MS: 15000,
    CAL_MAX_ABS_YAW_DEG: 15,       // ignore calibration frames where the student is already turned away
    CAL_MAX_ABS_GAZE: 0.15,
  };

  // Paths are resolved against the page (src/renderer/index.html).
  const ENGINE_URL = '../../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
  const WASM_DIR = '../../node_modules/@mediapipe/tasks-vision/wasm';
  const MODEL_URL = './assets/models/face_landmarker.task';

  // ── Runtime state ──
  let wanted = false;          // start() called, stop() not yet
  let isRunning = false;       // camera streaming and loop active
  let epoch = 0;               // bumped by stop(); lets in-flight start() calls abort
  let startPromise = null;
  let stream = null;
  let landmarker = null;
  let enginePromise = null;
  let loopTimer = null;
  let retryTimer = null;
  let lastVideoTime = -1;
  let lastFrameAt = 0;
  let errorCount = 0;

  // DOM
  let pipBox = null, pipTitlebar = null, btnMin = null;
  let videoEl = null, canvasEl = null, statusDot = null, statusText = null;
  let domBound = false;

  // Pose tracking state
  let smooth = null;           // smoothed metrics
  let baseline = null;         // calibrated "looking at screen" values
  let calSamples = [];
  let calStartedAt = 0;
  let lastClass = null;
  let lastFaceAt = 0;
  let absentSince = 0;
  let awayStart = 0;
  let lastAwayAt = 0;
  let awayState = null;
  let awayCause = 'NONE';
  const lastReportAt = {};     // per violation type
  let totalViolations = 0;
  let debugInfo = {};

  // ── DOM helpers ──────────────────────────────────────────

  function _bindElements() {
    pipBox = document.getElementById('webcam-pip');
    pipTitlebar = document.getElementById('webcam-pip-titlebar');
    btnMin = document.getElementById('btn-toggle-webcam');
    videoEl = document.getElementById('webcam-video');
    canvasEl = document.getElementById('webcam-overlay');
    statusDot = document.getElementById('webcam-status-dot');
    statusText = document.getElementById('webcam-status-text');
  }

  function _updateStatus(dotColor, text) {
    if (statusDot) statusDot.className = `webcam-status-dot ${dotColor}`;
    if (statusText) statusText.textContent = text;
  }

  function _setBoxState(stateClass) {
    if (!pipBox) return;
    pipBox.classList.remove('warning-state', 'violation-state');
    if (stateClass) pipBox.classList.add(stateClass);
  }

  function _clearCanvas() {
    if (canvasEl) {
      const ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  // ── Engine ───────────────────────────────────────────────

  function _loadEngine() {
    if (landmarker) return Promise.resolve(landmarker);
    if (enginePromise) return enginePromise;

    enginePromise = (async () => {
      const bundleHref = new URL(ENGINE_URL, document.baseURI).href;
      const wasmHref = new URL(WASM_DIR, document.baseURI).href;
      const modelHref = new URL(MODEL_URL, document.baseURI).href;

      const vision = await import(bundleHref);
      const fileset = await vision.FilesetResolver.forVisionTasks(wasmHref);

      const make = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelHref, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      try {
        landmarker = await make('GPU');
        console.log('[WebcamProctor] Face Landmarker ready (GPU).');
      } catch (gpuErr) {
        console.warn('[WebcamProctor] GPU delegate unavailable, using CPU:', gpuErr && gpuErr.message);
        landmarker = await make('CPU');
        console.log('[WebcamProctor] Face Landmarker ready (CPU).');
      }
      return landmarker;
    })().catch((err) => {
      enginePromise = null; // allow a retry on the next start()
      throw err;
    });

    return enginePromise;
  }

  // ── Public: init ─────────────────────────────────────────

  function init() {
    console.log('[WebcamProctor] Initializing...');
    _bindElements();
    if (!domBound) {
      _setupDraggable();
      _setupMinimize();
      domBound = true;
    }
    // Warm up in the background so the exam start is not delayed.
    _loadEngine().catch((err) => {
      console.warn('[WebcamProctor] Engine preload failed:', err && err.message);
    });
  }

  // ── Public: start / stop ─────────────────────────────────

  function start() {
    _bindElements();
    wanted = true;

    if (pipBox) {
      pipBox.classList.remove('hidden');
      pipBox.style.display = 'block';
      pipBox.style.visibility = 'visible';
    }

    if (isRunning) return Promise.resolve();
    // start() is called from several places in app.js; share one in-flight attempt.
    if (startPromise) return startPromise;

    startPromise = _startInternal(epoch).finally(() => { startPromise = null; });
    return startPromise;
  }

  async function _startInternal(myEpoch) {
    _updateStatus('yellow', 'Starting Camera...');

    let newStream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is unavailable');
      }
      newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: false,
      });
    } catch (err) {
      if (myEpoch !== epoch) return;
      _handleStartFailure(err);
      return;
    }

    if (myEpoch !== epoch) {
      // stop() was called while the camera was opening
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    stream = newStream;
    newStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (stream === newStream) _onCameraLost('Camera stream ended');
      });
    });

    try {
      await _attachVideo(newStream);
    } catch (err) {
      if (myEpoch !== epoch) return;
      _teardownStream();
      _handleStartFailure(err);
      return;
    }
    if (myEpoch !== epoch) return;

    isRunning = true;
    lastFrameAt = Date.now();
    lastVideoTime = -1;
    _resetPoseState();

    _updateStatus('yellow', 'Loading AI Engine...');
    try {
      await _loadEngine();
    } catch (err) {
      if (myEpoch !== epoch) return;
      console.error('[WebcamProctor] Engine failed to load:', err);
      _updateStatus('red', 'AI engine failed');
      _report('ENGINE_FAILED', { detail: String((err && err.message) || err).slice(0, 200), snapshot: true });
      _retryEngineLater(myEpoch); // the preview keeps running, analysis starts once the engine loads
      return;
    }
    if (myEpoch !== epoch) return;

    _beginCalibration();
    _scheduleTick(0);
    console.log('[WebcamProctor] Live monitoring successfully initialized.');
  }

  function _retryEngineLater(myEpoch) {
    setTimeout(async () => {
      if (myEpoch !== epoch || !isRunning || landmarker) return;
      try {
        await _loadEngine();
        if (myEpoch !== epoch || !isRunning) return;
        _beginCalibration();
        _scheduleTick(0);
      } catch (err) {
        _retryEngineLater(myEpoch);
      }
    }, CFG.RETRY_MS * 2);
  }

  function _attachVideo(s) {
    return new Promise((resolve, reject) => {
      if (!videoEl) return reject(new Error('Webcam video element missing'));
      const timer = setTimeout(() => reject(new Error('Video start timeout')), 8000);
      videoEl.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
      videoEl.srcObject = s;
      const p = videoEl.play();
      if (p && p.catch) p.catch((e) => console.warn('[WebcamProctor] play() warning:', e.message));
    });
  }

  function _teardownStream() {
    isRunning = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (stream) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* already stopped */ }
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  function stop() {
    wanted = false;
    epoch++;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    _teardownStream();
    _resetPoseState();
    _clearCanvas();
    _setBoxState('');
    if (pipBox) pipBox.classList.add('hidden');
    console.log('[WebcamProctor] Live monitoring stopped.');
  }

  function _scheduleRetry() {
    if (retryTimer || !wanted) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (wanted && !isRunning) start();
    }, CFG.RETRY_MS);
  }

  function _handleStartFailure(err) {
    const name = (err && err.name) || 'Error';
    console.warn('[WebcamProctor] Camera start failed:', name, err && err.message);
    _updateStatus('red', `Camera unavailable (${name})`);
    _setBoxState('violation-state');
    _report('CAMERA_UNAVAILABLE', { detail: `${name}: ${(err && err.message) || ''}`.slice(0, 200) });
    _scheduleRetry();
  }

  function _onCameraLost(reason) {
    if (!wanted) return;
    console.warn('[WebcamProctor] Camera lost:', reason);
    _teardownStream();
    _clearCanvas();
    _updateStatus('red', 'Camera disconnected');
    _setBoxState('violation-state');
    _report('CAMERA_LOST', { detail: reason });
    _scheduleRetry();
  }

  // ── Calibration ──────────────────────────────────────────

  function _resetPoseState() {
    smooth = null;
    lastClass = null;
    lastFaceAt = 0;
    absentSince = 0;
    awayStart = 0;
    lastAwayAt = 0;
    awayState = null;
    awayCause = 'NONE';
  }

  function _beginCalibration() {
    baseline = null;
    calSamples = [];
    calStartedAt = Date.now();
  }

  function recalibrate() {
    if (isRunning) _beginCalibration();
  }

  function _median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function _finishCalibration() {
    const n = calSamples.length;
    if (n >= CFG.CAL_MIN_SAMPLES) {
      const gazes = calSamples.map((s) => s.gazeH).filter((g) => g !== null);
      baseline = {
        yawDeg: _median(calSamples.map((s) => s.yawDeg)),
        pitchRatio: _median(calSamples.map((s) => s.pitchRatio)),
        gazeH: gazes.length ? _median(gazes) : 0.5,
        eyeDown: _median(calSamples.map((s) => s.eyeDown)),
      };
      console.log('[WebcamProctor] Calibrated from', n, 'frames:', JSON.stringify(baseline));
    } else {
      // Face never looked straight at the screen: fall back to neutral defaults.
      baseline = { yawDeg: 0, pitchRatio: null, gazeH: 0.5, eyeDown: 0 };
      console.warn('[WebcamProctor] Calibration incomplete (', n, 'frames). Using neutral baseline.');
    }
    calSamples = [];
  }

  function _collectCalibration(m, now) {
    const plausible = Math.abs(m.yawDeg) <= CFG.CAL_MAX_ABS_YAW_DEG &&
      (m.gazeH === null || Math.abs(m.gazeH - 0.5) <= CFG.CAL_MAX_ABS_GAZE);
    if (plausible && m.blink < ProctorGaze.DEFAULTS.BLINK_SCORE) calSamples.push(m);

    const pct = Math.min(100, Math.round((calSamples.length / CFG.CAL_SAMPLES) * 100));
    _updateStatus('yellow', `Calibrating: look at the screen (${pct}%)`);

    if (calSamples.length >= CFG.CAL_SAMPLES || (now - calStartedAt) > CFG.CAL_TIMEOUT_MS) {
      _finishCalibration();
    }
  }

  // ── Detection loop ───────────────────────────────────────

  function _scheduleTick(delay) {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = setTimeout(_tick, delay);
  }

  function _tick() {
    loopTimer = null;
    if (!isRunning || !landmarker || !videoEl) return;
    const t0 = performance.now();
    const now = Date.now();

    try {
      if (videoEl.readyState >= 2) {
        if (videoEl.currentTime !== lastVideoTime) {
          lastVideoTime = videoEl.currentTime;
          lastFrameAt = now;
          const result = landmarker.detectForVideo(videoEl, t0);
          _processResult(result, now);
        } else if (now - lastFrameAt > CFG.STALL_MS) {
          _onCameraLost('Video frames stopped arriving');
          return;
        }
      }
    } catch (err) {
      errorCount++;
      if (errorCount <= 5 || errorCount % 100 === 0) {
        console.error('[WebcamProctor] Frame error #' + errorCount + ':', err);
      }
    }

    if (isRunning) {
      _scheduleTick(Math.max(0, CFG.FRAME_INTERVAL_MS - (performance.now() - t0)));
    }
  }

  function _ema(prev, next) {
    return prev === null || prev === undefined ? next : prev + CFG.SMOOTHING * (next - prev);
  }

  function _processResult(result, now) {
    const face = result.faceLandmarks && result.faceLandmarks[0];
    if (!face) {
      _onNoFace(now);
      return;
    }
    lastFaceAt = now;
    absentSince = 0;

    const cats = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
    const raw = ProctorGaze.analyze(face, cats);

    smooth = smooth || { yawDeg: raw.yawDeg, pitchRatio: raw.pitchRatio, gazeH: raw.gazeH, eyeDown: raw.eyeDown, blink: raw.blink, faceWidth: raw.faceWidth };
    smooth.yawDeg = _ema(smooth.yawDeg, raw.yawDeg);
    smooth.pitchRatio = _ema(smooth.pitchRatio, raw.pitchRatio);
    smooth.eyeDown = _ema(smooth.eyeDown, raw.eyeDown);
    smooth.blink = raw.blink;
    smooth.faceWidth = raw.faceWidth;
    if (raw.gazeH !== null) smooth.gazeH = _ema(smooth.gazeH, raw.gazeH);
    // During a blink the iris is hidden; keep the previous smoothed gaze.

    if (!baseline) {
      _collectCalibration(smooth, now);
      _setBoxState('');
      _drawOverlay(face, null);
      return;
    }

    const cls = ProctorGaze.classify(smooth, baseline);
    lastClass = cls;
    debugInfo = { raw, smooth: Object.assign({}, smooth), cls, baseline };
    _updateAway(cls, now);
    _drawOverlay(face, cls);
  }

  // ── Absence / lost face ──────────────────────────────────

  function _onNoFace(now) {
    _clearCanvas();

    // Turned so far that the detector lost the face: still looking aside, not "absent".
    if (lastClass && Math.abs(lastClass.worldYawDeg) >= CFG.PROFILE_LOSS_YAW_DEG &&
        lastFaceAt && (now - lastFaceAt) <= CFG.PROFILE_LOSS_MS) {
      _updateAway({
        state: lastClass.worldYawDeg > 0 ? 'LEFT' : 'RIGHT',
        cause: 'HEAD',
        worldYawDeg: lastClass.worldYawDeg,
      }, now);
      return;
    }

    awayStart = 0;
    awayState = null;
    if (!absentSince) absentSince = now;
    smooth = null;
    lastClass = null;

    const elapsed = now - absentSince;
    _updateStatus('yellow', `No Face in View (${(elapsed / 1000).toFixed(1)}s)`);
    _setBoxState('warning-state');

    if (elapsed >= CFG.ABSENT_VIOLATION_MS) {
      const covered = _frameIsDark();
      _setBoxState('violation-state');
      _updateStatus('red', covered ? '🚨 Camera covered' : '🚨 Face not visible');
      _report(covered ? 'CAMERA_COVERED' : 'FACE_ABSENT', {
        durationSeconds: Math.round(elapsed / 1000),
        snapshot: true,
      });
    }
  }

  let lumCanvas = null;
  function _frameIsDark() {
    try {
      if (!lumCanvas) {
        lumCanvas = document.createElement('canvas');
        lumCanvas.width = 32;
        lumCanvas.height = 24;
      }
      const ctx = lumCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(videoEl, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return (sum / (d.length / 4)) < CFG.DARK_LUMINANCE;
    } catch (e) {
      return false;
    }
  }

  // ── Looking-aside state machine ──────────────────────────

  function _updateAway(cls, now) {
    if (cls.state === 'CENTER') {
      // A short return to centre (blink, jitter) must not reset the timer.
      if (awayStart && (now - lastAwayAt) > CFG.AWAY_GRACE_MS) {
        awayStart = 0;
        awayState = null;
      }
      if (!awayStart) {
        _setBoxState('');
        _updateStatus('green', '● Facing Screen (Normal)');
      }
      return;
    }

    lastAwayAt = now;
    // Switching LEFT <-> RIGHT keeps the same episode; only the direction label changes.
    if (!awayStart) awayStart = now;
    awayState = cls.state;
    awayCause = cls.cause;

    const elapsed = now - awayStart;
    const isDown = cls.state === 'DOWN';
    const warnAt = isDown ? CFG.DOWN_WARN_MS : CFG.WARN_MS;
    const violateAt = isDown ? CFG.DOWN_VIOLATION_MS : CFG.VIOLATION_MS;
    const label = isDown ? 'Looking Down' : `Looking ${cls.state}`;
    const how = cls.cause === 'EYES' ? ' (eyes)' : '';

    if (elapsed >= violateAt) {
      _setBoxState('violation-state');
      _updateStatus('red', `🚨 ${label}${how} (${(elapsed / 1000).toFixed(1)}s)`);
      _report(isDown ? 'LOOKING_DOWN' : 'LOOKING_BESIDE', {
        direction: isDown ? 'DOWN' : cls.state,
        cause: cls.cause,
        durationSeconds: Math.round(elapsed / 1000),
        snapshot: true,
      });
    } else if (elapsed >= warnAt) {
      _setBoxState('warning-state');
      _updateStatus('yellow', `⚠ ${label}${how} (${(elapsed / 1000).toFixed(1)}s)`);
    }
  }

  // ── Overlay ──────────────────────────────────────────────

  function _drawOverlay(face, cls) {
    if (!canvasEl || !videoEl) return;
    const W = videoEl.clientWidth || 214;
    const H = videoEl.clientHeight || 150;
    if (canvasEl.width !== W || canvasEl.height !== H) {
      canvasEl.width = W;
      canvasEl.height = H;
    }
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // The <video> uses object-fit: cover and is mirrored with CSS, so mirror here too.
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    const scale = Math.max(W / vw, H / vh);
    const offX = (W - vw * scale) / 2;
    const offY = (H - vh * scale) / 2;
    const map = (p) => ({ x: W - (p.x * vw * scale + offX), y: p.y * vh * scale + offY });

    const left = map(face[ProctorGaze.LM.CHEEK_A]);
    const right = map(face[ProctorGaze.LM.CHEEK_B]);
    const top = map(face[10]);
    const bottom = map(face[ProctorGaze.LM.CHIN]);
    const x = Math.min(left.x, right.x);
    const w = Math.abs(right.x - left.x);

    let color = '#22c55e';
    if (!cls) color = '#38bdf8';
    else if (cls.state !== 'CENTER') {
      const violating = awayStart && (Date.now() - awayStart) >= (cls.state === 'DOWN' ? CFG.DOWN_VIOLATION_MS : CFG.VIOLATION_MS);
      color = violating ? '#ef4444' : '#f59e0b';
    }

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.strokeRect(x, top.y, w, bottom.y - top.y);

    if (face.length >= 478) {
      [468, 473].forEach((i) => {
        const p = map(face[i]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const label = !cls ? 'CALIBRATING'
      : cls.state === 'CENTER' ? '✓ SCREEN FOCUS'
        : cls.state === 'DOWN' ? '⚠ LOOKING DOWN'
          : `⚠ LOOKING ${cls.state}`;
    ctx.font = 'bold 10px Tahoma, sans-serif';
    const tw = ctx.measureText(label).width;
    const ly = Math.max(0, top.y - 16);
    ctx.fillRect(x, ly, tw + 8, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, x + 4, ly + 12);
    ctx.restore();
  }

  // ── Reporting ────────────────────────────────────────────

  const TOAST_TEXT = {
    LOOKING_BESIDE: (d) => `Warning: Looking away from the screen (${d.direction}) is prohibited. Violation recorded.`,
    LOOKING_DOWN: () => 'Warning: Looking down for a long time. Violation recorded.',
    FACE_ABSENT: () => 'Warning: Your face is not visible to the camera. Violation recorded.',
    CAMERA_COVERED: () => 'Warning: The camera appears to be covered. Violation recorded.',
    CAMERA_LOST: () => 'Warning: The camera was disconnected. Reconnect it immediately.',
    CAMERA_UNAVAILABLE: () => 'Warning: The camera could not be started. Tell the invigilator.',
    ENGINE_FAILED: () => 'Warning: The AI proctor failed to start. Tell the invigilator.',
  };

  function _report(type, extra) {
    const now = Date.now();
    const isSystem = type === 'CAMERA_LOST' || type === 'CAMERA_UNAVAILABLE' || type === 'ENGINE_FAILED';
    const cooldown = isSystem ? CFG.SYSTEM_REPORT_COOLDOWN_MS
      : (type === 'FACE_ABSENT' || type === 'CAMERA_COVERED') ? CFG.ABSENT_COOLDOWN_MS
        : CFG.COOLDOWN_MS;
    if (lastReportAt[type] && now - lastReportAt[type] < cooldown) return;
    lastReportAt[type] = now;

    totalViolations++;
    const data = Object.assign({ direction: null, cause: null, durationSeconds: 0, detail: null }, extra);
    console.warn(`[WebcamProctor] Violation #${totalViolations}: ${type}`, data.direction || '', data.detail || '');

    const payload = {
      type,
      direction: data.direction,
      cause: data.cause,
      detail: data.detail,
      durationSeconds: data.durationSeconds,
      snapshot: data.snapshot ? _captureSnapshot() : null,
      violationCount: totalViolations,
      timestamp: now,
    };

    if (window.examAPI && window.examAPI.reportWebcamViolation) {
      window.examAPI.reportWebcamViolation(payload);
    }

    const el = document.getElementById('status-cam-violations');
    if (el) {
      el.textContent = `📷 ${totalViolations}`;
      el.style.color = '#dc2626';
      el.style.fontWeight = 'bold';
    }

    const toast = TOAST_TEXT[type];
    if (toast) _showWarningToast(toast(data));
  }

  function _captureSnapshot() {
    try {
      if (!videoEl || videoEl.readyState < 2) return null;
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      c.getContext('2d').drawImage(videoEl, 0, 0, 320, 240);
      return c.toDataURL('image/jpeg', 0.55);
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
        position: fixed; top: 65px; left: 50%; transform: translateX(-50%);
        background: #ef4444; color: white; padding: 8px 16px;
        border: 2px solid #b91c1c; border-radius: 4px;
        font-family: 'Tahoma', sans-serif; font-size: 12px; font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 999999;
        display: flex; align-items: center; gap: 8px; transition: opacity 0.3s;
      `;
      const icon = document.createElement('span');
      icon.textContent = '🚨';
      const text = document.createElement('span');
      text.id = 'webcam-warning-text';
      banner.appendChild(icon);
      banner.appendChild(text);
      document.body.appendChild(banner);
    }

    document.getElementById('webcam-warning-text').textContent = message;
    banner.style.display = 'flex';
    banner.style.opacity = '1';

    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(() => {
      banner.style.opacity = '0';
      banner._hideTimer = setTimeout(() => { banner.style.display = 'none'; }, 300);
    }, 3500);
  }

  // ── Drag & Drop / Minimize ───────────────────────────────

  function _setupDraggable() {
    if (!pipTitlebar || !pipBox) return;

    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    pipTitlebar.addEventListener('mousedown', (e) => {
      if (e.target === btnMin) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = pipBox.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      pipBox.style.bottom = 'auto';
      pipBox.style.right = 'auto';
      pipBox.style.left = `${initialLeft}px`;
      pipBox.style.top = `${initialTop}px`;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const maxLeft = window.innerWidth - pipBox.offsetWidth - 10;
      const maxTop = window.innerHeight - pipBox.offsetHeight - 30;
      pipBox.style.left = `${Math.max(10, Math.min(initialLeft + e.clientX - startX, maxLeft))}px`;
      pipBox.style.top = `${Math.max(10, Math.min(initialTop + e.clientY - startY, maxTop))}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  }

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
    recalibrate,
    getViolationCount: () => totalViolations,
    getDebug: () => debugInfo,
  };
})();

window.WebcamProctor = WebcamProctor;
console.log('[WebcamProctor] Module loaded and attached to window.');
