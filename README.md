# Huly Bot

An AI-powered chat bot for [Huly](https://huly.io), the open-source project management platform. The bot lives in your Huly workspace, responds to questions about Huly features, and provides helpful assistance to team members.

## Features

- **Huly Help Assistant** - Answers questions about Huly features, navigation, and workflows
- **Smart Triggers** - Responds when mentioned directly ("bot", "@huly") or when users ask Huly-related questions
- **Conversational** - Uses Ollama for natural, friendly responses
- **Reactive Design** - Only responds when asked, doesn't spam the workspace

## Prerequisites

- Node.js 20+
- A self-hosted [Huly](https://github.com/hcengineering/huly-selfhost) instance
- [Ollama](https://ollama.ai) running locally with a model installed (e.g., `qwen3-coder`, `llama3.1`)
- A bot account in your Huly workspace

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/OuttaMyDepth/huly_bot.git
cd huly_bot
npm install
```

### 2. Create Bot Account in Huly

1. Create a new user account in your Huly instance (e.g., `bot@yourdomain.com`)
2. Invite the bot account to your workspace
3. Generate a workspace token using the Huly tool container:

```bash
docker compose run --rm tool node bundle.js generate-token <bot-email> <workspace-id>
```

### 3. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `HULY_URL` | Your Huly instance URL (e.g., `https://huly.example.com`) |
| `HULY_TRANSACTOR_URL` | WebSocket URL (e.g., `wss://huly.example.com/_transactor`) |
| `HULY_TOKEN` | Pre-generated workspace token |
| `HULY_WORKSPACE_ID` | Your workspace ID |
| `HULY_SOCIAL_ID` | Bot's social ID (for message attribution) |
| `OLLAMA_MODEL` | Ollama model to use (default: `llama3.1:8b`) |

### 4. Run the Bot

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

Background with nohup:
```bash
nohup npm run dev &
```

## Usage

Once running, the bot will respond in chat when:

1. **Directly mentioned** - Messages containing "bot" or "@huly"
2. **Huly questions detected** - Questions about features like "how do I create an issue?" or "where is the tracker?"

### Example Interactions

- "Hey bot, how do I create a new project?"
- "What's the keyboard shortcut for search?"
- "How do I invite someone to the workspace?"
- "bot, tell me about the tracker"

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_PERSONALITY` | `chaotic-helpful` | Bot personality style |
| `ACTION_INTERVAL_MS` | `5000` | Polling interval in milliseconds |
| `MAX_ACTIONS_PER_MINUTE` | `10` | Rate limit for responses |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |

### Personalities

- `chaotic-helpful` - Friendly and quirky, helpful with a bit of humor
- `curious` - Asks questions, explores the workspace
- `productive` - Focused on helping organize and complete tasks
- `silly` - Adds humor and fun to interactions

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Ollama (Local) │     │  Huly Instance  │
│  qwen3-coder    │     │  (Self-hosted)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │ localhost:11434       │ WSS
         │                       │
┌────────┴───────────────────────┴────────┐
│              Huly Bot (Node.js)          │
│                                          │
│  1. Connect to Huly via WebSocket        │
│  2. Poll for new messages                │
│  3. Detect mentions or Huly questions    │
│  4. Generate response via Ollama         │
│  5. Send response back to chat           │
└──────────────────────────────────────────┘
```

## Development

### Project Structure

```
huly_bot/
├── src/
│   ├── index.ts          # Entry point
│   ├── agent.ts          # Main bot logic and message handling
│   ├── huly-client.ts    # Huly WebSocket RPC client
│   ├── huly-knowledge.ts # Huly documentation knowledge base
│   ├── ollama.ts         # Ollama chat integration
│   ├── config.ts         # Configuration loader
│   └── join-workspace.ts # Utility to join workspace with invite
├── .env.example          # Environment template
├── package.json
└── tsconfig.json
```

### Utility Scripts

Join a workspace with an invite link:
```bash
npx tsx src/join-workspace.ts <invite-id>
```

## Troubleshooting

**Bot not responding:**
- Check that Ollama is running: `curl http://localhost:11434/api/tags`
- Verify the bot is connected: check console output for "Connected to transactor!"
- Ensure messages contain "bot" or are Huly-related questions

**"AccountMismatch" errors:**
- Make sure `HULY_SOCIAL_ID` is set correctly
- The social ID links the bot's messages to its account

**Messages showing as "System":**
- The bot's social ID needs to be properly linked in the workspace
- This is a Huly account configuration issue

## License

MIT

## Credits

Built for use with [Huly](https://huly.io) - the open-source all-in-one project management platform.
