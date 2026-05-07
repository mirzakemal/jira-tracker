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
});
