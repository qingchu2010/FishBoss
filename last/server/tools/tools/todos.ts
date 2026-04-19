import { z } from 'zod'
import { defineTool } from '../tool.js'

const todoSchema = z.object({
  id: z.string().describe('Unique identifier for the todo'),
  content: z.string().describe('The task description'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status of the todo'),
  priority: z.enum(['high', 'medium', 'low']).describe('Priority level')
})

const parameters = z.object({
  todos: z.array(todoSchema).describe('The updated todo list')
})

type Todo = z.infer<typeof todoSchema>

const todosBySession = new Map<string, Todo[]>()

function getSessionId(sessionId?: string): string {
  return sessionId || 'default'
}

function getSessionTodos(sessionId?: string): Todo[] {
  return todosBySession.get(getSessionId(sessionId)) || []
}

function setSessionTodos(sessionId: string, todos: Todo[]): void {
  if (todos.length === 0) {
    todosBySession.delete(sessionId)
    return
  }
  todosBySession.set(sessionId, todos)
}

export function hasIncompleteTodos(sessionId?: string): boolean {
  return getSessionTodos(sessionId).some(todo => todo.status !== 'completed')
}

export function getIncompleteTodos(sessionId?: string): Array<{ id: string; content: string; status: string; priority: string }> {
  return getSessionTodos(sessionId)
    .filter(todo => todo.status !== 'completed')
    .map(todo => ({
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority
    }))
}

export function getAllTodos(sessionId?: string): Array<{ id: string; content: string; status: string; priority: string }> {
  return getSessionTodos(sessionId).map(todo => ({
    id: todo.id,
    content: todo.content,
    status: todo.status,
    priority: todo.priority
  }))
}

export function clearTodos(sessionId?: string): void {
  if (sessionId) {
    todosBySession.delete(getSessionId(sessionId))
    return
  }
  todosBySession.clear()
}

export const todosTool = defineTool('todos', {
  description: `Manage a task list for tracking progress on complex multi-step work.

When to use:
- Tasks with 3+ distinct steps or actions
- Complex tasks requiring careful planning
- Features that need multiple operations to complete

Rules:
- Keep todo IDs stable across updates (don't change IDs)
- Only ONE task can be in_progress at a time
- If any task is unfinished, exactly one must be in_progress
- Mark tasks completed immediately after finishing them
- Don't conclude work while unfinished todos remain

Parameters:
- todos: Array of todo objects with:
  - id: Unique identifier (string)
  - content: Task description
  - status: "pending" | "in_progress" | "completed"
  - priority: "high" | "medium" | "low"

Returns summary with counts and current active task.`,
  parameters,
  async execute(args, context) {
    const sessionId = getSessionId(context?.sessionId)
    const { todos } = args

    validateTodos(todos)

    const previousTodos = getSessionTodos(sessionId)
    const previousById = new Map(previousTodos.map(todo => [todo.id, todo]))
    const nextById = new Map(todos.map(todo => [todo.id, todo]))

    const addedCount = todos.filter(todo => !previousById.has(todo.id)).length
    const completedCount = todos.filter(todo => {
      const previous = previousById.get(todo.id)
      return todo.status === 'completed' && previous?.status !== 'completed'
    }).length
    const removedCount = previousTodos.filter(todo => !nextById.has(todo.id)).length

    setSessionTodos(sessionId, todos)

    const activeTodo = todos.find(todo => todo.status === 'in_progress')
    const remainingTodos = todos.filter(todo => todo.status !== 'completed')

    const summaryLines = [
      'Task list synced.',
      `Total: ${todos.length}`,
      `Remaining: ${remainingTodos.length}`
    ]

    if (addedCount > 0) {
      summaryLines.push(`Added: ${addedCount}`)
    }
    if (completedCount > 0) {
      summaryLines.push(`Completed: ${completedCount}`)
    }
    if (removedCount > 0) {
      summaryLines.push(`Removed: ${removedCount}`)
    }
    if (activeTodo) {
      summaryLines.push(`Active: ${activeTodo.content}`)
    } else if (remainingTodos.length === 0) {
      summaryLines.push('Active: none')
    }

    const orderedTodos = [...todos].sort(compareTodos)
    const todoLines = orderedTodos.map(todo => `${getStatusLabel(todo.status)} ${todo.content}`)

    return {
      title: 'Task List',
      output: `${summaryLines.join('\n')}\n\n${todoLines.join('\n')}`
    }
  }
})

function validateTodos(todos: Todo[]): void {
  const ids = new Set<string>()
  let inProgressCount = 0

  for (const todo of todos) {
    if (ids.has(todo.id)) {
      throw new Error(`Duplicate todo id: ${todo.id}`)
    }
    ids.add(todo.id)

    if (!todo.content.trim()) {
      throw new Error(`Todo content cannot be empty: ${todo.id}`)
    }

    if (todo.status === 'in_progress') {
      inProgressCount++
    }
  }

  if (inProgressCount > 1) {
    throw new Error('Only one todo can be in_progress at a time')
  }

  if (todos.some(todo => todo.status !== 'completed') && inProgressCount === 0) {
    throw new Error('One todo must be in_progress while unfinished tasks remain')
  }
}

function compareTodos(a: Todo, b: Todo): number {
  const statusOrder = getStatusRank(a.status) - getStatusRank(b.status)
  if (statusOrder !== 0) {
    return statusOrder
  }
  return getPriorityRank(a.priority) - getPriorityRank(b.priority)
}

function getStatusRank(status: Todo['status']): number {
  if (status === 'in_progress') {
    return 0
  }
  if (status === 'pending') {
    return 1
  }
  return 2
}

function getPriorityRank(priority: Todo['priority']): number {
  if (priority === 'high') {
    return 0
  }
  if (priority === 'medium') {
    return 1
  }
  return 2
}

function getStatusLabel(status: Todo['status']): string {
  if (status === 'completed') {
    return '[done]'
  }
  if (status === 'in_progress') {
    return '[doing]'
  }
  return '[todo]'
}
