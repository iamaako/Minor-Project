'use strict';

/**
 * Shared constants used across Main and Renderer processes.
 * Main process: require() this directly.
 * Renderer process: values are embedded via preload or hardcoded where needed.
 */
module.exports = {
  // ── Server Connection ──
  SERVER_URL: 'http://192.168.1.50:3000',

  // ── Code Execution ──
  EXECUTION_TIMEOUT_MS: 120000,
  MAX_OUTPUT_BUFFER: 1024 * 300,  // 300 KB max stdout/stderr
  SUPPORTED_LANGUAGES: ['python', 'c', 'cpp'],
  TEMP_DIR: 'temp',

  // ── Language → File Extension Map ──
  LANG_EXTENSIONS: {
    python: '.py',
    c: '.c',
    cpp: '.cpp',
  },

  // ── Compiler/Interpreter Commands (Windows) ──
  LANG_COMMANDS: {
    python: { run: 'python' },
    c: { compile: 'gcc', run: null },      // run target set dynamically after compile
    cpp: { compile: 'g++', run: null },
  },

  // ── Anti-Cheat ──
  MAX_FOCUS_VIOLATIONS: 3,
  AUTO_SAVE_INTERVAL_MS: 30000,

  // ── Socket Events (Server → Client) ──
  EVENTS: {
    FORCE_LOCK: 'force-lock',
    PAUSE_EXAM: 'pause-exam',
    RESUME_EXAM: 'resume-exam',
    SUBMIT_AND_CLOSE: 'submit-and-close',
    TIMER_SYNC: 'timer-sync',
    QUESTIONS_LOAD: 'questions-load',
    AUTH_SUCCESS: 'auth-success',
    AUTH_FAILURE: 'auth-failure',
    CONNECTION_STATUS: 'connection-status',
  },

  // ── App States ──
  STATES: {
    CONNECTING: 'CONNECTING',
    LOGIN: 'LOGIN',
    EXAM_ACTIVE: 'EXAM_ACTIVE',
    EXAM_PAUSED: 'EXAM_PAUSED',
    EXAM_LOCKED: 'EXAM_LOCKED',
    EXAM_SUBMITTED: 'EXAM_SUBMITTED',
  },
};
