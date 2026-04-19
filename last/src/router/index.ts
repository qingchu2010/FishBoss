import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import ChatView from '@/views/ChatView.vue'
import ModelProvidersView from '@/views/ModelProvidersView.vue'
import AgentsView from '@/views/AgentsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import LogsView from '@/views/LogsView.vue'
import MCPView from '@/views/MCPView.vue'
import SkillsView from '@/views/SkillsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView
    },
    {
      path: '/model-providers',
      name: 'model-providers',
      component: ModelProvidersView
    },
    {
      path: '/agents',
      name: 'agents',
      component: AgentsView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    },
    {
      path: '/logs',
      name: 'logs',
      component: LogsView
    },
    {
      path: '/mcp-servers',
      name: 'mcp-servers',
      component: MCPView
    },
    {
      path: '/skills',
      name: 'skills',
      component: SkillsView
    }
  ]
})

export default router
