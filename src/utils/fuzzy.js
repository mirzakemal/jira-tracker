/**
 * Small fuzzy matcher for local, in-memory search.
 *
 * Deliberately simple and predictable rather than clever: results have to feel
 * obvious to someone typing a ticket number or a couple of words.
 *
 * A query matches when EITHER
 *   - every whitespace-separated term appears as a substring (order-free), or
 *   - the whole query appears as an in-order subsequence (tolerates typos and
 *     abbreviations, e.g. "bulktnd" -> "bulk tender").
 *
 * Subsequence matching is opt-out via `allowSubsequence: false`, and callers
 * SHOULD disable it for long concatenated text. Across a few hundred characters
 * almost any short query can be found in order, so a document-length haystack
 * matches nearly everything — use substring matching there and keep subsequence
 * matching for short, high-signal fields like the key and title.
 */

/** Lowercase and collapse punctuation so "PDT-12" and "pdt 12" both match. */
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Is `query` an in-order subsequence of `text`? Ignores spaces on both sides so
 * "srchfltr" matches "search filters".
 */
function isSubsequence(text, query) {
  const t = text.replace(/ /g, '');
  const q = query.replace(/ /g, '');
  if (!q) return true;
  if (q.length > t.length) return false;

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

/**
 * Does `haystack` match `query`?
 * An empty query matches everything, so callers can pass user input straight in.
 *
 * @param {string} haystack
 * @param {string} query
 * @param {object} [options] - { allowSubsequence = true }
 * @returns {boolean}
 */
export function fuzzyMatch(haystack, query, options = {}) {
  const q = normalize(query);
  if (!q) return true;

  const text = normalize(haystack);
  if (!text) return false;

  // Fast path: whole query as a substring.
  if (text.includes(q)) return true;

  // All terms present, in any order — how people usually type multi-word queries.
  const terms = q.split(' ');
  if (terms.length > 1 && terms.every(term => text.includes(term))) return true;

  // Typo/abbreviation tolerance. Restricted to queries of 3+ characters:
  // shorter ones match almost anything as a subsequence.
  const allowSubsequence = options.allowSubsequence !== false;
  if (allowSubsequence && q.replace(/ /g, '').length >= 3 && isSubsequence(text, q)) {
    return true;
  }

  return false;
}
