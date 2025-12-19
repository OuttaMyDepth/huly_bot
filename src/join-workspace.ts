import { config, validateConfig } from './config.js'
import { HulyClient } from './huly-client.js'

async function main(): Promise<void> {
  const inviteId = process.argv[2]

  if (!inviteId) {
    console.error('Usage: tsx src/join-workspace.ts <inviteId>')
    process.exit(1)
  }

  validateConfig()

  const client = new HulyClient()

  try {
    await client.login()
  } catch {
    console.log('Login failed, account might not exist')
    process.exit(1)
  }

  await client.joinWithInvite(inviteId)

  const workspaces = await client.getWorkspaces()
  console.log('Workspaces:', workspaces)
}

main().catch(console.error)
