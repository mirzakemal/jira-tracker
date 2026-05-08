export function renderBackButton(onBack) {
  const id = 'back-to-board-btn'
  return `<button class="back-btn" id="${id}">← Back to Board</button>`
}

export function bindBackButton(onBack) {
  const btn = document.getElementById('back-to-board-btn')
  if (btn && onBack) {
    btn.addEventListener('click', onBack)
  }
}
