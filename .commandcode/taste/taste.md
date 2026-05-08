# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# architecture
- Extract duplicated utility functions into shared modules under src/utils/ (e.g., escapeHtml to src/utils/html.js, formatDate to src/utils/date.js). Confidence: 0.80
- Extract duplicated boilerplate patterns into reusable helper functions (e.g., ensureDB() for DB init guards, switchView() for view-switching, toggleBoardSelector() for showing/hiding board selector). Confidence: 0.80
- Extract duplicated UI patterns into shared components (e.g., BackButton component for "Back to Board", renderLoading() for loading spinners). Confidence: 0.80
- Keep files focused by responsibility — split large files when they exceed a single concern (e.g., split main.js into viewManager.js, syncManager.js, routerHandler.js). Confidence: 0.75
- Use inline error rendering (renderError() in views) instead of alert() calls for error display; alert() blocks the thread and creates poor UX. Confidence: 0.70

