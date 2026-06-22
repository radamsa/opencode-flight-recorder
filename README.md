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
npm install && npm run build
```

### 2. Run the installer

```bash
./install.sh
```

The script will ask whether to install for the **current project** or **globally**. It runs `opencode plugin <path>` internally — OpenCode's built-in plugin command handles everything: updating `opencode.json`, installing dependencies, and linking the package.

**Non-interactive usage:**

```bash
./install.sh --project           # install in current directory
./install.sh --global            # install globally (~/.config/opencode)
```

### 3. Verify it loads

Start (or restart) OpenCode. After making a few requests, check:

```bash
ls ~/.opencode-flight-recorder/sessions/
```

You should see session directories appear.

## Alternative: symlink (no npm needed)

If you prefer not to use npm packages, symlink the compiled plugin directly:

```bash
mkdir -p ~/.config/opencode/plugins
ln -s /path/to/opencode-flight-recorder/dist/plugin ~/.config/opencode/plugins/flight-recorder
```

OpenCode automatically loads `.js`/`.ts` files from `~/.config/opencode/plugins/` and `.opencode/plugins/`.

## CLI: `flight`

The package includes a standalone CLI for reading recorded data:

```bash
# List all sessions (one line each, 24h time, truncated ID)
npm run flight session list

# Show a specific session with all exchanges
npm run flight session show <session-id>

# Aggregate statistics
npm run flight stats               # pretty-print table
npm run flight stats json          # JSON output
npm run flight stats yaml          # YAML output

# Full-text search across all exchanges
npm run flight search "error message"      # pretty-print
npm run flight search json "error message" # JSON output
npm run flight search yaml "error message" # YAML output

# Generate HTML usage report (all time, or by date)
npm run flight report              # all time
npm run flight report 2026         # year 2026
npm run flight report 2026-06      # June 2026
npm run flight report 2026-06-22   # single day

# Clear recorded history
npm run flight clear               # all sessions (with confirmation)
npm run flight clear 2026          # only sessions from 2026
npm run flight clear 2026-06       # only sessions from June 2026
npm run flight clear 2026-06-22    # only sessions from that day

# Export data as JSON
npm run flight export              # all sessions
npm run flight export <session-id> # single session

# Show help
npm run flight help
```

If installed globally (`npm link` or via npm), use `flight` directly:

```bash
flight session list
flight stats
flight stats json
flight search "database migration"
flight search yaml "error message"
flight report
flight clear 2026-01
flight export <session-id>
```

> **Note:** npm intercepts `--` flags (like `--json`, `--yaml`). Use positional subcommands (`stats json`, `search yaml`) instead.

## Data Model

### Exchange

One request-response cycle with the LLM. Each time OpenCode sends a prompt to the model and receives a response (possibly with tool calls in between), that is one exchange. The exchange count per session is shown in `flight session list`.

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
