import { createRouter, createWebHistory } from 'vue-router'
import { ROUTES } from '@/config'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: ROUTES.HOME,
    redirect: ROUTES.DASHBOARD
  },
  {
    path: ROUTES.DASHBOARD,
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue')
  },
  {
    path: ROUTES.CONVERSATIONS,
    name: 'conversations',
    component: () => import('@/views/ConversationsView.vue')
  },
  {
    path: ROUTES.CONVERSATION_DETAIL,
    name: 'conversation-detail',
    component: () => import('@/views/ConversationsView.vue')
  },
  {
    path: ROUTES.AGENTS,
    name: 'agents',
    component: () => import('@/views/AgentsView.vue')
  },
  {
    path: ROUTES.AGENT_DETAIL,
    name: 'agent-detail',
    component: () => import('@/views/AgentDetailView.vue')
  },
  {
    path: ROUTES.PROVIDERS,
    name: 'providers',
    component: () => import('@/views/ProvidersView.vue')
  },
  {
    path: ROUTES.MCP,
    name: 'mcp',
    component: () => import('@/views/MCPView.vue')
  },
  {
    path: ROUTES.SKILLS,
    name: 'skills',
    component: () => import('@/views/SkillsView.vue')
  },
  {
    path: ROUTES.WORKFLOWS,
    name: 'workflows',
    component: () => import('@/views/WorkflowsView.vue')
  },
  {
    path: ROUTES.PLATFORMS,
    name: 'platforms',
    component: () => import('@/views/PlatformsView.vue')
  },
  {
    path: ROUTES.GROUPS,
    name: 'groups',
    component: () => import('@/views/WorkflowsView.vue')
  },
  {
    path: ROUTES.MEDIA,
    name: 'media',
    component: () => import('@/views/WorkflowsView.vue')
  },
  {
    path: ROUTES.SETTINGS,
    name: 'settings',
    component: () => import('@/views/SettingsView.vue')
  },
  {
    path: ROUTES.LOGS,
    name: 'logs',
    component: () => import('@/views/LogsView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
