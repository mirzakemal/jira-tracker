import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '../utils/fuzzy.js';
import { adfToText } from '../utils/adf.js';

describe('adfToText', () => {
  it('returns an empty string for null/undefined', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
  });

  it('passes a plain string through — older cached issues hold either shape', () => {
    expect(adfToText('already text')).toBe('already text');
  });

  it('flattens a real ADF document', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Multiple PO search' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'with AND/OR logic' }] }
      ]
    };
    expect(adfToText(doc)).toBe('Multiple PO search\nwith AND/OR logic');
  });

  it('keeps list items separate so words do not run together', () => {
    const doc = { type: 'doc', content: [{ type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }] }
    ] }] };
    expect(adfToText(doc)).toBe('alpha\nbeta');
  });

  it('includes mention and link text', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'ask' },
      { type: 'mention', attrs: { text: '@Darell' } },
      { type: 'inlineCard', attrs: { url: 'https://example.com/x' } }
    ] }] };
    const text = adfToText(doc);
    expect(text).toContain('@Darell');
    expect(text).toContain('https://example.com/x');
  });

  it('never yields [object Object]', () => {
    expect(adfToText({ type: 'doc', content: [{ type: 'unknownThing' }] }))
      .not.toContain('[object Object]');
  });
});

describe('fuzzyMatch', () => {
  const HAY = 'PDT-12 Search functionality improvement Multiple PO search with AND/OR logic';

  it('matches everything on an empty query', () => {
    expect(fuzzyMatch(HAY, '')).toBe(true);
    expect(fuzzyMatch(HAY, '   ')).toBe(true);
  });

  it('matches a card number with or without the dash', () => {
    expect(fuzzyMatch(HAY, 'PDT-12')).toBe(true);
    expect(fuzzyMatch(HAY, 'pdt 12')).toBe(true);
    expect(fuzzyMatch(HAY, 'pdt12')).toBe(true);
  });

  it('matches words from the title and description', () => {
    expect(fuzzyMatch(HAY, 'functionality')).toBe(true);
    expect(fuzzyMatch(HAY, 'AND/OR')).toBe(true);
  });

  it('matches multiple terms in any order', () => {
    expect(fuzzyMatch(HAY, 'search improvement')).toBe(true);
    expect(fuzzyMatch(HAY, 'improvement search')).toBe(true);
  });

  it('tolerates abbreviations via subsequence matching', () => {
    expect(fuzzyMatch('Bulk tender upload', 'bulktnd')).toBe(true);
    expect(fuzzyMatch('Saved search filters', 'svdfltr')).toBe(true);
  });

  it('rejects text that genuinely does not match', () => {
    expect(fuzzyMatch(HAY, 'zzzzzz')).toBe(false);
    expect(fuzzyMatch('Bulk tender upload', 'invoice reconciliation')).toBe(false);
  });

  it('does not match a 1-2 character query as a subsequence of anything', () => {
    // Short queries would otherwise match nearly every card.
    expect(fuzzyMatch('Bulk tender upload', 'zq')).toBe(false);
  });

  it('handles empty or missing haystacks', () => {
    expect(fuzzyMatch('', 'anything')).toBe(false);
    expect(fuzzyMatch(null, 'anything')).toBe(false);
  });
});

describe('fuzzyMatch subsequence scoping', () => {
  const LONG = [
    'PDT-62 NTUC Requires some amendment to custom report',
    'NTUC Jamie Tan alfatio',
    'TSM2-4395 Custom Report and Email Delivery for NTUC'
  ].join(' ');

  it('does not subsequence-match across a long blob', () => {
    // "restlet" appears nowhere, but its letters can be found in order across
    // this much text — precisely the false positive to avoid.
    expect(fuzzyMatch(LONG, 'restlet', { allowSubsequence: false })).toBe(false);
  });

  it('still substring-matches the long blob', () => {
    expect(fuzzyMatch(LONG, 'Email Delivery', { allowSubsequence: false })).toBe(true);
    expect(fuzzyMatch(LONG, 'TSM2-4395', { allowSubsequence: false })).toBe(true);
  });

  it('keeps subsequence matching for short headline text', () => {
    expect(fuzzyMatch('PDT-42 Bulk tender upload', 'bulktnd')).toBe(true);
  });
});
