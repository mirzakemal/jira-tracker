const DONE_STATUSES = ['done', 'closed', 'resolved', 'complete', 'completed'];

export function isDoneStatus(status) {
  const s = (status || '').toLowerCase().trim();
  return DONE_STATUSES.includes(s);
}

export function isDoneCategory(statusCategory) {
  const cat = (statusCategory || '').toLowerCase();
  return cat.includes('done') || cat.includes('closed') || cat.includes('resolved');
}
