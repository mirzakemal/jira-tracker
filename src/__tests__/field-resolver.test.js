import { describe, it, expect } from 'vitest';
import {
  buildFieldNameMap,
  findFieldIdByName,
  resolveCustomFieldIds,
  defaultCustomFieldIds
} from '../db/field-resolver.js';
import { FIELD_PATTERNS, CUSTOM_FIELDS } from '../jira-config.js';

/** Shaped like the real /rest/api/3/field response for this instance. */
const FIELDS = [
  { id: 'summary', name: 'Summary', custom: false },
  { id: 'customfield_10014', name: 'Story Points', custom: true },
  { id: 'customfield_10040', name: 'QA Tester', custom: true },
  { id: 'customfield_10041', name: 'QA Reviewer', custom: true },
  { id: 'customfield_10043', name: 'Customer', custom: true },
  { id: 'customfield_10077', name: 'Product Area', custom: true }
];

describe('buildFieldNameMap', () => {
  it('maps ids to lowercased names', () => {
    const map = buildFieldNameMap(FIELDS);
    expect(map.get('customfield_10014')).toBe('story points');
    expect(map.get('customfield_10040')).toBe('qa tester');
  });

  it('tolerates a missing or malformed response', () => {
    expect(buildFieldNameMap(null).size).toBe(0);
    expect(buildFieldNameMap([{ id: 'x' }, { name: 'y' }]).size).toBe(0);
  });
});

describe('findFieldIdByName', () => {
  const map = buildFieldNameMap(FIELDS);

  it('matches on the field NAME, which is the whole point', () => {
    // The old code compared patterns against "customfield_10040", which can
    // never contain a word like "tester".
    expect(findFieldIdByName(map, ['tester'])).toBe('customfield_10040');
  });

  it('prefers an exact name match over a substring one', () => {
    // Both "QA Tester" and "QA Reviewer" contain "qa"; the exact name wins.
    expect(findFieldIdByName(map, ['qa tester'])).toBe('customfield_10040');
  });

  it('honours pattern order, most specific first', () => {
    expect(findFieldIdByName(map, FIELD_PATTERNS.qaTester)).toBe('customfield_10040');
  });

  it('falls back to a substring match', () => {
    expect(findFieldIdByName(map, ['product'])).toBe('customfield_10077');
  });

  it('ignores non-custom fields', () => {
    expect(findFieldIdByName(map, ['summary'])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findFieldIdByName(map, ['nonexistent'])).toBeNull();
    expect(findFieldIdByName(map, [])).toBeNull();
    expect(findFieldIdByName(null, ['x'])).toBeNull();
  });
});

describe('resolveCustomFieldIds', () => {
  it('resolves product and QA tester by name', () => {
    const ids = resolveCustomFieldIds(FIELDS);
    expect(ids.product).toBe('customfield_10077');
    expect(ids.qaTester).toBe('customfield_10040');
  });

  it('lets an explicit configured id win over name matching', () => {
    // Story Points is pinned in CUSTOM_FIELDS, so the config value is used.
    const ids = resolveCustomFieldIds(FIELDS);
    expect(ids.storyPoints).toBe(CUSTOM_FIELDS.storyPoints);
  });

  it('resolves Story Points by name when nothing is configured', () => {
    const map = buildFieldNameMap(FIELDS);
    expect(findFieldIdByName(map, FIELD_PATTERNS.storyPoints)).toBe('customfield_10014');
  });

  it('degrades to configured ids when the field list is unavailable', () => {
    const ids = resolveCustomFieldIds([]);
    expect(ids.product).toBeNull();
    expect(ids.storyPoints).toBe(CUSTOM_FIELDS.storyPoints);
  });

  it('defaultCustomFieldIds matches the no-metadata shape', () => {
    const fallback = defaultCustomFieldIds();
    expect(Object.keys(fallback).sort()).toEqual(['product', 'qaTester', 'storyPoints']);
    expect(fallback.storyPoints).toBe(CUSTOM_FIELDS.storyPoints);
  });
});
