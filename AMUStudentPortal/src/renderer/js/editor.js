'use strict';

/**
 * editor.js — Monaco Editor Manager
 *
 * Initialises the Monaco editor with a retro-dark theme,
 * manages per-question code buffers, language switching,
 * auto-save to localStorage, and triggers code execution.
 */

const Editor = (() => {
  let monacoEditor     = null;
  let currentLanguage  = 'python';
  let currentQuestionId = null;
  let isReadOnly       = false;

  // Saved code is stored per student (roll number), never shared between students.
  let storageKey       = 'amu_code_buffers_anon';
  // true while the editor shows the question's solution file (main.*).
  // Other workspace files (helper.py ...) must not overwrite the question buffer.
  let isMainFile       = true;
  // true while code sets the editor value (question switch, file open). Not a student edit.
  let programmaticChange = false;

  // Per-question code buffers: { [questionId]: { [language]: code } }
  let codeBuffers = {};

  // DOM
  const langSelect    = document.getElementById('lang-select');
  const filenameEl    = document.getElementById('editor-filename');
  const modifiedDotEl = document.getElementById('editor-modified-dot');
  const runBtn        = document.getElementById('btn-run');
  const saveBtn       = document.getElementById('btn-submit');

  // Auto-save interval
  let autoSaveInterval = null;
  const AUTO_SAVE_MS   = 30000;

  // ── Language → file extension map ─────────────────────

  const LANG_EXT = { python: 'py', c: 'c', cpp: 'cpp' };
  const LANG_MONACO = { python: 'python', c: 'c', cpp: 'cpp' };

  // ── Default starter code per language ─────────────────

  const STARTERS = {
    python: '',
    c: '',
    cpp: '',
  };

  // ── Custom Monaco Theme (XP-inspired dark) ────────────

  function _defineTheme() {
    monaco.editor.defineTheme('xp-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',    foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword',    foreground: '569CD6', fontStyle: 'bold'   },
        { token: 'string',     foreground: 'CE9178' },
        { token: 'number',     foreground: 'B5CEA8' },
        { token: 'operator',   foreground: 'D4D4D4' },
        { token: 'type',       foreground: '4EC9B0' },
        { token: 'function',   foreground: 'DCDCAA' },
        { token: 'variable',   foreground: '9CDCFE' },
        { token: 'delimiter',  foreground: 'D4D4D4' },
        { token: 'identifier', foreground: 'D4D4D4' },
      ],
      colors: {
        'editor.background':            '#0C0C0C',
        'editor.foreground':            '#D4D4D4',
        'editor.lineHighlightBackground':'#1A1A1A',
        'editor.selectionBackground':   '#264F78',
        'editorCursor.foreground':      '#AEAFAD',
        'editorLineNumber.foreground':  '#4A4A4A',
        'editorLineNumber.activeForeground': '#8A8A8A',
        'editorIndentGuide.background': '#1E1E1E',
        'editorWidget.background':      '#1E1E1E',
        'editorSuggestWidget.background':'#1E1E1E',
        'editorSuggestWidget.border':   '#454545',
        'scrollbar.shadow':             '#000000',
        'scrollbarSlider.background':   '#424242',
        'scrollbarSlider.hoverBackground':'#555555',
      },
    });
  }

  // ── Public: Initialise ────────────────────────────────

  function init(rollNumber) {
    storageKey = 'amu_code_buffers_' + String(rollNumber || 'anon').replace(/[^A-Za-z0-9_-]/g, '_');
    try { localStorage.removeItem('amu_code_buffers'); } catch (e) { /* legacy shared key, owner unknown */ }

    if (typeof monaco === 'undefined') {
      console.error('[Editor] Monaco not loaded!');
      return;
    }

    _defineTheme();

    monacoEditor = monaco.editor.create(
      document.getElementById('monaco-container'),
      {
        value:           STARTERS.python,
        language:        'python',
        theme:           'vs', // Professional light theme
        fontFamily:      "'Consolas', 'Courier New', monospace",
        fontSize:        14,
        lineHeight:      22,
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        minimap:         { enabled: false },
        automaticLayout: true,
        wordWrap:        'off',
        lineNumbers:     'on',
        glyphMargin:     false,
        folding:         true,
        cursorBlinking:  'blink',
        cursorStyle:     'line',
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        renderWhitespace: 'none',
        tabSize:         4,
        insertSpaces:    true,
        contextmenu:     false,
        quickSuggestions: { other: true, comments: false, strings: false },
        parameterHints:  { enabled: true },
        suggest:         { showIcons: false },
      }
    );

    // Track modifications
    monacoEditor.onDidChangeModelContent(() => {
      if (programmaticChange) {
        // Not typing: keep the behaviour monitor's baseline in step so a question switch
        // is not mistaken for a pasted block of code.
        if (window.StudentBehavior && typeof window.StudentBehavior.syncEditorLength === 'function') {
          window.StudentBehavior.syncEditorLength(monacoEditor.getValue().length);
        }
        return;
      }
      if (modifiedDotEl) modifiedDotEl.classList.add('visible');
      _saveCurrentBuffer();
      if (window.StudentBehavior && typeof window.StudentBehavior.notifyEditorChange === 'function') {
        window.StudentBehavior.notifyEditorChange(monacoEditor.getValue().length);
      }
    });

    // Wire language select
    if (langSelect) {
      langSelect.addEventListener('change', async () => {
        const newLang = langSelect.value;
        const newExt = LANG_EXT[newLang];
        
        // If workspace is active and the file is named "main.*", rename it
        if (window.Workspace && window.examAPI) {
          const active = window.Workspace.getCurrentActiveFile();
          if (active && active.startsWith('main.')) {
            const newName = 'main.' + newExt;
            if (active !== newName) {
              // Delete old main file
              await window.examAPI.deleteWorkspace(active);
              // Write new main file with starter code for new language
              const code = STARTERS[newLang] || '';
              await window.examAPI.writeWorkspace(newName, code);
              // Open the new file
              window.Workspace.openFile(newName);
              window.Workspace.refreshFileList();
              return;
            }
          }
        }
        
        switchLanguage(newLang);
      });
    }

    // Wire Run button
    if (runBtn) {
      runBtn.addEventListener('click', runCode);
    }

    // Wire Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', saveCurrentQuestion);
    }

    // Wire Theme Toggle button
    let isDarkMode = false;
    const themeToggleBtn = document.getElementById('btn-theme-toggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
        themeToggleBtn.innerHTML = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
      });
    }

    // Auto-save every 30 seconds
    autoSaveInterval = setInterval(_persistToStorage, AUTO_SAVE_MS);

    // Restore any saved buffers from localStorage
    _loadFromStorage();
  }

  // ── Public: Load question (switch buffers) ────────────

  function loadQuestion(questionId, language) {
    // Save current before switching
    if (currentQuestionId !== null) {
      _saveCurrentBuffer();
    }

    // Leaving a helper file: write its text to disk first (arguments are read right now).
    if (!isMainFile && window.Workspace) window.Workspace.syncActiveFile();

    currentQuestionId = questionId;
    isMainFile = true;

    // Restore saved code or use starter
    const savedCode = _getBuffer(questionId, language || currentLanguage);
    const code = savedCode !== null ? savedCode : STARTERS[language || currentLanguage] || '';

    // Switch Monaco language
    const lang = language || currentLanguage;
    currentLanguage = lang;
    if (langSelect) langSelect.value = lang;

    const monacoLang = LANG_MONACO[lang] || 'python';
    monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLang);
    _setEditorValue(code);
    monacoEditor.setScrollPosition({ scrollTop: 0 });

    // The question's code lives in main.<ext>: tell the file panel so autosave and Run use it.
    if (window.Workspace && typeof window.Workspace.setActiveFile === 'function') {
      window.Workspace.setActiveFile('main.' + (LANG_EXT[lang] || 'py'));
    }

    if (filenameEl) {
      filenameEl.textContent = `solution.${LANG_EXT[lang] || 'py'}`;
    }
    if (modifiedDotEl) modifiedDotEl.classList.remove('visible');

    // Focus editor
    monacoEditor.focus();

    if (isReadOnly) {
      monacoEditor.updateOptions({ readOnly: true });
      if (allowRunInReadOnly && runBtn) {
        runBtn.disabled = false;
        runBtn.style.opacity = '1';
      }
    }
  }

  // ── Public: Switch language within same question ──────

  function switchLanguage(lang) {
    if (isReadOnly) return;
    if (!LANG_MONACO[lang]) return;

    // Leaving a helper file: write its text to disk first.
    if (!isMainFile && window.Workspace) window.Workspace.syncActiveFile();

    // Save current language buffer
    _saveCurrentBuffer();

    currentLanguage = lang;

    const savedCode = _getBuffer(currentQuestionId, lang);
    const code = savedCode !== null ? savedCode : (STARTERS[lang] || '');

    const monacoLang = LANG_MONACO[lang];
    monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLang);
    _setEditorValue(code);
    isMainFile = true;
    if (window.Workspace && typeof window.Workspace.setActiveFile === 'function') {
      window.Workspace.setActiveFile('main.' + LANG_EXT[lang]);
    }

    if (filenameEl) {
      filenameEl.textContent = `solution.${LANG_EXT[lang]}`;
    }
    if (modifiedDotEl) modifiedDotEl.classList.remove('visible');
  }

  // ── Public: Set Language and Code (from Workspace) ─────

  function setLanguageAndCode(lang, code, filename) {
    currentLanguage = lang;
    isMainFile = /^main\.(py|c|cpp)$/.test(filename || '');
    
    // If it's a known language, update select
    if (LANG_MONACO[lang] && langSelect) {
      langSelect.value = lang;
    }

    const monacoLang = LANG_MONACO[lang] || 'plaintext';
    if (monacoEditor) {
      monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLang);
      _setEditorValue(code);
      monacoEditor.setScrollPosition({ scrollTop: 0 });
      if (isReadOnly) {
        monacoEditor.updateOptions({ readOnly: true });
      }
    }

    if (filenameEl) {
      filenameEl.textContent = filename;
    }
    if (modifiedDotEl) modifiedDotEl.classList.remove('visible');

    // Disable run button if it's a text file or if readOnly without allowRun
    if (runBtn) {
      if (lang === 'plaintext' || lang === 'json') {
        runBtn.disabled = true;
        runBtn.style.opacity = '0.5';
      } else {
        const canRun = !isReadOnly || allowRunInReadOnly;
        runBtn.disabled = !canRun;
        runBtn.style.opacity = canRun ? '1' : '0.5';
      }
    }
  }

  let isRunningCode = false;

  function toggleRunButton(running) {
    isRunningCode = running;
    if (!runBtn) return;
    if (running) {
      runBtn.innerHTML = '⏹ Stop Code';
      runBtn.style.backgroundColor = '#d32f2f'; // Red color for stop
      runBtn.style.color = 'white';
    } else {
      runBtn.innerHTML = '▶ Run Code';
      runBtn.style.backgroundColor = ''; // Revert to default xp-theme styling
      runBtn.style.color = '';
    }
  }

  // ── Public: Run current code ──────────────────────────

  async function runCode() {
    if (!window.examAPI) return;

    if (isRunningCode) {
      // Button was clicked while code is running -> Stop execution
      window.examAPI.stopInteractive();
      return;
    }

    const code = monacoEditor.getValue();
    if (!code.trim()) {
      Terminal.warn('No code to run. Write your solution first.');
      return;
    }

    if (window.Workspace) {
      await window.Workspace.syncActiveFile();
    }

    toggleRunButton(true);
    Terminal.prompt(`Running ${currentLanguage} solution...`);
    Terminal.showRunning(currentLanguage);
    Terminal.setRunningState(true);

    try {
      // Run the file being edited (helper.py, main.c ...), never silently overwrite main.*.
      const activeFile = window.Workspace && window.Workspace.getCurrentActiveFile && window.Workspace.getCurrentActiveFile();
      await window.examAPI.startInteractive(code, currentLanguage, activeFile || undefined);
    } catch (err) {
      Terminal.stderr(`Execution error: ${err.message}`);
      Terminal.setRunningState(false);
      toggleRunButton(false);
    }
  }

  // ── Terminal Stream Listeners ──
  if (window.examAPI && window.examAPI.onTerminalOutput) {
    window.examAPI.onTerminalOutput((data) => {
      Terminal.stdout(data);
    });
    
    window.examAPI.onTerminalError((data) => {
      Terminal.stderr(data);
    });

    window.examAPI.onTerminalExit(({ exitCode, executionTime, timedOut }) => {
      Terminal.renderExit(exitCode, executionTime, timedOut);
      toggleRunButton(false);
    });
  }

  // ── Public: Save current question's code ──────────────

  async function saveCurrentQuestion() {
    if (!currentQuestionId || !window.examAPI) return;
    _saveCurrentBuffer();

    if (window.Workspace) {
      await window.Workspace.syncActiveFile();
    }

    const code = getSolutionCode();
    const result = await window.examAPI.submitCode(currentQuestionId, code, currentLanguage);

    if (result && result.success) {
      if (modifiedDotEl) modifiedDotEl.classList.remove('visible');
      Terminal.success(`✓ Code saved for Q${currentQuestionId} (${currentLanguage})`);
    } else {
      Terminal.warn('Save failed — check server connection.');
    }
  }

  // ── Public: Get all code buffers (for final submit) ───

  function getAllBuffers() {
    _saveCurrentBuffer(); // include unsaved current
    return JSON.parse(JSON.stringify(codeBuffers));
  }

  // ── Public: Get current editor content ────────────────

  function getCurrentCode() {
    return monacoEditor ? monacoEditor.getValue() : '';
  }

  // The question's solution: the editor text when main.* is open, else the stored buffer.
  function getSolutionCode() {
    if (isMainFile) return getCurrentCode();
    const buf = _getBuffer(currentQuestionId, currentLanguage);
    return buf === null ? '' : buf;
  }

  function getCurrentLanguage() {
    return currentLanguage;
  }

  // ── Public: Set read-only (with optional allowRun for invigilator checks) ─
  let allowRunInReadOnly = false;

  function setReadOnly(readOnly, allowRun = false) {
    isReadOnly = readOnly;
    allowRunInReadOnly = allowRun;
    if (monacoEditor) {
      monacoEditor.updateOptions({ readOnly });
    }
    if (runBtn) {
      runBtn.disabled  = allowRun ? false : readOnly;
      runBtn.style.opacity = (allowRun || !readOnly) ? '1' : '0.5';
    }
    if (saveBtn) saveBtn.disabled = readOnly;
    if (langSelect) langSelect.disabled = readOnly;
  }

  // ── Internal: set editor text from code (not a student edit) ──

  function _setEditorValue(code) {
    programmaticChange = true;
    try {
      monacoEditor.setValue(code);
    } finally {
      programmaticChange = false;
    }
  }

  // ── Internal: Buffer management ───────────────────────

  function _saveCurrentBuffer() {
    if (isReadOnly) return;
    if (!isMainFile) return;
    if (currentQuestionId === null || !monacoEditor) return;
    if (!codeBuffers[currentQuestionId]) {
      codeBuffers[currentQuestionId] = {};
    }
    codeBuffers[currentQuestionId][currentLanguage] = monacoEditor.getValue();
  }

  function _getBuffer(questionId, language) {
    if (!codeBuffers[questionId]) return null;
    return codeBuffers[questionId][language] !== undefined
      ? codeBuffers[questionId][language]
      : null;
  }

  // ── Internal: localStorage persistence ────────────────

  function _persistToStorage() {
    if (isReadOnly) return;
    _saveCurrentBuffer();
    try {
      localStorage.setItem(storageKey, JSON.stringify(codeBuffers));
    } catch (e) {
      console.warn('[Editor] localStorage write failed:', e.message);
    }
    
    // Also auto-save the physical file in the Workspace tab
    if (window.Workspace && typeof window.Workspace.syncActiveFile === 'function') {
      window.Workspace.syncActiveFile();
    }
  }

  function _loadFromStorage() {
    try {
      const saved = localStorage.getItem(storageKey);
      codeBuffers = saved ? JSON.parse(saved) : {};
      if (saved) console.log('[Editor] Restored code buffers from localStorage');
    } catch (e) {
      console.warn('[Editor] localStorage read failed:', e.message);
      codeBuffers = {};
    }
  }

  function clearStorage() {
    localStorage.removeItem(storageKey);
    codeBuffers = {};
  }

  return {
    init,
    loadQuestion,
    switchLanguage,
    runCode,
    saveCurrentQuestion,
    getAllBuffers,
    getCurrentCode,
    getSolutionCode,
    getCurrentLanguage,
    setLanguageAndCode,
    setReadOnly,
    isReadOnly: () => isReadOnly,
    clearStorage,
  };
})();

window.Editor = Editor;
