import { describe, it, expect } from 'vitest';
import { issueKeysIn, mentionIndex } from '../utils/mentions.js';
import { buildTraceability, linkIndex, COMMITTED_PRODUCT_STATUSES } from '../db/trace-queries.js';

const DAY = 86400000;
const NOW = new Date('2026-09-17T12:00:00Z').getTime();
const ago = days => new Date(NOW - days * DAY).toISOString();

const issue = (key, over = {}) => ({
  key, project_key: key.split('-')[0], issue_type: 'Task', status: 'To Do', status_category: 'To Do',
  priority: 'Medium', summary: `Issue ${key}`, customer: '', parent_key: null,
  created_at: ago(20), updated_at: ago(2), resolved_at: null, ...over
});
const link = (a, b, type = 'Relates') => ({ source_key: a, target_key: b, link_type: type });

describe('issueKeysIn / mentionIndex', () => {
  it('finds every distinct key in a title, in order', () => {
    expect(issueKeysIn('PR line item … blocking submission (NAFA / TTS-457) see TSM2-8032 and TTS-457'))
      .toEqual(['TTS-457', 'TSM2-8032']);
  });

  it('can restrict to given projects', () => {
    expect(issueKeysIn('Non-sourcing GR shows download option (TTS-210, SKM) regression from TSM2-8032', ['TTS'])).toEqual(['TTS-210']);
  });

  it('ignores things that look like keys but are not', () => {
    expect(issueKeysIn('report-1618 and PO 24-01187 and Excel-2019')).toEqual([]);
  });

  it('indexes who mentions whom, skipping self-mentions', () => {
    const idx = mentionIndex([
      issue('TSM2-1', { summary: 'Fix thing (TTS-9)' }),
      issue('TSM2-2', { summary: 'Another for TTS-9 and TTS-10' }),
      issue('TTS-9', { summary: 'TTS-9 itself' })
    ], ['TTS']);
    expect(idx.get('TTS-9')).toEqual(['TSM2-1', 'TSM2-2']);
    expect(idx.get('TTS-10')).toEqual(['TSM2-2']);
  });
});

describe('linkIndex', () => {
  it('is symmetric', () => {
    const idx = linkIndex([link('PDT-1', 'TSM2-5')]);
    expect([...idx.get('PDT-1')]).toEqual(['TSM2-5']);
    expect([...idx.get('TSM2-5')]).toEqual(['PDT-1']);
  });
});

describe('buildTraceability — product cards without engineering work', () => {
  it('lists committed PDT cards with no TSM2 link or child, idlest first', () => {
    const issues = [
      issue('PDT-1', { status: 'Ready for Development', updated_at: ago(40) }),
      issue('PDT-2', { status: 'Development Process', updated_at: ago(5) }),
      issue('PDT-3', { status: 'Ready for Technical Specification', updated_at: ago(10) }),
      issue('PDT-4', { status: 'Plan' }),                       // not committed yet
      issue('PDT-5', { status: 'Delivered / Released', status_category: 'Done' }),
      issue('TSM2-9', { parent_key: 'PDT-3' })                 // PDT-3 has a child
    ];
    const links = [link('PDT-2', 'TSM2-50', 'Polaris work item link')];
    const result = buildTraceability(issues, links, { now: NOW });
    expect(result.pdtWithoutEng.map(r => r.key)).toEqual(['PDT-1']);
    expect(COMMITTED_PRODUCT_STATUSES).toContain('ready for development');
  });

  it('hides parked product cards unless asked', () => {
    const issues = [issue('PDT-1', { status: 'Ready for Development', summary: '[On Hold] Later' })];
    expect(buildTraceability(issues, [], { now: NOW }).pdtWithoutEng).toHaveLength(0);
    expect(buildTraceability(issues, [], { now: NOW, includeParked: true }).pdtWithoutEng).toHaveLength(1);
  });
});

describe('buildTraceability — engineering work without a product parent', () => {
  const issues = [
    issue('TSM2-1', { issue_type: 'Story', created_at: ago(100) }),               // orphan story
    issue('TSM2-2', { issue_type: 'Task', parent_key: 'TSM2-99' }),               // has an epic
    issue('TSM2-3', { issue_type: 'Task', summary: 'Implements PDT-7 request' }),  // mentions a PDT card
    issue('TSM2-4', { issue_type: 'Bug' }),                                        // bug, excluded by default
    issue('TSM2-5', { issue_type: 'Sub-task' }),                                   // sub-tasks never count
    issue('TSM2-6', { issue_type: 'Epic', created_at: ago(300) }),                 // orphan epic
    issue('TSM2-7', { issue_type: 'Story', status: 'Done', status_category: 'Done' }),
    issue('TSM2-8', { issue_type: 'Story' })                                       // linked to PDT
  ];
  const links = [link('PDT-1', 'TSM2-8', 'Polaris work item link')];

  it('excludes bugs, sub-tasks, parented, linked, mentioning and done work', () => {
    const result = buildTraceability(issues, links, { now: NOW });
    expect(result.engWithoutPdt.map(r => r.key)).toEqual(['TSM2-6', 'TSM2-1']);
    expect(result.engCandidateCount).toBe(2);
  });

  it('can include bugs', () => {
    const result = buildTraceability(issues, links, { now: NOW, includeBugs: true });
    expect(result.engWithoutPdt.map(r => r.key)).toContain('TSM2-4');
  });
});

describe('buildTraceability — support tickets', () => {
  const issues = [
    issue('TTS-457', { issue_type: 'Investigation', created_at: ago(30) }),
    issue('TTS-477', { issue_type: 'Investigation', created_at: ago(60) }),
    issue('TTS-500', { issue_type: 'Product Clarification', created_at: ago(5) }),
    issue('TTS-1', { issue_type: 'Investigation', status: 'Done', status_category: 'Done' }),
    issue('TSM2-8271', { issue_type: 'Bug', summary: 'PR line item Description input writes to purchaseDescription (NAFA / TTS-457)' }),
    issue('TSM2-8239', { issue_type: 'Bug', summary: 'PO list Purchaser column falls back (TTS-477)' }),
    issue('TSM2-8000', { issue_type: 'Bug', summary: 'Mentions a closed ticket TTS-1 and an uncached one TTS-999' })
  ];
  const links = [link('TSM2-8239', 'TTS-477')];

  it('sorts tickets into linked, mentioned-only, and unconnected', () => {
    const { tts } = buildTraceability(issues, links, { now: NOW });
    expect(tts.linked.map(r => r.key)).toEqual(['TTS-477']);
    expect(tts.mentioned.map(r => r.key)).toEqual(['TTS-457']);
    expect(tts.mentioned[0].mentionedBy).toEqual([{ key: 'TSM2-8271', summary: expect.stringContaining('purchaseDescription'), status: 'To Do' }]);
    expect(tts.none.map(r => r.key)).toEqual(['TTS-500']);
    expect(tts.cached).toBe(3); // the Done one is out
    expect(tts.supportProject).toBe('TTS');
  });

  it('surfaces mentions of tickets that are not in the cache', () => {
    const { tts } = buildTraceability(issues, links, { now: NOW });
    expect(tts.uncachedMentions.map(u => u.key)).toEqual(['TTS-999']);
    expect(tts.uncachedMentions[0].mentionedBy[0].key).toBe('TSM2-8000');
  });

  it('a mention that IS also linked does not double-count', () => {
    const { tts } = buildTraceability([
      issue('TTS-5'),
      issue('TSM2-1', { issue_type: 'Bug', summary: 'Fix (TTS-5)' })
    ], [link('TSM2-1', 'TTS-5')], { now: NOW });
    expect(tts.linked.map(r => r.key)).toEqual(['TTS-5']);
    expect(tts.mentioned).toHaveLength(0);
  });
});
