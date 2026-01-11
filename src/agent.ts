import { HulyClient } from './huly-client.js'
import { OllamaClient, BotAction, DetectedIntent } from './ollama.js'
import { config } from './config.js'
import { appendFileSync } from 'fs'

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  appendFileSync('/tmp/huly-bot-debug.log', line)
}

interface AgentState {
  lastActionTime: number
  actionsThisMinute: number
  minuteStart: number
  recentActivity: string[]
  workspace: string | null
  defaultProject: { _id: string; name: string; identifier: string } | null
}

export class HulyAgent {
  private huly: HulyClient
  private ollama: OllamaClient
  private state: AgentState
  private running = false

  constructor() {
    this.huly = new HulyClient()
    this.ollama = new OllamaClient()
    this.state = {
      lastActionTime: 0,
      actionsThisMinute: 0,
      minuteStart: Date.now(),
      recentActivity: [],
      workspace: null,
      defaultProject: null
    }
  }

  async start(): Promise<void> {
    console.log('Starting Huly Agent...')
    console.log(`Personality: ${config.bot.personality}`)

    // Check Ollama availability
    const ollamaAvailable = await this.ollama.isAvailable()
    if (!ollamaAvailable) {
      console.warn('WARNING: Ollama is not available. Bot will run in limited mode.')
    } else {
      console.log('Ollama connected!')
    }

    // Use pre-generated token if available
    if (config.huly.token) {
      console.log('Using pre-generated token...')
      this.huly.setToken(config.huly.token, config.huly.workspaceId, config.huly.socialId)
      this.state.workspace = config.huly.workspaceId
    } else {
      // Login to Huly (or sign up if account doesn't exist)
      try {
        await this.huly.login()
      } catch (error) {
        console.log('Login failed, attempting to create account...')
        try {
          await this.huly.signUp()
        } catch (signupError) {
          console.error('Both login and signup failed')
          throw error
        }
      }

      // Get workspaces
      const workspaces = await this.huly.getWorkspaces()
      console.log(`Found ${workspaces.length} workspace(s)`)

      if (workspaces.length === 0) {
        console.error('No workspaces available. Bot needs to be invited to a workspace.')
        console.log(`Please invite ${config.huly.email} to your Huly workspace.`)
        return
      }

      // Select first workspace
      const workspace = workspaces[0]
      console.log(`Joining workspace: ${workspace.workspaceName || workspace.workspaceId}`)
      await this.huly.selectWorkspace(workspace.workspaceId)
      this.state.workspace = workspace.workspaceId
    }

    // Connect to transactor
    await this.huly.connectTransactor()

    // Set up event handlers
    this.setupEventHandlers()

    // Subscribe to workspace transactions
    await this.huly.subscribe((tx) => {
      console.log('TX received:', JSON.stringify(tx).slice(0, 500))
    })

    // First, explore to discover what's available
    console.log('\n=== EXPLORING WORKSPACE ===')
    await this.explore()
    console.log('=== EXPLORATION COMPLETE ===\n')

    // Discover projects for issue creation
    await this.discoverProjects()

    // Initialize message count so we don't respond to old messages on restart
    const existingMessages = await this.huly.findAll('chunter:class:ChatMessage', {}) as unknown[]
    this.lastMessageCount = existingMessages.length
    console.log(`Ignoring ${this.lastMessageCount} existing messages`)

    // Start the main loop
    this.running = true
    this.mainLoop()

    console.log('Agent is now running!')
    console.log(`Action interval: ${config.bot.actionIntervalMs}ms`)
  }

  private setupEventHandlers(): void {
    this.huly.on('tx', (data) => {
      const dataStr = JSON.stringify(data)
      console.log('TX Event:', dataStr.slice(0, 500))
      this.addActivity(`Event: ${dataStr.slice(0, 100)}...`)
    })
  }

  private addActivity(activity: string): void {
    this.state.recentActivity.push(`[${new Date().toISOString()}] ${activity}`)
    // Keep only last 20 activities
    if (this.state.recentActivity.length > 20) {
      this.state.recentActivity = this.state.recentActivity.slice(-20)
    }
  }

  private async mainLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.tick()
      } catch (error) {
        console.error('Error in main loop:', error)
        this.addActivity(`Error: ${error}`)
      }

      await this.sleep(config.bot.actionIntervalMs)
    }
  }

  private lastMessageCount = 0

  private async tick(): Promise<void> {
    // Rate limiting
    const now = Date.now()
    if (now - this.state.minuteStart > 60000) {
      this.state.minuteStart = now
      this.state.actionsThisMinute = 0
    }

    if (this.state.actionsThisMinute >= config.bot.maxActionsPerMinute) {
      console.log('Rate limit reached, waiting...')
      return
    }

    // Check for new messages and respond if mentioned
    await this.checkAndRespondToMessages()
  }

  private async checkAndRespondToMessages(): Promise<void> {
    try {
      const messages = await this.huly.findAll('chunter:class:ChatMessage', {}) as Array<{
        _id: string
        message: string
        modifiedBy?: string
        createdBy?: string
        createdOn?: number
        modifiedOn?: number
        attachedTo?: string
      }>

      // Sort by creation time (oldest first)
      messages.sort((a, b) => (a.createdOn || 0) - (b.createdOn || 0))

      // Check if there are new messages
      log(`Messages count: ${messages.length}, lastCount: ${this.lastMessageCount}`)
      if (messages.length > this.lastMessageCount) {
        const newMessages = messages.slice(this.lastMessageCount)
        log(`Found ${newMessages.length} new message(s)`)

        for (const msg of newMessages) {
          log(`Processing msg ${msg._id} from ${msg.createdBy}`)
          // Skip messages from the bot itself
          if (msg.createdBy === config.huly.socialId) {
            log('Skipping own message')
            continue
          }

          // Parse the message content
          try {
            const content = JSON.parse(msg.message)
            const text = content?.content?.[0]?.content?.[0]?.text || ''
            log(`Message text: "${text.slice(0, 100)}"`)

            // Ask LLM if we should respond to this message
            const shouldRespond = await this.ollama.shouldRespond(text)
            log(`Should respond: ${shouldRespond}`)

            if (shouldRespond) {
              // Detect intent - is this a request to create an issue?
              const intent = await this.ollama.detectIntent(text)
              log(`Detected intent: ${JSON.stringify(intent)}`)

              if (intent.type === 'create_issue' && intent.issueTitle) {
                // Handle issue creation
                await this.handleCreateIssue(intent, text)
              } else {
                // Regular chat response
                log('Generating response...')
                const response = await this.ollama.chat(text)
                // Strip JSON wrapper if present (in case model outputs JSON anyway)
                let cleanResponse = response
                try {
                  const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}')
                  cleanResponse = parsed.content || parsed.description || parsed.reason || response
                } catch {
                  // Use response as-is if not JSON
                }
                log(`Responding with: "${cleanResponse.slice(0, 100)}"`)
                await this.huly.sendChatMessage('chunter:space:General', cleanResponse)
                log('Response sent')
              }
            }
          } catch (e) {
            // Log the error for debugging
            log(`Error processing message ${msg._id}: ${e}`)
            console.error('Message processing error:', e)
          }
        }
        log(`Updating lastMessageCount from ${this.lastMessageCount} to ${messages.length}`)
        this.lastMessageCount = messages.length
      }
    } catch (e) {
      console.error('Error checking messages:', e)
    }
  }

  private async gatherContext(): Promise<string> {
    const parts: string[] = []

    parts.push(`You are in workspace: ${this.state.workspace}`)
    parts.push(`Current time: ${new Date().toISOString()}`)
    parts.push(`Actions this minute: ${this.state.actionsThisMinute}/${config.bot.maxActionsPerMinute}`)

    if (this.state.recentActivity.length > 0) {
      parts.push('\nRecent activity:')
      parts.push(this.state.recentActivity.slice(-5).join('\n'))
    }

    // Try to fetch some data from Huly
    try {
      // This might not work depending on the API - we'll discover what works
      parts.push('\nWhat would you like to do next?')
    } catch (error) {
      parts.push('\nUnable to fetch current data. What would you like to do?')
    }

    return parts.join('\n')
  }

  private async executeAction(action: BotAction): Promise<void> {
    this.addActivity(`Action: ${action.action}`)

    switch (action.action) {
      case 'observe':
        console.log(`Observing: ${action.reason || 'just watching'}`)
        break

      case 'comment':
        console.log(`Would comment on ${action.target}: ${action.content}`)
        // TODO: Implement when we figure out the API
        break

      case 'create_issue':
        console.log(`Would create issue: ${action.title}`)
        // TODO: Implement when we figure out the API
        break

      case 'send_message':
        console.log(`Sending message to ${action.channel}: ${action.content}`)
        try {
          await this.huly.sendChatMessage('chunter:space:General', action.content || 'Hello!')
          console.log('Message sent!')
        } catch (e) {
          console.error('Failed to send message:', e)
        }
        break

      case 'explore':
        console.log('Exploring the workspace...')
        await this.explore()
        break

      default:
        console.log(`Unknown action: ${action.action}`)
    }
  }

  private async handleCreateIssue(intent: DetectedIntent, originalMessage: string): Promise<void> {
    if (!this.state.defaultProject) {
      log('No project available for issue creation')
      await this.huly.sendChatMessage(
        'chunter:space:General',
        "I'd love to create that issue, but I don't see any projects in this workspace yet. Create a project first and I'll be ready to help!"
      )
      return
    }

    try {
      const title = intent.issueTitle!
      const description = intent.issueDescription
      const priority = intent.issuePriority || 'Medium'

      log(`Creating issue: "${title}" with priority ${priority}`)

      const issueId = await this.huly.createIssue(
        this.state.defaultProject._id,
        title,
        description,
        priority === 'Medium' ? undefined : priority
      )

      log(`Issue created with ID: ${issueId}`)

      // Send confirmation message
      const projectId = this.state.defaultProject.identifier
      await this.huly.sendChatMessage(
        'chunter:space:General',
        `Done! I created issue "${title}" in ${this.state.defaultProject.name}. Priority: ${priority}`
      )

      this.addActivity(`Created issue: ${title}`)
    } catch (error) {
      log(`Failed to create issue: ${error}`)
      await this.huly.sendChatMessage(
        'chunter:space:General',
        `Hmm, I tried to create that issue but something went wrong. Could you try again?`
      )
    }
  }

  private async discoverProjects(): Promise<void> {
    try {
      const projects = await this.huly.findProjects()
      console.log(`Found ${projects.length} project(s)`)

      if (projects.length > 0) {
        // Use preferred project from config if specified, otherwise first project
        let selectedProject = projects[0]
        if (config.bot.preferredProject) {
          const preferred = projects.find(p =>
            p.name.toLowerCase().includes(config.bot.preferredProject.toLowerCase()) ||
            p.identifier === config.bot.preferredProject
          )
          if (preferred) {
            selectedProject = preferred
          }
        }
        this.state.defaultProject = selectedProject
        console.log(`Default project: ${this.state.defaultProject.name} (${this.state.defaultProject.identifier})`)
        for (const p of projects) {
          console.log(`  - ${p.name} (${p.identifier}): ${p._id}`)
        }
      } else {
        console.log('No projects found. Issue creation will be disabled.')
      }

      // Debug: dump full issue structure
      const issues = await this.huly.findAll('tracker:class:Issue', {}) as unknown[]
      if (issues.length > 0) {
        console.log('\n=== SAMPLE ISSUE STRUCTURE ===')
        console.log(JSON.stringify(issues[0], null, 2))
        console.log('=== END SAMPLE ===\n')
      }
    } catch (error) {
      console.error('Failed to discover projects:', error)
    }
  }

  private async explore(): Promise<void> {
    try {
      // Try to discover what's in the workspace
      console.log('Attempting to explore workspace data...')

      // These are guesses at class names - we'll need to discover the real ones
      const classesToTry = [
        'chunter:class:ChatMessage',
        'chunter:class:ThreadMessage',
        'chunter:class:Channel',
        'chunter:class:DirectMessage',
        'chunter:class:ChunterMessage',
        'activity:class:ActivityMessage',
        'tracker:class:Issue',
        'tracker:class:Project',
        'contact:class:Person',
        'core:class:Space'
      ]

      for (const className of classesToTry) {
        try {
          const results = await this.huly.findAll(className, {})
          console.log(`Found ${(results as unknown[]).length} items of type ${className}`)
          if ((results as unknown[]).length > 0) {
            console.log('Sample:', JSON.stringify((results as unknown[])[0]).slice(0, 300))
          }
          this.addActivity(`Explored ${className}: found ${(results as unknown[]).length} items`)
        } catch (e) {
          console.log(`Could not query ${className}: ${e}`)
        }
      }
    } catch (error) {
      console.error('Exploration failed:', error)
    }
  }

  stop(): void {
    console.log('Stopping agent...')
    this.running = false
    this.huly.disconnect()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
