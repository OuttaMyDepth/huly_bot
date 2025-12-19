import WebSocket from 'ws'
import { config } from './config.js'

interface LoginResponse {
  token?: string
  error?: string
}

interface Workspace {
  workspaceId: string
  workspaceName: string
  workspaceUrl: string
}

interface RpcRequest {
  id: string
  method: string
  params: unknown[]
}

interface RpcResponse {
  id: string
  result?: unknown
  error?: { message: string; code: number }
}

export class HulyClient {
  private token: string | null = null
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }> = new Map()
  private workspace: string | null = null
  private accountId: string | null = null
  private eventHandlers: Map<string, ((data: unknown) => void)[]> = new Map()

  setToken(token: string, workspaceId?: string, socialId?: string): void {
    this.token = token
    if (workspaceId) {
      this.workspace = workspaceId
    }
    if (socialId) {
      this.accountId = socialId
      console.log('Using social ID:', this.accountId)
    } else {
      // Parse account ID from JWT
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        this.accountId = payload.account
        console.log('Account ID from token:', this.accountId)
      } catch (e) {
        console.log('Could not parse account ID from token')
      }
    }
  }

  async login(): Promise<string> {
    console.log('Logging in to Huly...')

    const response = await fetch(config.huly.accountUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'login',
        params: {
          email: config.huly.email,
          password: config.huly.password
        }
      })
    })

    const data = await response.json() as { result?: LoginResponse; error?: unknown }

    if (data.error || !data.result?.token) {
      throw new Error(`Login failed: ${JSON.stringify(data.error || 'No token received')}`)
    }

    this.token = data.result.token
    console.log('Login successful!')
    return this.token
  }

  async signUp(): Promise<string> {
    console.log('Creating account...')

    const response = await fetch(config.huly.accountUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'signUp',
        params: {
          email: config.huly.email,
          password: config.huly.password,
          firstName: 'Huly',
          lastName: 'Bot'
        }
      })
    })

    const data = await response.json() as { result?: LoginResponse; error?: unknown }

    if (data.error) {
      console.log('Signup response:', JSON.stringify(data))
      throw new Error(`Signup failed: ${JSON.stringify(data.error)}`)
    }

    if (data.result?.token) {
      this.token = data.result.token
      console.log('Account created!')
      return this.token
    }

    throw new Error('Signup failed: No token received')
  }

  async joinWithInvite(inviteId: string): Promise<void> {
    if (!this.token) throw new Error('Not logged in')

    console.log(`Joining workspace with invite: ${inviteId}`)

    const response = await fetch(config.huly.accountUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        method: 'join',
        params: { inviteId }
      })
    })

    const data = await response.json() as { result?: unknown; error?: unknown }

    if (data.error) {
      throw new Error(`Failed to join workspace: ${JSON.stringify(data.error)}`)
    }

    console.log('Successfully joined workspace!')
  }

  async getWorkspaces(): Promise<Workspace[]> {
    if (!this.token) throw new Error('Not logged in')

    const response = await fetch(config.huly.accountUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        method: 'listWorkspaces',
        params: {}
      })
    })

    const data = await response.json() as { result?: Workspace[]; error?: unknown }

    if (data.error) {
      throw new Error(`Failed to get workspaces: ${JSON.stringify(data.error)}`)
    }

    return data.result || []
  }

  async selectWorkspace(workspaceId: string): Promise<string> {
    if (!this.token) throw new Error('Not logged in')

    const response = await fetch(config.huly.accountUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        method: 'selectWorkspace',
        params: { workspaceId }
      })
    })

    const data = await response.json() as { result?: { token: string }; error?: unknown }

    if (data.error || !data.result?.token) {
      throw new Error(`Failed to select workspace: ${JSON.stringify(data.error)}`)
    }

    this.token = data.result.token
    this.workspace = workspaceId
    console.log(`Selected workspace: ${workspaceId}`)
    return this.token
  }

  async connectTransactor(): Promise<void> {
    if (!this.token) throw new Error('Not logged in')

    return new Promise((resolve, reject) => {
      const wsUrl = `${config.huly.transactorUrl}/${this.token}`
      console.log('Connecting to transactor...')

      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        console.log('Connected to transactor!')
        resolve()
      })

      this.ws.on('message', (data) => {
        try {
          const raw = data.toString()
          console.log('WS RAW:', raw.slice(0, 300))
          const message = JSON.parse(raw) as RpcResponse | { event: string; data: unknown }

          if ('id' in message && this.pendingRequests.has(message.id)) {
            const pending = this.pendingRequests.get(message.id)!
            this.pendingRequests.delete(message.id)

            if (message.error) {
              pending.reject(new Error(message.error.message))
            } else {
              pending.resolve(message.result)
            }
          } else if ('event' in message) {
            this.emit(message.event, message.data)
          } else if ('result' in message && Array.isArray(message.result)) {
            // This is a pushed event/transaction
            for (const tx of message.result) {
              this.emit('tx', tx)
            }
          } else if (message.result !== 'ping') {
            console.log('Unknown message type:', Object.keys(message))
          }
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      })

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error)
        reject(error)
      })

      this.ws.on('close', () => {
        console.log('WebSocket closed')
        this.ws = null
      })
    })
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }

  on(event: string, handler: (data: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }

  async rpc(method: string, params: unknown[] = []): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to transactor')
    }

    const id = `req-${++this.requestId}`

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })

      const request: RpcRequest = { id, method, params }
      this.ws!.send(JSON.stringify(request))

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request ${method} timed out`))
        }
      }, 30000)
    })
  }

  async findAll(className: string, query: Record<string, unknown> = {}): Promise<unknown[]> {
    const result = await this.rpc('findAll', [className, query]) as { value?: unknown[], dataType?: string }
    return result?.value || []
  }

  async subscribe(callback: (tx: unknown) => void): Promise<void> {
    // Listen for tx events
    this.on('tx', callback)

    // Try to load model / get initial state
    try {
      const result = await this.rpc('loadModel', [])
      console.log('loadModel result keys:', Object.keys(result as object || {}))
    } catch (e) {
      console.log('loadModel failed:', e)
    }

    // Try to get diff/subscribe
    try {
      const result = await this.rpc('getAccount', [])
      console.log('getAccount result:', JSON.stringify(result).slice(0, 200))
    } catch (e) {
      console.log('getAccount failed:', e)
    }
  }

  async createDoc(className: string, space: string, data: Record<string, unknown>): Promise<unknown> {
    return this.rpc('tx', [{
      _class: 'core:class:TxCreateDoc',
      objectClass: className,
      space,
      attributes: data
    }])
  }

  async updateDoc(className: string, space: string, id: string, operations: Record<string, unknown>): Promise<void> {
    await this.rpc('tx', [{
      _class: 'core:class:TxUpdateDoc',
      objectClass: className,
      space,
      objectId: id,
      operations
    }])
  }

  async sendChatMessage(channelId: string, text: string): Promise<unknown> {
    const messageDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: text
        }]
      }]
    }

    const now = Date.now()
    const txId = this.generateId()
    const createDocId = this.generateId()
    const messageId = this.generateId()

    return this.rpc('tx', [{
      _class: 'core:class:TxApplyIf',
      _id: txId,
      extraNotify: [],
      match: [],
      measureName: 'chunter.create.chunter:class:ChatMessage chunter:class:Channel',
      modifiedBy: this.accountId,
      modifiedOn: now,
      notMatch: [],
      notify: true,
      objectSpace: 'core:space:Tx',
      space: 'core:space:Tx',
      txes: [{
        _class: 'core:class:TxCreateDoc',
        _id: createDocId,
        attachedTo: channelId,
        attachedToClass: 'chunter:class:Channel',
        attributes: {
          attachments: 0,
          message: JSON.stringify(messageDoc)
        },
        collection: 'messages',
        createdBy: this.accountId,
        modifiedBy: this.accountId,
        modifiedOn: now,
        objectClass: 'chunter:class:ChatMessage',
        objectId: messageId,
        objectSpace: channelId,
        space: 'core:space:Tx'
      }]
    }])
  }

  private generateId(): string {
    return Math.random().toString(16).slice(2) + Date.now().toString(16)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
