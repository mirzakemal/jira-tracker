/**
 * StandupView — recency window, person filter, grouping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-12T09:00:00Z').getTime();

/** Issue shaped as sync.js writes it. */
function issue(key, daysAgo, overrides = {}) {
  return {
    key,
    summary: `Summary ${key}`,
    status: 'In Progress',
    status_category: 'In Progress',
    assignee_id: 'acc-1',
    assignee_name: 'Darell Rabial Andefa',
    created_at: new Date(NOW - 60 * DAY).toISOString(),
    updated_at: new Date(NOW - daysAgo * DAY).toISOString(),
    raw_data: '{}',
    ...overrides
  };
}

describe('isRecentlyUpdated', () => {
  let mod;
  beforeEach(async () => { mod = await import('../components/StandupView.js'); });

  it('defaults the window to 5 days', () => {
    expect(mod.DEFAULT_STANDUP_DAYS).toBe(5);
  });

  it('accepts an issue updated inside the window', () => {
    expect(mod.isRecentlyUpdated(issue('A', 2), 5, NOW)).toBe(true);
    expect(mod.isRecentlyUpdated(issue('A', 0), 5, NOW)).toBe(true);
  });

  it('rejects one updated outside it', () => {
    expect(mod.isRecentlyUpdated(issue('A', 6), 5, NOW)).toBe(false);
    expect(mod.isRecentlyUpdated(issue('A', 30), 5, NOW)).toBe(false);
  });

  it('rejects a missing or unparseable timestamp rather than throwing', () => {
    expect(mod.isRecentlyUpdated({ updated_at: null }, 5, NOW)).toBe(false);
    expect(mod.isRecentlyUpdated({ updated_at: 'not a date' }, 5, NOW)).toBe(false);
    expect(mod.isRecentlyUpdated(null, 5, NOW)).toBe(false);
  });
});

describe('StandupView grouping', () => {
  let StandupView;

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  /** Build a view over a fixed issue set without touching IndexedDB. */
  function viewWith(issues, users = [{ account_id: 'acc-1', display_name: 'Darell Rabial Andefa' }]) {
    const view = new StandupView(null, 'example.atlassian.net', () => {});
    view._allIssues = issues;
    view._userMap = new Map(users.map(u => [u.account_id, u.display_name]));
    view.isLoading = false;
    view.rebuild();
    return view;
  }

  it('only includes issues updated within the window', () => {
    const view = viewWith([issue('A', 1), issue('B', 4), issue('C', 9)]);
    const keys = view.people[0].columns.inProgress.map(i => i.key);
    expect(keys).toEqual(['A', 'B']);
  });

  it('orders each section newest first', () => {
    const view = viewWith([issue('OLD', 4), issue('NEW', 0), issue('MID', 2)]);
    expect(view.people[0].columns.inProgress.map(i => i.key)).toEqual(['NEW', 'MID', 'OLD']);
  });

  it('routes issues into the named columns', () => {
    const view = viewWith([
      issue('P', 1),
      issue('T', 1, { status: 'To Do', status_category: 'To Do' }),
      issue('Q', 2, { status: 'Code Quality Check', status_category: 'In Progress' }),
      issue('R', 1, { status: 'In Review', status_category: 'In Progress' }),
      issue('A', 3, { status: 'Review Approval', status_category: 'In Progress' }),
      issue('RT', 1, { status: 'Ready To Test', status_category: 'Done' })
    ]);
    const c = view.people[0].columns;
    expect(c.inProgress.map(i => i.key)).toEqual(['P']);
    expect(c.todo.map(i => i.key)).toEqual(['T']);
    // All three review stages share one column, newest first.
    expect(c.review.map(i => i.key)).toEqual(['R', 'Q', 'A']);
    expect(c.test.map(i => i.key)).toEqual(['RT']);
  });

  it('groups by person and sorts people by name', () => {
    const view = viewWith(
      [
        issue('A', 1, { assignee_id: 'acc-2', assignee_name: 'Zed' }),
        issue('B', 1, { assignee_id: 'acc-1' })
      ],
      [
        { account_id: 'acc-1', display_name: 'Darell Rabial Andefa' },
        { account_id: 'acc-2', display_name: 'Zed' }
      ]
    );
    expect(view.people.map(p => p.name)).toEqual(['Darell Rabial Andefa', 'Zed']);
  });

  it('drops unassigned issues', () => {
    const view = viewWith([issue('A', 1, { assignee_id: null })]);
    expect(view.people).toEqual([]);
  });

  it('changing the window re-filters without re-reading the database', () => {
    const view = viewWith([issue('A', 1), issue('B', 9)]);
    expect(view.people[0].columns.inProgress).toHaveLength(1);

    view.days = 14;
    view.rebuild();
    expect(view.people[0].columns.inProgress).toHaveLength(2);
  });

  it('keeps the selected person in view when the window changes', () => {
    const view = viewWith(
      [
        issue('A', 1, { assignee_id: 'acc-1' }),
        issue('B', 1, { assignee_id: 'acc-2', assignee_name: 'Zed' })
      ],
      [
        { account_id: 'acc-1', display_name: 'Darell Rabial Andefa' },
        { account_id: 'acc-2', display_name: 'Zed' }
      ]
    );
    view.selectedId = 'acc-2';
    view.rebuild();
    expect(view.people[view.currentIdx].name).toBe('Zed');
  });

  it('renders a person filter and a window selector', () => {
    const view = viewWith([issue('A', 1)]);
    document.getElementById('issue-board-container').innerHTML = view.render();

    expect(document.getElementById('standup-person-filter')).toBeTruthy();
    expect(document.getElementById('standup-days-filter')).toBeTruthy();
    expect(document.getElementById('standup-days-filter').value).toBe('5');
  });

  it('selecting a name switches to that person', () => {
    const view = viewWith(
      [
        issue('A', 1, { assignee_id: 'acc-1' }),
        issue('B', 1, { assignee_id: 'acc-2', assignee_name: 'Zed' })
      ],
      [
        { account_id: 'acc-1', display_name: 'Darell Rabial Andefa' },
        { account_id: 'acc-2', display_name: 'Zed' }
      ]
    );
    document.getElementById('issue-board-container').innerHTML = view.render();
    view.bindEvents();

    const select = document.getElementById('standup-person-filter');
    select.value = 'acc-2';
    select.dispatchEvent(new Event('change'));

    expect(document.querySelector('.standup-name').textContent.trim()).toBe('Zed');
  });

  it('says so when nothing changed in the window', () => {
    const view = viewWith([issue('A', 40)]);
    document.getElementById('issue-board-container').innerHTML = view.render();

    expect(document.body.textContent).toContain('No updates in the last 5 days');
    // The controls stay so the window can be widened from the empty state.
    expect(document.getElementById('standup-days-filter')).toBeTruthy();
  });
});

describe('StandupView cards and story points', () => {
  let StandupView;

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  function mount(issues) {
    const view = new StandupView(null, 'example.atlassian.net', () => {});
    view._allIssues = issues;
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();
    return view;
  }

  it('renders each issue as a card', () => {
    mount([issue('A', 1), issue('B', 1)]);
    expect(document.querySelectorAll('.standup-card')).toHaveLength(2);
  });

  it('shows story points on the card', () => {
    mount([issue('A', 1, { story_points: 5 })]);
    expect(document.querySelector('.standup-points').textContent.trim()).toBe('5 pts');
  });

  it('omits the points chip when an issue has none', () => {
    mount([issue('A', 1)]);
    expect(document.querySelector('.standup-points')).toBeNull();
  });

  it('shows a story point total per section', () => {
    mount([issue('A', 1, { story_points: 3 }), issue('B', 1, { story_points: 2 })]);
    expect(document.querySelector('.standup-points-total').textContent.trim()).toBe('5 pts');
  });

  it('ignores non-numeric story points in the total', () => {
    mount([issue('A', 1, { story_points: 3 }), issue('B', 1, { story_points: null })]);
    expect(document.querySelector('.standup-points-total').textContent.trim()).toBe('3 pts');
  });

  it('hides the total when no issue in the section is estimated', () => {
    mount([issue('A', 1)]);
    expect(document.querySelector('.standup-points-total')).toBeNull();
  });

  it('treats zero points as an estimate, not as missing', () => {
    mount([issue('A', 1, { story_points: 0 })]);
    expect(document.querySelector('.standup-points').textContent.trim()).toBe('0 pts');
  });

  it('uses the singular for a single point', () => {
    mount([issue('A', 1, { story_points: 1 })]);
    expect(document.querySelector('.standup-points').textContent.trim()).toBe('1 pt');
    expect(document.querySelector('.standup-points-total').textContent.trim()).toBe('1 pt');
  });

  it('lets long summaries wrap rather than truncating them', () => {
    mount([issue('A', 1, { summary: 'A very long summary that needs to be read aloud in full' })]);
    const card = document.querySelector('.standup-card-summary');
    expect(card.textContent).toContain('read aloud in full');
  });
});

describe('Standup column layout', () => {
  let mod, StandupView;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../components/StandupView.js');
    StandupView = mod.StandupView;
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  it('orders the columns left to right through the pipeline', () => {
    expect(mod.STANDUP_COLUMNS.map(c => c.key)).toEqual([
      'todo', 'inProgress', 'review', 'test', 'completed'
    ]);
  });

  it('folds all three review stages into the Review column', () => {
    for (const status of ['Code Quality Check', 'In Review', 'Review Approval']) {
      expect(mod.columnForIssue({ status, status_category: 'In Progress' })).toBe('review');
    }
  });

  it('groups the whole test stage into one Test column', () => {
    for (const status of ['Ready To Test', 'Testing', 'Tested', 'Ready for Regression']) {
      expect(mod.columnForIssue({ status, status_category: 'Done' })).toBe('test');
    }
  });

  it('puts released and approval statuses in Completed', () => {
    for (const status of ['Delivered / Released', 'Approved', 'Ready For Approval']) {
      expect(mod.columnForIssue({ status, status_category: 'Done' })).toBe('completed');
    }
  });

  it('matches approval status regardless of capitalisation', () => {
    // Jira spells it "Ready For Approval"; matching is lowercased.
    expect(mod.columnForIssue({ status: 'ready for approval' })).toBe('completed');
    expect(mod.columnForIssue({ status: 'READY FOR APPROVAL' })).toBe('completed');
  });

  it('matches Ready To Test by name even though TSM2 files it under Done', () => {
    expect(mod.columnForIssue({ status: 'Ready To Test', status_category: 'Done' }))
      .toBe('test');
  });

  it('sends an unrecognised FINISHED status to Completed, not to blockers', () => {
    expect(mod.columnForIssue({ status: 'Shipped To Prod', status_category: 'Done' }))
      .toBe('completed');
    expect(mod.columnForIssue({ status: 'Closed' })).toBe('completed');
  });

  it('never drops an issue', () => {
    for (const status of ['To Do', 'In Progress', 'Anything At All', 'Done']) {
      expect(mod.columnForIssue({ status })).toBeTruthy();
    }
  });

  it('files every testing stage under Test', () => {
    const testing = [
      'Testing', 'TESTING IN PROGRESS', 'TEST RUN PASSED',
      'Test Comments', 'Tested', 'Ready for Regression'
    ];
    for (const status of testing) {
      expect(mod.columnForIssue({ status, status_category: 'In Progress' })).toBe('test');
    }
  });

  it('treats a failed test run as a blocker, not as testing', () => {
    expect(mod.columnForIssue({ status: 'TEST RUN FAILED', status_category: 'In Progress' }))
      .toBe('todo');
  });

  it('sends an unrecognised open status to the catch-all column', () => {
    expect(mod.columnForIssue({ status: 'Waiting on customer', status_category: 'To Do' }))
      .toBe('todo');
  });

  it('renders all column headings in order', () => {
    const view = new StandupView(null, 'example.atlassian.net', () => {});
    view._allIssues = [issue('A', 1)];
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();

    const headings = [...document.querySelectorAll('.standup-section-title')]
      .map(h => h.textContent.trim());
    expect(headings).toEqual([
      'Blockers / To Do',
      'In Progress',
      'Review',
      'Test',
      'Completed'
    ]);
  });

  it('gives each column a stage colour class', () => {
    const view = new StandupView(null, 'example.atlassian.net', () => {});
    view._allIssues = [issue('A', 1)];
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();

    const tones = [...document.querySelectorAll('.standup-section')]
      .map(el => [...el.classList].find(c => c.startsWith('standup-tone-')));
    expect(tones).toEqual([
      'standup-tone-todo', 'standup-tone-progress',
      'standup-tone-review', 'standup-tone-test', 'standup-tone-done'
    ]);
  });
});

describe('Last updated by', () => {
  let StandupView;

  const ISSUES = [
    { key: 'TSM2-1', summary: 'One', status: 'In Progress', status_category: 'In Progress',
      assignee_id: 'acc-1', updated_at: new Date(NOW - DAY).toISOString() }
  ];

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  function mount(client) {
    const view = new StandupView(client, 'example.atlassian.net', () => {});
    view._allIssues = ISSUES;
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();
    return view;
  }

  it('renders nothing extra before the lookup answers', () => {
    mount({ getLastChangeAuthor: async () => null });
    expect(document.querySelector('.standup-card-by')).toBeNull();
  });

  it('shows who last changed the issue once resolved', async () => {
    const view = mount({
      getLastChangeAuthor: async () => ({ author: 'Tan Khay Ong', created: '2026-09-11T10:00:00Z' })
    });
    await view.loadLastChangeAuthors();

    const by = document.querySelector('.standup-card-by');
    expect(by.textContent).toContain('Updated by');
    expect(by.textContent).toContain('Tan Khay Ong');
  });

  it('asks only for the cards on screen, and only once each', async () => {
    const spy = vi.fn().mockResolvedValue({ author: 'X', created: null });
    const view = mount({ getLastChangeAuthor: spy });

    await view.loadLastChangeAuthors();
    await view.loadLastChangeAuthors();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('TSM2-1');
  });

  it('still renders when there is no client (offline view)', () => {
    const view = mount(null);
    expect(() => view.render()).not.toThrow();
    expect(document.querySelector('.standup-card')).toBeTruthy();
  });

  it('survives a changelog lookup that fails', async () => {
    const view = mount({ getLastChangeAuthor: async () => null });
    await expect(view.loadLastChangeAuthors()).resolves.toBeUndefined();
    expect(document.querySelector('.standup-card')).toBeTruthy();
  });
});

describe('Created and Updated dates on the card', () => {
  let StandupView;

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  function mount(issues, client = null) {
    const view = new StandupView(client, 'example.atlassian.net', () => {});
    view._allIssues = issues;
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();
    return view;
  }

  it('shows exactly two dates, labelled Created and Updated', () => {
    mount([issue('A', 2)]);

    const labels = [...document.querySelectorAll('.standup-date-label')].map(e => e.textContent.trim());
    expect(labels).toEqual(['Created', 'Updated']);
    expect(document.querySelectorAll('.standup-date-value')).toHaveLength(2);
  });

  it('uses created_at and updated_at, not the same value twice', () => {
    mount([issue('A', 2, {
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z'
    })]);

    const [created, updated] = [...document.querySelectorAll('.standup-date-value')]
      .map(e => e.textContent.trim());
    expect(created).not.toBe(updated);
    expect(created).toContain('2026');
    expect(updated).toContain('Sep');
  });

  it('falls back to a dash when an issue has no created date', () => {
    mount([issue('A', 2, { created_at: null })]);
    const [created] = [...document.querySelectorAll('.standup-date-value')].map(e => e.textContent.trim());
    expect(created).toBe('—');
  });

  it('the Updated by row carries the name only, not a third date', async () => {
    const view = mount([issue('A', 2)], {
      getLastChangeAuthor: async () => ({ author: 'Tan Khay Ong', created: '2026-09-11T10:00:00Z' })
    });
    await view.loadLastChangeAuthors();

    const by = document.querySelector('.standup-card-by');
    expect(by.textContent).toContain('Tan Khay Ong');
    expect(by.querySelector('.standup-by-when')).toBeNull();
    // Still only the two labelled dates on the card.
    expect(document.querySelectorAll('.standup-date-value')).toHaveLength(2);
  });
});

describe('Standup cards link to Jira', () => {
  let StandupView;

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  function mount(domain = 'tenderboard.atlassian.net') {
    const view = new StandupView(null, domain, () => {});
    view._allIssues = [issue('TSM2-8294', 1)];
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();
    return view;
  }

  it('renders each card as an anchor to the Jira issue', () => {
    mount();
    const card = document.querySelector('.standup-card');

    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href'))
      .toBe('https://tenderboard.atlassian.net/browse/TSM2-8294');
    expect(card.getAttribute('target')).toBe('_blank');
    expect(card.getAttribute('rel')).toBe('noopener');
  });

  it('falls back to a non-link card when the domain is unknown', () => {
    mount('');
    const card = document.querySelector('.standup-card');
    expect(card.tagName).toBe('ARTICLE');
    expect(card.getAttribute('href')).toBeNull();
  });

  it('keeps the card content intact inside the link', () => {
    mount();
    const card = document.querySelector('.standup-card');
    expect(card.querySelector('.standup-card-summary')).toBeTruthy();
    expect(card.querySelector('.standup-date-label')).toBeTruthy();
    expect(card.querySelectorAll('.standup-date-value')).toHaveLength(2);
  });

  it('url-encodes an awkward issue key', () => {
    const view = mount();
    expect(view.jiraUrl('A B/C')).toContain('A%20B%2FC');
  });
});

describe('Standup filter bar', () => {
  let StandupView;

  beforeEach(async () => {
    vi.resetModules();
    ({ StandupView } = await import('../components/StandupView.js'));
    document.body.innerHTML = '<div id="issue-board-container"></div>';
    vi.setSystemTime(new Date(NOW));
  });

  function mount() {
    const view = new StandupView(null, 'example.atlassian.net', () => {});
    view._allIssues = [issue('TSM2-1', 1)];
    view._userMap = new Map([['acc-1', 'Darell Rabial Andefa']]);
    view.isLoading = false;
    view.rebuild();
    document.getElementById('issue-board-container').innerHTML = view.render();
    view.bindEvents();
    return view;
  }

  it('has no Exit button', () => {
    mount();
    expect(document.getElementById('standup-back-btn')).toBeNull();
    expect(document.body.textContent).not.toContain('Exit');
  });

  it('labels both filters', () => {
    mount();
    const labels = [...document.querySelectorAll('.standup-filters label')]
      .map(l => l.textContent.trim());
    expect(labels).toEqual(['Person', 'Updated within']);
  });

  it('uses the same filter bar markup as the other views', () => {
    mount();
    const bar = document.querySelector('.product-filters.standup-filters');
    expect(bar).toBeTruthy();
    expect(bar.querySelectorAll('.product-filter')).toHaveLength(2);
  });

  it('keeps the prev/next navigation inside the bar', () => {
    mount();
    const bar = document.querySelector('.standup-filters');
    expect(bar.querySelector('#standup-prev')).toBeTruthy();
    expect(bar.querySelector('#standup-next')).toBeTruthy();
    expect(bar.querySelector('.standup-counter').textContent.trim()).toBe('1 / 1');
  });

  it('the filters still work after the rebuild', async () => {
    const view = mount();
    const days = document.getElementById('standup-days-filter');
    days.value = '14';
    days.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 20));
    expect(view.days).toBe(14);
  });

  it('renders no text below 12px', async () => {
    const { StandupViewStyles } = await import('../components/StandupView.js');
    const sizes = [...StandupViewStyles.matchAll(/font-size:\s*([0-9.]+)px/g)]
      .map(m => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});
