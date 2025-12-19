import { validateConfig } from './config.js'
import { HulyAgent } from './agent.js'

async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  HULY AUTONOMOUS BOT')
  console.log('='.repeat(60))
  console.log()

  try {
    validateConfig()
  } catch (error) {
    console.error('Configuration error:', error)
    process.exit(1)
  }

  const agent = new HulyAgent()

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down...')
    agent.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down...')
    agent.stop()
    process.exit(0)
  })

  try {
    await agent.start()

    // Keep the process alive
    await new Promise(() => {})
  } catch (error) {
    console.error('Fatal error:', error)
    agent.stop()
    process.exit(1)
  }
}

main()
