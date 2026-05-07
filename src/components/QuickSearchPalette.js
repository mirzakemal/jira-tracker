import { searchIssues } from '../db/queries.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';

export class QuickSearchPalette {
  constructor(jiraDomain) {
    this.jiraDomain = jiraDomain;
    this.results = [];
    this.selectedIndex = -1;
    this._boundKey = null;
    this._boundClick = null;
    this._open = false;
  }

  async open() {
    if (this._open) return;
    this._open = true;
    this.selectedIndex = -1;

    const overlay = document.createElement('div');
    overlay.id = 'quick-search-overlay';
    overlay.className = 'quick-search-overlay';
    overlay.innerHTML = this.render();
    document.body.appendChild(overlay);

    const input = document.getElementById('quick-search-input');
    input?.focus();

    setTimeout(() => input?.focus(), 50);

    this.bindEvents();
  }

  close() {
    this._open = false;
    const overlay = document.getElementById('quick-search-overlay');
    overlay?.remove();
    if (this._boundKey) {
      document.removeEventListener('keydown', this._boundKey);
      this._boundKey = null;
    }
    if (this._boundClick) {
      document.removeEventListener('click', this._boundClick);
      this._boundClick = null;
    }
  }

  render() {
    return `
      <div class="quick-search-backdrop" id="quick-search-backdrop"></div>
      <div class="quick-search-palette" id="quick-search-palette" role="dialog" aria-modal="true" aria-label="Quick search">
        <div class="palette-input-row">
          <svg class="palette-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text"
                 id="quick-search-input"
                 class="palette-input"
                 placeholder="Search issues by key or summary..."
                 autocomplete="off"
                 aria-label="Search issues">
        </div>
        <div class="palette-results" id="palette-results">
          ${this.renderResults()}
        </div>
        <div class="palette-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    `;
  }

  renderResults() {
    if (this.results.length === 0) {
      return '<div class="palette-empty">Type to search issues…</div>';
    }
    return this.results.map((issue, i) => {
      const selected = i === this.selectedIndex ? ' selected' : '';
      const priorityClass = issue.priority ? issue.priority.toLowerCase() : '';
      return `
        <div class="palette-result${selected}" data-index="${i}" data-issue-key="${issue.key}">
          <span class="palette-issue-key">${issue.key}</span>
          <span class="palette-issue-summary">${this.escapeHtml(issue.summary || '')}</span>
          <span class="palette-issue-meta">
            ${issue.priority ? `<span class="priority-badge ${priorityClass}">${issue.priority}</span>` : ''}
            ${issue.status ? `<span class="palette-status">${issue.status}</span>` : ''}
          </span>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    const input = document.getElementById('quick-search-input');
    const backdrop = document.getElementById('quick-search-backdrop');

    this._boundKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveSelection(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSelection(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
          const key = this.results[this.selectedIndex].key;
          this.close();
          openIssueDrawer(key, this.jiraDomain, () => {});
        }
        return;
      }
    };

    this._boundClick = (e) => {
      if (e.target.closest('#quick-search-overlay') && !e.target.closest('#quick-search-palette')) {
        this.close();
      }
    };

    document.addEventListener('keydown', this._boundKey);
    document.addEventListener('click', this._boundClick);

    backdrop?.addEventListener('click', () => this.close());

    input?.addEventListener('input', async (e) => {
      const query = e.target.value;
      if (!query || !query.trim()) {
        this.results = [];
        this.selectedIndex = -1;
        this.refreshResults();
        return;
      }
      const results = await searchIssues(query);
      this.results = results;
      this.selectedIndex = results.length > 0 ? 0 : -1;
      this.refreshResults();
    });

    const resultsContainer = document.getElementById('palette-results');
    resultsContainer?.addEventListener('click', (e) => {
      const item = e.target.closest('.palette-result');
      if (item) {
        const key = item.dataset.issueKey;
        this.close();
        openIssueDrawer(key, this.jiraDomain, () => {});
      }
    });
  }

  moveSelection(delta) {
    if (this.results.length === 0) return;
    this.selectedIndex = Math.max(0, Math.min(this.results.length - 1, this.selectedIndex + delta));
    this.refreshResults();
  }

  refreshResults() {
    const resultsContainer = document.getElementById('palette-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = this.renderResults();

      const selectedEl = resultsContainer.querySelector('.palette-result.selected');
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export const QuickSearchPaletteStyles = `
.quick-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  padding-top: 15vh;
}
.quick-search-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.quick-search-palette {
  position: relative;
  z-index: 1;
  width: 560px;
  max-width: 92vw;
  max-height: 60vh;
  background: var(--bg);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: paletteIn 0.15s ease;
}
@keyframes paletteIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.palette-input-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  gap: 10px;
}
.palette-search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}
.palette-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  background: transparent;
  color: var(--text);
}
.palette-input::placeholder {
  color: var(--text-muted);
}
.palette-results {
  flex: 1;
  overflow-y: auto;
  max-height: 40vh;
}
.palette-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.palette-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
}
.palette-result:hover,
.palette-result.selected {
  background: var(--hover);
}
.palette-issue-key {
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--link);
  flex-shrink: 0;
  min-width: 70px;
}
.palette-issue-summary {
  flex: 1;
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-issue-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.palette-status {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 10px;
}
.palette-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}
.palette-footer kbd {
  font-family: monospace;
  font-size: 10px;
  padding: 1px 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
}
`;
