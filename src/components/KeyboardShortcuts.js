import { navigate } from '../utils/router.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';

let overlayVisible = false;
let gPending = false;

const SHORTCUTS = [
  { keys: '?', desc: 'Show this help' },
  { keys: 'j / k', desc: 'Next / previous issue' },
  { keys: 'o / Enter', desc: 'Open selected issue' },
  { keys: 'Esc', desc: 'Close overlay / drawer' },
  { keys: 'g b', desc: 'Go to Board' },
  { keys: 'g a', desc: 'Go to All Issues' },
  { keys: 'g r', desc: 'Go to Roadmap' },
  { keys: 'g d', desc: 'Go to Dashboard' },
  { keys: 'g v', desc: 'Go to Velocity' },
  { keys: 'g w', desc: 'Go to Workload' },
  { keys: 'g f', desc: 'Go to CFD' },
  { keys: 'g s', desc: 'Go to Standup' },
];

const GOTO_MAP = {
  b: 'board', a: 'all-issues', r: 'roadmap', d: 'dashboard',
  v: 'velocity', w: 'workload', f: 'cfd', s: 'standup'
};

function showOverlay() {
  if (overlayVisible) return;
  overlayVisible = true;
  const html = `
    <div class="shortcuts-overlay" id="shortcuts-overlay">
      <div class="shortcuts-modal">
        <div class="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="modal-close" id="shortcuts-close">&times;</button>
        </div>
        <div class="shortcuts-grid">
          ${SHORTCUTS.map(s => `
            <div class="shortcut-row">
              <span class="shortcut-keys">${s.keys.split(' / ').map(k => `<kbd>${k.trim()}</kbd>`).join(' / ')}</span>
              <span class="shortcut-desc">${s.desc}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('shortcuts-close')?.addEventListener('click', hideOverlay);
  document.getElementById('shortcuts-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'shortcuts-overlay') hideOverlay();
  });
}

function hideOverlay() {
  overlayVisible = false;
  document.getElementById('shortcuts-overlay')?.remove();
}

function getSelectableRows() {
  return Array.from(document.querySelectorAll('.issue-card, .table-row, [data-issue-key]'));
}

function getSelectedIndex(rows) {
  return rows.findIndex(r => r.classList.contains('kb-selected'));
}

function selectRow(rows, idx) {
  rows.forEach(r => r.classList.remove('kb-selected'));
  if (rows[idx]) {
    rows[idx].classList.add('kb-selected');
    rows[idx].scrollIntoView({ block: 'nearest' });
  }
}

export function initKeyboardShortcuts(jiraDomain) {
  document.addEventListener('keydown', (e) => {
    // Skip if typing in input/textarea/select
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

    // Handle g+key combos
    if (gPending) {
      gPending = false;
      const route = GOTO_MAP[e.key];
      if (route) { e.preventDefault(); navigate(route); }
      return;
    }

    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      overlayVisible ? hideOverlay() : showOverlay();
      return;
    }

    if (e.key === 'Escape') {
      if (overlayVisible) { hideOverlay(); return; }
      return;
    }

    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      gPending = true;
      setTimeout(() => { gPending = false; }, 1000);
      return;
    }

    const rows = getSelectableRows();
    if (!rows.length) return;

    if (e.key === 'j') {
      e.preventDefault();
      const idx = getSelectedIndex(rows);
      selectRow(rows, Math.min(idx + 1, rows.length - 1));
    } else if (e.key === 'k') {
      e.preventDefault();
      const idx = getSelectedIndex(rows);
      selectRow(rows, Math.max(idx - 1, 0));
    } else if (e.key === 'o' || e.key === 'Enter') {
      const idx = getSelectedIndex(rows);
      if (idx >= 0) {
        e.preventDefault();
        const key = rows[idx].dataset?.issueKey || rows[idx].querySelector('[data-issue-key]')?.dataset?.issueKey;
        if (key) openIssueDrawer(key, jiraDomain, () => {});
      }
    }
  });
}

export const KeyboardShortcutsStyles = `
  .shortcuts-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 14, 26, 0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
  }
  .shortcuts-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl, 16px);
    padding: 24px 28px;
    max-width: 420px;
    width: 90%;
    box-shadow: var(--shadow-xl);
  }
  .shortcuts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .shortcuts-header h3 { margin: 0; }
  .shortcuts-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
  }
  .shortcut-keys {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .shortcut-keys kbd {
    display: inline-block;
    padding: 2px 7px;
    font-family: var(--mono, monospace);
    font-size: 12px;
    background: var(--surface-sunken, var(--border-light));
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 22px;
    text-align: center;
  }
  .shortcut-desc {
    font-size: 13px;
    color: var(--text-muted);
  }
  .kb-selected {
    outline: 2px solid var(--primary) !important;
    outline-offset: -2px;
    border-radius: var(--radius-md, 8px);
  }
`;
