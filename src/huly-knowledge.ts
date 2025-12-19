// Huly documentation knowledge base for the bot

export const HULY_KNOWLEDGE = `
## Huly Platform Overview

Huly is an open-source all-in-one project management platform - an alternative to Linear, Jira, Slack, Notion, and Motion combined.

### Key Features
- **Tracker**: Issue/task management (like Jira/Linear)
- **Documents**: Collaborative docs and teamspaces (like Notion)
- **Chat**: Team messaging (like Slack)
- **Planner**: Personal scheduling and time management
- **Virtual Office**: Video conferencing and presence
- **Drive**: File storage
- **Human Resources**: Team and employee management
- **Recruiting**: Hiring pipeline management

### Workspace Structure
- **Workspace**: Top level - you can have multiple workspaces per account
- **Spaces**: Containers within modules (called "projects" in Tracker, "teamspaces" in Documents, "drives" in Drive)
- **Objects**: Individual items like issues, documents, messages

### Navigation Tips
- **Left sidebar**: Access all modules (Inbox, Planner, Tracker, Documents, Chat, etc.)
- **Context sidebar**: Click hamburger icon below workspace icon for module-specific options
- **Tabs**: Use "+" to open multiple tabs and work on different things
- **Right sidebar**: Quick access to planner and office, pin chats here

### Tracker (Issues)
- Create issues in projects
- Set priority, status, assignee, due dates
- Use sub-issues for breaking down work
- Milestones help group related issues
- Views: List, Kanban board, Calendar

### Documents
- Create teamspaces for different teams/topics
- Real-time collaborative editing
- Supports rich text, embeds, and formatting

### Chat
- Channels for team discussions
- Direct messages for 1:1
- Thread replies to keep conversations organized
- Can pin important chats to right sidebar

### Keyboard Shortcuts
- Cmd/Ctrl+K: Quick search and commands
- Cmd/Ctrl+N: Create new item
- Tab: Navigate between fields

### Getting Help
- Huly Docs: https://docs.huly.io/
- Slack Community: Join for peer support
- GitHub: https://github.com/hcengineering/platform
`

// Keywords that suggest someone is asking about Huly features
export const HULY_KEYWORDS = [
  'tracker', 'issue', 'issues', 'task', 'tasks', 'project', 'projects',
  'document', 'documents', 'docs', 'teamspace',
  'chat', 'channel', 'message', 'dm', 'direct message',
  'planner', 'calendar', 'schedule',
  'drive', 'file', 'files', 'upload',
  'workspace', 'space', 'spaces',
  'milestone', 'sprint', 'kanban', 'board',
  'assign', 'assignee', 'priority', 'status', 'due date',
  'office', 'video', 'call', 'meeting',
  'notification', 'inbox', 'mention',
  'shortcut', 'keyboard', 'navigate',
  'create', 'add', 'new', 'make',
  'find', 'search', 'filter', 'view',
  'invite', 'member', 'team', 'user', 'permission', 'role'
]

// Patterns that suggest a question or help request
export const HELP_PATTERNS = [
  /how (do|can|to|would)/i,
  /what (is|are|does)/i,
  /where (is|are|can|do)/i,
  /can (i|you|we)/i,
  /is there (a|any)/i,
  /help( me)?( with)?/i,
  /explain/i,
  /show me/i,
  /tell me/i,
  /\?$/  // ends with question mark
]

export function isHulyQuestion(text: string): boolean {
  const lowerText = text.toLowerCase()

  // Check if it matches help patterns
  const isQuestion = HELP_PATTERNS.some(pattern => pattern.test(text))

  // Check if it mentions Huly-related keywords
  const hasHulyKeyword = HULY_KEYWORDS.some(keyword =>
    lowerText.includes(keyword.toLowerCase())
  )

  return isQuestion && hasHulyKeyword
}
