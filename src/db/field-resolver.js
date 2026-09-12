/**
 * Resolve custom field IDs from field display names.
 *
 * Issue payloads key custom fields by id only ("customfield_10014"), so
 * name-based detection has to go through the instance's field list first.
 * Matching the patterns against the KEY — as this app used to — can never
 * succeed, because a key never contains a human word.
 */

import logger from '../utils/logger.js';
import { CUSTOM_FIELDS, FIELD_PATTERNS } from '../jira-config.js';

/**
 * Build id -> lowercased name from a /rest/api/3/field response.
 *
 * @param {object[]} fields
 * @returns {Map<string, string>}
 */
export function buildFieldNameMap(fields) {
  const map = new Map();
  for (const field of fields || []) {
    const id = field?.id || field?.key;
    if (id && typeof field.name === 'string') {
      map.set(id, field.name.toLowerCase().trim());
    }
  }
  return map;
}

/**
 * Find the custom field id whose name best matches a pattern list.
 *
 * Patterns are tried in order, so callers can list the most specific first
 * ("qa tester" before "qa"). Within one pattern an exact name match beats a
 * substring match, so a field literally called "QA Tester" is not lost to some
 * other field that merely contains "qa".
 *
 * @param {Map<string, string>} nameById
 * @param {string[]} patterns
 * @returns {string|null}
 */
export function findFieldIdByName(nameById, patterns) {
  if (!nameById || !patterns?.length) return null;

  for (const pattern of patterns) {
    const needle = pattern.toLowerCase();
    let substringMatch = null;

    for (const [id, name] of nameById) {
      if (!id.startsWith('customfield_')) continue;
      if (name === needle) return id;
      if (!substringMatch && name.includes(needle)) substringMatch = id;
    }

    if (substringMatch) return substringMatch;
  }
  return null;
}

/**
 * Work out which field ids to read for each logical field.
 *
 * An explicit id in CUSTOM_FIELDS always wins — it is a deliberate per-instance
 * override. Otherwise fall back to name matching.
 *
 * @param {object[]} fields - /rest/api/3/field response
 * @returns {{product: string|null, qaTester: string|null, storyPoints: string|null}}
 */
export function resolveCustomFieldIds(fields) {
  const nameById = buildFieldNameMap(fields);

  const resolved = {
    product: findFieldIdByName(nameById, FIELD_PATTERNS.product),
    qaTester: CUSTOM_FIELDS.qaTester
      || findFieldIdByName(nameById, FIELD_PATTERNS.qaTester),
    storyPoints: CUSTOM_FIELDS.storyPoints
      || findFieldIdByName(nameById, FIELD_PATTERNS.storyPoints)
  };

  logger.debug('[Sync] Resolved custom fields:', resolved);
  return resolved;
}

/** Ids to fall back on when the field list cannot be fetched. */
export function defaultCustomFieldIds() {
  return {
    product: null,
    qaTester: CUSTOM_FIELDS.qaTester || null,
    storyPoints: CUSTOM_FIELDS.storyPoints || null
  };
}
