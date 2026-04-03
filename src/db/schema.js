/**
 * Database Schema Definitions and Migrations
 */

export const SCHEMA_VERSION = 1;

export const TABLES = {
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      description TEXT,
      lead TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  boards: `
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      project_key TEXT,
      type TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_key) REFERENCES projects(key)
    )
  `,
  sprints: `
    CREATE TABLE IF NOT EXISTS sprints (
      id INTEGER PRIMARY KEY,
      board_id INTEGER,
      name TEXT NOT NULL,
      state TEXT,
      start_date DATETIME,
      end_date DATETIME,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      account_id TEXT PRIMARY KEY,
      display_name TEXT,
      email TEXT,
      avatar_url TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  issues: `
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      project_key TEXT,
      summary TEXT,
      description TEXT,
      status TEXT,
      status_category TEXT,
      priority TEXT,
      issue_type TEXT,
      reporter_id TEXT,
      assignee_id TEXT,
      created_at DATETIME,
      updated_at DATETIME,
      resolved_at DATETIME,
      due_date DATETIME,
      fix_version TEXT,
      customer TEXT,
      product TEXT,
      qa_tester_id TEXT,
      sprint_id INTEGER,
      board_id INTEGER,
      jira_url TEXT,
      raw_data JSON,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_key) REFERENCES projects(key),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id),
      FOREIGN KEY (board_id) REFERENCES boards(id),
      FOREIGN KEY (reporter_id) REFERENCES users(account_id),
      FOREIGN KEY (assignee_id) REFERENCES users(account_id),
      FOREIGN KEY (qa_tester_id) REFERENCES users(account_id)
    )
  `,
  issue_tags: `
    CREATE TABLE IF NOT EXISTS issue_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_key TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_key) REFERENCES issues(key) ON DELETE CASCADE
    )
  `,
  saved_views: `
    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      columns JSON,
      filters JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  sync_metadata: `
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
};

export const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_issues_sprint ON issues(sprint_id);
  CREATE INDEX IF NOT EXISTS idx_issues_board ON issues(board_id);
  CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_key);
  CREATE INDEX IF NOT EXISTS idx_issues_updated ON issues(updated_at);
  CREATE INDEX IF NOT EXISTS idx_issues_fix_version ON issues(fix_version);
  CREATE INDEX IF NOT EXISTS idx_issues_customer ON issues(customer);
  CREATE INDEX IF NOT EXISTS idx_issues_product ON issues(product);
  CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_issues_reporter ON issues(reporter_id);
  CREATE INDEX IF NOT EXISTS idx_issues_qa_tester ON issues(qa_tester_id);
  CREATE INDEX IF NOT EXISTS idx_issues_status_category ON issues(status_category);
  CREATE INDEX IF NOT EXISTS idx_issue_tags_tag ON issue_tags(tag_name);
  CREATE INDEX IF NOT EXISTS idx_sprints_board ON sprints(board_id);
  CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_key);
  CREATE INDEX IF NOT EXISTS idx_issue_tags_issue ON issue_tags(issue_key);
`;

export function getAllTables() {
  return Object.values(TABLES);
}

export function getAllIndexes() {
  return INDEXES.split(';').filter(sql => sql.trim().length > 0);
}
