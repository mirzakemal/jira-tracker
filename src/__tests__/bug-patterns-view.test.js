import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.stubEnv('VITE_ENG_PROJECT_KEY', 'TSM2');

const DAY = 86400000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();
const bug = (key, over = {}) => ({
  key, project_key: 'TSM2', issue_type: 'Bug', status: 'To Do', status_category: 'To Do',
  priority: 'Medium', summary: `Bug ${key}`, customer: '', created_at: ago(10), updated_at: ago(1), ...over
});

async function mount(view) {
  document.body.innerHTML = `<div id="view-container">${view.render()}</div>`;
  await view.load();
}

describe('BugPatternsView', () => {
  let db, BugPatternsView;

  beforeEach(async () => {
    vi.resetModules();
    db = await import('../db/indexeddb.js');
    ({ BugPatternsView } = await import('../components/BugPatternsView.js'));
    await db.initDatabase();
    try { await db.clear('issues'); } catch { /* ignore */ }
    window.jiraDomain = 'tenderboard.atlassian.net';
    window.location.hash = '';
    await db.putBulk('issues', [
      bug('TSM2-1', { summary: 'Invoice total wrong', status: 'Test Comments' }),
      bug('TSM2-2', { summary: 'Invoice PDF blank', created_at: ago(40) }),
      bug('TSM2-3', { summary: 'Gateway timeout', customer: 'MAH' }),
      bug('TSM2-4', { summary: 'Invoice rounding', issue_type: 'Defect' }),
      bug('TSM2-5', { summary: 'Utterly unclassifiable thing' })
    ]);
  });

  it('explains the selected sort, and lists all four measures in the disclosure', async () => {
    const view = new BugPatternsView(null, 'tenderboard.atlassian.net');
    await mount(view);

    const explain = document.getElementById('bp-sort-explain');
    expect(explain.textContent).toContain('Open bugs:');
    expect(explain.textContent).toContain('open right now');
    expect(document.querySelectorAll('.bp-help dt')).toHaveLength(4);
    expect(document.querySelector('.bp-help').textContent).toContain('Escape ratio');

    const select = document.getElementById('bp-sort');
    select.value = 'escape';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('bp-sort-explain').textContent).toContain('Bugs found in production for every Defect');
    expect(window.location.hash).toContain('sort=escape');
  });

  it('ranks areas and shows the selected one in detail, with the unclassified count', async () => {
    const view = new BugPatternsView(null, 'tenderboard.atlassian.net');
    await mount(view);

    const names = [...document.querySelectorAll('.bp-area-name span:first-child')].map(e => e.textContent);
    expect(names[0]).toBe('Invoicing & Payments'); // 3 open, the most
    expect(document.querySelector('.bp-detail-title').textContent).toBe('Invoicing & Payments');
    expect(document.querySelector('.bp-totals').textContent).toContain('1 unclassified');

    document.querySelector('.bp-area[data-select="gateway"]').click();
    expect(document.querySelector('.bp-detail-title').textContent).toBe('Gateway & Integrations');
    expect(document.querySelector('.bp-detail').textContent).toContain('MAH');
    expect(window.location.hash).toContain('sel=gateway');
  });

  it('links recent cards to Jira in a new tab', async () => {
    const view = new BugPatternsView(null, 'tenderboard.atlassian.net');
    await mount(view);
    const row = document.querySelector('.bp-row[data-issue-key="TSM2-1"]');
    expect(row.getAttribute('href')).toBe('https://tenderboard.atlassian.net/browse/TSM2-1');
    expect(row.getAttribute('target')).toBe('_blank');
  });

  it('will not let every issue type be switched off', async () => {
    const view = new BugPatternsView(null, 'tenderboard.atlassian.net');
    await mount(view);
    document.querySelector('.bp-type[data-type="defect"]').click();
    await new Promise(r => setTimeout(r, 20));
    document.querySelector('.bp-type[data-type="bug"]').click();
    await new Promise(r => setTimeout(r, 20));
    expect(view.types.bug).toBe(true); // refused — last one standing
    expect(view.types.defect).toBe(false);
  });

  it('shows an honest empty state when nothing matches', async () => {
    await db.clear('issues');
    const view = new BugPatternsView(null, 'tenderboard.atlassian.net');
    await mount(view);
    expect(document.querySelector('.bp-empty-all').textContent).toContain('Sync first');
  });
});
