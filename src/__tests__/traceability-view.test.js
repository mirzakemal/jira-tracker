import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_ENG_PROJECT_KEY', 'TSM2');
vi.stubEnv('VITE_EXTRA_SYNC_PROJECTS', 'TTS');

const DAY = 86400000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();
const issue = (key, over = {}) => ({
  key, project_key: key.split('-')[0], issue_type: 'Task', status: 'To Do', status_category: 'To Do',
  priority: 'Medium', summary: `Issue ${key}`, customer: '', parent_key: null,
  created_at: ago(20), updated_at: ago(2), ...over
});

async function mount(view) {
  document.body.innerHTML = `<div id="view-container">${view.render()}</div>`;
  await view.load();
}

describe('TraceabilityView', () => {
  let db, TraceabilityView;

  beforeEach(async () => {
    vi.resetModules();
    db = await import('../db/indexeddb.js');
    ({ TraceabilityView } = await import('../components/TraceabilityView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks']) { try { await db.clear(s); } catch { /* ignore */ } }
    window.jiraDomain = 'tenderboard.atlassian.net';
    window.location.hash = '';
    await db.putBulk('issues', [
      issue('PDT-1', { status: 'Ready for Development', updated_at: ago(40) }),
      issue('PDT-2', { status: 'Development Process' }),
      issue('TSM2-8', { issue_type: 'Story' }),
      issue('TSM2-9', { issue_type: 'Story', created_at: ago(200) }),
      issue('TSM2-8271', { issue_type: 'Bug', summary: 'PR line item Description writes to the wrong field (NAFA / TTS-457)' }),
      issue('TTS-457', { issue_type: 'Investigation', created_at: ago(30) }),
      issue('TTS-500', { issue_type: 'Product Clarification', created_at: ago(5) })
    ]);
    await db.putBulk('issuelinks', [{ source_key: 'PDT-2', target_key: 'TSM2-8', link_type: 'Polaris work item link' }]);
  });

  it('shows the three tabs with counts and opens on the product gap', async () => {
    const view = new TraceabilityView(null, 'tenderboard.atlassian.net');
    await mount(view);

    const tabs = [...document.querySelectorAll('.tr-tab')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
    expect(tabs[0]).toMatch(/PDT cards with no engineering work 1/);
    expect(tabs[1]).toMatch(/TSM2 work with no product parent 1/);   // TSM2-9 only; TSM2-8 is linked
    expect(tabs[2]).toMatch(/TTS tickets not linked to engineering 2/);
    expect(document.querySelector('.tr-row[data-issue-key="PDT-1"]')).not.toBeNull();
    expect(document.querySelector('.tr-row[data-issue-key="PDT-2"]')).toBeNull();
  });

  it('switches tabs and records the choice in the URL', async () => {
    const view = new TraceabilityView(null, 'tenderboard.atlassian.net');
    await mount(view);
    document.querySelector('.tr-tab[data-tab="eng"]').click();
    expect(document.querySelector('.tr-row[data-issue-key="TSM2-9"]')).not.toBeNull();
    expect(window.location.hash).toContain('tab=eng');
  });

  it('separates support tickets into mentioned-not-linked and not-connected, with a Link in Jira action on the bug', async () => {
    const view = new TraceabilityView(null, 'tenderboard.atlassian.net');
    await mount(view);
    document.querySelector('.tr-tab[data-tab="tts"]').click();

    const text = document.getElementById('tr-body').textContent;
    expect(text).toContain('0 of 2 open TTS tickets are linked');
    const pair = document.querySelector('.tr-link2');
    expect(pair.textContent).toContain('TTS-457');
    expect(pair.textContent).toContain('TSM2-8271');
    const act = pair.querySelector('.tr-act');
    expect(act.getAttribute('href')).toBe('https://tenderboard.atlassian.net/browse/TSM2-8271');
    expect(act.getAttribute('target')).toBe('_blank');
    expect(document.querySelector('.tr-row[data-issue-key="TTS-500"]')).not.toBeNull();
  });

  it('includes bugs in the engineering gap when asked', async () => {
    const view = new TraceabilityView(null, 'tenderboard.atlassian.net');
    await mount(view);
    document.querySelector('.tr-tab[data-tab="eng"]').click();
    expect(document.querySelector('.tr-row[data-issue-key="TSM2-8271"]')).toBeNull();

    document.getElementById('tr-bugs-toggle').click();
    await new Promise(r => setTimeout(r, 30));
    expect(document.querySelector('.tr-row[data-issue-key="TSM2-8271"]')).not.toBeNull();
    expect(window.location.hash).toContain('bugs=1');
  });

  it('tells you to sync when the support project has never been cached', async () => {
    await db.clear('issues');
    await db.putBulk('issues', [issue('TSM2-1', { issue_type: 'Bug', summary: 'plain' })]);
    const view = new TraceabilityView(null, 'tenderboard.atlassian.net');
    await mount(view);
    document.querySelector('.tr-tab[data-tab="tts"]').click();
    expect(document.getElementById('tr-body').textContent).toContain('fetched by JQL during sync');
  });
});
