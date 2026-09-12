/**
 * ProductBoardView component tests (jsdom)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_BOARD_ID', '100');
vi.stubEnv('VITE_ENG_BOARD_ID', '200');
vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_PRODUCT_ISSUE_TYPE_ID', '10267');

const DOMAIN = 'tenderboard.atlassian.net';

describe('ProductBoardView', () => {
  let ProductBoardView, pq, db;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));

    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards', 'doc_drafts']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /** Mount the view and run its async load, as main.js does. */
  async function mount(view) {
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return document.getElementById('issue-board-container').innerHTML;
  }

  it('keeps the #product-board-view wrapper in the loading state so refresh can find it', () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    expect(view.render()).toContain('id="product-board-view"');
    expect(view.render()).toContain('spinner');
  });

  it('renders Customer, Priority and Reporter filters — and no Persona or Status', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).toContain('id="product-filter-customer"');
    expect(html).toContain('id="product-filter-priority"');
    expect(html).toContain('id="product-filter-reporter"');
    expect(html).not.toContain('id="product-filter-persona"');
    expect(html).not.toContain('id="product-filter-status"');
  });

  it('orders the Priority filter by severity, not alphabetically', async () => {
    for (const [key, priority] of [['PDT-40','Low'],['PDT-41','Highest'],['PDT-42','Medium']]) {
      await pq.createProductCard({ product_issue_key: key, title: key, priority });
    }

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const options = [...document.getElementById('product-filter-priority').options]
      .map(o => o.value).filter(Boolean);
    expect(options).toEqual(['Highest', 'Medium', 'Low']);
  });

  it('lists only priorities actually in use', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-43', title: 'A', priority: 'High' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const options = [...document.getElementById('product-filter-priority').options]
      .map(o => o.value).filter(Boolean);
    expect(options).toEqual(['High']);
  });

  it('filters the board by reporter', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-44', title: 'Darell card', reporter_name: 'Darell Rabial Andefa' });
    await pq.createProductCard({ product_issue_key: 'PDT-45', title: 'Other card', reporter_name: 'Jamie Tan' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const select = document.getElementById('product-filter-reporter');
    expect([...select.options].map(o => o.value).filter(Boolean))
      .toEqual(['Darell Rabial Andefa', 'Jamie Tan']);

    select.value = 'Jamie Tan';
    select.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 10));

    expect(document.body.innerHTML).toContain('Other card');
    expect(document.body.innerHTML).not.toContain('Darell card');
  });

  it('filters the board by priority', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-46', title: 'Urgent thing', priority: 'Highest' });
    await pq.createProductCard({ product_issue_key: 'PDT-47', title: 'Minor thing', priority: 'Low' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await view.load({ priority: 'Highest' });

    expect(view.cards.map(c => c.title)).toEqual(['Urgent thing']);
  });

  it('populates customer and persona filters from the cards', async () => {
    await pq.createProductCard({ title: 'A', customer: 'Acme Corp', user_persona: 'Buyer' });
    await pq.createProductCard({ title: 'B', customer: 'Beta Inc', user_persona: 'Supplier' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const customers = [...document.getElementById('product-filter-customer').options]
      .map(o => o.value).filter(Boolean);
    expect(customers).toEqual(['Acme Corp', 'Beta Inc']);
  });

  it('shows Title, Customer, Status and the linked Eng engineer in each row', async () => {
    await db.put('issues', {
      key: 'ENG-1', board_id: 200, status: 'In Progress',
      assignee_id: 'a1', assignee_name: 'Dana Engineer', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-1', target_key: 'ENG-1', link_type: 'implements'
    });
    const id = await pq.createProductCard({
      product_issue_key: 'PDT-1',
      title: 'Bulk tender upload',
      customer: 'Acme Corp',
      status: 'Development Process'
    });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).toContain('Bulk tender upload');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Development Process');
    expect(html).toContain('Dana Engineer');
    expect(html).toContain('ENG-1');
  });

  it('shows a Linked Issues section reading None when nothing is linked', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-2', title: 'Unlinked' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const linked = document.querySelector('.pb-card-linked');
    expect(linked.textContent).toContain('Linked Issues');
    expect(linked.textContent).toContain('None');
    expect(document.body.innerHTML).not.toContain('No Eng card');
  });

  it('lists every linked issue and marks which one is the Eng card', async () => {
    await db.put('issues', {
      key: 'ENG-80', board_id: 200, status: 'In Progress',
      assignee_name: 'Dana Okafor', raw_data: '{}'
    });
    await db.put('issues', { key: 'DES-5', board_id: 300, status: 'Done', raw_data: '{}' });
    await db.put('issuelinks', {
      source_key: 'PDT-30', target_key: 'ENG-80', link_type: 'implements'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-30', target_key: 'DES-5', link_type: 'relates to'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-30', title: 'Multi-link' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const keys = [...document.querySelectorAll('.pb-card-linked-key')].map(e => e.textContent.trim());
    expect(keys).toEqual(['DES-5', 'ENG-80']);
    expect(document.querySelector('.pb-card-linked-eng').textContent.trim()).toBe('ENG-80');
  });

  it('shows the linked-issue count on the card', async () => {
    await db.put('issues', { key: 'TSM2-90', project_key: 'TSM2', status: 'In Review', status_category: 'In Progress', raw_data: '{}' });
    await db.put('issues', { key: 'DES-9', project_key: 'DES', status: 'Done', status_category: 'Done', raw_data: '{}' });
    await db.put('issuelinks', { source_key: 'PDT-50', target_key: 'TSM2-90', link_type: 'implements' });
    await db.put('issuelinks', { source_key: 'PDT-50', target_key: 'DES-9', link_type: 'Relates' });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-50', title: 'Counted' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    expect(document.querySelector('.pb-card-linked-count').textContent).toBe('2');
  });

  it('shows no count and reads None when nothing is linked', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-51', title: 'Alone' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    expect(document.querySelector('.pb-card-linked-count')).toBeNull();
    expect(document.querySelector('.pb-card-linked').textContent).toContain('None');
  });

  it('shows each linked issue status, coloured by category', async () => {
    await db.put('issues', { key: 'TSM2-91', project_key: 'TSM2', status: 'Ready To Test', status_category: 'Done', raw_data: '{}' });
    await db.put('issuelinks', { source_key: 'PDT-52', target_key: 'TSM2-91', link_type: 'implements' });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-52', title: 'With status' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const chip = document.querySelector('.pb-card-linked-status');
    expect(chip.textContent.trim()).toBe('Ready To Test');
    expect(chip.className).toContain('pb-cat-done');
  });

  it('marks a linked issue that is not in the local cache', async () => {
    await db.put('issuelinks', { source_key: 'PDT-53', target_key: 'TSM2-9999', link_type: 'implements' });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-53', title: 'Uncached link' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    expect(document.querySelector('.pb-card-linked-status').textContent.trim()).toBe('Not synced');
  });

  it('maps status categories onto colour classes', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    expect(view.categoryClass('Done')).toBe('done');
    expect(view.categoryClass('In Progress')).toBe('progress');
    expect(view.categoryClass('indeterminate')).toBe('progress');
    expect(view.categoryClass('To Do')).toBe('todo');
    expect(view.categoryClass(null)).toBe('unknown');
  });

  it('shows the product issue own assignee', async () => {
    await pq.createProductCard({
      product_issue_key: 'PDT-60', title: 'Owned', assignee_name: 'Shanon Liew'
    });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).toContain('Shanon Liew');
  });

  it('falls back to the Eng card assignee when the product issue is unassigned', async () => {
    await db.put('issues', {
      key: 'TSM2-60', project_key: 'TSM2', status: 'In Review',
      assignee_name: 'Indra Firmansyah', raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'PDT-61', target_key: 'TSM2-60', link_type: 'implements' });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-61', title: 'Unowned' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const name = document.querySelector('.pb-card-person-name[title]');
    expect(name.textContent.trim()).toBe('Indra Firmansyah');
    expect(name.getAttribute('title')).toContain('TSM2-60');
  });

  it('reads Unassigned when neither the card nor an Eng card has an assignee', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-62', title: 'Nobody' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).toContain('Unassigned');
  });

  it('renders a search box in the filter bar', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    expect(document.getElementById('product-search')).toBeTruthy();
  });

  it('searches by card number, title and description', async () => {
    await pq.createProductCard({
      product_issue_key: 'PDT-70', title: 'Search functionality improvement',
      description: 'Multiple PO search with AND/OR logic'
    });
    await pq.createProductCard({ product_issue_key: 'PDT-71', title: 'Bulk tender upload' });

    const view = new ProductBoardView(null, DOMAIN, () => {});

    await view.load({ search: 'PDT-71' });
    expect(view.cards.map(c => c.title)).toEqual(['Bulk tender upload']);

    await view.load({ search: 'functionality' });
    expect(view.cards.map(c => c.title)).toEqual(['Search functionality improvement']);

    await view.load({ search: 'AND/OR' });
    expect(view.cards.map(c => c.title)).toEqual(['Search functionality improvement']);
  });

  it('searches the linked issues summary and description', async () => {
    await db.put('issues', {
      key: 'TSM2-70', project_key: 'TSM2', status: 'In Review',
      summary: 'Multiple PO search with AND/OR logic',
      description: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'gateway RESTlet handling' }
      ] }] },
      raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'PDT-72', target_key: 'TSM2-70', link_type: 'implements' });

    const id = await pq.createProductCard({ product_issue_key: 'PDT-72', title: 'Opaque title' });
    await pq.resolveAssignedEngineer(id);
    await pq.createProductCard({ product_issue_key: 'PDT-73', title: 'Unrelated' });

    const view = new ProductBoardView(null, DOMAIN, () => {});

    // matches the linked ticket's summary
    await view.load({ search: 'Multiple PO' });
    expect(view.cards.map(c => c.title)).toEqual(['Opaque title']);

    // matches the linked ticket's ADF description — and ONLY that card, rather
    // than every card whose combined text happens to contain the letters
    await view.load({ search: 'RESTlet' });
    expect(view.cards.map(c => c.title)).toEqual(['Opaque title']);

    // and by the linked key itself
    await view.load({ search: 'TSM2-70' });
    expect(view.cards.map(c => c.title)).toEqual(['Opaque title']);
  });

  it('typing in the search box filters the board', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-74', title: 'Bulk tender upload' });
    await pq.createProductCard({ product_issue_key: 'PDT-75', title: 'Saved search filters' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const input = document.getElementById('product-search');
    input.value = 'bulk';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 260));

    expect(document.body.innerHTML).toContain('Bulk tender upload');
    expect(document.body.innerHTML).not.toContain('Saved search filters');
  });

  it('keeps focus in the search box across the re-render', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-76', title: 'Anything' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const input = document.getElementById('product-search');
    input.focus();
    input.value = 'any';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 260));

    expect(document.activeElement.id).toBe('product-search');
  });

  it('labels the person field Assignee, not Engineer', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-54', title: 'Labels' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).toContain('Assignee');
    expect(html).not.toContain('>Engineer<');
  });

  it('shows reporter and priority on the card', async () => {
    await pq.createProductCard({
      product_issue_key: 'PDT-31',
      title: 'With people',
      reporter_name: 'Jamie Tan',
      priority: 'High'
    });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const card = document.querySelector('.pb-card');
    expect(card.textContent).toContain('Reporter');
    expect(card.textContent).toContain('Jamie Tan');
    expect(card.querySelector('.pb-card-priority').textContent.trim()).toBe('High');
    expect(card.querySelector('.pb-card-priority').className).toContain('pb-priority-high');
  });

  it('maps priority names onto colour classes', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    expect(view.priorityClass('Highest')).toBe('highest');
    expect(view.priorityClass('P1 - Critical')).toBe('highest');
    expect(view.priorityClass('Major')).toBe('high');
    expect(view.priorityClass('Medium')).toBe('medium');
    expect(view.priorityClass('Lowest')).toBe('lowest');
    expect(view.priorityClass('Minor')).toBe('low');
  });

  it('prompts to TEST on the card itself when the Eng card is Ready to Test', async () => {
    await db.put('issues', {
      key: 'ENG-2', board_id: 200, status: 'Ready to Test',
      assignee_name: 'Sam Dev', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-3', target_key: 'ENG-2', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-3', title: 'Personas' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    // The board-level banner is gone; the prompt lives on the card.
    expect(html).not.toContain('Action Required');
    expect(document.querySelector('.pb-action-test')).toBeTruthy();
    expect(document.querySelector('.pb-action-test').textContent).toContain('Ready to test');
    expect(html).toContain('Personas');
  });

  it('prompts for documentation on the card when the Eng card is Released', async () => {
    await db.put('issues', {
      key: 'ENG-3', board_id: 200, status: 'Released', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-4', target_key: 'ENG-3', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-4', title: 'Exports' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).not.toContain('Action Required');
    expect(document.querySelector('.pb-action-doc')).toBeTruthy();
    expect(document.querySelector('.pb-doc-create').textContent).toContain('Create Documentation');
  });

  it('shows no action row when nothing needs attention', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-5', title: 'Quiet' });
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(html).not.toContain('Action Required');
    expect(document.querySelector('.pb-card-actions')).toBeNull();
  });

  it('marking a card tested clears its test prompt', async () => {
    await db.put('issues', {
      key: 'TSM2-4', project_key: 'TSM2', status: 'Ready To Test', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-6', target_key: 'TSM2-4', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-6', title: 'Dismiss me' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    document.querySelector('.pb-test-done').click();
    await new Promise(r => setTimeout(r, 20));

    expect(document.querySelector('.pb-action-test')).toBeNull();
  });

  it('filters the grid by customer', async () => {
    await pq.createProductCard({ title: 'Acme thing', customer: 'Acme Corp' });
    await pq.createProductCard({ title: 'Beta thing', customer: 'Beta Inc' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const select = document.getElementById('product-filter-customer');
    select.value = 'Acme Corp';
    select.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 10));

    const html = document.body.innerHTML;
    expect(html).toContain('Acme thing');
    expect(html).not.toContain('Beta thing');
  });

  it('status filter matches the Eng-derived status, not just the card status', async () => {
    await db.put('issues', {
      key: 'ENG-5', board_id: 200, status: 'Ready to Test', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-7', target_key: 'ENG-5', link_type: 'implements'
    });
    // Card still says "Eng WIP" while engineering has moved on.
    const id = await pq.createProductCard({
      product_issue_key: 'PROD-7', title: 'Lagging card', status: 'Development Process'
    });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await view.load({ status: 'Ready to Test' });

    expect(view.cards).toHaveLength(1);
    expect(view.cards[0].title).toBe('Lagging card');
  });

  it('shows an empty state that distinguishes "no cards" from "no matches"', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    let html = await mount(view);
    expect(html).toContain('No product cards yet');

    await pq.createProductCard({ title: 'A', customer: 'Acme Corp' });
    await view.load({ customer: 'Nobody Ltd' });
    expect(document.body.innerHTML).toContain('No cards match these filters');
  });

  it('the New Product Card button opens Jira rather than writing to it', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await db.put('projects', { id: '10500', key: 'PROD', name: 'Product' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    document.getElementById('product-new-card-btn').click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('CreateIssueDetails');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the create link from configured PDT defaults with no projects cached', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    // PRODUCT_PROJECT.id defaults to the real PDT project, so the prefilled
    // create screen works even before any project has been synced.
    await db.clear('projects');
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);
    document.getElementById('product-new-card-btn').click();

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('CreateIssueDetails');
    expect(url).toContain('pid=10085');
    expect(url).toContain('issuetype=10267');
  });

  it('escapes card content so a malicious title cannot inject markup', async () => {
    await pq.createProductCard({
      title: '<img src=x onerror=alert(1)>',
      customer: '<script>bad()</script>'
    });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    // No element was created from the payload — check the DOM, not the string.
    expect(document.querySelector('#product-board-view img')).toBeNull();
    expect(document.querySelector('#product-board-view script')).toBeNull();
    expect(document.querySelector('.pb-card-title').textContent)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('a quote in a filter value cannot break out of the option attribute', async () => {
    // escapeHtml does NOT escape quotes, so attribute interpolation must use
    // escapeAttr — otherwise this payload becomes a real event handler.
    await pq.createProductCard({ title: 'X', customer: '" onmouseover="alert(1)' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const option = document.querySelector('#product-filter-customer option[value]:not([value=""])');
    expect(option.getAttributeNames()).toEqual(['value']);
    expect(option.getAttribute('value')).toBe('" onmouseover="alert(1)');
  });

  it('renders one Kanban column per PDT status, in board order', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-19', title: 'Seed', status: 'Plan' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const titles = [...document.querySelectorAll('.pb-column-title')].map(e => e.textContent);
    expect(titles).toEqual([
      'Plan',
      'Feedback',
      'Validation',
      'Ready for Technical Specification',
      'Ready for Development',
      'Development Process',
      'Delivered / Released'
    ]);
  });

  it('places each card in the column matching its status, with a count', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-20', title: 'A', status: 'Plan' });
    await pq.createProductCard({ product_issue_key: 'PDT-21', title: 'B', status: 'Plan' });
    await pq.createProductCard({ product_issue_key: 'PDT-22', title: 'C', status: 'Validation' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const columns = [...document.querySelectorAll('.pb-column')];
    const plan = columns.find(c => c.querySelector('.pb-column-title').textContent === 'Plan');
    const validation = columns.find(c => c.querySelector('.pb-column-title').textContent === 'Validation');

    expect(plan.querySelectorAll('.pb-card')).toHaveLength(2);
    expect(plan.querySelector('.pb-column-count').textContent).toBe('2');
    expect(validation.querySelectorAll('.pb-card')).toHaveLength(1);
  });

  it('gives an unknown status its own column rather than dropping the card', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-23', title: 'Odd', status: 'Parked' });

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    const titles = [...document.querySelectorAll('.pb-column-title')].map(e => e.textContent);
    expect(titles).toContain('Parked');
    expect(titles[titles.length - 1]).toBe('Parked');
    expect(document.body.innerHTML).toContain('Odd');
  });

  it('marks cards that need action so the board agrees with the alert banner', async () => {
    await db.put('issues', {
      key: 'ENG-70', board_id: 200, status: 'Ready to Test', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-24', target_key: 'ENG-70', link_type: 'implements'
    });
    const id = await pq.createProductCard({
      product_issue_key: 'PDT-24', title: 'Needs testing', status: 'Development Process'
    });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);

    expect(document.querySelectorAll('.pb-card-action')).toHaveLength(1);
    expect(document.querySelector('.pb-card-action .pb-card-title').textContent)
      .toBe('Needs testing');
  });

  it('destroy removes the delegated listener', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    await mount(view);
    const root = document.getElementById('product-board-view');
    const spy = vi.spyOn(root, 'removeEventListener');

    view.destroy();

    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(view.boundHandler).toBeNull();
  });

  it('has no Back to Board button', async () => {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    const html = await mount(view);

    expect(document.getElementById('product-back-btn')).toBeNull();
    expect(html).not.toContain('Back to Board');
  });
});

describe('Epic linked issues', () => {
  let db, pq, ProductBoardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards', 'doc_drafts']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  async function mountWith(linked) {
    for (const [key, issueType] of linked) {
      await db.put('issues', {
        key, project_key: 'TSM2', status: 'To Do', status_category: 'To Do',
        issue_type: issueType, raw_data: '{}'
      });
      await db.put('issuelinks', {
        source_key: 'PDT-39', target_key: key, link_type: 'Polaris work item link'
      });
    }
    const id = await pq.createProductCard({ product_issue_key: 'PDT-39', title: 'NTUC Health Product Card' });
    await pq.resolveAssignedEngineer(id);

    const view = new ProductBoardView(null, 'tenderboard.atlassian.net', () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('detects epic issue types, and only epics', async () => {
    expect(pq.isEpicType('Epic')).toBe(true);
    expect(pq.isEpicType('epic')).toBe(true);
    expect(pq.isEpicType('Delivery Epic')).toBe(true);
    expect(pq.isEpicType('Task')).toBe(false);
    expect(pq.isEpicType('Story')).toBe(false);
    expect(pq.isEpicType(null)).toBe(false);
  });

  it('marks only the epic among several linked issues', async () => {
    await mountWith([['TSM2-7759', 'Epic'], ['TSM2-7761', 'Task'], ['TSM2-7779', 'Task']]);

    const chips = [...document.querySelectorAll('.pb-card-linked-key')];
    expect(chips).toHaveLength(3);

    const epics = chips.filter(c => c.classList.contains('pb-card-linked-epic'));
    expect(epics).toHaveLength(1);
    expect(epics[0].textContent).toContain('TSM2-7759');
  });

  it('rings the whole product card when any link is an epic', async () => {
    await mountWith([['TSM2-7759', 'Epic']]);
    expect(document.querySelector('.pb-card').classList.contains('pb-card-epic')).toBe(true);
  });

  it('leaves the card unringed when no link is an epic', async () => {
    await mountWith([['TSM2-7761', 'Task']]);
    expect(document.querySelector('.pb-card').classList.contains('pb-card-epic')).toBe(false);
    expect(document.querySelector('.pb-card-linked-epic')).toBeNull();
  });

  it('carries the issue type onto the linked issue record', async () => {
    await mountWith([['TSM2-7759', 'Epic']]);
    const card = await pq.getProductCardByIssueKey('PDT-39');
    expect(card.linked_issues[0]).toMatchObject({ issue_type: 'Epic', is_epic: true });
  });
});

describe('Documentation workflow', () => {
  let db, pq, ProductBoardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards', 'doc_drafts']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.restoreAllMocks();
  });

  /** A card whose Eng ticket has been released, so documentation is owed. */
  async function releasedCard(key = 'PDT-80', title = 'Released thing') {
    await db.put('issues', {
      key: 'TSM2-80', project_key: 'TSM2', status: 'Delivered / Released', raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: key, target_key: 'TSM2-80', link_type: 'implements' });
    const id = await pq.createProductCard({ product_issue_key: key, title });
    await pq.resolveAssignedEngineer(id);
    return id;
  }

  async function mount() {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('starts a released card at Not started with a Create Documentation button', async () => {
    await releasedCard();
    await mount();

    expect(document.querySelector('.pb-doc-select').value).toBe('not_started');
    expect(document.querySelector('.pb-doc-create')).toBeTruthy();
    expect(document.querySelector('.pb-doc-done')).toBeNull();
  });

  it('offers all four states, including Not needed', async () => {
    await releasedCard();
    await mount();

    const values = [...document.querySelector('.pb-doc-select').options].map(o => o.value);
    expect(values).toEqual(['not_started', 'in_progress', 'done', 'not_needed']);
  });

  it('Create Documentation opens Confluence and moves the card to In progress', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const id = await releasedCard('PDT-81', 'Docs please');
    const view = await mount();

    document.querySelector('.pb-doc-create').click();
    await new Promise(r => setTimeout(r, 20));

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('/wiki/create-content/page');
    // Parse rather than decodeURIComponent: URLSearchParams encodes spaces as
    // '+', which decodeURIComponent does not turn back into spaces.
    const title = new URLSearchParams(url.split('?')[1]).get('title');
    // Prefixed with the issue key so the page maps back to the card.
    expect(title).toBe('PDT-81: Docs please');

    expect((await pq.getProductCard(id)).doc_status).toBe('in_progress');
    expect(view.cards.find(c => c.id === id).doc_status).toBe('in_progress');
  });

  it('shows Mark done once documentation is in progress', async () => {
    const id = await releasedCard();
    await pq.setDocStatus(id, 'in_progress');
    await mount();

    expect(document.querySelector('.pb-doc-done')).toBeTruthy();
    expect(document.querySelector('.pb-doc-create').textContent).toContain('Open in Confluence');
  });

  it('Mark done records the state and stops prompting', async () => {
    const id = await releasedCard();
    await pq.setDocStatus(id, 'in_progress');
    await mount();

    document.querySelector('.pb-doc-done').click();
    await new Promise(r => setTimeout(r, 20));

    const card = await pq.getProductCard(id);
    expect(card.doc_status).toBe('done');
    expect(pq.needsDocumentation(card)).toBe(false);
    expect(document.querySelector('.pb-doc-settled').textContent).toContain('Documented');
  });

  it('changing the dropdown sets the status', async () => {
    const id = await releasedCard();
    await mount();

    const select = document.querySelector('.pb-doc-select');
    select.value = 'not_needed';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    expect((await pq.getProductCard(id)).doc_status).toBe('not_needed');
    expect(document.body.textContent).toContain('No documentation needed');
  });

  it('settling documentation acknowledges the released milestone', async () => {
    const id = await releasedCard();
    expect(await pq.getPendingMilestones()).toHaveLength(1);

    await pq.setDocStatus(id, 'not_needed');

    expect(await pq.getPendingMilestones()).toHaveLength(0);
  });

  it('keeps a settled card visible as a record rather than hiding it', async () => {
    const id = await releasedCard();
    await pq.setDocStatus(id, 'done');
    await mount();

    expect(document.querySelector('.pb-action-doc')).toBeTruthy();
    expect(document.querySelector('.pb-action-doc').className).toContain('pb-doc-done');
  });

  it('shows no documentation row for a card whose Eng work is not released', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-82', title: 'Still building' });
    await mount();

    expect(document.querySelector('.pb-action-doc')).toBeNull();
  });

  it('rejects an unknown status rather than corrupting the card', async () => {
    const id = await releasedCard();
    expect(await pq.setDocStatus(id, 'bogus')).toBeNull();
    expect((await pq.getProductCard(id)).doc_status).toBe('not_started');
  });

  it('labels the section Confluence, not Documentation', async () => {
    await releasedCard();
    await mount();

    const row = document.querySelector('.pb-action-doc');
    expect(row.textContent).toContain('Confluence');
    expect(row.textContent).not.toContain('Documentation ');
  });

  it('clicking anywhere in the action area does not open the issue', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    await releasedCard();
    await mount();

    // The row background, the label, and the select — none should navigate.
    document.querySelector('.pb-action-doc').click();
    document.querySelector('.pb-action-doc .pb-action-text').click();
    document.querySelector('.pb-doc-select').click();
    await new Promise(r => setTimeout(r, 20));

    expect(openSpy).not.toHaveBeenCalled();
    expect(document.getElementById('issue-detail-overlay')).toBeNull();
  });
});

describe('Cards link to Jira', () => {
  let db, pq, ProductBoardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.restoreAllMocks();
  });

  async function mount(domain = DOMAIN) {
    const view = new ProductBoardView(null, domain, () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('opens the Jira issue instead of a local popup', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    await pq.createProductCard({ product_issue_key: 'PDT-39', title: 'NTUC Health' });
    await mount();

    document.querySelector('.pb-card-title').click();
    await new Promise(r => setTimeout(r, 20));

    expect(openSpy).toHaveBeenCalledWith(
      `https://${DOMAIN}/browse/PDT-39`, '_blank', 'noopener'
    );
    expect(document.getElementById('issue-detail-overlay')).toBeNull();
  });

  it('renders the issue key as a real link so ctrl-click works', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-39', title: 'NTUC Health' });
    await mount();

    const link = document.querySelector('.pb-card-key-link');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(`https://${DOMAIN}/browse/PDT-39`);
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('a local draft has no Jira link and opens nothing', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    await pq.createProductCard({ title: 'Local only' });
    await mount();

    expect(document.querySelector('.pb-card-key-link')).toBeNull();
    document.querySelector('.pb-card-title').click();
    await new Promise(r => setTimeout(r, 20));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('does not build a link when the Jira domain is unknown', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-39', title: 'No domain' });
    const view = await mount('');
    expect(view.jiraUrl('PDT-39')).toBe('#');
  });
});

describe('Linked issue chips for unsynced issues', () => {
  let db, pq, ProductBoardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  async function mount() {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('shows EPIC instead of "Not synced" for an uncached epic', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-39', target_key: 'TSM2-7759',
      link_type: 'Polaris work item link', target_type: 'Epic'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-39', title: 'NTUC Health' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    const chip = document.querySelector('.pb-card-linked-status');
    expect(chip.textContent.trim()).toBe('EPIC');
    expect(chip.className).toContain('pb-cat-epic');
    expect(document.body.textContent).not.toContain('Not synced');
    // And it is still marked as an epic.
    expect(document.querySelector('.pb-card-linked-epic')).toBeTruthy();
  });

  it('says EPIC even when the epic has a known status', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-40', target_key: 'TSM2-7760',
      link_type: 'implements', target_type: 'Epic', target_status: 'In Progress',
      target_status_category: 'In Progress'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-40', title: 'Has status' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    const chip = document.querySelector('.pb-card-linked-status');
    expect(chip.textContent.trim()).toBe('EPIC');
    // The status is not lost — it moves to the tooltip.
    expect(chip.getAttribute('title')).toBe('Epic — In Progress');
  });

  it('shows a real status for a non-epic link', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-43', target_key: 'TSM2-7762',
      link_type: 'implements', target_type: 'Task', target_status: 'In Progress',
      target_status_category: 'In Progress'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-43', title: 'Task link' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    expect(document.querySelector('.pb-card-linked-status').textContent.trim()).toBe('In Progress');
  });

  it('shows the assignee of each linked issue when it is known', async () => {
    await db.put('issues', {
      key: 'TSM2-7763', project_key: 'TSM2', status: 'In Review',
      status_category: 'In Progress', issue_type: 'Task',
      assignee_name: 'Indra Firmansyah', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-44', target_key: 'TSM2-7763', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-44', title: 'With people' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    expect(document.querySelector('.pb-card-linked-who').textContent.trim())
      .toBe('Indra Firmansyah');
  });

  it('omits the assignee line for a link that has not synced', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-45', target_key: 'TSM2-9998',
      link_type: 'implements', target_type: 'Task'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-45', title: 'No people' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    expect(document.querySelector('.pb-card-linked-who')).toBeNull();
  });

  it('still says Not synced when nothing at all is known', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-41', target_key: 'TSM2-9999', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-41', title: 'Unknown' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    expect(document.querySelector('.pb-card-linked-status').textContent.trim()).toBe('Not synced');
  });
});

describe('Customer-type linked issues', () => {
  let db, pq, ProductBoardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ({ ProductBoardView } = await import('../components/ProductBoardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  async function mount() {
    const view = new ProductBoardView(null, DOMAIN, () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();
    return view;
  }

  it('shows CUSTOMER for a linked customer card (PDT-36 -> TSM2-7612)', async () => {
    await db.put('issues', {
      key: 'TSM2-7612', project_key: 'TSM2', issue_type: 'Customer',
      summary: 'UOL Customer Card', status: 'Ready for Customer / Alpha Testing',
      status_category: 'To Do', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-36', target_key: 'TSM2-7612', link_type: 'Polaris work item link'
    });
    const id = await pq.createProductCard({
      product_issue_key: 'PDT-36', title: 'SFTP Integration + CC Placeholders'
    });
    await pq.resolveAssignedEngineer(id);
    await mount();

    const chip = document.querySelector('.pb-card-linked-status');
    expect(chip.textContent.trim()).toBe('CUSTOMER');
    expect(chip.className).toContain('pb-cat-customer');
    // The real status is not lost, just moved off the chip.
    expect(chip.getAttribute('title')).toContain('Ready for Customer / Alpha Testing');
  });

  it('does NOT treat a "Customer Request" product card as a customer card', async () => {
    // PDT's own issue type is "Customer Request" — a request, not a customer.
    await db.put('issues', {
      key: 'PDT-99', project_key: 'PDT', issue_type: 'Customer Request',
      summary: 'A request', status: 'Plan', status_category: 'To Do', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PDT-37', target_key: 'PDT-99', link_type: 'Relates'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-37', title: 'Other' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    expect(document.querySelector('.pb-card-linked-status').textContent.trim()).toBe('Plan');
  });

  it('rings a customer link in the info colour, not the epic orange', async () => {
    await db.put('issuelinks', {
      source_key: 'PDT-38', target_key: 'TSM2-7612',
      link_type: 'Relates', target_type: 'Customer'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PDT-38', title: 'Linked' });
    await pq.resolveAssignedEngineer(id);
    await mount();

    const key = document.querySelector('.pb-card-linked-key');
    expect(key.classList.contains('pb-card-linked-customer')).toBe(true);
    expect(key.classList.contains('pb-card-linked-epic')).toBe(false);
  });
});

describe('Readable type sizes', () => {
  const floor = (styles) => {
    const sizes = [...styles.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    return Math.min(...sizes);
  };

  it('the Product Board has nothing below 12px', async () => {
    const { ProductBoardViewStyles } = await import('../components/ProductBoardView.js');
    expect(floor(ProductBoardViewStyles)).toBeGreaterThanOrEqual(12);
  });

  it('the Customer Card Dashboard has nothing below 12px', async () => {
    const { CustomerDashboardViewStyles } = await import('../components/CustomerDashboardView.js');
    expect(floor(CustomerDashboardViewStyles)).toBeGreaterThanOrEqual(12);
  });
});
