export function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = String(str)
  return div.innerHTML
}

/**
 * Escape a value for interpolation into a QUOTED HTML attribute.
 *
 * `escapeHtml` is not safe here: it escapes via textContent/innerHTML, and the
 * HTML serializer does not escape quotes inside text nodes. A value such as
 *   " onmouseover="alert(1)
 * therefore passes through unchanged and breaks out of `value="..."`, turning
 * into a real event-handler attribute.
 *
 * Use this for every attribute interpolation; use escapeHtml for text content.
 */
export function escapeAttr(str) {
  if (!str && str !== 0) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
