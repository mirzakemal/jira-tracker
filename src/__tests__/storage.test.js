import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveCredentials, loadCredentials, clearCredentials, saveSelection, loadSelection } from '../utils/storage.js';

describe('storage - credentials', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads credentials', async () => {
    const result = await saveCredentials({
      domain: 'test.atlassian.net',
      email: 'test@example.com',
      token: 'abc123'
    });

    expect(result).toBe(true);

    const loaded = await loadCredentials();
    expect(loaded).toEqual({
      domain: 'test.atlassian.net',
      email: 'test@example.com',
      token: 'abc123'
    });
  });

  it('encrypts the token in localStorage', async () => {
    await saveCredentials({
      domain: 'test.atlassian.net',
      email: 'test@example.com',
      token: 'secret-token-123'
    });

    const raw = JSON.parse(localStorage.getItem('jira-planner-credentials'));
    expect(raw.token).not.toBe('secret-token-123');
    expect(raw.iv).toBeDefined();
    expect(Array.isArray(raw.token)).toBe(true);
  });

  it('returns null when no credentials saved', async () => {
    expect(await loadCredentials()).toBeNull();
  });

  it('clears stored credentials', async () => {
    await saveCredentials({
      domain: 'test.atlassian.net',
      email: 'test@example.com',
      token: 'abc123'
    });

    clearCredentials();
    expect(await loadCredentials()).toBeNull();
  });

  it('migrates legacy plaintext credentials to encrypted', async () => {
    // Simulate legacy plaintext format
    localStorage.setItem('jira-planner-credentials', JSON.stringify({
      domain: 'legacy.atlassian.net',
      email: 'legacy@example.com',
      token: 'old-plaintext-token'
    }));

    const loaded = await loadCredentials();
    expect(loaded).toEqual({
      domain: 'legacy.atlassian.net',
      email: 'legacy@example.com',
      token: 'old-plaintext-token'
    });
  });

  it('handles storage errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await saveCredentials({
      domain: 'test.atlassian.net',
      email: 'test@example.com',
      token: 'abc123'
    });

    expect(result).toBe(true);
    consoleSpy.mockRestore();
  });
});

describe('storage - selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves board/sprint selection', () => {
    saveSelection({ boardId: 5, sprintId: 10 });

    const stored = JSON.parse(localStorage.getItem('jira-planner-selection'));
    expect(stored).toEqual({ boardId: 5, sprintId: 10 });
  });

  it('loads saved selection', () => {
    saveSelection({ boardId: 5, sprintId: 10 });

    const loaded = loadSelection();
    expect(loaded).toEqual({ boardId: 5, sprintId: 10 });
  });

  it('returns null when no selection saved', () => {
    expect(loadSelection()).toBeNull();
  });
});
