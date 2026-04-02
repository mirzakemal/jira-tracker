# Jira Planner

A modern, browser-based Jira planning tool with a Kanban-style board interface. Connect to your Jira Cloud instance and manage your sprint issues with an intuitive drag-and-drop interface.

## Features

- **Jira Cloud Integration**: Connect to your Jira Cloud instance using API tokens
- **Kanban Board**: View issues organized by status (To Do, In Progress, Done, etc.)
- **Drag-and-Drop**: Move issues between columns to update their status
- **Project/Board/Sprint Selection**: Navigate between your Jira projects and boards
- **Create Issues**: Quickly create new issues from the board
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

2. **Select Project & Board**:
   - Choose a project from the dropdown
   - Select a board
   - Pick a sprint (active or future)

3. **Manage Issues**:
   - Drag issues between columns to change their status
   - Click "Create Issue" to add new issues
   - Click the issue key to open in Jira
   - Use "Refresh" to reload issues

## Project Structure

```
src/
├── api/
│   └── jira.js           # Jira API client
├── components/
│   ├── SettingsPanel.js  # Connection settings
│   ├── BoardSelector.js  # Project/board/sprint selector
│   ├── IssueBoard.js     # Kanban board component
│   ├── IssueCard.js      # Individual issue card
│   └── CreateIssueModal.js
├── utils/
│   └── storage.js        # LocalStorage helpers
├── main.js               # App entry point
└── style.css             # Styles
```

## API Integration

This app uses the Jira Cloud REST API:

- **Authentication**: Basic Auth with email + API token
- **Agile API**: For boards, sprints, and board issues
- **REST API v3**: For issues, projects, and transitions

### Key Endpoints

- `GET /rest/api/3/myself` - Get current user
- `GET /rest/api/3/project` - List projects
- `GET /rest/agile/1.0/board` - List boards
- `GET /rest/agile/1.0/board/{id}/issue` - Get board issues
- `POST /rest/api/3/issue` - Create issue
- `POST /rest/api/3/issue/{key}/transitions` - Transition issue

## Security Notes

- Credentials are stored in browser localStorage
- For enhanced security, use session-only mode (clear on close)
- Never commit your API token to version control
- The app runs entirely in your browser - no data is sent to third parties

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

## License

MIT
