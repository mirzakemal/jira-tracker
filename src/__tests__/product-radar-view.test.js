import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_ENG_PROJECT_KEY', 'TSM2');

const DAY = 86400000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();

const eng = (key, over = {}) => ({
  key, project_key: 'TSM2', issue_type: 'Bug', status: 'To Do', status_category: 'To Do',
  priority: 'High', summary: `Engineering ${key}`, customer: 'NCL',
  created_at: ago(100), updated_at: ago(2), resolved_at: null, ...over
});
const pdt = (key, over = {}) => ({
  key, project_key: 'PDT', issue_type: 'Customer Request', status: 'Plan', status_category: 'To Do',
  priority: 'Medium', summary: `Product ${key}`, customer: '',
  created_at: ago(30), updated_at: ago(5), resolved_at: null, ...over
});

async function mount(view) {
  document.body.innerHTML = `<div id="view-container">${view.render()}</div>`;
  await view.load();
}

describe('ProductRadarView', () => {
  let db, ProductRadarView;

  beforeEach(async () => {
    vi.resetModules();
    db = await import('../db/indexeddb.js');
    ({ ProductRadarView } = await import('../components/ProductRadarView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'tags']) { try { await db.clear(s); } catch { /* ignore */ } }
    document.body.innerHTML = '';
    window.jiraDomain = 'tenderboard.atlassian.net';
  });

  it('renders a loading state first, then every section', async () => {
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    const html = view.render();
    expect(html).toContain('id="radar-view"');
    expect(html).toContain('Building the radar');

    await db.putBulk('issues', [pdt('PDT-1'), eng('TSM2-1')]);
    await mount(view);

    const text = document.body.textContent;
    expect(text).toContain('Decisions waiting on product');
    expect(text).toContain('High priority, still open after 30 days');
    expect(text).toContain('Rework');
    expect(text).toContain('Inflow vs outflow');
    expect(text).toContain('Customers with open High / Highest work');
    expect(view.isLoading).toBe(false);
  });

  it('opens every row in Jira in a new tab', async () => {
    await db.putBulk('issues', [eng('TSM2-1')]);
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    await mount(view);

    const link = document.querySelector('.radar-row[data-issue-key="TSM2-1"] a.radar-link');
    expect(link.getAttribute('href')).toBe('https://tenderboard.atlassian.net/browse/TSM2-1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('hides parked cards by default and shows them when the toggle is off', async () => {
    await db.putBulk('issues', [
      pdt('PDT-15', { summary: '[On Hold]Further improvement for Company Names settings' }),
      pdt('PDT-60', { status: 'Validation' })
    ]);
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    await mount(view);

    expect(document.querySelector('[data-issue-key="PDT-15"]')).toBeNull();
    expect(document.querySelector('[data-issue-key="PDT-60"]')).not.toBeNull();
    expect(document.getElementById('radar-parked-toggle').textContent).toContain('(1)');

    document.getElementById('radar-parked-toggle').click();
    await new Promise(r => setTimeout(r, 20));

    const parked = document.querySelector('[data-issue-key="PDT-15"]');
    expect(parked).not.toBeNull();
    expect(parked.classList.contains('is-parked')).toBe(true);
    expect(parked.textContent).toContain('parked · [on hold]');
  });

  it('stores a triage choice locally and re-renders; parking removes the row', async () => {
    await db.putBulk('issues', [pdt('PDT-1'), pdt('PDT-2')]);
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    await mount(view);

    document.querySelector('[data-issue-key="PDT-1"] .radar-tri[data-state="decision"]').click();
    await new Promise(r => setTimeout(r, 30));
    const tags = (await db.getByIndex('tags', 'issue_key', 'PDT-1')).map(t => t.tag_name);
    expect(tags).toEqual(['triage:decision']);
    expect(document.querySelector('[data-issue-key="PDT-1"] .radar-tri[data-state="decision"]').getAttribute('aria-pressed')).toBe('true');

    document.querySelector('[data-issue-key="PDT-2"] .radar-tri[data-state="parked"]').click();
    await new Promise(r => setTimeout(r, 30));
    expect(document.querySelector('[data-issue-key="PDT-2"]')).toBeNull();
    expect(document.getElementById('radar-parked-toggle').textContent).toContain('(1)');
  });

  it('scopes the lists to the chosen team area and reflects it in the URL', async () => {
    await db.putBulk('issues', [
      eng('TSM2-1', { summary: 'Gateway Xero disconnects', customer: 'MAH' }),
      eng('TSM2-2', { summary: 'Plain bug', customer: 'NCL' })
    ]);
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    await mount(view);
    expect(document.querySelectorAll('.radar-sec[data-sec="hot"] .radar-row')).toHaveLength(2);

    document.querySelector('.radar-seg-btn[data-area="integration"]').click();
    await new Promise(r => setTimeout(r, 20));

    const keys = [...document.querySelectorAll('.radar-sec[data-sec="hot"] .radar-row')].map(r => r.dataset.issueKey);
    expect(keys).toEqual(['TSM2-1']);
    expect(window.location.hash).toContain('area=integration');
    expect(view.filters).toEqual({ area: 'integration', includeParked: false });
  });

  it('escapes Jira text so a hostile title cannot inject markup', async () => {
    await db.putBulk('issues', [eng('TSM2-1', { summary: '<img src=x onerror="alert(1)"> "quoted"' })]);
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    await mount(view);
    expect(document.querySelector('.radar-row img')).toBeNull();
    expect(document.querySelector('.radar-sum').textContent).toContain('<img src=x');
  });

  it('ignores a late load after destroy()', async () => {
    const view = new ProductRadarView(null, 'tenderboard.atlassian.net');
    document.body.innerHTML = `<div id="view-container">${view.render()}</div>`;
    const loading = view.load();
    view.destroy();
    await loading;
    expect(view.data).toBeNull();
  });
});
