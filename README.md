# Jira Planner

A modern, browser-based Jira planning tool with local IndexedDB storage. View your Jira issues in a Kanban board or table view with powerful filtering, custom tags, and shareable URLs. **Read-only** - all data is stored locally in your browser.

## Features

- **Local Storage (IndexedDB)**: All Jira data is cached locally - no writes to Jira
- **Kanban Board**: View issues organized by status (To Do, In Progress, Done, etc.)
- **Table View**: Alternative grid view with customizable columns
- **All Issues View**: See all sprints (past, current & future) in one place
- **Roadmap Planner**: Timeline/Gantt view with swimlanes, sprint markers, and date range filtering
- **Advanced Filtering**:
  - Status (multi-select)
  - Fix Version
  - Customer (customfield_10043)
  - Product
  - Assignee, Reporter, QA Tester
  - Tags
  - Search by key or summary
  - To Be Tested By date
  - Updated After date
- **Custom Tags**: Add personal tags to issues for organization
- **Saved Views**: Save and load filter/column configurations
- **Shareable URLs**: Bookmark or share filtered views with URL parameters
- **Auto-Connect**: Stay logged in across page refreshes
- **Boards without Sprints**: Full support for Kanban boards without sprint configuration
- **Dark/Light Mode**: Automatically adapts to your system preference

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Jira Cloud account
- An API token from Atlassian

### Generate Jira API Token

1. Go to [https://id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens)
2. Click "Create API token"
3. Label your token (e.g., "Jira Planner")
4. Copy the token - you'll need it for setup

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

### Usage

1. **Connect to Jira**:
   - Enter your Jira domain (e.g., `yourcompany.atlassian.net`)
   - Enter your email address
   - Enter your API token
   - Click "Connect"
   - Credentials are saved - you'll auto-connect on future visits

2. **Select Project & Board**:
   - Choose a project from the dropdown
   - Select a board
   - Pick a sprint, or select "All Sprints (Past, Current & Future)"

3. **View Issues**:
   - **Kanban Board**: View issues by status (default)
   - **All Issues**: Click "All Issues" button for table view with filters
   - **Roadmap**: Click "Roadmap" button for timeline/Gantt view

4. **Roadmap View**:
   - **Date Range**: Select start and end dates, or use presets (Today, 3 Months, 6 Months)
   - **Group By**: Organize swimlanes by Epic/Theme, Status, Assignee, or Fix Version
   - **Zoom Level**: Adjust timeline granularity (Weeks, Months, Quarters)
   - **Issue Bars**: Horizontal bars show issue duration based on start/due dates
   - **Sprint Markers**: Vertical bands indicate sprint boundaries
   - **Click to Open**: Click any issue bar to open it in Jira

5. **Filter Issues** (All Issues view):
   - Use the filter panel to narrow down issues
   - Multiple filters can be combined
   - Filters are reflected in the URL for sharing

5. **Manage Tags**:
   - Click on the Tags cell in any row to add/remove tags
   - Tags are stored locally only

6. **Save Views**:
   - Configure your desired columns and filters
   - Click "Save View" to store the configuration
   - Load saved views later for quick access

## URL Routing & Parameters

The app uses hash-based routing for shareable URLs:

```
#/board                              - Kanban board view
#/all-issues                         - All Issues table view
#/roadmap                            - Roadmap timeline view
#/all-issues?customer=Acme           - Filtered by customer
#/all-issues?status=In%20Progress    - Filtered by status
#/all-issues?fixVersion=v1.0         - Filtered by fix version
#/all-issues?tag=urgent              - Filtered by tag
#/all-issues?assigneeId=xxx          - Filtered by assignee
```

Roadmap view supports URL parameters for date range and grouping:
```
#/roadmap?startDate=2026-04-01&endDate=2026-09-30&groupBy=epic&zoomLevel=month
```

Multiple filters can be combined:
```
#/all-issues?customer=Acme&status=In%20Progress&status=To%20Do&fixVersion=v2.0
```

**Bookmark or share these URLs** - they preserve your view and filters on page refresh.

## Project Structure

```
src/
├── api/
│   └── jira.js           # Jira API client (read-only)
├── components/
│   ├── SettingsPanel.js  # Connection settings
│   ├── BoardSelector.js  # Project/board/sprint selector
│   ├── IssueBoard.js     # Kanban board component
│   ├── IssueCard.js      # Individual issue card
│   ├── AllIssuesView.js  # Table view with filters
│   ├── TableView.js      # Configurable table component
│   ├── FilterPanel.js    # Filter controls
│   ├── TagsManager.js    # Tag management modal
│   ├── SavedViewsMenu.js # Save/load view configurations
│   ├── SyncStatus.js     # Sync status indicator
│   ├── RoadmapView.js    # Roadmap container component
│   ├── RoadmapTimeline.js# Timeline/Gantt visualization
│   └── RoadmapToolbar.js # Roadmap filter toolbar
├── db/
│   ├── indexeddb.js      # IndexedDB wrapper
│   ├── sync.js           # Data synchronization from Jira
│   └── queries.js        # Query helpers with filtering
├── utils/
│   ├── storage.js        # LocalStorage helpers (credentials)
│   ├── router.js         # Hash-based routing
│   └── debounce.js       # Debounce utility
├── main.js               # App entry point
└── style.css             # Styles
```

## Data Storage

### IndexedDB (Local Data)
All Jira data is stored locally in browser IndexedDB:
- Projects, Boards, Sprints
- Issues with all fields
- Users (for display names)
- Tags (your personal tags)
- Saved Views

**Data is read-only from Jira** - no changes are written back to Jira.

### LocalStorage (Settings)
- Jira credentials (domain, email, API token)
- Last selected board/sprint

## Sync Behavior

- **Initial Connect**: Full sync of all projects, boards, sprints, and issues
- **Page Refresh**: Incremental sync (last 30 days of updated issues)
- **Manual Sync**: Click "Sync" button to force refresh data from Jira

## Custom Fields

The app extracts data from custom fields:
- **customer**: `customfield_10043` (array or string)
- **product**: Any custom field containing "product"
- **qa_tester**: Any custom field containing "qa" or "tester"

## API Integration

This app uses the Jira Cloud REST API (read-only):

- **Authentication**: Basic Auth with email + API token
- **Agile API**: For boards, sprints, and board issues
- **REST API v3**: For issues and projects

### Key Endpoints

- `GET /rest/api/3/myself` - Get current user
- `GET /rest/api/3/project` - List projects
- `GET /rest/agile/1.0/board` - List boards
- `GET /rest/agile/1.0/board/{id}/sprint` - List sprints
- `GET /rest/agile/1.0/board/{id}/issue` - Get board issues

## Security Notes

- Credentials are stored in browser localStorage
- All Jira data is stored in browser IndexedDB
- The app runs entirely in your browser - no data is sent to third parties
- Never commit your API token to version control

## Scripts

```bash
# Development
npm run dev      # Start dev server

# Production
npm run build    # Build for production
npm run preview  # Preview production build
```

## Troubleshooting

### "Failed to connect to Jira"
- Verify your Jira domain (should be `xxx.atlassian.net`)
- Check that your API token is valid
- Ensure your account has access to the Jira instance

### "No boards found"
- Make sure you have a Scrum or Kanban board configured in Jira
- Check that your account has board permissions

### Issues not loading
- Open browser console for error messages
- Verify the selected board has issues
- Check network tab for API response errors

### Customer filter not showing values
- Ensure `customfield_10043` exists in your Jira instance
- Trigger a manual sync to refresh the data
- Check browser console for sync logs

### View resets to Kanban board on refresh
- Check that the URL contains `#/all-issues` or filter parameters
- The app should restore your last view based on the URL

## License

MIT
