/**
 * Customer Dashboard — grouping, filtering, rendering.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_ENG_PROJECT_KEY', 'TSM2');

const DOMAIN = 'tenderboard.atlassian.net';

describe('getCustomerCards', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
  });

  /** A TSM2 issue of type "Customer" — what the Customer Testing Board holds. */
  async function customerCard(key, title, overrides = {}) {
    await db.put('issues', {
      key, project_key: 'TSM2', issue_type: 'Customer', summary: title,
      status: 'Ready for Customer / Alpha Testing', status_category: 'To Do',
      updated_at: '2026-09-10T00:00:00Z', raw_data: '{}', ...overrides
    });
  }

  it('selects issues of type Customer, not product cards', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await db.put('issues', {
      key: 'TSM2-7600', project_key: 'TSM2', issue_type: 'Task',
      summary: 'Some work', raw_data: '{}'
    });
    // A PDT product card is type "Customer Request" — close, but not a customer.
    await db.put('issues', {
      key: 'PDT-36', project_key: 'PDT', issue_type: 'Customer Request',
      summary: 'SFTP Integration', raw_data: '{}'
    });

    const cards = await pq.getCustomerCards();
    expect(cards.map(c => c.key)).toEqual(['TSM2-7612']);
    expect(cards[0].title).toBe('UOL Customer Card');
  });

  it('resolves each customer card linked issues', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await db.put('issues', {
      key: 'TSM2-7611', project_key: 'TSM2', issue_type: 'Task',
      summary: 'Update CC function', status: 'Delivered / Released',
      status_category: 'Done', assignee_name: 'alfatio', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'TSM2-7612', target_key: 'TSM2-7611', link_type: 'Duplicate'
    });

    const [card] = await pq.getCustomerCards();
    expect(card.linked_issues).toHaveLength(1);
    expect(card.linked_issues[0]).toMatchObject({
      key: 'TSM2-7611', status: 'Delivered / Released', assignee_name: 'alfatio'
    });
  });

  it('filters to a single customer card by key', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await customerCard('TSM2-7700', 'NTUC Customer Card');

    const cards = await pq.getCustomerCards({ customer: 'TSM2-7700' });
    expect(cards.map(c => c.title)).toEqual(['NTUC Customer Card']);
  });

  it('searches the card and its linked issues', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await customerCard('TSM2-7700', 'NTUC Customer Card');
    await db.put('issues', {
      key: 'TSM2-7611', project_key: 'TSM2', issue_type: 'Task',
      summary: 'SFTP integration work', raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'TSM2-7612', target_key: 'TSM2-7611', link_type: 'Relates' });

    expect((await pq.getCustomerCards({ search: 'NTUC' })).map(c => c.key)).toEqual(['TSM2-7700']);
    // Matching a linked issue surfaces its customer card.
    expect((await pq.getCustomerCards({ search: 'SFTP' })).map(c => c.key)).toEqual(['TSM2-7612']);
  });

  it('orders the most recently updated customer first', async () => {
    await customerCard('TSM2-A', 'Older', { updated_at: '2026-01-01T00:00:00Z' });
    await customerCard('TSM2-B', 'Newer', { updated_at: '2026-09-01T00:00:00Z' });

    expect((await pq.getCustomerCards()).map(c => c.title)).toEqual(['Newer', 'Older']);
  });

  it('returns nothing when no customer cards exist', async () => {
    expect(await pq.getCustomerCards()).toEqual([]);
  });
});

describe('CustomerDashboardView', () => {
  let db, CustomerDashboardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    ({ CustomerDashboardView } = await import('../components/CustomerDashboardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  async function customerCard(key, title, overrides = {}) {
    await db.put('issues', {
      key, project_key: 'TSM2', issue_type: 'Customer', summary: title,
      status: 'Ready for Customer / Alpha Testing', status_category: 'To Do',
      assignee_name: 'Mirza Kemal', updated_at: '2026-09-10T00:00:00Z',
      raw_data: '{}', ...overrides
    });
  }

  async function mount(view) {
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('keeps its wrapper id in the loading state so refresh can find it', () => {
    const view = new CustomerDashboardView(null, DOMAIN, () => {});
    expect(view.render()).toContain('id="customer-dashboard-view"');
    expect(view.render()).toContain('spinner');
  });

  it('renders one full-width card per customer card', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await customerCard('TSM2-7700', 'NTUC Customer Card');

    await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    expect(document.querySelectorAll('.cd-card')).toHaveLength(2);
    const names = [...document.querySelectorAll('.cd-card-name')].map(e => e.textContent.trim());
    expect(names).toContain('UOL Customer Card');
  });

  it('shows linked issues with key, summary, status and assignee', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await db.put('issues', {
      key: 'TSM2-7611', project_key: 'TSM2', issue_type: 'Task',
      summary: 'Update CC function', status: 'Delivered / Released',
      status_category: 'Done', assignee_name: 'alfatio', raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'TSM2-7612', target_key: 'TSM2-7611', link_type: 'Duplicate' });

    await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    expect(document.querySelector('.cd-link-key').textContent.trim()).toBe('TSM2-7611');
    expect(document.querySelector('.cd-link-summary').textContent.trim()).toBe('Update CC function');
    expect(document.querySelector('.cd-link-status').textContent.trim()).toBe('Delivered / Released');
    expect(document.querySelector('.cd-link-who').textContent.trim()).toBe('alfatio');
  });

  it('marks an epic link EPIC here too', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await db.put('issuelinks', {
      source_key: 'TSM2-7612', target_key: 'TSM2-7600',
      link_type: 'Duplicate', target_type: 'Epic', target_status: 'To Do'
    });

    await mount(new CustomerDashboardView(null, DOMAIN, () => {}));
    expect(document.querySelector('.cd-link-status').textContent.trim()).toBe('EPIC');
  });

  it('filters to one customer card', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await customerCard('TSM2-7700', 'NTUC Customer Card');

    const view = await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    const select = document.getElementById('customer-filter');
    select.value = 'TSM2-7700';
    select.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 20));

    expect(document.querySelectorAll('.cd-card')).toHaveLength(1);
    expect(document.body.textContent).toContain('NTUC Customer Card');
    expect(view.filters.customer).toBe('TSM2-7700');
  });

  it('keeps every customer in the dropdown after filtering', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await customerCard('TSM2-7700', 'NTUC Customer Card');

    const view = await mount(new CustomerDashboardView(null, DOMAIN, () => {}));
    await view.load({ customer: 'TSM2-7700' });

    // The control that made the choice must not shrink to a single option.
    const options = [...document.getElementById('customer-filter').options]
      .map(o => o.value).filter(Boolean);
    expect(options).toHaveLength(2);
  });

  it('links the header to the Customer Testing Board', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    const view = await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    expect(view.boardUrl())
      .toBe(`https://${DOMAIN}/jira/software/c/projects/TSM2/boards/22`);
    expect(document.body.innerHTML).toContain('/boards/22');
  });

  it('links cards and issues straight to Jira', async () => {
    await customerCard('TSM2-7612', 'UOL Customer Card');
    await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    const link = document.querySelector('.cd-card-key');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(`https://${DOMAIN}/browse/TSM2-7612`);
  });

  it('distinguishes no cards from no matches', async () => {
    const view = new CustomerDashboardView(null, DOMAIN, () => {});
    await mount(view);
    expect(document.body.textContent).toContain('No customer cards found');

    await customerCard('TSM2-7612', 'UOL Customer Card');
    await view.load({ customer: 'TSM2-NOPE' });
    expect(document.body.textContent).toContain('No customer cards match these filters');
  });

  it('escapes customer card titles', async () => {
    await customerCard('TSM2-7612', '<img src=x onerror=alert(1)>');
    await mount(new CustomerDashboardView(null, DOMAIN, () => {}));

    expect(document.querySelector('.cd-card img')).toBeNull();
    expect(document.querySelector('.cd-card-name').textContent)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('destroy removes the delegated listener', async () => {
    const view = new CustomerDashboardView(null, DOMAIN, () => {});
    await mount(view);
    const root = document.getElementById('customer-dashboard-view');
    const spy = vi.spyOn(root, 'removeEventListener');

    view.destroy();
    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('Customer card search precision', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
  });

  it('does not subsequence-match across the whole blob', () => {
    const card = {
      key: 'TSM2-7700',
      title: 'NTUC Customer Card',
      status: 'Ready for Customer / Alpha Testing',
      linked_issues: []
    };
    // The letters of "sftp" can be hunted out of that much text; a match here
    // would make every customer card answer every query.
    expect(pq.customerMatchesSearch(card, 'sftp')).toBe(false);
    expect(pq.customerMatchesSearch(card, 'NTUC')).toBe(true);
  });

  it('still allows typo tolerance on the key and title', () => {
    const card = { key: 'TSM2-7612', title: 'UOL Customer Card', linked_issues: [] };
    expect(pq.customerMatchesSearch(card, 'uolcstmr')).toBe(true);
  });

  it('matches text inside a linked issue', () => {
    const card = {
      key: 'TSM2-7612', title: 'UOL Customer Card',
      linked_issues: [{ key: 'TSM2-7611', summary: 'SFTP integration work' }]
    };
    expect(pq.customerMatchesSearch(card, 'SFTP')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(pq.customerMatchesSearch({ key: 'X', title: 'Y' }, '')).toBe(true);
  });
});

describe('Epic children on the Customer Card Dashboard', () => {
  let db, pq, CustomerDashboardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ CustomerDashboardView } = await import('../components/CustomerDashboardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  /** TSM2-7612 -> epic TSM2-7600 -> its six real children. */
  async function seedRealShape() {
    await db.put('issues', {
      key: 'TSM2-7612', project_key: 'TSM2', issue_type: 'Customer',
      summary: 'UOL Customer Card', status: 'Ready for Customer / Alpha Testing',
      status_category: 'To Do', updated_at: '2026-09-10T00:00:00Z', raw_data: '{}'
    });
    await db.put('issues', {
      key: 'TSM2-7600', project_key: 'TSM2', issue_type: 'Epic',
      summary: 'SAP - UOL/SingLand', status: 'To Do', status_category: 'To Do', raw_data: '{}'
    });
    const children = [
      ['TSM2-7601', 'PR - Pull PR Data from SAP via SFTP', 'Tested', 'Done'],
      ['TSM2-7603', 'Evaluate - Push Awarded PR to SAP via SFTP', 'Tested', 'Done'],
      ['TSM2-7608', 'User - Import User Data from SAP via SFTP', 'In Review', 'In Progress'],
      ['TSM2-8153', 'Add filename formatting option', 'Test Comments', 'To Do']
    ];
    for (const [key, summary, status, cat] of children) {
      await db.put('issues', {
        key, project_key: 'TSM2', issue_type: 'Task', summary,
        status, status_category: cat, parent_key: 'TSM2-7600',
        assignee_name: 'Mirza Kemal', raw_data: '{}'
      });
    }
    await db.put('issuelinks', {
      source_key: 'TSM2-7612', target_key: 'TSM2-7600', link_type: 'Duplicate'
    });
  }

  async function mount() {
    const view = new CustomerDashboardView(null, DOMAIN, () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('getChildIssues returns a parent work items in key order', async () => {
    await seedRealShape();
    const children = await pq.getChildIssues('TSM2-7600');
    expect(children.map(c => c.key)).toEqual([
      'TSM2-7601', 'TSM2-7603', 'TSM2-7608', 'TSM2-8153'
    ]);
    expect(children[0].status).toBe('Tested');
  });

  it('attaches children to epic links only', async () => {
    await seedRealShape();
    await db.put('issues', {
      key: 'TSM2-9001', project_key: 'TSM2', issue_type: 'Task',
      summary: 'A plain task', status: 'To Do', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'TSM2-7612', target_key: 'TSM2-9001', link_type: 'Relates'
    });

    const [card] = await pq.getCustomerCards();
    const epic = card.linked_issues.find(l => l.key === 'TSM2-7600');
    const task = card.linked_issues.find(l => l.key === 'TSM2-9001');

    expect(epic.children).toHaveLength(4);
    expect(task.children).toBeUndefined();
  });

  it('renders children nested under their epic, visibly attributed', async () => {
    await seedRealShape();
    await mount();

    const group = document.querySelector('.cd-link-group-epic');
    expect(group).toBeTruthy();

    // The epic heads the group; the children sit inside it behind a rail.
    expect(group.querySelector('.cd-link-is-epic .cd-link-key').textContent).toContain('TSM2-7600');
    expect(group.querySelectorAll('.cd-link-child')).toHaveLength(4);
    // ...and the label names the parent explicitly.
    expect(group.querySelector('.cd-children-label').textContent)
      .toContain('4 child work items in TSM2-7600');
  });

  it('marks the epic itself as EPIC', async () => {
    await seedRealShape();
    await mount();

    const epicRow = document.querySelector('.cd-link-is-epic');
    expect(epicRow.querySelector('.cd-link-status').textContent.trim()).toBe('EPIC');
  });

  it('shows each child status and assignee', async () => {
    await seedRealShape();
    await mount();

    const first = document.querySelector('.cd-link-child');
    expect(first.textContent).toContain('TSM2-7601');
    expect(first.textContent).toContain('Tested');
    expect(first.textContent).toContain('Mirza Kemal');
  });

  it('makes every row a link to Jira, child rows included', async () => {
    await seedRealShape();
    await mount();

    const rows = [...document.querySelectorAll('.cd-link')];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.tagName).toBe('A');
      expect(row.getAttribute('href')).toContain(`https://${DOMAIN}/browse/`);
      expect(row.getAttribute('rel')).toBe('noopener');
    }
    const child = document.querySelector('.cd-link-child');
    expect(child.getAttribute('href')).toBe(`https://${DOMAIN}/browse/TSM2-7601`);
  });

  it('an epic with no children renders no child block', async () => {
    await db.put('issues', {
      key: 'TSM2-7612', project_key: 'TSM2', issue_type: 'Customer',
      summary: 'UOL Customer Card', raw_data: '{}'
    });
    await db.put('issues', {
      key: 'TSM2-7600', project_key: 'TSM2', issue_type: 'Epic',
      summary: 'Childless epic', raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'TSM2-7612', target_key: 'TSM2-7600', link_type: 'Relates' });
    await mount();

    expect(document.querySelector('.cd-children')).toBeNull();
    expect(document.querySelector('.cd-link-group-epic')).toBeTruthy();
  });

  it('searches child work items too', async () => {
    await seedRealShape();
    const [card] = await pq.getCustomerCards();
    // "filename formatting" exists only on a child of the epic.
    expect(pq.customerMatchesSearch(card, 'filename formatting')).toBe(true);
  });
});
