import 'dotenv/config'

export const config = {
  huly: {
    url: process.env.HULY_URL || '',
    transactorUrl: process.env.HULY_TRANSACTOR_URL || '',
    accountUrl: process.env.HULY_ACCOUNT_URL || '',
    email: process.env.HULY_EMAIL || '',
    password: process.env.HULY_PASSWORD || '',
    token: process.env.HULY_TOKEN || '',
    workspaceId: process.env.HULY_WORKSPACE_ID || '',
    socialId: process.env.HULY_SOCIAL_ID || ''
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.1:8b'
  },
  bot: {
    personality: process.env.BOT_PERSONALITY || 'chaotic-helpful',
    actionIntervalMs: parseInt(process.env.ACTION_INTERVAL_MS || '30000'),
    maxActionsPerMinute: parseInt(process.env.MAX_ACTIONS_PER_MINUTE || '10')
  }
}

export function validateConfig(): void {
  if (!config.huly.url || !config.huly.transactorUrl) {
    throw new Error('HULY_URL and HULY_TRANSACTOR_URL are required')
  }
  if (!config.huly.token && (!config.huly.email || !config.huly.password)) {
    throw new Error('HULY_TOKEN or (HULY_EMAIL and HULY_PASSWORD) are required')
  }
}
