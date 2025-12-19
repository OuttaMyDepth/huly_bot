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

Your job:
- Answer questions about how to use Huly
- Help people find features and navigate the platform
- Be a friendly presence in the chat
- If you don't know something, say so honestly

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
}

export interface BotAction {
  action: string
  target?: string
  content?: string
  title?: string
  description?: string
  channel?: string
  reason?: string
}
