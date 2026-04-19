import { z } from 'zod'
import { defineTool } from '../tool.js'

const askOptionSchema = z.object({
  label: z.string().describe('Display text for the option (1-5 words)'),
  description: z.string().describe('Explanation of what this option means or what will happen if chosen')
})

const askQuestionSchema = z.object({
  question: z.string().describe('One page in the questionnaire. Ask one concrete question here.'),
  options: z.array(askOptionSchema).min(2).max(6).describe('Available choices for this page. Must have 2-6 options. Each option should be distinct and mutually exclusive.'),
  multiSelect: z.boolean().optional().describe('Set to true to allow the user to select multiple options instead of just one')
})

const parameters = z.object({
  header: z.string().max(12).optional().describe('Short label for the whole ask or questionnaire (max 12 chars). Examples: "Auth method", "Library", "Approach"'),
  question: z.string().optional().describe('Compatibility mode for exactly one question. Do not use this when you need multiple answers.'),
  options: z.array(askOptionSchema).min(2).max(6).optional().describe('Compatibility mode for exactly one question. Do not use this when you need multiple answers.'),
  multiSelect: z.boolean().optional().describe('Compatibility mode for exactly one question. Do not use this when you need multiple answers.'),
  questions: z.array(askQuestionSchema).min(1).max(6).optional().describe('Preferred questionnaire form. If you need 2-6 answers in the same clarification flow, put them all here in one ask. The UI will show 1/3, 2/3 style paging with previous/next and submit all answers once.')
})

interface PendingAsk {
  id: string
  sessionId: string
  header?: string
  questions: AskQuestion[]
  resolve: (answer: AskAnswer) => void
  reject: (reason: string) => void
}

type AskQuestion = z.infer<typeof askQuestionSchema>

type AskAnswer =
  | string
  | string[]
  | {
      type: 'custom' | 'single' | 'multi'
      value: string | string[]
    }
  | {
      type: 'multi_step'
      value: Array<{
        question: string
        answerType: 'custom' | 'single' | 'multi'
        answer: string | string[]
      }>
    }

type NormalizedAskAnswer =
  | {
      type: 'custom' | 'single' | 'multi'
      value: string | string[]
    }
  | {
      type: 'multi_step'
      value: Array<{
        question: string
        answerType: 'custom' | 'single' | 'multi'
        answer: string | string[]
      }>
    }

const pendingAsksBySession = new Map<string, Map<string, PendingAsk>>()

function getSessionAsks(sessionId: string): Map<string, PendingAsk> {
  if (!pendingAsksBySession.has(sessionId)) {
    pendingAsksBySession.set(sessionId, new Map())
  }
  return pendingAsksBySession.get(sessionId)!
}

function cleanupSessionAsks(sessionId: string): void {
  const sessionAsks = pendingAsksBySession.get(sessionId)
  if (sessionAsks && sessionAsks.size === 0) {
    pendingAsksBySession.delete(sessionId)
  }
}

export function getPendingAsk(sessionId?: string): PendingAsk | undefined {
  if (sessionId) {
    const sessionAsks = pendingAsksBySession.get(sessionId)
    if (sessionAsks && sessionAsks.size > 0) {
      const asks = Array.from(sessionAsks.values())
      return asks[asks.length - 1]
    }
    return undefined
  }
  const allAsks: PendingAsk[] = []
  for (const sessionAsks of pendingAsksBySession.values()) {
    allAsks.push(...sessionAsks.values())
  }
  return allAsks[allAsks.length - 1]
}

export function resolveAsk(id: string, answer: AskAnswer): boolean {
  for (const [sessionId, sessionAsks] of pendingAsksBySession.entries()) {
    const ask = sessionAsks.get(id)
    if (ask) {
      ask.resolve(answer)
      sessionAsks.delete(id)
      cleanupSessionAsks(sessionId)
      return true
    }
  }
  return false
}

export function cancelAsk(id: string): boolean {
  for (const [sessionId, sessionAsks] of pendingAsksBySession.entries()) {
    const ask = sessionAsks.get(id)
    if (ask) {
      ask.reject('User cancelled')
      sessionAsks.delete(id)
      cleanupSessionAsks(sessionId)
      return true
    }
  }
  return false
}

export function cancelSessionAsks(sessionId: string): number {
  const sessionAsks = pendingAsksBySession.get(sessionId)
  if (!sessionAsks) return 0
  
  let count = 0
  for (const ask of sessionAsks.values()) {
    ask.reject('Session terminated')
    count++
  }
  pendingAsksBySession.delete(sessionId)
  return count
}

export const askTool = defineTool('ask', {
  description: `Ask the user questions. IMPORTANT: Use the \`questions\` array for multiple related questions - this creates a multi-page questionnaire (1/3, 2/3, 3/3) where the user submits all answers at once.

WHEN TO USE MULTI-PAGE QUESTIONNAIRE (questions array):
- Setting up a new feature that requires multiple configuration choices
- Gathering several related preferences at the start of a task
- Any scenario where you need 2+ answers that are logically connected
- Examples: "Choose framework + database + styling library", "Select runtime + package manager + test framework"

WHEN TO USE SINGLE QUESTION (question + options):
- Exactly ONE independent question that doesn't require follow-up questions
- The answer stands alone and doesn't lead to more questions

CRITICAL RULES:
1. NEVER chain multiple single-question asks together - use questions array instead
2. If you find yourself wanting to ask "and also..." or "next question...", combine them into one multi-page ask
3. Each ask call blocks until the user responds - minimize ask calls by batching questions
4. Maximum 6 questions per questionnaire, minimum 2 options per question
5. Options must be mutually exclusive (unless multiSelect is true)
6. Never include time estimates in options

Single question example:
{"header":"Runtime","question":"Choose runtime","options":[{"label":"Node","description":"Use Node.js runtime"},{"label":"Bun","description":"Use Bun runtime"}]}

Multi-page questionnaire example (PREFERRED for related questions):
{"header":"Setup","questions":[{"question":"Choose package manager","options":[{"label":"pnpm","description":"Use pnpm for installs and scripts"},{"label":"npm","description":"Use npm for installs and scripts"}]},{"question":"Choose database","options":[{"label":"SQLite","description":"Use a local file database"},{"label":"Postgres","description":"Use a server database"}]},{"question":"Choose styling","options":[{"label":"Tailwind","description":"Utility-first CSS framework"},{"label":"CSS Modules","description":"Scoped CSS with module system"}]}]}`,
  parameters,
  async execute(args, context) {
    const { header } = args
    const sessionId = context?.sessionId || 'default'
    const sessionAsks = getSessionAsks(sessionId)

    if (sessionAsks.size > 0) {
      throw new Error('There is already a pending ask for this session')
    }
    
    const questions = normalizeQuestions(args)
    
    const askId = `ask_${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2)}`
    
    return new Promise((resolve) => {
      sessionAsks.set(askId, {
        id: askId,
        sessionId,
        header,
        questions,
        resolve: (answer) => {
          const normalized = normalizeAskAnswer(answer)
          const output = normalized.type === 'multi_step'
            ? formatMultiStepAnswer(normalized.value)
            : formatAskAnswer(normalized)
          resolve({
            title: 'User Response',
            output
          })
        },
        reject: (reason) => {
          resolve({
            title: 'User Response',
            output: reason
          })
        }
      })
      
      setTimeout(() => {
        if (sessionAsks.has(askId)) {
          sessionAsks.delete(askId)
          cleanupSessionAsks(sessionId)
          resolve({
            title: 'User Response',
            output: 'No response (timeout)'
          })
        }
      }, 300000)
    })
  }
})

function normalizeAskAnswer(answer: AskAnswer): NormalizedAskAnswer {
  if (typeof answer === 'object' && answer !== null && 'type' in answer && answer.type === 'multi_step' && 'value' in answer) {
    return answer
  }

  if (typeof answer === 'object' && answer !== null && 'type' in answer && 'value' in answer) {
    return answer
  }

  if (Array.isArray(answer)) {
    return {
      type: 'multi',
      value: answer
    }
  }

  return {
    type: 'single',
    value: answer
  }
}

function formatAskAnswer(answer: { type: 'custom' | 'single' | 'multi'; value: string | string[] }): string {
  if (answer.type === 'custom') {
    return `User entered custom input: ${String(answer.value)}`
  }

  if (answer.type === 'multi') {
    const values = Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)
    return `User selected options: ${values}`
  }

  return `User selected option: ${String(answer.value)}`
}

function normalizeQuestions(args: z.infer<typeof parameters>): AskQuestion[] {
  if (args.questions && args.questions.length > 0) {
    return args.questions.map(question => ({
      question: question.question,
      options: question.options,
      multiSelect: question.multiSelect ?? false
    }))
  }

  if (!args.question || !args.options) {
    throw new Error('ask requires either questions or question + options')
  }

  return [{
    question: args.question,
    options: args.options,
    multiSelect: args.multiSelect ?? false
  }]
}

function formatMultiStepAnswer(answers: Array<{ question: string; answerType: 'custom' | 'single' | 'multi'; answer: string | string[] }>): string {
  const lines = ['User completed questionnaire:']

  answers.forEach((item, index) => {
    const answerValue = Array.isArray(item.answer) ? item.answer.join(', ') : item.answer
    lines.push(`${index + 1}. ${item.question}`)
    lines.push(`Type: ${item.answerType}`)
    lines.push(`Answer: ${answerValue}`)
  })

  return lines.join('\n')
}
