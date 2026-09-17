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
