'use strict';

/**
 * terminal.js — Interactive Real-Time Code Output Terminal
 */

const Terminal = (() => {
  const outputEl  = document.getElementById('terminal-output');
  const timeEl    = document.getElementById('terminal-exec-time');
  const clearBtn  = document.getElementById('btn-clear-terminal');

  let hasCleared = false;
  let isRunning = false;
  let inputBuffer = '';
  let inputLineSpan = null; // Span where user typing is echoed

  let cursorEl = null;

  function _getCursor() {
    if (!cursorEl) {
      cursorEl = outputEl.querySelector('.term-cursor');
      if (!cursorEl) {
        cursorEl = document.createElement('span');
        cursorEl.className = 'term-cursor';
        cursorEl.id = 'term-cursor';
      }
    }
    return cursorEl;
  }

  function _repositionCursor() {
    const c = _getCursor();
    if (outputEl.lastChild !== c) {
      outputEl.appendChild(c);
    }
    // Clean up any duplicate cursors
    const duplicates = outputEl.querySelectorAll('.term-cursor');
    duplicates.forEach(dup => {
      if (dup !== c) dup.remove();
    });
  }

  const MAX_DOM_NODES = 2000;

  function _trimScrollback() {
    while (outputEl.childNodes.length > MAX_DOM_NODES) {
      if (outputEl.firstChild && outputEl.firstChild.id === 'term-cursor') break; // Safety
      outputEl.removeChild(outputEl.firstChild);
    }
  }

  // Appends a block of text, handling newlines properly by creating span elements
  function _appendStream(text, type = 'stdout') {
    if (!hasCleared) hasCleared = true;

    const lines = String(text).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (i > 0) {
        outputEl.appendChild(document.createElement('br'));
      }
      if (lineText.length > 0) {
        const span = document.createElement('span');
        span.className = `term-${type}`;
        span.textContent = lineText;
        outputEl.appendChild(span);
      }
    }
    _repositionCursor();
    _trimScrollback();
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  // Handle Interactive Typing
  outputEl.addEventListener('keydown', (e) => {
    if (!isRunning) return; // Only allow typing when code is running

    if (e.key === 'Enter') {
      e.preventDefault();
      const textToSend = inputBuffer + '\n';
      inputBuffer = '';
      
      // Lock in the input line
      if (inputLineSpan) {
        inputLineSpan = null;
      }
      outputEl.appendChild(document.createElement('br'));
      _repositionCursor();
      outputEl.scrollTop = outputEl.scrollHeight;

      // Send to main process via IPC
      if (window.examAPI && window.examAPI.sendTerminalInput) {
        window.examAPI.sendTerminalInput(textToSend);
      }

    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        if (inputLineSpan) inputLineSpan.textContent = inputBuffer;
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      inputBuffer += e.key;
      
      if (!inputLineSpan) {
        inputLineSpan = document.createElement('span');
        inputLineSpan.className = 'term-input';
        inputLineSpan.style.color = '#fff';
        inputLineSpan.style.fontWeight = 'bold';
        outputEl.appendChild(inputLineSpan);
        _repositionCursor();
      }
      inputLineSpan.textContent = inputBuffer;
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  });

  // Expose methods
  function prompt(label) {
    _appendStream(`\nC:\\> ${label}\n`, 'prompt');
  }

  function showRunning(language) {
    const c = _getCursor();
    if (c.parentNode) c.remove(); // Temporarily remove cursor so it doesn't stay above running indicator
    const span = document.createElement('span');
    span.className = 'term-running';
    span.id = 'term-running-indicator';
    span.textContent = `⟳ Running ${language} code...\n`;
    outputEl.appendChild(span);
    _repositionCursor();
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function hideRunning() {
    const el = document.getElementById('term-running-indicator');
    if (el) el.remove();
  }

  function setRunningState(state) {
    isRunning = state;
    if (isRunning) {
      inputBuffer = '';
      inputLineSpan = null;
      outputEl.focus(); // Focus terminal so user can type immediately
    } else {
      inputLineSpan = null;
    }
  }

  function stdout(text) { hideRunning(); _appendStream(text, 'stdout'); }
  function stderr(text) { hideRunning(); _appendStream(text, 'stderr'); }
  function info(text)   { _appendStream(text + '\n', 'info'); }
  function warn(text)   { _appendStream(text + '\n', 'warn'); }

  function renderExit(exitCode, executionTime, timedOut = false) {
    hideRunning();
    setRunningState(false);

    if (timedOut) {
      stderr(`\n⏱ Execution timed out after 120 seconds.\nPossible infinite loop detected.`);
      return;
    }

    const exitMsg = exitCode === 0
      ? `\n✓ Process exited with code 0`
      : `\n✗ Process exited with code ${exitCode}`;
    const timeMsg = `  [${executionTime}ms]\n`;

    const summaryEl = document.createElement('span');
    summaryEl.className = exitCode === 0 ? 'term-success' : 'term-stderr';
    summaryEl.textContent = exitMsg + timeMsg;
    outputEl.appendChild(summaryEl);
    _repositionCursor();

    if (timeEl) {
      timeEl.textContent = `Last run: ${executionTime}ms`;
    }
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function clear() {
    outputEl.innerHTML = '';
    hasCleared = false;
    if (timeEl) timeEl.textContent = '';
    info('Terminal cleared.\nWrite your solution and click [▶ Run] to execute.');
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clear);
  }

  return { prompt, showRunning, hideRunning, setRunningState, stdout, stderr, info, warn, renderExit, clear };
})();

window.Terminal = Terminal;
