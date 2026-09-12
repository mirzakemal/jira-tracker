/**
 * Atlassian Document Format helpers.
 *
 * Jira's v3 API returns rich text (descriptions, comments) as an ADF document
 * tree, not a string. Storing or searching that object directly yields
 * "[object Object]", so flatten it to plain text at the boundary.
 */

/**
 * Extract readable plain text from an ADF document.
 *
 * Walks the node tree collecting `text`, plus the display text of inline nodes
 * that carry meaning (mentions, emoji, links). Block-level nodes are separated
 * by newlines so words from adjacent paragraphs don't run together and produce
 * false search matches.
 *
 * Accepts a plain string too, so callers don't need to know which shape they
 * have — older cached issues may hold either.
 *
 * @param {object|string|null} node
 * @returns {string}
 */
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);

  const BLOCK = new Set([
    'paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock',
    'tableRow', 'tableCell', 'tableHeader', 'panel', 'rule'
  ]);

  const parts = [];

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;

    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }

    if (typeof n.text === 'string') parts.push(n.text);

    // Inline nodes whose meaning lives in attrs rather than a text child.
    if (n.type === 'mention' && n.attrs?.text) parts.push(n.attrs.text);
    if (n.type === 'emoji' && n.attrs?.shortName) parts.push(n.attrs.shortName);
    if (n.type === 'inlineCard' && n.attrs?.url) parts.push(n.attrs.url);

    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
      if (BLOCK.has(n.type)) parts.push('\n');
    }
  };

  walk(node);

  return parts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
