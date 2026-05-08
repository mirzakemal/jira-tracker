export function renderLoading(message = 'Loading...') {
  return `<div class="loading-board"><div class="spinner"></div><p>${message}</p></div>`
}

export function toggleBoardSelector(show) {
  const el = document.getElementById('board-selector-container')
  if (el) {
    el.style.display = show ? 'block' : 'none'
  }
}

export function showError(message, duration = 5000) {
  const existing = document.querySelector('.app-error-banner')
  if (existing) existing.remove()

  const banner = document.createElement('div')
  banner.className = 'app-error-banner'
  banner.textContent = message
  banner.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 10000;
    background: var(--danger, #dc3545); color: #fff; padding: 12px 20px;
    border-radius: 8px; font-size: 14px; max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
  `
  banner.addEventListener('click', () => banner.remove())
  document.body.appendChild(banner)
  setTimeout(() => { if (banner.parentNode) banner.remove() }, duration)
}
