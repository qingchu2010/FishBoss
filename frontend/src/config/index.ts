export const API_BASE = '/api'

export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  CONVERSATIONS: '/conversations',
  CONVERSATION_DETAIL: '/conversations/:id',
  AGENTS: '/agents',
  AGENT_DETAIL: '/agents/:id',
  PROVIDERS: '/providers',
  MCP: '/mcp',
  SKILLS: '/skills',
  WORKFLOWS: '/workflows',
  PLATFORMS: '/platforms',
  GROUPS: '/groups',
  MEDIA: '/media',
  SETTINGS: '/settings',
  LOGS: '/logs'
} as const
