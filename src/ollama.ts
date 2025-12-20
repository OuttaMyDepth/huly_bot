import { config } from './config.js'
import { HULY_KNOWLEDGE } from './huly-knowledge.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OllamaResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

const SYSTEM_PROMPTS: Record<string, string> = {
  'chaotic-helpful': `You are a friendly AI assistant living inside Huly, a project management platform.

Your personality:
- Helpful and knowledgeable about Huly
- A bit quirky and fun - you can make jokes and be playful
- Concise - keep responses short and conversational
- You speak naturally like a teammate, not formally

Your capabilities:
- Answer questions about how to use Huly
- Help people find features and navigate the platform
- Be a friendly presence in the chat
- CREATE ISSUES when asked - you have the ability to create issues in tracker projects!
- If you don't know something, say so honestly

When someone asks you to create an issue/task/bug, acknowledge that you're doing it. Say something like "On it!" or "Creating that issue now!"

IMPORTANT: Reply in plain text only. No JSON, no markdown formatting, no code blocks. Just natural conversation.

${HULY_KNOWLEDGE}`,

  'curious': `You are a curious AI bot exploring a project management system.
You love asking questions and learning about what everyone is working on.
You explore issues, read comments, and try to understand the big picture.
Keep responses short. Respond with JSON actions.`,

  'productive': `You are a productive AI assistant focused on helping the team.
You look for ways to organize, prioritize, and complete tasks.
You might add helpful comments, update statuses, or remind people of deadlines.
Keep responses short. Respond with JSON actions.`,

  'silly': `You are a silly AI bot who loves making work fun.
You create humorous tasks, add funny comments, and try to lighten the mood.
Nothing offensive - just wholesome workplace humor.
Keep responses short. Respond with JSON actions.`
}

export class OllamaClient {
  private baseUrl: string
  private model: string
  private conversationHistory: ChatMessage[] = []

  constructor() {
    this.baseUrl = config.ollama.url
    this.model = config.ollama.model
    this.resetConversation()
  }

  resetConversation(): void {
    const systemPrompt = SYSTEM_PROMPTS[config.bot.personality] || SYSTEM_PROMPTS['chaotic-helpful']
    this.conversationHistory = [
      { role: 'system', content: systemPrompt }
    ]
  }

  async shouldRespond(message: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a helpful AI bot in a team chat that can create issues and help with tasks. Decide if you should respond to this message.

Respond YES if:
- Someone is asking a question (even if not directly to you)
- Someone seems confused or needs help
- Someone is greeting the chat or being social
- The message seems like it could use a friendly response
- Someone mentions "bot", "huly", or seems to want assistance
- Someone wants to CREATE something (issue, task, bug, ticket)
- Someone is asking you to DO something

Respond NO if:
- It's clearly a private conversation between others
- It's just an acknowledgment like "ok" or "thanks" (unless thanking you)
- It's a system message or notification

When in doubt, respond YES.

Reply with just YES or NO.`
            },
            { role: 'user', content: message }
          ],
          temperature: 0.3,
          max_tokens: 10
        })
      })

      const data = await response.json() as OllamaResponse
      const answer = data.choices[0]?.message?.content?.trim().toUpperCase() || 'NO'
      return answer.includes('YES')
    } catch (error) {
      console.error('shouldRespond check failed:', error)
      return false
    }
  }

  async chat(userMessage: string): Promise<string> {
    this.conversationHistory.push({ role: 'user', content: userMessage })

    // Keep conversation history manageable
    if (this.conversationHistory.length > 20) {
      const system = this.conversationHistory[0]
      this.conversationHistory = [system, ...this.conversationHistory.slice(-10)]
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: this.conversationHistory,
          temperature: 0.8,
          max_tokens: 500
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as OllamaResponse
      const assistantMessage = data.choices[0]?.message?.content || 'No response'

      this.conversationHistory.push({ role: 'assistant', content: assistantMessage })

      return assistantMessage
    } catch (error) {
      console.error('Ollama request failed:', error)
      throw error
    }
  }

  async decide(context: string): Promise<BotAction> {
    const response = await this.chat(context)

    // Try to parse JSON action from response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as BotAction
      }
    } catch {
      // If parsing fails, return observe action
    }

    return { action: 'observe', reason: response }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  async detectIntent(message: string): Promise<DetectedIntent> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an intent detector for a project management bot that CAN create issues. Analyze the user's message.

If the user wants to CREATE an issue/task/bug/ticket, return CREATE_ISSUE.
Otherwise return CHAT.

Key phrases that mean CREATE_ISSUE:
- "create an issue", "make an issue", "add an issue"
- "create a task", "make a task", "add a task"
- "create a bug", "file a bug", "report a bug"
- "make me an issue", "open a ticket"
- Any request to create/add/make something in a project

Extract for CREATE_ISSUE:
- issueTitle: A concise title (required)
- issueDescription: Additional details (optional)
- issuePriority: Urgent, High, Medium, or Low (default: Medium)

Respond with JSON only:
{"type": "chat"}
OR
{"type": "create_issue", "issueTitle": "...", "issueDescription": "...", "issuePriority": "Medium"}

Examples:
- "create an issue for the login bug" -> {"type": "create_issue", "issueTitle": "Login bug", "issuePriority": "Medium"}
- "make me an issue in the project" -> {"type": "create_issue", "issueTitle": "New issue", "issuePriority": "Medium"}
- "can you make a task to update the docs?" -> {"type": "create_issue", "issueTitle": "Update the docs", "issuePriority": "Medium"}
- "add a high priority issue: API is returning 500 errors" -> {"type": "create_issue", "issueTitle": "API is returning 500 errors", "issuePriority": "High"}
- "try again, create an issue" -> {"type": "create_issue", "issueTitle": "New issue", "issuePriority": "Medium"}
- "how do I use the tracker?" -> {"type": "chat"}
- "hello!" -> {"type": "chat"}`
            },
            { role: 'user', content: message }
          ],
          temperature: 0.1,
          max_tokens: 200
        })
      })

      const data = await response.json() as OllamaResponse
      const content = data.choices[0]?.message?.content || ''

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as DetectedIntent
        return parsed
      }
    } catch (error) {
      console.error('Intent detection failed:', error)
    }

    // Default to chat
    return { type: 'chat' }
  }
}

export interface BotAction {
  action: 'chat' | 'create_issue' | 'observe' | 'comment' | 'send_message' | 'explore'
  target?: string
  content?: string
  title?: string
  description?: string
  priority?: 'Urgent' | 'High' | 'Medium' | 'Low'
  channel?: string
  reason?: string
}

export interface DetectedIntent {
  type: 'chat' | 'create_issue'
  issueTitle?: string
  issueDescription?: string
  issuePriority?: 'Urgent' | 'High' | 'Medium' | 'Low'
}
