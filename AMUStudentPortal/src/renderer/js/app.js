'use strict';

/**
 * app.js — Main Application Controller
 *
 * State machine:
 *   CONNECTING → LOGIN → EXAM_ACTIVE → EXAM_PAUSED → EXAM_LOCKED → EXAM_SUBMITTED
 *
 * NOTE: All sub-modules (socket.js, timer.js, etc.) are loaded as static
 * <script> tags in index.html BEFORE this file runs. Monaco is also
 * guaranteed to be ready since this script is loaded inside require([...]).
 */

// ── App State ─────────────────────────────────────────────

const AppState = {
  SETUP:          'SETUP',
  CONNECTING:     'CONNECTING',
  LOGIN:          'LOGIN',
  INSTRUCTIONS:   'INSTRUCTIONS',
  WAITING:        'WAITING',
  EXAM_ACTIVE:    'EXAM_ACTIVE',
  EXAM_PAUSED:    'EXAM_PAUSED',
  EXAM_LOCKED:    'EXAM_LOCKED',
  EXAM_SUBMITTED: 'EXAM_SUBMITTED',
};

let currentState   = AppState.SETUP;
let studentInfo    = null;
let questionsData  = [];
let isInitialized  = false;
let scheduledCountdownInterval = null;

// ── Screen Elements ───────────────────────────────────────

const screens = {
  setup:        document.getElementById('setup-screen'),
  connecting:   document.getElementById('connecting-screen'),
  login:        document.getElementById('login-screen'),
  instructions: document.getElementById('instructions-screen'),
  waiting:      document.getElementById('waiting-screen'),
  exam:         document.getElementById('exam-screen'),
  submitted:    document.getElementById('submitted-screen'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', key !== name);
  });
}

function _setStatus(text) {
  const el = document.getElementById('status-main');
  if (el) el.textContent = text;
}

// ── Boot Sequence ─────────────────────────────────────────

function boot() {
  console.log('[App] Booting AMU Test Portal...');

  // Start at SETUP screen
  showScreen('setup');

  const btnConnect = document.getElementById('btn-connect-server');
  btnConnect.addEventListener('click', async () => {
    const ip = document.getElementById('input-server-ip').value.trim();
    const port = document.getElementById('input-server-port').value.trim();
    const errorEl = document.getElementById('setup-error');
    
    if (!ip || !port) {
      errorEl.textContent = 'Please enter both IP and Port.';
      return;
    }
    
    errorEl.textContent = '';
    
    // Move to connecting screen
    currentState = AppState.CONNECTING;
    showScreen('connecting');
    _startConnectingDots();

    // Trigger main process to initiate socket
    await window.examAPI.connectToServer(ip, port);
    
    // Init socket bridge to listen to updates
    SocketBridge.init();
  });

  // ── Listen for all preload events ──

  // Connection status → transition from connecting to login
  window.examAPI.onConnectionStatus((status) => {
    console.log('[App] Connection status:', status);
    
    if (status.connected && currentState === AppState.CONNECTING) {
      // Update header IP info
      const ip = document.getElementById('input-server-ip').value.trim();
      const port = document.getElementById('input-server-port').value.trim();
      const serverUrlEl = document.getElementById('login-server-url');
      if (serverUrlEl) serverUrlEl.textContent = `${ip}:${port}`;

      setTimeout(() => _transitionToLogin(), 600);
    }
    
    // Update connecting screen error text if failed
    if (status.error && currentState === AppState.CONNECTING) {
      const el = document.getElementById('connect-status');
      if (el) { 
        el.textContent = `Error: Failed to connect`; 
        el.style.color = 'red'; 
      }
      // Provide option to go back to setup
      setTimeout(() => {
        currentState = AppState.SETUP;
        showScreen('setup');
        const setupErr = document.getElementById('setup-error');
        if (setupErr) setupErr.textContent = 'Failed to connect. Please check IP/Port and try again.';
      }, 3000);
    }

    // Handle forceful disconnection mid-session
    if (!status.connected && currentState !== AppState.SETUP && currentState !== AppState.CONNECTING) {
      console.warn('[App] Server connection lost mid-session!');
      currentState = AppState.SETUP;
      showScreen('setup');
      const setupErr = document.getElementById('setup-error');
      if (setupErr) setupErr.textContent = 'Connection to Exam Server was lost. Please reconnect.';
    }
  });

  // Questions loaded from server/mock
  window.examAPI.onQuestionsLoaded((questions) => {
    console.log('[App] Questions loaded:', questions.length);
    questionsData = questions;
    window.questionsReceivedFlag = true;
    if (currentState === AppState.EXAM_ACTIVE && !isInitialized) {
      // Editor is ready, questions just arrived — init now
      _initExamEnvironment();
    } else if (currentState === AppState.EXAM_ACTIVE && isInitialized) {
      // Reload questions into panel
      Questions.load(questionsData, _onQuestionSwitch);
      if (questionsData.length > 0) Editor.loadQuestion(questionsData[0].id, 'python');
    }
  });

  // Timer sync from server
  window.examAPI.onTimerSync((timeData) => {
    Timer.syncFromServer(timeData);
  });

  // Teacher commands
  window.examAPI.onExamEvent((event) => {
    _handleExamEvent(event);
  });

  // Invigilator dynamic events (Lock, Warn, Announce)
  if (window.examAPI.onInvigilatorEvent) {
    window.examAPI.onInvigilatorEvent((event) => {
      _handleInvigilatorEvent(event);
    });
  }
}

// ── Connecting Screen Animation ───────────────────────────

function _startConnectingDots() {
  const dotsEl = document.getElementById('connecting-dots');
  if (!dotsEl) return;
  let count = 1;
  setInterval(() => {
    count = (count % 3) + 1;
    dotsEl.textContent = '.'.repeat(count);
  }, 500);
}

// ── CONNECTING → LOGIN ────────────────────────────────────

function _transitionToLogin() {
  currentState = AppState.LOGIN;
  showScreen('login');

  Login.init(async (authResult) => {
    studentInfo = authResult;
    _transitionToInstructions();
  });
}

// ── LOGIN → INSTRUCTIONS ──────────────────────────────────

function _transitionToInstructions() {
  currentState = AppState.INSTRUCTIONS;
  showScreen('instructions');
  
  const chk = document.getElementById('chk-agree-instructions');
  const btn = document.getElementById('btn-proceed-instructions');
  
  chk.checked = false;
  btn.disabled = true;
  
  // Clean up old listener if exists to prevent duplicates
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  chk.onchange = (e) => {
    newBtn.disabled = !e.target.checked;
    if (e.target.checked) {
      newBtn.style.opacity = '1';
      newBtn.style.cursor = 'pointer';
    } else {
      newBtn.style.opacity = '0.5';
      newBtn.style.cursor = 'not-allowed';
    }
  };
  
  newBtn.addEventListener('click', async () => {
    if (studentInfo.globalExamStatus === 'STARTED') {
      await _transitionToExam();
    } else {
      _transitionToWaiting();
    }
  });
}

// ── INSTRUCTIONS → WAITING ────────────────────────────────

function _transitionToWaiting() {
  currentState = AppState.WAITING;
  showScreen('waiting');
  
  if (studentInfo.globalScheduledTime) {
    _startScheduledCountdown(studentInfo.globalScheduledTime);
  } else {
    document.getElementById('scheduled-timer').textContent = '';
  }
}

function _startScheduledCountdown(scheduledTimeMs) {
  const timerEl = document.getElementById('scheduled-timer');
  if (scheduledCountdownInterval) clearInterval(scheduledCountdownInterval);
  
  function update() {
    const now = Date.now();
    const diff = scheduledTimeMs - now;
    if (diff <= 0) {
      clearInterval(scheduledCountdownInterval);
      timerEl.textContent = '00:00:00';
      if (studentInfo && studentInfo.mockMode) {
        _transitionToExam();
      }
    } else {
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      timerEl.textContent = `Starts in: ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
  }

  update();
  scheduledCountdownInterval = setInterval(update, 1000);
}

// ── LOGIN → EXAM_ACTIVE ───────────────────────────────────

async function _transitionToExam() {
  currentState = AppState.EXAM_ACTIVE;
  showScreen('exam');

  if (scheduledCountdownInterval) clearInterval(scheduledCountdownInterval);

  // Update title bar
  const titleEl = document.getElementById('header-exam-title-display');
  if (titleEl && studentInfo) {
    titleEl.textContent = studentInfo.globalExamTitle || 'End Semester Examination';
  }

  // Update status bar & header
  const rollEl = document.getElementById('status-roll');
  const headerNameEl = document.getElementById('header-student-name');
  const seatEl = document.getElementById('status-seat');
  
  if (rollEl && studentInfo) rollEl.textContent = studentInfo.rollNumber || '—';
  if (headerNameEl && studentInfo) {
    if (studentInfo.studentName) {
      headerNameEl.textContent = `${studentInfo.studentName} (${studentInfo.rollNumber})`;
    } else {
      headerNameEl.textContent = studentInfo.rollNumber || '—';
    }
  }

  const ip = await window.examAPI.getClientIP();
  if (seatEl) seatEl.textContent = ip || '—';

  // ── Full Screen Toggle ──
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }

  // Init Monaco editor
  Editor.init();
  if (window.Workspace) {
    window.Workspace.init();
  }

  // Load questions if already received, else show spinner
  if (window.questionsReceivedFlag) {
    _initExamEnvironment();
  } else {
    const qContent = document.getElementById('question-content');
    if (qContent) {
      qContent.innerHTML = `
        <div style="text-align:center;padding:20px;color:#808080;">
          <div class="spinner-xp" style="margin:0 auto 12px;"></div>
          Loading questions from server...
        </div>`;
    }
  }

  // Wire all toolbar + overlay buttons
  _wireButtons();

  // Activate anti-cheat
  AntiCheat.activate();
}

// ── Init Exam Content ─────────────────────────────────────

function _initExamEnvironment() {
  if (isInitialized) {
    Questions.load(questionsData, _onQuestionSwitch);
    if (questionsData.length > 0) {
      Editor.loadQuestion(questionsData[0].id, 'python');
    }
    return;
  }
  isInitialized = true;

  if (questionsData.length === 0) {
    const qContent = document.getElementById('question-content');
    if (qContent) {
      qContent.innerHTML = `
        <div style="text-align:center;padding:40px;color:#808080;font-size:16px;">
          <div style="font-size: 32px; margin-bottom: 10px;">📭</div>
          No questions assigned yet.<br>Please wait for the invigilator.
        </div>`;
    }
    _setStatus('Exam started — No questions assigned.');
    Terminal.info('No questions have been assigned to you yet.');
    
    // Default timer to 0 since no questions exist
    Timer.start(0, _onTimerExpired);
    return;
  }

  // Load questions panel
  Questions.load(questionsData, _onQuestionSwitch);

  // Load first question into editor
  if (questionsData.length > 0) {
    Editor.loadQuestion(questionsData[0].id, 'python');
  }

  // Start countdown timer (use server synced remaining time)
  const remainingTime = studentInfo.currentRemainingSeconds ?? (studentInfo.globalExamDuration * 60);
  if (remainingTime > 0) {
    Timer.startWithRemaining(remainingTime, studentInfo.globalExamDuration * 60, _onTimerExpired);
  } else {
    Timer.start(0, _onTimerExpired);
  }

  // Status bar
  _setStatus(`Exam started — ${questionsData.length} question(s) loaded. Good luck!`);

  // Terminal welcome
  Terminal.info(`Exam session started — ${questionsData.length} question(s) loaded.`);
  Terminal.info(`Duration: ${studentInfo.globalExamDuration} minutes.`);
  Terminal.info('Select a question tab above, write your solution, and click [▶ Run].');
  Terminal.info('─────────────────────────────────────────────────────────');
}

// ── Question Switch ───────────────────────────────────────

function _onQuestionSwitch(index, question) {
  const lang = document.getElementById('lang-select').value || 'python';
  Editor.loadQuestion(question.id, lang);
  Terminal.info(`Switched to Q${index + 1}: ${question.title}`);
  _setStatus(`Q${index + 1}: ${question.title}`);
}

// ── Timer Expiry (auto-submit) ────────────────────────────

async function _onTimerExpired() {
  Terminal.warn('⏰ Time is up! Auto-submitting your solutions...');
  await _doFinalSubmit(true);
}

// ── Teacher Command Handler ───────────────────────────────

function _handleExamEvent(event) {
  console.log('[App] Exam event:', event.type);
  switch (event.type) {

    case 'exam_started':
      if (studentInfo) studentInfo.globalExamStatus = 'STARTED';
      if (currentState === AppState.WAITING || currentState === AppState.INSTRUCTIONS) {
         if (currentState === AppState.WAITING) {
           _transitionToExam();
         }
      }
      break;
      
    case 'exam_scheduled':
      if (studentInfo) {
         studentInfo.globalExamStatus = 'WAITING';
         studentInfo.globalScheduledTime = event.data?.scheduledTime;
      }
      if (currentState === AppState.WAITING && studentInfo.globalScheduledTime) {
         _startScheduledCountdown(studentInfo.globalScheduledTime);
      }
      break;

    case 'FORCE_LOCK':
      currentState = AppState.EXAM_LOCKED;
      AntiCheat.lock(event.message || 'Your session has been locked by the invigilator.');
      Editor.setReadOnly(true);
      Terminal.warn('🔒 Session locked by invigilator.');
      break;

    case 'PAUSE_EXAM':
      currentState = AppState.EXAM_PAUSED;
      Timer.pause();
      Editor.setReadOnly(true);
      const pauseBanner = document.getElementById('pause-banner');
      if (pauseBanner) pauseBanner.classList.remove('hidden');
      Terminal.warn('⏸ Exam paused. Please wait for the invigilator...');
      _setStatus('PAUSED — Waiting for invigilator.');
      break;

    case 'RESUME_EXAM':
      currentState = AppState.EXAM_ACTIVE;
      Timer.resume();
      Editor.setReadOnly(false);
      AntiCheat.unlock();
      const banner = document.getElementById('pause-banner');
      if (banner) banner.classList.add('hidden');
      Terminal.info('▶ Exam resumed. You may continue.');
      _setStatus('Exam resumed.');
      break;

    case 'SUBMIT_AND_CLOSE':
      Terminal.warn('📤 Auto-submitting by server command...');
      _doFinalSubmit(true);
      break;

    case 'UNSUBMIT':
      _undoFinalSubmit();
      break;

    case 'FOCUS_LOST':
      AntiCheat.onFocusLostFromMain(event);
      break;

    case 'USB_DETECTED':
      Terminal.warn('⚠ ILLEGAL DEVICE DETECTED: USB storage device detected! This incident has been reported to the invigilator.');
      _showNotification('⚠ SECURITY ALERT', 'USB device detected. Your activity has been logged and reported.', '#ffcccc', '#cc0000');
      break;

  default:
      console.warn('[App] Unknown exam event:', event.type);
  }
}

// ── Invigilator Event Handler ─────────────────────────────

function _handleInvigilatorEvent(event) {
  console.log('[App] Invigilator event:', event.type, event);
  
  const notifContainer = document.getElementById('notification-container');
  
  switch (event.type) {
    case 'WARNING':
      Terminal.warn(`⚠ Invigilator Warning: ${event.message}`);
      _showNotification('⚠ WARNING', event.message, '#ffcccc', '#cc0000');
      break;

    case 'ANNOUNCEMENT':
      Terminal.info(`📢 Announcement: ${event.message}`);
      _showNotification('📢 ANNOUNCEMENT', event.message, '#cce5ff', '#004085');
      break;

    case 'SCREEN_LOCK':
      const lockOverlay = document.getElementById('lock-overlay');
      const lockMessage = document.getElementById('lock-message');
      if (lockOverlay) lockOverlay.classList.remove('hidden');
      if (lockMessage && event.message) lockMessage.textContent = event.message;
      Editor.setReadOnly(true);
      Timer.pause();
      break;

    case 'SCREEN_UNLOCK':
      const overlay = document.getElementById('lock-overlay');
      if (overlay) overlay.classList.add('hidden');
      Editor.setReadOnly(false);
      Timer.resume();
      break;
  }
}

function _showNotification(title, message, bgColor, textColor) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const notif = document.createElement('div');
  notif.style.backgroundColor = bgColor;
  notif.style.color = textColor;
  notif.style.padding = '15px';
  notif.style.border = `2px solid ${textColor}`;
  notif.style.borderRadius = '5px';
  notif.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.5)';
  notif.style.minWidth = '300px';
  notif.style.fontFamily = 'var(--font-ui)';
  
  notif.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">${title}</div>
    <div style="font-size: 12px;">${message}</div>
  `;

  container.appendChild(notif);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      if (container.contains(notif)) container.removeChild(notif);
    }, 500);
  }, 10000);
}

// ── Final Submission ──────────────────────────────────────

async function _doFinalSubmit(force = false) {
  if (currentState === AppState.EXAM_SUBMITTED) return;
  currentState = AppState.EXAM_SUBMITTED;

  Timer.stop();
  Editor.setReadOnly(true);
  AntiCheat.deactivate();

  const buffers = Editor.getAllBuffers();
  Terminal.info('Submitting all code buffers to server...');

  let success = false;
  try {
    const result = await window.examAPI.finalSubmitAll(buffers, studentInfo?.rollNumber || 'unknown');
    success = result && result.success;
  } catch (err) {
    console.error('[App] Final submit error:', err);
  }

  showScreen('submitted');
  const tsEl = document.getElementById('submit-timestamp');
  if (tsEl) {
    tsEl.textContent = `Submitted at: ${new Date().toLocaleTimeString()} — Roll: ${studentInfo?.rollNumber || '—'}`;
  }

  if (success) Editor.clearStorage();
}

async function _undoFinalSubmit() {
  if (currentState !== AppState.EXAM_SUBMITTED) return;
  
  currentState = AppState.EXAM_ACTIVE;
  showScreen('exam');
  
  Editor.setReadOnly(false);
  AntiCheat.activate();
  
  // Timer is tricky: we'd need to sync or just resume. Let's resume.
  Timer.resume();
  
  Terminal.info('🔄 Exam has been unsubmitted by the invigilator. You may continue.');
  _setStatus('Exam resumed after unsubmit.');
}

// ── Button Wiring ─────────────────────────────────────────

function _wireButtons() {
  const finalSubmitBtn   = document.getElementById('btn-final-submit');
  const confirmOverlay   = document.getElementById('confirm-submit-overlay');
  const confirmSubmitBtn = document.getElementById('btn-confirm-submit');
  const cancelSubmitBtn  = document.getElementById('btn-cancel-submit');

  if (finalSubmitBtn) {
    finalSubmitBtn.addEventListener('click', () => {
      if (confirmOverlay) confirmOverlay.classList.remove('hidden');
    });
  }
  if (confirmSubmitBtn) {
    confirmSubmitBtn.addEventListener('click', () => {
      if (confirmOverlay) confirmOverlay.classList.add('hidden');
      _doFinalSubmit(false);
    });
  }
  if (cancelSubmitBtn) {
    cancelSubmitBtn.addEventListener('click', () => {
      if (confirmOverlay) confirmOverlay.classList.add('hidden');
    });
  }
}

// ── Start ─────────────────────────────────────────────────

// Expose boot function to HTML loader
window.bootApp = function() {
  boot();
};

