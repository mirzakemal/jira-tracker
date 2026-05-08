export function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = String(str)
  return div.innerHTML
}
