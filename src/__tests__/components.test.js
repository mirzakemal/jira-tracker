/**
 * Component tests using jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SyncStatus', () => {
  let SyncStatus;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../components/SyncStatus.js');
    SyncStatus = mod.SyncStatus;
    document.body.innerHTML = '<div id="app"><div id="sync-status"></div></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders initial state', () => {
    const component = new SyncStatus(() => {});
    const html = component.render();

    expect(html).toContain('Sync');
    expect(html).toContain('0 issues');
    expect(html).toContain('Never');
  });

  it('renders with sync status data', () => {
    const component = new SyncStatus(() => {});
    component.setStatus({
      lastSync: '2026-05-07T10:00:00Z',
      lastFullSync: '2026-05-06T10:00:00Z',
      issueCount: 42
    });

    const container = document.getElementById('sync-status');
    expect(container.innerHTML).toContain('42 issues');
    expect(container.innerHTML).toContain('Sync');
  });

  it('shows syncing state', () => {
    const component = new SyncStatus(() => {});
    component.setSyncing(true);

    const container = document.getElementById('sync-status');
    expect(container.innerHTML).toContain('Syncing...');
    expect(container.innerHTML).toContain('disabled');
  });

  it('bindEvents attaches click handler to sync button', () => {
    const onSync = vi.fn();
    const component = new SyncStatus(onSync);

    // Render into DOM and bind events
    const container = document.getElementById('sync-status');
    container.outerHTML = component.render();
    component.bindEvents();

    const btn = document.getElementById('sync-btn');
    expect(btn).not.toBeNull();

    btn.click();
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('does not trigger sync when already syncing', () => {
    const onSync = vi.fn();
    const component = new SyncStatus(onSync);
    component.isSyncing = true;

    const container = document.getElementById('sync-status');
    container.outerHTML = component.render();
    component.bindEvents();

    const btn = document.getElementById('sync-btn');
    btn.click();
    expect(onSync).not.toHaveBeenCalled();
  });
});

describe('IssueCard', () => {
  let IssueCard;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../components/IssueCard.js');
    IssueCard = mod.IssueCard;
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders issue card with key and summary', () => {
    const issue = { key: 'TEST-1', fields: { summary: 'Login page' } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('TEST-1');
    expect(html).toContain('Login page');
  });

  it('renders issue with assignee', () => {
    const issue = { key: 'TEST-1', fields: { summary: 'Test', assignee: { displayName: 'Alice', avatarUrls: { '24x24': 'https://example.com/avatar.png' } } } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('Alice');
  });

  it('renders issue with priority label', () => {
    const issue = { key: 'TEST-1', fields: { summary: 'Test', priority: { name: 'High' } } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('High');
  });

  it('generates correct browse link when window.jiraDomain is set', () => {
    window.jiraDomain = 'test.atlassian.net';
    const issue = { key: 'TEST-1', fields: { summary: 'Test' } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('https://test.atlassian.net/browse/TEST-1');
    delete window.jiraDomain;
  });

  it('handles missing optional fields gracefully', () => {
    const issue = { key: 'TEST-1', fields: { summary: 'Minimal issue' } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('TEST-1');
    expect(html).toContain('Minimal issue');
  });

  it('renders unassigned icon when no assignee', () => {
    const issue = { key: 'TEST-1', fields: { summary: 'Test' } };
    const html = new IssueCard(issue).render();
    expect(html).toContain('issue-unassigned');
    expect(html).toContain('Unassigned');
  });

  it('a quote in Jira text cannot break out of an attribute', () => {
    // escapeHtml serialises via textContent -> innerHTML, which does NOT escape
    // quotes, so attribute interpolation must use escapeAttr. Otherwise this
    // payload closes title="..." and becomes a real event handler.
    const payload = '" onmouseover="alert(1)';
    const issue = {
      key: 'TEST-1',
      fields: {
        summary: payload,
        priority: { name: payload },
        issuetype: { name: payload },
        assignee: { displayName: payload, avatarUrls: { '24x24': payload } }
      }
    };

    document.body.innerHTML = new IssueCard(issue).render();

    // Assert against the parsed DOM, not the string: no extra attribute exists.
    const summary = document.querySelector('.issue-summary');
    expect(summary.getAttributeNames().sort()).toEqual(['class', 'title']);
    expect(summary.getAttribute('title')).toBe(payload);

    expect(document.querySelector('.issue-priority').getAttributeNames().sort())
      .toEqual(['class', 'title']);
    expect(document.querySelector('.issue-type-icon').getAttributeNames().sort())
      .toEqual(['class', 'title']);
    expect(document.querySelector('.issue-assignee').getAttributeNames().sort())
      .toEqual(['alt', 'class', 'src', 'title']);

    // Nothing anywhere in the card picked up an inline handler.
    expect(document.querySelectorAll('[onmouseover]').length).toBe(0);

    document.body.innerHTML = '';
  });
});

describe('IssueDetailDrawer epic links', () => {
  function drawerWith(issuetypeName) {
    return {
      fields: {
        issuelinks: [{
          type: { name: 'Polaris work item link', inward: 'is implemented by' },
          inwardIssue: {
            key: 'TSM2-7759',
            fields: { summary: 'Supplier-Side Combined-GR Invoicing', issuetype: { name: issuetypeName } }
          }
        }]
      }
    };
  }

  it('rings an epic link in the detail modal', async () => {
    const { IssueDetailDrawer } = await import('../components/IssueDetailDrawer.js');
    const drawer = new IssueDetailDrawer('PDT-39', 'example.atlassian.net', () => {});
    drawer.parsedRaw = drawerWith('Epic');

    document.body.innerHTML = drawer.renderLinkedIssues();
    const item = document.querySelector('.linked-issue-item');
    expect(item.classList.contains('linked-issue-epic')).toBe(true);
    expect(item.getAttribute('title')).toBe('Epic');
  });

  it('leaves a non-epic link unmarked', async () => {
    const { IssueDetailDrawer } = await import('../components/IssueDetailDrawer.js');
    const drawer = new IssueDetailDrawer('PDT-39', 'example.atlassian.net', () => {});
    drawer.parsedRaw = drawerWith('Task');

    document.body.innerHTML = drawer.renderLinkedIssues();
    expect(document.querySelector('.linked-issue-epic')).toBeNull();
  });
});
