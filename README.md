# OpenCode Flight Recorder

> **Black box recorder for LLM interactions.** Captures, structures, and stores every prompt, response, and tool call made through OpenCode in a reproducible format.

## Overview

Flight Recorder is an event-driven plugin for [OpenCode](https://opencode.ai) that passively observes all LLM interactions and persists them to disk as JSONL. It never modifies prompts or responses — it only records.

### What it captures

| Data | Detail |
|------|--------|
| **Messages** | Full prompt/response text per exchange |
| **Provider & model** | e.g. `anthropic/claude-3-5-sonnet-20241022` |
| **Token usage** | prompt, completion, cached, total tokens |
| **Latency** | Wall-clock time per exchange |
| **Model parameters** | temperature, maxTokens, topP |
| **Tool calls** | Every bash/read/write/etc. with arguments and results |
| **Lineage** | Conversation graph — parentId/rootId per exchange |
| **Session metadata** | cwd, git branch/commit, hostname, OS |

## Storage Layout

```
~/.opencode-flight-recorder/
sessions/
YYYY/
  MM/
    DD/
      <session-id>/
        session.json          # session metadata
        exchanges.jsonl        # append-only exchange log
        semantic.jsonl         # (reserved for future enrichment)
```

## Quick Start

### 1. Clone and build

```bash
git clone <repo-url> opencode-flight-recorder
cd opencode-flight-recorder
npm install
npm run build
```

### 2. Install as a local plugin

Create a `package.json` in your OpenCode config directory (so local plugins can use npm dependencies):

```bash
# project-level (recommended)
mkdir -p .opencode
echo '{ "dependencies": { "opencode-flight-recorder": "file:/path/to/opencode-flight-recorder" } }' > .opencode/package.json

# OR global-level
mkdir -p ~/.config/opencode
echo '{ "dependencies": { "opencode-flight-recorder": "file:/path/to/opencode-flight-recorder" } }' > ~/.config/opencode/package.json
```

Then run `bun install` in that directory, or just start OpenCode — it runs `bun install` automatically on startup.

### 3. Register the plugin in `opencode.json`

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-flight-recorder"]
}
```

> **Tip:** You can place this file at the project root (`opencode.json`) or globally (`~/.config/opencode/opencode.json`).

### 4. Verify it loads

Start OpenCode. The plugin logs its activity via `client.app.log()` — no console output by default. To verify the plugin is loaded, run:

```bash
ls ~/.opencode-flight-recorder/sessions/
```

After making a few requests in OpenCode, you should see session directories appear.

## Alternative: symlink to the global plugins directory

If you don't want to deal with npm packages, symlink the compiled output directly:

```bash
mkdir -p ~/.config/opencode/plugins
ln -s /path/to/opencode-flight-recorder/dist/plugin ~/.config/opencode/plugins/flight-recorder
```

OpenCode automatically loads `.js`/`.ts` files from `~/.config/opencode/plugins/` and `.opencode/plugins/`.

## CLI: `flight`

The package includes a standalone CLI for reading recorded data:

```bash
# List all sessions
npm run flight session list

# Show a specific session (with all exchanges)
npm run flight session show <session-id>

# Aggregate statistics
npm run flight stats

# Full-text search across all exchanges
npm run flight search "error message"

# Export all data as JSON
npm run flight export

# Export a single session
npm run flight export <session-id>
```

If installed globally (`npm link` or via npm), use `flight` directly:

```bash
flight session list
flight stats
flight search "database migration"
```

## Data Model

### Exchange

```typescript
interface Exchange {
  id: string
  sessionId: string
  timestampStart: string
  timestampEnd?: string
  provider: string
  model: string
  request: {
    messages: unknown[]
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
    topP?: number
  }
  response?: {
    text: string
    toolCalls?: unknown[]
    finishReason?: string
  }
  usage?: {
    promptTokens: number
    completionTokens: number
    cachedTokens?: number
    totalTokens?: number
    costUsd?: number
  }
  latencyMs?: number
  tools?: ToolEvent[]
  lineage?: {
    parentId?: string
    rootId?: string
  }
}
```

### Session

```typescript
interface Session {
  id: string
  createdAt: string
  endedAt?: string
  cwd: string
  gitBranch?: string
  gitCommit?: string
  hostname?: string
  os?: string
  exchangeCount: number
}
```

## OpenCode Plugin Hooks Used

| Hook | Purpose |
|------|---------|
| `chat.message` | Capture user messages and assistant responses |
| `chat.params` | Capture model parameters (temperature, maxTokens, topP) |
| `tool.execute.before` | Log tool name and arguments before execution |
| `tool.execute.after` | Log tool results after execution |
| `dispose` | Finalize session on plugin unload |

All hooks are **read-only** — the plugin never modifies messages, parameters, or tool behavior.

## Project Structure

```
src/
├── capture/ExchangeBuilder.ts   Build exchange objects from fragments
├── cli/index.ts                 CLI entrypoint
├── cli/commands.ts              CLI commands (list, show, stats, search, export)
├── plugin/index.ts              OpenCode plugin entrypoint
├── storage/JsonlWriter.ts       Append-only JSONL writer
├── storage/SessionManager.ts    Session lifecycle and exchange routing
├── storage/StorageReader.ts     Read and search recorded data
└── types/index.ts               TypeScript type definitions
```

## Development

```bash
npm test           # run all 30+ tests
npm run test:watch # watch mode
npm run build      # compile TypeScript
npm run flight     # run CLI
```

## License

MIT
