'use strict';

/**
 * questions.js — Question Panel Renderer & Navigation
 *
 * Renders the question list as XP-style tab buttons in the toolbar,
 * and displays the active question's full content in the left panel.
 */

const Questions = (() => {
  let questions        = [];
  let activeIndex      = 0;
  let solvedSet        = new Set();  // question IDs that have been submitted
  let onSwitchCallback = null;

  const tabsContainer  = document.getElementById('question-tabs-container');
  const contentEl      = document.getElementById('question-content');
  const panelTitleEl   = document.getElementById('question-panel-title');

  // ── Public: Load questions ──────────────────────────────

  function load(questionArray, onSwitch) {
    questions        = questionArray || [];
    onSwitchCallback = onSwitch;
    solvedSet        = new Set();
    activeIndex      = 0;

    _renderTabs();

    if (questions.length > 0) {
      _showQuestion(0);
    } else {
      contentEl.innerHTML = '<div style="color:#808080;text-align:center;margin-top:20px;">No questions loaded.</div>';
    }
  }

  // ── Public: Mark a question as solved ──────────────────

  function markSolved(questionId) {
    solvedSet.add(questionId);
    _renderTabs(); // refresh tab appearance
  }

  // ── Public: Get active question ────────────────────────

  function getActive() {
    return questions[activeIndex] || null;
  }

  function getAll() {
    return questions;
  }

  function getCount() {
    return questions.length;
  }

  // ── Internal: Render tab row ───────────────────────────

  function _renderTabs() {
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    questions.forEach((q, i) => {
      const tab = document.createElement('button');
      tab.className = 'xp-tab' + (i === activeIndex ? ' active' : '') + (solvedSet.has(q.id) ? ' solved' : '');
      tab.textContent = `Q${i + 1}`;
      tab.title       = q.title;
      tab.dataset.index = i;

      tab.addEventListener('click', () => {
        if (i !== activeIndex) {
          activeIndex = i;
          _renderTabs();
          _showQuestion(i);
          if (typeof onSwitchCallback === 'function') {
            onSwitchCallback(i, q);
          }
        }
      });

      tabsContainer.appendChild(tab);
    });
  }

  // ── Internal: Render a question's content ─────────────

  function _showQuestion(index) {
    const q = questions[index];
    if (!q || !contentEl) return;

    if (panelTitleEl) {
      panelTitleEl.textContent = `Q${index + 1}: ${q.title}`;
    }

    // Safely parse test cases if it's a string
    let parsedTestCases = [];
    if (typeof q.testCases === 'string' && q.testCases.trim() !== '') {
      try {
        parsedTestCases = JSON.parse(q.testCases);
        if (!Array.isArray(parsedTestCases)) parsedTestCases = [];
      } catch (e) {
        console.warn('Failed to parse test cases for Q' + q.id, e);
      }
    } else if (Array.isArray(q.testCases)) {
      parsedTestCases = q.testCases;
    }

    // Helper to check if a field has actual content
    const hasContent = (str) => typeof str === 'string' && str.trim().length > 0;

    // Build the question card HTML
    const diffClass = (q.difficulty || 'easy').toLowerCase();
    const diffLabel = q.difficulty || 'Easy';

    contentEl.innerHTML = `
      <!-- Header: number + title + difficulty -->
      <div class="question-meta">
        <span class="question-number">Q${index + 1}</span>
        <span class="question-title">${_esc(q.title)}</span>
        <span class="difficulty-badge ${diffClass}">${_esc(diffLabel)}</span>
        ${solvedSet.has(q.id) ? '<span style="color:var(--clr-success);font-size:12px;" title="Submitted">✓</span>' : ''}
      </div>

      <!-- Problem Statement -->
      <div class="question-section-title">Problem Statement</div>
      <div class="question-description">${_esc(q.description)}</div>

      <!-- Constraints -->
      ${hasContent(q.constraints) ? `
        <div class="question-section-title">Constraints</div>
        <div class="question-constraints">${_esc(q.constraints)}</div>
      ` : ''}

      <!-- Sample I/O -->
      ${hasContent(q.sampleInput) || hasContent(q.sampleOutput) ? `
        <div class="question-section-title">Sample Input / Output</div>
        <div class="question-io-block">
          ${hasContent(q.sampleInput) ? `
          <div class="io-row">
            <span class="io-label">Input:</span>
            <pre class="io-value">${_esc(q.sampleInput)}</pre>
          </div>` : ''}
          ${hasContent(q.sampleOutput) ? `
          <div class="io-row">
            <span class="io-label">Output:</span>
            <pre class="io-value">${_esc(q.sampleOutput)}</pre>
          </div>` : ''}
        </div>
      ` : ''}

      <!-- Explanation -->
      ${hasContent(q.explanation) ? `
        <div class="question-section-title">Explanation</div>
        <div class="question-explanation">${_esc(q.explanation)}</div>
      ` : ''}

      <!-- Test Cases preview (non-hidden) -->
      ${parsedTestCases.length > 0 ? `
        <div class="question-section-title">Test Cases (${parsedTestCases.length} total)</div>
        ${parsedTestCases.map((tc, ti) => `
          <div style="margin-bottom:8px;">
            <div style="font-size:10px;color:#808080;margin-bottom:2px;">Case ${ti + 1}:</div>
            <div class="io-row">
              <span class="io-label">Input:</span>
              <pre class="io-value" style="font-size:10px;">${_esc(tc.input)}</pre>
            </div>
            <div class="io-row">
              <span class="io-label">Expected:</span>
              <pre class="io-value" style="font-size:10px;">${_esc(tc.expected)}</pre>
            </div>
          </div>
        `).join('')}
      ` : ''}
    `;

    // Scroll question panel to top on switch
    contentEl.scrollTop = 0;
  }

  // ── Utility: HTML escape ───────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return { load, markSolved, getActive, getAll, getCount };
})();

window.Questions = Questions;
